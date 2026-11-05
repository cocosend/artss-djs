#include "AudioEngine.hpp"
#include "DrumSynth.hpp"
#include "BeatGrid.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <stdexcept>

namespace artss::audio {
namespace {
constexpr std::uint32_t kFadeFrames = 64;
constexpr float kHeadroom = 0.354813389F;  // -9 dB before master gain.
constexpr std::array<std::array<Drum, kPadCount>, 3> kFactoryKits{{
    {Drum::Kick606, Drum::Sub303, Drum::Clap909, Drum::Hat606,
     Drum::OpenHat909, Drum::Perc606, Drum::Acid303, Drum::Crash909},
    {Drum::Kick606, Drum::Snare606, Drum::Clap909, Drum::Hat606,
     Drum::OpenHat909, Drum::Rim606, Drum::Cowbell606, Drum::Perc606},
    {Drum::Kick909, Drum::Snare909, Drum::Clap909, Drum::Hat606,
     Drum::OpenHat909, Drum::Tom909, Drum::Ride909, Drum::Acid303},
}};
static_assert(std::atomic<float>::is_always_lock_free);
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
}

AudioEngine::AudioEngine() noexcept {
  for (auto& progress : progress_) progress.store(-1, std::memory_order_relaxed);
}

void AudioEngine::prepare(double sampleRate, SampleBank bank) {
  if (running()) throw std::logic_error("Stop RemoteIO before preparing samples");
  if (!std::isfinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw std::invalid_argument("Unsupported sample rate");
  }
  for (const auto& sample : bank) {
    if (sample.stereo.empty() || sample.stereo.size() % 2 != 0 ||
        sample.stereo.size() > static_cast<std::size_t>(sampleRate * 30) * 2) {
      throw std::invalid_argument("Samples must be nonempty stereo PCM, at most 30 seconds");
    }
    for (const float value : sample.stereo) {
      if (!std::isfinite(value) || std::abs(value) > 1.0F) {
        throw std::invalid_argument("PCM samples must be finite and normalized");
      }
    }
  }
  kits_[0] = std::move(bank);
  // Build immutable factory PCM on the lifecycle thread. Never synthesize in RemoteIO.
  for (std::size_t kit = 1; kit < kKitCount; ++kit) {
    for (std::size_t pad = 0; pad < kPadCount; ++pad) {
      std::vector<float> mono(static_cast<std::size_t>(std::ceil(sampleRate * 1.5)));
      const auto count = renderDrum(kFactoryKits[kit - 1][pad], mono.data(), mono.size(),
                                    static_cast<float>(sampleRate), static_cast<std::uint32_t>(kit * 13 + pad));
      if (!count) throw std::runtime_error("Factory drum synthesis failed");
      auto& pcm = kits_[kit][pad].stereo;
      pcm.resize(count * 2);
      for (std::size_t frame = 0; frame < count; ++frame) {
        pcm[2 * frame] = mono[frame];
        pcm[2 * frame + 1] = mono[frame];
      }
    }
  }
  sampleRate_ = sampleRate;
  lowCoefficient_ = static_cast<float>(-std::expm1(-2.0 * 3.141592653589793 * 220.0 / sampleRate));
  highCoefficient_ = static_cast<float>(-std::expm1(-2.0 * 3.141592653589793 * 4000.0 / sampleRate));
  lowL_ = lowR_ = highLpL_ = highLpR_ = 0;
  limiterHold_ = 0;
  bassCoefficient_ = static_cast<float>(-std::expm1(-2.0 * 3.141592653589793 * 180.0 / sampleRate));
  limiterHoldFrames_ = static_cast<std::uint32_t>(sampleRate * 0.01);
  for (auto& deck : decks_) {
    deck.eqLowL = deck.eqLowR = deck.eqHighL = deck.eqHighR = deck.bassL = deck.bassR = 0;
    deck.lowGain = std::pow(10.0F, deck.lowDb.load(std::memory_order_relaxed) / 20.0F);
    deck.midGain = std::pow(10.0F, deck.midDb.load(std::memory_order_relaxed) / 20.0F);
    deck.highGain = std::pow(10.0F, deck.highDb.load(std::memory_order_relaxed) / 20.0F);
    deck.gainSmooth = deck.gain.load(std::memory_order_relaxed);
    deck.frameCount.store(0, std::memory_order_release);
    deck.loaded.store(false, std::memory_order_release);
    deck.filterAmount.store(0, std::memory_order_relaxed);
    deck.filterCoefficient.store(0, std::memory_order_relaxed);
    deck.filterAmountSmooth = deck.filterG = deck.filterLowL = deck.filterBandL = deck.filterLowR = deck.filterBandR = 0;
    deck.bpm.store(0, std::memory_order_relaxed);
    deck.firstBeat.store(0, std::memory_order_relaxed);
    deck.track.stereo.clear();
    deck.waveform.fill(0);
    deck.cursor = 0;
    deck.position.store(0, std::memory_order_relaxed);
    deck.cue.store(0, std::memory_order_relaxed);
    deck.rate.store(1, std::memory_order_relaxed);
    deck.playing.store(false, std::memory_order_relaxed);
    deck.jogging.store(false, std::memory_order_relaxed);
    deck.jogRate.store(0, std::memory_order_relaxed);
    deck.envelope = 0;
    deck.actualRate = deck.lastL = deck.lastR = deck.seekTailL = deck.seekTailR = 0;
    deck.seekFadeRemaining = 0;
    deck.seenJogRevision = deck.jogRevision.load(std::memory_order_relaxed);
    deck.jogIdleFrames = 0;
  }
  voices_ = {};
  gainSlew_ = static_cast<float>(1.0 / (sampleRate * 0.005));
  jogSlew_ = static_cast<float>(4.0 / (sampleRate * 0.005));
  jogTimeoutFrames_ = static_cast<std::uint32_t>(sampleRate * 0.05);
  limiterRelease_ = static_cast<float>(-std::expm1(-1.0 / (sampleRate * 0.08)));
  for (std::size_t kit = 0; kit < kKitCount; ++kit) {
    for (std::size_t pad = 0; pad < kPadCount; ++pad) {
      const auto frames = kits_[kit][pad].frames();
      for (std::size_t bin = 0; bin < kWaveformBins; ++bin) {
        const auto start = bin * frames / kWaveformBins;
        const auto end = std::min<std::size_t>(frames, std::max(start + 1, (bin + 1) * frames / kWaveformBins));
        float peak = 0;
        for (auto i = start; i < end; ++i) {
          peak = std::max({peak, std::abs(kits_[kit][pad].stereo[i * 2]),
                           std::abs(kits_[kit][pad].stereo[i * 2 + 1])});
        }
        kitWaveforms_[kit][pad][bin] = peak;
      }
      progress_[pad].store(-1, std::memory_order_relaxed);
    }
  }
  prepared_ = true;
}

void AudioEngine::activate() noexcept {
  if (!prepared_) return;
  // Restore the accepted control intent before the first audible block.
  master_ = requestedMaster_.load(std::memory_order_acquire);
  epoch_.fetch_add(1, std::memory_order_acq_rel);
  active_.store(true, std::memory_order_release);
}

void AudioEngine::rejectCommands() noexcept {
  active_.store(false, std::memory_order_release);
  requestedCrossfade_.store(crossfadePosition_.load(std::memory_order_relaxed), std::memory_order_relaxed);
  autoMixCommand_.store(-1, std::memory_order_release);
  autoMixState_.store(0, std::memory_order_release);
}

void AudioEngine::deactivateAfterStop() noexcept {
  rejectCommands();
  epoch_.fetch_add(1, std::memory_order_acq_rel);
  // RemoteIO is stopped: lifecycle temporarily owns the single consumer.
  // Do not reset queue indices; a preempted producer may still publish an old
  // reservation. Epoch checks continue to reject those late publications.
  Command stale;
  for (int i = 0; i < 512 && commands_.tryPop(stale); ++i) {}
  voices_ = {};
  limiter_ = 1;
  limiterHold_ = 0;
  lowL_ = lowR_ = highLpL_ = highLpR_ = 0;
  peak_.store(0, std::memory_order_relaxed);
  meterRmsL_.store(0, std::memory_order_relaxed);
  meterRmsR_.store(0, std::memory_order_relaxed);
  for (auto& progress : progress_) progress.store(-1, std::memory_order_relaxed);
  sequencerWasPlaying_ = false;
  sequenceFrame_ = 0;
  currentStep_.store(0, std::memory_order_relaxed);
  for (auto& deck : decks_) {
    deck.playing.store(false, std::memory_order_release);
    deck.jogging.store(false, std::memory_order_release);
    deck.jogRate.store(0, std::memory_order_release);
    deck.envelope = 0;
    deck.actualRate = deck.lastL = deck.lastR = deck.seekTailL = deck.seekTailR = 0;
    deck.seekFadeRemaining = 0;
    deck.seenJogRevision = deck.jogRevision.load(std::memory_order_relaxed);
    deck.jogIdleFrames = 0;
    deck.filterLowL = deck.filterBandL = deck.filterLowR = deck.filterBandR = 0;
  }
}

void AudioEngine::loadDeck(std::uint32_t index, Sample track) {
  if (running()) throw std::logic_error("Stop RemoteIO before loading a track");
  const auto grid = analyzeBeatGrid(track, sampleRate_);
  loadDeck(index, std::move(track), grid);
}

void AudioEngine::loadDeck(std::uint32_t index, Sample track, BeatGrid grid) {
  if (running()) throw std::logic_error("Stop RemoteIO before loading a track");
  if (!std::isfinite(grid.bpm) || !std::isfinite(grid.firstBeatSeconds) ||
      !std::isfinite(grid.confidence) || grid.bpm < 0 || grid.bpm > 200 ||
      grid.firstBeatSeconds < 0 || grid.confidence < 0 || grid.confidence > 1)
    throw std::invalid_argument("Invalid beat grid");
  if (index >= kDeckCount || track.stereo.size() < 2 || track.stereo.size() % 2 ||
      track.stereo.size() > static_cast<std::size_t>(sampleRate_ * 60 * 30) * 2) {
    throw std::invalid_argument("Invalid deck track (maximum 30 minutes)");
  }
  for (const float value : track.stereo) {
    if (!std::isfinite(value) || std::abs(value) > 1.0F) throw std::invalid_argument("Invalid track PCM");
  }
  if (track.frames() / sampleRate_ + remainingTrackSeconds(index) > 12 * 60)
    throw std::invalid_argument("Combined deck duration exceeds twelve minutes");
  auto& deck = decks_[index];
  deck.loaded.store(false, std::memory_order_release);
  deck.track = std::move(track);
  deck.frameCount.store(deck.track.frames(), std::memory_order_release);
  deck.eqLowL = deck.eqLowR = deck.eqHighL = deck.eqHighR = deck.bassL = deck.bassR = 0;
  deck.filterAmountSmooth = deck.filterG = deck.filterLowL = deck.filterBandL = deck.filterLowR = deck.filterBandR = 0;
  deck.bpm.store(grid.bpm, std::memory_order_release);
  deck.firstBeat.store(grid.firstBeatSeconds, std::memory_order_release);
  deck.cursor = 0;
  deck.position.store(0, std::memory_order_release);
  deck.cue.store(0, std::memory_order_release);
  deck.rate.store(1, std::memory_order_release);
  deck.jogRate.store(0, std::memory_order_release);
  deck.jogging.store(false, std::memory_order_release);
  deck.seek.store(-1, std::memory_order_release);
  deck.loopRange.store(0x3f80000000000000ULL, std::memory_order_release);
  deck.playing.store(false, std::memory_order_release);
  deck.envelope = 0;
  deck.actualRate = deck.lastL = deck.lastR = deck.seekTailL = deck.seekTailR = 0;
  deck.seekFadeRemaining = 0;
  deck.seenJogRevision = deck.jogRevision.load(std::memory_order_relaxed);
  deck.jogIdleFrames = 0;
  for (std::size_t bin = 0; bin < kWaveformBins; ++bin) {
    const auto frames = deck.track.frames();
    const auto first = bin * frames / kWaveformBins;
    const auto last = std::min<std::size_t>(frames, std::max(first + 1, (bin + 1) * frames / kWaveformBins));
    float peak = 0;
    for (auto i = first; i < last; ++i)
      peak = std::max({peak, std::abs(deck.track.stereo[2 * i]), std::abs(deck.track.stereo[2 * i + 1])});
    deck.waveform[bin] = peak;
  }
  deck.loaded.store(true, std::memory_order_release);
}

// A stopped deck can capture either its committed playhead or a pending seek.
// Both mailboxes are lock-free; the render callback remains the sole cursor owner.
bool AudioEngine::deckSetCue(std::uint32_t index) noexcept {
  if (index >= kDeckCount || !running()) return false;
  auto& deck = decks_[index];
  if (!deck.loaded.load(std::memory_order_acquire) ||
      deck.playing.load(std::memory_order_acquire) ||
      deck.jogging.load(std::memory_order_acquire)) return false;
  const float pending = deck.seek.load(std::memory_order_acquire);
  const float cue = pending >= 0 ? pending : deck.position.load(std::memory_order_acquire);
  deck.cue.store(cue, std::memory_order_release);
  return true;
}

bool AudioEngine::deckCue(std::uint32_t index) noexcept {
  if (index >= kDeckCount || !running()) return false;
  auto& deck = decks_[index];
  if (!deck.loaded.load(std::memory_order_acquire)) return false;
  // A DJ CUE press cancels automix, pauses the transport and returns to
  // its saved point; the render thread applies the seek with a short fade.
  stopAutoMix();
  deck.playing.store(false, std::memory_order_release);
  deck.jogging.store(false, std::memory_order_release);
  deck.jogRate.store(0, std::memory_order_release);
  deck.jogRevision.fetch_add(1, std::memory_order_release);
  deck.seek.store(deck.cue.load(std::memory_order_acquire), std::memory_order_release);
  return true;
}

float AudioEngine::deckCuePosition(std::uint32_t index) const noexcept {
  return index < kDeckCount ? decks_[index].cue.load(std::memory_order_acquire) : 0;
}

bool AudioEngine::deckPlay(std::uint32_t index, bool play) noexcept {
  if (index >= kDeckCount || !running() || !decks_[index].loaded.load(std::memory_order_acquire)) return false;
  if (play && decks_[index].position.load(std::memory_order_acquire) >= 0.999F)
    decks_[index].seek.store(0, std::memory_order_release);
  if (!play) stopAutoMix();
  decks_[index].playing.store(play, std::memory_order_release);
  return true;
}
bool AudioEngine::deckSeek(std::uint32_t index, float position) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(position) || position < 0 || position > 1 ||
      !decks_[index].loaded.load(std::memory_order_acquire)) return false;
  decks_[index].seek.store(position, std::memory_order_release);
  return true;
}
bool AudioEngine::deckRate(std::uint32_t index, float rate) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(rate) || rate < 0.5F || rate > 2) return false;
  decks_[index].rate.store(rate, std::memory_order_release);
  return true;
}
bool AudioEngine::deckFilter(std::uint32_t index, float amount) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(amount) || amount < -1 || amount > 1)
    return false;
  const double requestedFrequency = amount < 0 ? 18000.0 * std::pow(250.0 / 18000.0, -amount)
                                      : 30.0 * std::pow(4000.0 / 30.0, amount);
  const double frequency = std::clamp(requestedFrequency, 10.0, sampleRate_ * 0.45);
  const float g = static_cast<float>(std::tan(3.141592653589793 * frequency / sampleRate_));
  decks_[index].filterCoefficient.store(g, std::memory_order_release);
  decks_[index].filterAmount.store(amount, std::memory_order_release);
  return true;
}
bool AudioEngine::deckSync(std::uint32_t index) noexcept {
  if (index >= kDeckCount || !running()) return false;
  auto& target = decks_[index];
  auto& source = decks_[1 - index];
  if (!target.loaded.load(std::memory_order_acquire) ||
      !source.loaded.load(std::memory_order_acquire) ||
      !source.playing.load(std::memory_order_acquire) ||
      !target.playing.load(std::memory_order_acquire)) return false;
  const auto sourceBpm = source.bpm.load(std::memory_order_acquire);
  const auto targetBpm = target.bpm.load(std::memory_order_acquire);
  const auto rate = source.rate.load(std::memory_order_acquire) * sourceBpm / targetBpm;
  if (sourceBpm <= 0 || targetBpm <= 0 || !std::isfinite(rate) || rate < 0.5F || rate > 2.0F)
    return false;
  const double sourceSeconds = source.position.load(std::memory_order_acquire) * source.frameCount.load(std::memory_order_acquire) / sampleRate_;
  const double targetSeconds = target.position.load(std::memory_order_acquire) * target.frameCount.load(std::memory_order_acquire) / sampleRate_;
  const double sourceBeats = (sourceSeconds - source.firstBeat.load(std::memory_order_acquire)) * sourceBpm / 60.0;
  const double phase = sourceBeats - std::floor(sourceBeats);
  const double targetBeatSeconds = 60.0 / targetBpm;
  const double targetFirst = target.firstBeat.load(std::memory_order_acquire);
  const double endSeconds = (target.frameCount.load(std::memory_order_acquire) - 1) / sampleRate_;
  const double firstValidBeat = std::ceil(-targetFirst / targetBeatSeconds - phase);
  const double lastValidBeat = std::floor((endSeconds - targetFirst) / targetBeatSeconds - phase);
  if (firstValidBeat > lastValidBeat) return false;
  const double beat = std::clamp(std::round((targetSeconds - targetFirst) / targetBeatSeconds - phase),
                                 firstValidBeat, lastValidBeat);
  const double aligned = targetFirst + (beat + phase) * targetBeatSeconds;
  target.rate.store(rate, std::memory_order_release);
  target.seek.store(static_cast<float>(aligned * sampleRate_ / target.frameCount.load(std::memory_order_acquire)),
                    std::memory_order_release);
  return true;
}
bool AudioEngine::deckJog(std::uint32_t index, float speed, bool touching) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(speed) || speed < -4 || speed > 4 ||
      !decks_[index].loaded.load(std::memory_order_acquire)) return false;
  auto& deck = decks_[index];
  deck.jogRate.store(touching ? speed : 0, std::memory_order_release);
  deck.jogRevision.fetch_add(1, std::memory_order_release);
  deck.jogging.store(touching, std::memory_order_release);
  return true;
}
bool AudioEngine::deckLoop(std::uint32_t index, float start, float end) noexcept {
  if (index >= kDeckCount || !running() || !std::isfinite(start) || !std::isfinite(end) || start < 0 || end > 1 || start >= end) return false;
  const auto packed = static_cast<std::uint64_t>(std::bit_cast<std::uint32_t>(start)) |
      (static_cast<std::uint64_t>(std::bit_cast<std::uint32_t>(end)) << 32);
  decks_[index].loopRange.store(packed, std::memory_order_release);
  return true;
}
bool AudioEngine::setCrossfadeCurve(std::uint32_t curve) noexcept {
  if (curve > 2) return false;
  requestedCrossfadeCurve_.store(curve, std::memory_order_release);
  return true;
}

bool AudioEngine::crossfade(float position) noexcept {
  if (!running() || !std::isfinite(position) || position < 0 || position > 1) return false;
  requestedCrossfade_.store(position, std::memory_order_release);
  autoMixCommand_.store(-1, std::memory_order_release);
  autoMixState_.store(0, std::memory_order_release);
  return true;
}
bool AudioEngine::startAutoMix(std::uint32_t bars) noexcept {
  if (!running() || bars < 1 || bars > 16 ||
      !decks_[0].loaded.load(std::memory_order_acquire) || !decks_[1].loaded.load(std::memory_order_acquire)) return false;
  const bool a = decks_[0].playing.load(std::memory_order_acquire);
  const bool b = decks_[1].playing.load(std::memory_order_acquire);
  const std::uint32_t source = a != b ? (a ? 0U : 1U) : (crossfadePosition_.load(std::memory_order_relaxed) > 0.5F ? 1U : 0U);
  autoMixState_.store(1, std::memory_order_release);
  autoMixCommand_.store(static_cast<int>(bars * 2 + source), std::memory_order_release);
  return true;
}
void AudioEngine::stopAutoMix() noexcept {
  requestedCrossfade_.store(crossfadePosition_.load(std::memory_order_relaxed), std::memory_order_release);
  autoMixCommand_.store(-1, std::memory_order_release);
  autoMixState_.store(0, std::memory_order_release);
}
bool AudioEngine::setEQ(float lowDb, float midDb, float highDb) noexcept {
  const auto valid = [](float db) noexcept { return std::isfinite(db) && db >= -12 && db <= 12; };
  if (!valid(lowDb) || !valid(midDb) || !valid(highDb)) return false;
  lowDb_.store(lowDb, std::memory_order_release);
  midDb_.store(midDb, std::memory_order_release);
  highDb_.store(highDb, std::memory_order_release);
  return true;
}
bool AudioEngine::setDeckEQ(std::uint32_t index, float low, float mid, float high) noexcept {
  if (index >= kDeckCount || !std::isfinite(low) || !std::isfinite(mid) || !std::isfinite(high) ||
      low < -24 || low > 6 || mid < -24 || mid > 6 || high < -24 || high > 6) return false;
  decks_[index].lowDb.store(low, std::memory_order_relaxed);
  decks_[index].midDb.store(mid, std::memory_order_relaxed);
  decks_[index].highDb.store(high, std::memory_order_relaxed);
  return true;
}
bool AudioEngine::setDeckGain(std::uint32_t index, float gain) noexcept {
  if (index >= kDeckCount || !std::isfinite(gain) || gain < 0 || gain > 1.5F) return false;
  decks_[index].gain.store(gain, std::memory_order_relaxed);
  return true;
}
double AudioEngine::remainingTrackSeconds(std::uint32_t replacingDeck) const noexcept {
  if (replacingDeck >= kDeckCount || sampleRate_ <= 0) return 0;
  double seconds = 0;
  for (std::size_t index = 0; index < kDeckCount; ++index)
    if (index != replacingDeck) seconds += decks_[index].frameCount.load(std::memory_order_acquire) / sampleRate_;
  return seconds;
}
bool AudioEngine::setKit(std::uint32_t kit) noexcept {
  if (kit >= kKitCount) return false;
  selectedKit_.store(kit, std::memory_order_release);
  return true;
}
bool AudioEngine::setTempo(float bpm) noexcept {
  if (!std::isfinite(bpm) || bpm < 60 || bpm > 200) return false;
  tempo_.store(bpm, std::memory_order_release);
  return true;
}
bool AudioEngine::setStep(std::uint32_t pad, std::uint32_t step, float velocity) noexcept {
  if (pad >= kPadCount || step >= kSteps || !std::isfinite(velocity) || velocity < 0 || velocity > 1) return false;
  pattern_[pad][step].store(velocity, std::memory_order_release);
  return true;
}
void AudioEngine::setSequencer(bool playing) noexcept {
  sequencerPlaying_.store(playing, std::memory_order_release);
}
float AudioEngine::deckPosition(std::uint32_t index) const noexcept {
  return index < kDeckCount ? decks_[index].position.load(std::memory_order_acquire) : 0;
}
double AudioEngine::deckDuration(std::uint32_t index, double sampleRate) const noexcept {
  return index < kDeckCount && sampleRate > 0 ? decks_[index].frameCount.load(std::memory_order_acquire) / sampleRate : 0;
}
bool AudioEngine::deckPlaying(std::uint32_t index) const noexcept {
  return index < kDeckCount && decks_[index].playing.load(std::memory_order_acquire);
}
float AudioEngine::deckBpm(std::uint32_t index) const noexcept {
  return index < kDeckCount ? decks_[index].bpm.load(std::memory_order_acquire) : 0;
}
float AudioEngine::deckPlaybackRate(std::uint32_t index) const noexcept {
  return index < kDeckCount ? decks_[index].rate.load(std::memory_order_acquire) : 1;
}
float AudioEngine::deckFirstBeat(std::uint32_t index) const noexcept {
  return index < kDeckCount ? decks_[index].firstBeat.load(std::memory_order_acquire) : 0;
}
const std::array<float, kWaveformBins>& AudioEngine::deckWaveform(std::uint32_t index) const noexcept {
  static const std::array<float, kWaveformBins> empty{};
  return index < kDeckCount ? decks_[index].waveform : empty;
}

bool AudioEngine::push(Command command) noexcept {
  // Capture epoch before the active check: commands racing a restart stay stale.
  command.epoch = epoch_.load(std::memory_order_acquire);
  command.noteEpoch = noteEpoch_.load(std::memory_order_acquire);
  if (!running()) return false;
  if (commands_.tryPush(command)) return true;
  dropped_.fetch_add(1, std::memory_order_relaxed);
  return false;
}

bool AudioEngine::trigger(std::uint32_t pad, float velocity) noexcept {
  if (pad >= kPadCount || !std::isfinite(velocity) || velocity <= 0 || velocity > 1) return false;
  return push({pad, velocity, 0, 0});
}

bool AudioEngine::setMaster(float gain) noexcept {
  if (!std::isfinite(gain) || gain < 0 || gain > 1 || !running()) return false;
  // Latest-value mailbox: continuous controls cannot fill the trigger queue or
  // disappear when a stopped session discards its stale hit commands.
  requestedMaster_.store(gain, std::memory_order_release);
  return true;
}

bool AudioEngine::allNotesOff() noexcept {
  if (!running()) return false;
  // Panic bypasses the queue and invalidates every trigger queued before it.
  noteEpoch_.fetch_add(1, std::memory_order_release);
  return true;
}

float AudioEngine::progress(std::uint32_t pad) const noexcept {
  return pad < kPadCount ? progress_[pad].load(std::memory_order_relaxed) : -1;
}

void AudioEngine::startVoice(std::uint32_t pad, float velocity) noexcept {
  // Retrigger a pad through a short release; do not stack dozens of identical
  // bass/acid tails into the master limiter on fast repeated taps.
  for (auto& voice : voices_) if (voice.sample && voice.pad == pad && voice.releaseRemaining == 0)
    voice.releaseRemaining = kFadeFrames;
  auto* selected = &voices_[0];
  for (auto& voice : voices_) {
    if (!voice.sample && voice.tailRemaining == 0) { selected = &voice; break; }
    if (voice.serial < selected->serial) selected = &voice;
  }
  const auto lastL = selected->previousL;
  const auto lastR = selected->previousR;
  const auto kit = selectedKit_.load(std::memory_order_relaxed);
  *selected = {&kits_[kit][pad], pad, 0, ++voiceSerial_, velocity,
               0, 0, lastL, lastR, kFadeFrames, 0};
  triggered_.fetch_add(1, std::memory_order_relaxed);
}

void AudioEngine::apply(const Command& command) noexcept {
  if (command.epoch != epoch_.load(std::memory_order_relaxed)) return;
  if (command.noteEpoch == noteEpoch_.load(std::memory_order_acquire)) startVoice(command.pad, command.velocity);
}

void AudioEngine::render(float* left, float* right, std::uint32_t frames) noexcept {
  if (!left || !right) return;
  std::fill_n(left, frames, 0);
  std::fill_n(right, frames, 0);
  if (!running()) return;

  const auto noteEpoch = noteEpoch_.load(std::memory_order_acquire);
  if (noteEpoch != appliedNoteEpoch_) {
    for (auto& voice : voices_) if (voice.sample) voice.releaseRemaining = kFadeFrames;
    appliedNoteEpoch_ = noteEpoch;
  }

  Command command;
  // Bounded work even under input flood; a producer can never stall RemoteIO.
  for (int i = 0; i < 128 && commands_.tryPop(command); ++i) apply(command);
  const float targetMaster = requestedMaster_.load(std::memory_order_acquire);
  const float targetLow = std::pow(10.0F, lowDb_.load(std::memory_order_relaxed) / 20.0F);
  const float targetMid = std::pow(10.0F, midDb_.load(std::memory_order_relaxed) / 20.0F);
  const float targetHigh = std::pow(10.0F, highDb_.load(std::memory_order_relaxed) / 20.0F);
  // Control-rate snapshots: atomics are read once per callback, never in the
  // per-sample mixer. Audio smoothing remains sample-rate independent.
  const bool sequenceOn = sequencerPlaying_.load(std::memory_order_relaxed);
  const double stepFrames = sampleRate_ * 15.0 / tempo_.load(std::memory_order_relaxed);
  float targetCrossfade = requestedCrossfade_.load(std::memory_order_relaxed);
  const auto curve = requestedCrossfadeCurve_.load(std::memory_order_relaxed);
  int autoCommand = autoMixCommand_.exchange(0, std::memory_order_acq_rel);
  // After a transition, wait until the playing track approaches its end, then
  // bring the other deck back in. A manual fader move or pause cancels it.
  if (!autoCommand && !autoMixActive_ && autoMixState_.load(std::memory_order_acquire) == 2) {
    const auto& source = decks_[autoMixSource_];
    if (!source.playing.load(std::memory_order_acquire)) autoMixState_.store(0, std::memory_order_release);
    else {
      const float detected = source.bpm.load(std::memory_order_relaxed);
      const float bpm = detected >= 60 && detected <= 200 ? detected : tempo_.load(std::memory_order_relaxed);
      const double remaining = (1.0 - source.position.load(std::memory_order_relaxed)) *
        source.frameCount.load(std::memory_order_relaxed) / std::max(0.5F, source.rate.load(std::memory_order_relaxed));
      const double fadeFrames = sampleRate_ * autoMixBars_ * 4.0 * 60.0 / bpm;
      if (remaining <= fadeFrames) { autoCommand = static_cast<int>(autoMixBars_ * 2 + autoMixSource_); autoMixState_.store(1, std::memory_order_release); }
    }
  }
  if (autoCommand < 0) autoMixActive_ = false;
  else if (autoCommand >= 2) {
    autoMixSource_ = static_cast<std::uint32_t>(autoCommand & 1);
    autoMixBars_ = static_cast<std::uint32_t>(autoCommand / 2);
    const auto target = 1U - autoMixSource_;
    // Start both decks without altering playback pitch; existing BPM estimates
    // determine fade duration only, and no unverified sync is imposed.
    if (decks_[autoMixSource_].position.load(std::memory_order_relaxed) >= 0.999F)
      decks_[autoMixSource_].seek.store(0, std::memory_order_release);
    if (decks_[target].position.load(std::memory_order_relaxed) >= 0.999F)
      decks_[target].seek.store(0, std::memory_order_release);
    decks_[autoMixSource_].playing.store(true, std::memory_order_release);
    decks_[target].playing.store(true, std::memory_order_release);
    const float estimate = decks_[autoMixSource_].bpm.load(std::memory_order_relaxed);
    const float bpm = estimate >= 60 && estimate <= 200 ? estimate : tempo_.load(std::memory_order_relaxed);
    const auto sourceFrames = decks_[autoMixSource_].frameCount.load(std::memory_order_relaxed);
    const float sourcePosition = decks_[autoMixSource_].position.load(std::memory_order_relaxed);
    const double remaining = (sourcePosition >= 0.999F ? 1.0 : 1.0 - sourcePosition) * sourceFrames /
      std::max(0.5F, decks_[autoMixSource_].rate.load(std::memory_order_relaxed));
    const double intended = sampleRate_ * autoMixBars_ * 4.0 * 60.0 / bpm;
    const auto targetFrames = decks_[target].frameCount.load(std::memory_order_relaxed);
    const float targetPosition = decks_[target].position.load(std::memory_order_relaxed);
    const double targetRate = std::max(0.5F, decks_[target].rate.load(std::memory_order_relaxed));
    double targetRemaining = (targetPosition >= 0.999F ? 1.0 : 1.0 - targetPosition) * targetFrames / targetRate;
    if (targetRemaining < intended && targetPosition > 0) {
      decks_[target].seek.store(0, std::memory_order_release);
      targetRemaining = targetFrames / targetRate;
    }
    autoMixTotal_ = static_cast<std::uint64_t>(std::max(1.0, std::min({intended, std::max(sampleRate_ * 0.1, remaining), std::max(1.0, targetRemaining)})));
    autoMixFrame_ = 0;
    autoMixStart_ = crossfade_;
    autoMixTarget_ = target == 0 ? 0.f : 1.f;
    autoMixActive_ = true;
  }
  std::array<float, kDeckCount> filterAmounts{}, filterCoefficients{}, rates{};
  for (std::size_t index = 0; index < kDeckCount; ++index) {
    filterAmounts[index] = decks_[index].filterAmount.load(std::memory_order_relaxed);
    filterCoefficients[index] = decks_[index].filterCoefficient.load(std::memory_order_relaxed);
    rates[index] = decks_[index].rate.load(std::memory_order_relaxed);
  }
  std::array<float, kDeckCount> deckLow{}, deckMid{}, deckHigh{}, deckGain{}, loopStarts{}, loopEnds{};
  for (std::size_t index = 0; index < kDeckCount; ++index) {
    const auto& deck = decks_[index];
    deckLow[index] = std::pow(10.0F, deck.lowDb.load(std::memory_order_relaxed) / 20.0F);
    deckMid[index] = std::pow(10.0F, deck.midDb.load(std::memory_order_relaxed) / 20.0F);
    deckHigh[index] = std::pow(10.0F, deck.highDb.load(std::memory_order_relaxed) / 20.0F);
    deckGain[index] = deck.gain.load(std::memory_order_relaxed);
    const auto loop = deck.loopRange.load(std::memory_order_acquire);
    loopStarts[index] = std::bit_cast<float>(static_cast<std::uint32_t>(loop));
    loopEnds[index] = std::bit_cast<float>(static_cast<std::uint32_t>(loop >> 32));
  }
  float blockPeak = 0;
  double sumSqL = 0, sumSqR = 0;
  for (std::uint32_t frame = 0; frame < frames; ++frame) {
    if (sequenceOn && !sequencerWasPlaying_) {
      sequenceFrame_ = 0;
      nextStepFrame_ = 0;
      sequenceStep_ = 0;
    }
    if (sequenceOn && static_cast<double>(sequenceFrame_) >= nextStepFrame_) {
      currentStep_.store(sequenceStep_, std::memory_order_relaxed);
      for (std::size_t pad = 0; pad < kPadCount; ++pad) {
        const float velocity = pattern_[pad][sequenceStep_].load(std::memory_order_relaxed);
        if (velocity > 0) startVoice(static_cast<std::uint32_t>(pad), velocity);
      }
      sequenceStep_ = (sequenceStep_ + 1) % kSteps;
      nextStepFrame_ += stepFrames;
    }
    if (sequenceOn) ++sequenceFrame_;
    else if (sequencerWasPlaying_) currentStep_.store(0, std::memory_order_relaxed);
    sequencerWasPlaying_ = sequenceOn;
    float l = 0, r = 0;
    for (auto& voice : voices_) {
      float vl = 0, vr = 0;
      if (voice.tailRemaining > 0) {
        const float tail = static_cast<float>(voice.tailRemaining--) / kFadeFrames;
        vl += voice.tailL * tail;
        vr += voice.tailR * tail;
      }
      if (voice.sample) {
        const auto total = voice.sample->frames();
        const float attack = std::min(1.0F, static_cast<float>(voice.cursor) / kFadeFrames);
        const float endFade = std::min(1.0F, static_cast<float>(total - voice.cursor) / kFadeFrames);
        float envelope = attack * endFade * voice.velocity;
        if (voice.releaseRemaining > 0) envelope *= static_cast<float>(voice.releaseRemaining) / kFadeFrames;
        vl += voice.sample->stereo[voice.cursor * 2] * envelope;
        vr += voice.sample->stereo[voice.cursor * 2 + 1] * envelope;
        ++voice.cursor;
        const bool released = voice.releaseRemaining > 0 && --voice.releaseRemaining == 0;
        if (voice.cursor == total || released) voice.sample = nullptr;
      }
      voice.previousL = vl;
      voice.previousR = vr;
      l += vl;
      r += vr;
    }
    if (autoMixActive_) {
      const float p = std::min(1.f, static_cast<float>(autoMixFrame_) / static_cast<float>(autoMixTotal_));
      const float curve = p * p * (3.f - 2.f * p);
      targetCrossfade = autoMixStart_ + (autoMixTarget_ - autoMixStart_) * curve;
      if (++autoMixFrame_ >= autoMixTotal_) {
        targetCrossfade = autoMixTarget_;
        autoMixActive_ = false;
        if (autoMixCommand_.load(std::memory_order_acquire) < 0) {
          targetCrossfade = requestedCrossfade_.load(std::memory_order_relaxed);
          autoMixState_.store(0, std::memory_order_release);
        } else {
          requestedCrossfade_.store(targetCrossfade, std::memory_order_relaxed);
          decks_[autoMixSource_].playing.store(false, std::memory_order_release);
          autoMixSource_ = 1U - autoMixSource_;
          autoMixState_.store(2, std::memory_order_release);
        }
      }
    }
    crossfade_ += std::clamp(targetCrossfade - crossfade_, -gainSlew_, gainSlew_);
    float targetGainA = 0, targetGainB = 0;
    float targetBassA = 0, targetBassB = 0;
    if (curve == 0) {
      // Smoothstep: continuous value and first derivative at both endpoints.
      const float t = crossfade_ * crossfade_ * (3.0F - 2.0F * crossfade_);
      targetGainA = targetBassA = 1.0F - t;
      targetGainB = targetBassB = t;
    } else if (curve == 1) {
      // A narrow 8% cut zone for scratch-style transitions.
      const float t = std::clamp((crossfade_ - 0.46F) / 0.08F, 0.0F, 1.0F);
      targetGainA = targetBassA = 1.0F - t;
      targetGainB = targetBassB = t;
    } else {
      // Preserve FIX38's equal-power treble and correlated-bass behavior.
      targetGainA = std::sqrt(std::max(0.0F, 1.0F - crossfade_));
      targetGainB = std::sqrt(std::max(0.0F, crossfade_));
      targetBassA = 1.0F - crossfade_;
      targetBassB = crossfade_;
    }
    // Slew the gains themselves: switching curves at a static fader position
    // must not make an abrupt PCM step.
    const auto slew = [this](float& current, float target) noexcept {
      current += std::clamp(target - current, -gainSlew_, gainSlew_);
    };
    slew(curveGainA_, targetGainA);
    slew(curveGainB_, targetGainB);
    slew(curveBassA_, targetBassA);
    slew(curveBassB_, targetBassB);
    const float gainA = curveGainA_;
    const float gainB = curveGainB_;
    for (std::size_t index = 0; index < kDeckCount; ++index) {
      auto& deck = decks_[index];
      const auto total = deck.track.frames();
      if (!total) continue;
      const float seek = deck.seek.exchange(-1, std::memory_order_acq_rel);
      if (seek >= 0) {
        deck.seekTailL = deck.lastL;
        deck.seekTailR = deck.lastR;
        deck.seekFadeRemaining = kFadeFrames;
        deck.cursor = std::min<double>(total - 1, static_cast<double>(seek) * total);
      }
      const bool playing = deck.playing.load(std::memory_order_acquire);
      const bool jogging = deck.jogging.load(std::memory_order_acquire);
      const auto revision = deck.jogRevision.load(std::memory_order_acquire);
      if (revision != deck.seenJogRevision) {
        deck.seenJogRevision = revision;
        deck.jogIdleFrames = 0;
      } else if (deck.jogIdleFrames < jogTimeoutFrames_) ++deck.jogIdleFrames;
      const float targetRate = jogging ? (deck.jogIdleFrames < jogTimeoutFrames_ ?
                               deck.jogRate.load(std::memory_order_relaxed) : 0) :
                               playing ? rates[index] : 0;
      deck.actualRate += std::clamp(targetRate - deck.actualRate, -jogSlew_, jogSlew_);
      const bool atEdge = (deck.cursor <= 0 && deck.actualRate < 0) ||
                          (deck.cursor >= total - 1 && deck.actualRate > 0);
      const bool audible = (jogging ? std::abs(targetRate) > 0.015F : playing) && !atEdge;
      deck.envelope += std::clamp((audible ? 1.0F : 0.0F) - deck.envelope, -gainSlew_, gainSlew_);
      if (deck.envelope > 0 && deck.cursor < total) {
        const auto first = static_cast<std::size_t>(deck.cursor);
        const auto next = std::min<std::size_t>(first + 1, total - 1);
        const float fraction = static_cast<float>(deck.cursor - first);
        const float side = index == 0 ? gainA : gainB;
        float sampleL = deck.track.stereo[2 * first] * (1 - fraction) + deck.track.stereo[2 * next] * fraction;
        float sampleR = deck.track.stereo[2 * first + 1] * (1 - fraction) + deck.track.stereo[2 * next + 1] * fraction;
        if (deck.seekFadeRemaining > 0) {
          const float fade = static_cast<float>(deck.seekFadeRemaining--) / kFadeFrames;
          sampleL = sampleL * (1 - fade) + deck.seekTailL * fade;
          sampleR = sampleR * (1 - fade) + deck.seekTailR * fade;
        }
        deck.lastL = sampleL;
        deck.lastR = sampleR;
        deck.filterAmountSmooth += std::clamp(filterAmounts[index] - deck.filterAmountSmooth,
                                               -gainSlew_, gainSlew_);
        const float amount = deck.filterAmountSmooth;
        deck.filterG += std::clamp(filterCoefficients[index] - deck.filterG,
                                   -gainSlew_, gainSlew_);
        const float g = deck.filterG;
        const float denominator = 1.0F / (1.0F + 1.41421356F * g + g * g);
        const auto filter = [g, denominator, amount, wet = std::abs(amount)](float input, float& low, float& band) noexcept {
          // Topology-preserving SVF: integrate the band state inside the
          // denominator. The old high-pass recurrence omitted g*band and
          // became unstable while sweeping, even with normalized input PCM.
          const float nextBand = (band + g * (input - low)) * denominator;
          const float nextLow = low + g * nextBand;
          const float high = input - 1.41421356F * nextBand - nextLow;
          band = 2 * nextBand - band;
          low = 2 * nextLow - low;
          if (std::abs(band) < 1.e-20F) band = 0;
          if (std::abs(low) < 1.e-20F) low = 0;
          return input * (1 - wet) + (amount < 0 ? nextLow : high) * wet;
        };
        sampleL = filter(sampleL, deck.filterLowL, deck.filterBandL);
        sampleR = filter(sampleR, deck.filterLowR, deck.filterBandR);
        deck.lowGain += std::clamp(deckLow[index] - deck.lowGain, -gainSlew_, gainSlew_);
        deck.midGain += std::clamp(deckMid[index] - deck.midGain, -gainSlew_, gainSlew_);
        deck.highGain += std::clamp(deckHigh[index] - deck.highGain, -gainSlew_, gainSlew_);
        deck.gainSmooth += std::clamp(deckGain[index] - deck.gainSmooth, -gainSlew_, gainSlew_);
        const auto channelEQ = [&](float input, float& low, float& high) noexcept {
          low += lowCoefficient_ * (input - low);
          high += highCoefficient_ * (input - high);
          if (std::abs(low) < 1.e-20F) low = 0;
          if (std::abs(high) < 1.e-20F) high = 0;
          return (low * deck.lowGain + (high - low) * deck.midGain +
                  (input - high) * deck.highGain) * deck.gainSmooth;
        };
        sampleL = channelEQ(sampleL, deck.eqLowL, deck.eqHighL);
        sampleR = channelEQ(sampleR, deck.eqLowR, deck.eqHighR);
        deck.bassL += bassCoefficient_ * (sampleL - deck.bassL);
        deck.bassR += bassCoefficient_ * (sampleR - deck.bassR);
        const float bassSide = index == 0 ? curveBassA_ : curveBassB_;
        l += ((sampleL - deck.bassL) * side + deck.bassL * bassSide) * deck.envelope;
        r += ((sampleR - deck.bassR) * side + deck.bassR * bassSide) * deck.envelope;
      }
      if (jogging) {
        deck.cursor = std::clamp(deck.cursor + deck.actualRate, 0.0, static_cast<double>(total - 1));
      } else if (playing) {
        deck.cursor = std::max(0.0, deck.cursor + deck.actualRate);
        const auto loopEnd = std::max(1.0, static_cast<double>(loopEnds[index]) * total);
        if (deck.cursor >= loopEnd) {
          if (loopStarts[index] > 0 || loopEnds[index] < 1) {
            deck.seekTailL = deck.lastL;
            deck.seekTailR = deck.lastR;
            deck.seekFadeRemaining = kFadeFrames;
            const double start = static_cast<double>(loopStarts[index]) * total;
            // Retain fractional overshoot at every wrap; dropping it drifts the beat grid.
            const double span = loopEnd - start;
            deck.cursor = span > 0 ? start + std::fmod(deck.cursor - loopEnd, span) : start;
          }
          else { deck.cursor = total - 1; deck.playing.store(false, std::memory_order_release); }
        }
      }
    }
    lowGain_ += std::clamp(targetLow - lowGain_, -gainSlew_, gainSlew_);
    midGain_ += std::clamp(targetMid - midGain_, -gainSlew_, gainSlew_);
    highGain_ += std::clamp(targetHigh - highGain_, -gainSlew_, gainSlew_);
    const auto equalize = [&](float input, float& low, float& highLp) noexcept {
      low += lowCoefficient_ * (input - low);
      highLp += highCoefficient_ * (input - highLp);
      if (std::abs(low) < 1.0e-20F) low = 0;
      if (std::abs(highLp) < 1.0e-20F) highLp = 0;
      return low * lowGain_ + (highLp - low) * midGain_ + (input - highLp) * highGain_;
    };
    l = equalize(l, lowL_, highLpL_);
    r = equalize(r, lowR_, highLpR_);
    master_ += std::clamp(targetMaster - master_, -gainSlew_, gainSlew_);
    l *= master_ * kHeadroom;
    r *= master_ * kHeadroom;
    const float magnitude = std::max(std::abs(l), std::abs(r));
    const float required = magnitude > 0.96F ? 0.96F / magnitude : 1.0F;
    // Hold peak attenuation through a bass cycle; sample-by-sample release
    // previously amplitude-modulated the mix and created harsh harmonics.
    if (required < limiter_) { limiter_ = required; limiterHold_ = limiterHoldFrames_; }
    else if (limiterHold_) --limiterHold_;
    else limiter_ += limiterRelease_ * (required - limiter_);
    left[frame] = l * limiter_;
    right[frame] = r * limiter_;
    blockPeak = std::max({blockPeak, std::abs(left[frame]), std::abs(right[frame])});
    sumSqL += static_cast<double>(left[frame]) * left[frame];
    sumSqR += static_cast<double>(right[frame]) * right[frame];
  }
  std::array<std::uint64_t, kPadCount> newest{};
  std::array<float, kPadCount> progress;
  progress.fill(-1);
  for (const auto& voice : voices_) {
    if (voice.sample && voice.serial > newest[voice.pad]) {
      newest[voice.pad] = voice.serial;
      progress[voice.pad] = static_cast<float>(voice.cursor) / static_cast<float>(voice.sample->frames());
    }
  }
  for (std::size_t pad = 0; pad < kPadCount; ++pad) progress_[pad].store(progress[pad], std::memory_order_relaxed);
  for (auto& deck : decks_) if (deck.track.frames())
    deck.position.store(static_cast<float>(deck.cursor / deck.track.frames()), std::memory_order_release);
  crossfadePosition_.store(crossfade_, std::memory_order_relaxed);
  peak_.store(blockPeak, std::memory_order_relaxed);
  const double denominator = frames > 0 ? static_cast<double>(frames) : 1.0;
  meterRmsL_.store(static_cast<float>(std::sqrt(sumSqL / denominator)), std::memory_order_relaxed);
  meterRmsR_.store(static_cast<float>(std::sqrt(sumSqR / denominator)), std::memory_order_relaxed);
  renderedFrames_.fetch_add(frames, std::memory_order_relaxed);
}

}  // namespace artss::audio
