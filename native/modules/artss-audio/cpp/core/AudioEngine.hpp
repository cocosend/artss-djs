#pragma once

#include "BoundedQueue.hpp"

#include <array>
#include <atomic>
#include <cstdint>
#include <vector>

namespace artss::audio {

constexpr std::size_t kPadCount = 8;
constexpr std::size_t kVoiceCount = 48;
constexpr std::size_t kWaveformBins = 96;
constexpr std::size_t kDeckCount = 2;
constexpr std::size_t kKitCount = 4; // original starter kit + 303/606/909
constexpr std::size_t kSteps = 16;

struct Sample final {
  std::vector<float> stereo;
  std::uint32_t frames() const noexcept {
    return static_cast<std::uint32_t>(stereo.size() / 2);
  }
};
struct BeatGrid final {
  float bpm{};
  float firstBeatSeconds{};
  float confidence{};
};
using SampleBank = std::array<Sample, kPadCount>;
using Waveforms = std::array<std::array<float, kWaveformBins>, kPadCount>;

// prepare/activate/deactivateAfterStop require exclusive lifecycle ownership.
// render is single-consumer and called ONLY by the Audio Unit render thread.
class AudioEngine final {
 public:
  AudioEngine() noexcept;
  void prepare(double sampleRate, SampleBank bank);
  void activate() noexcept;
  void rejectCommands() noexcept;
  void deactivateAfterStop() noexcept;

  bool trigger(std::uint32_t pad, float velocity) noexcept;
  bool setMaster(float gain) noexcept;
  bool allNotesOff() noexcept;
  // Track ownership changes only while RemoteIO is stopped.
  void loadDeck(std::uint32_t deck, Sample track);
  void loadDeck(std::uint32_t deck, Sample track, BeatGrid grid);
  bool deckPlay(std::uint32_t deck, bool play) noexcept;
  bool deckSetCue(std::uint32_t deck) noexcept;
  bool deckCue(std::uint32_t deck) noexcept;
  float deckCuePosition(std::uint32_t deck) const noexcept;
  bool deckSeek(std::uint32_t deck, float normalized) noexcept;
  bool deckRate(std::uint32_t deck, float rate) noexcept;
  bool deckFilter(std::uint32_t deck, float amount) noexcept;
  bool deckSync(std::uint32_t deck) noexcept;
  bool deckJog(std::uint32_t deck, float speed, bool touching) noexcept;
  bool deckLoop(std::uint32_t deck, float start, float end) noexcept;
  bool crossfade(float position) noexcept;
  bool setCrossfadeCurve(std::uint32_t curve) noexcept;
  bool startAutoMix(std::uint32_t bars) noexcept;
  void stopAutoMix() noexcept;
  std::uint32_t autoMixState() const noexcept { return autoMixState_.load(std::memory_order_acquire); }
  float crossfadePosition() const noexcept { return crossfadePosition_.load(std::memory_order_relaxed); }
  bool setEQ(float lowDb, float midDb, float highDb) noexcept;
  bool setDeckEQ(std::uint32_t deck, float lowDb, float midDb, float highDb) noexcept;
  bool setDeckGain(std::uint32_t deck, float gain) noexcept;
  bool setKit(std::uint32_t kit) noexcept;
  bool setTempo(float bpm) noexcept;
  bool setStep(std::uint32_t pad, std::uint32_t step, float velocity) noexcept;
  void setSequencer(bool playing) noexcept;
  std::uint32_t currentStep() const noexcept { return currentStep_.load(std::memory_order_relaxed); }
  float deckPosition(std::uint32_t deck) const noexcept;
  double deckDuration(std::uint32_t deck, double sampleRate) const noexcept;
  double remainingTrackSeconds(std::uint32_t replacingDeck) const noexcept;
  bool deckPlaying(std::uint32_t deck) const noexcept;
  float deckBpm(std::uint32_t deck) const noexcept;
  float deckPlaybackRate(std::uint32_t deck) const noexcept;
  float deckFirstBeat(std::uint32_t deck) const noexcept;
  const std::array<float, kWaveformBins>& deckWaveform(std::uint32_t deck) const noexcept;
  void render(float* left, float* right, std::uint32_t frames) noexcept;

  bool running() const noexcept { return active_.load(std::memory_order_acquire); }
  float peak() const noexcept { return peak_.load(std::memory_order_relaxed); }
  float meterRmsL() const noexcept { return meterRmsL_.load(std::memory_order_relaxed); }
  float meterRmsR() const noexcept { return meterRmsR_.load(std::memory_order_relaxed); }
  float progress(std::uint32_t pad) const noexcept;
  std::uint64_t renderedFrames() const noexcept {
    return renderedFrames_.load(std::memory_order_relaxed);
  }
  std::uint64_t droppedCommands() const noexcept {
    return dropped_.load(std::memory_order_relaxed);
  }
  std::uint64_t triggeredVoices() const noexcept {
    return triggered_.load(std::memory_order_relaxed);
  }
  const Waveforms& waveforms() const noexcept {
    return kitWaveforms_[selectedKit_.load(std::memory_order_acquire)];
  }

 private:
  struct Command {
    std::uint32_t pad{};
    float velocity{};
    std::uint64_t epoch{};
    std::uint64_t noteEpoch{};
  };
  struct Voice {
    const Sample* sample{};
    std::uint32_t pad{};
    std::uint32_t cursor{};
    std::uint64_t serial{};
    float velocity{};
    float previousL{}, previousR{};
    float tailL{}, tailR{};
    std::uint32_t tailRemaining{};
    std::uint32_t releaseRemaining{};
  };

  bool push(Command command) noexcept;
  void apply(const Command& command) noexcept;
  void startVoice(std::uint32_t pad, float velocity) noexcept;

  std::array<SampleBank, kKitCount> kits_{};
  std::array<Waveforms, kKitCount> kitWaveforms_{};
  std::atomic<std::uint32_t> selectedKit_{0};
  std::atomic<float> tempo_{136};
  std::atomic<bool> sequencerPlaying_{false};
  std::array<std::array<std::atomic<float>, kSteps>, kPadCount> pattern_{};
  std::atomic<std::uint32_t> currentStep_{0};
  std::uint64_t sequenceFrame_{0};
  double nextStepFrame_{0};
  std::uint32_t sequenceStep_{0};
  bool sequencerWasPlaying_{false};
  std::array<Voice, kVoiceCount> voices_{};
  BoundedQueue<Command, 512> commands_{};
  std::atomic<bool> active_{false};
  std::atomic<std::uint64_t> epoch_{0};
  std::atomic<std::uint64_t> noteEpoch_{0};
  std::atomic<std::uint64_t> renderedFrames_{0}, dropped_{0}, triggered_{0};
  std::atomic<float> peak_{0};
  std::atomic<float> meterRmsL_{0}, meterRmsR_{0};
  std::atomic<float> requestedMaster_{0.75F};
  std::array<std::atomic<float>, kPadCount> progress_{};
  float master_{0.75F};
  float limiter_{1};
  std::uint32_t limiterHold_{0}, limiterHoldFrames_{480};
  float gainSlew_{1.0F / 240.0F}, limiterRelease_{1.0F / 2400.0F}, jogSlew_{4.0F / 240.0F};
  std::uint32_t jogTimeoutFrames_{2400};
  std::uint64_t voiceSerial_{0};
  std::uint64_t appliedNoteEpoch_{0};
  bool prepared_{false};
  struct Deck {
    Sample track;
    std::array<float, kWaveformBins> waveform{};
    std::atomic<float> seek{-1}, cue{0}, rate{1}, jogRate{0}, position{0};
    std::atomic<std::uint32_t> jogRevision{0}, frameCount{0};
    std::atomic<std::uint64_t> loopRange{0x3f80000000000000ULL};
    std::atomic<float> gain{1}, lowDb{0}, midDb{0}, highDb{0};
    float gainSmooth{1}, lowGain{1}, midGain{1}, highGain{1};
    float eqLowL{0}, eqLowR{0}, eqHighL{0}, eqHighR{0}, bassL{0}, bassR{0};
    std::atomic<bool> playing{false}, jogging{false}, loaded{false};
    std::atomic<float> bpm{0}, firstBeat{0};
    std::atomic<float> filterAmount{0}, filterCoefficient{0};
    float filterAmountSmooth{0}, filterG{0}, filterLowL{0}, filterBandL{0}, filterLowR{0}, filterBandR{0};
    double cursor{0};
    float envelope{0}, actualRate{0}, lastL{0}, lastR{0}, seekTailL{0}, seekTailR{0};
    std::uint32_t seekFadeRemaining{0}, seenJogRevision{0}, jogIdleFrames{0};
  };
  std::array<Deck, kDeckCount> decks_{};
  // Curve IDs: 0 smooth (S-curve), 1 sharp (scratch cut), 2 dipless (existing).
  std::atomic<std::uint32_t> requestedCrossfadeCurve_{2};
  float curveGainA_{0.707106781F}, curveGainB_{0.707106781F};
  float curveBassA_{0.5F}, curveBassB_{0.5F};
  std::atomic<float> requestedCrossfade_{0.5F};
  float crossfade_{0.5F};
  std::atomic<float> crossfadePosition_{0.5F};
  // Command: 0 idle, -1 cancel, positive (bars*2 + source deck).
  std::atomic<int> autoMixCommand_{0};
  std::atomic<std::uint32_t> autoMixState_{0};
  bool autoMixActive_{false};
  std::uint32_t autoMixSource_{0}, autoMixBars_{4};
  std::uint64_t autoMixFrame_{0}, autoMixTotal_{1};
  float autoMixStart_{0.5F}, autoMixTarget_{1};
  std::atomic<float> lowDb_{0}, midDb_{0}, highDb_{0};
  float lowGain_{1}, midGain_{1}, highGain_{1};
  float lowL_{0}, lowR_{0}, highLpL_{0}, highLpR_{0};
  float lowCoefficient_{0}, highCoefficient_{0}, bassCoefficient_{0};
  double sampleRate_{48000};
};

}  // namespace artss::audio
