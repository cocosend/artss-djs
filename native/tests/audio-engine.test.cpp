#include "AudioEngine.hpp"
#include "BeatGrid.hpp"
#include "DrumSynth.hpp"

#include <array>
#include <atomic>
#include <cassert>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <new>
#include <thread>

namespace {
thread_local bool inRender = false;
std::atomic<std::uint64_t> renderAllocations{0};
[[gnu::noinline]] void releaseAllocation(void* pointer) noexcept { std::free(pointer); }
}

void* operator new(std::size_t bytes) {
  if (inRender) renderAllocations.fetch_add(1, std::memory_order_relaxed);
  if (auto* p = std::malloc(bytes == 0 ? 1 : bytes)) return p;
  throw std::bad_alloc();
}
void* operator new[](std::size_t bytes) { return ::operator new(bytes); }
void operator delete(void* p) noexcept { releaseAllocation(p); }
void operator delete[](void* p) noexcept { releaseAllocation(p); }
void operator delete(void* p, std::size_t) noexcept { releaseAllocation(p); }
void operator delete[](void* p, std::size_t) noexcept { releaseAllocation(p); }

using namespace artss::audio;

namespace {
SampleBank makeBank(std::size_t frames = 8192, float value = 0.75F) {
  SampleBank bank;
  for (auto& sample : bank) sample.stereo.assign(frames * 2, value);
  return bank;
}
void render(AudioEngine& engine, float* left, float* right, std::uint32_t frames);
Sample makeClickTrack(unsigned sampleRate, double bpm, double offset = 0.25) {
  Sample track;
  track.stereo.assign(sampleRate * 12 * 2, 0);
  for (double seconds = offset; seconds < 11.8; seconds += 60.0 / bpm) {
    const auto start = static_cast<std::size_t>(seconds * sampleRate);
    for (std::size_t frame = start; frame < start + sampleRate / 100; ++frame)
      track.stereo[2 * frame] = track.stereo[2 * frame + 1] = 0.8F;
  }
  return track;
}

void syncBeatGrids() {
  AudioEngine engine;
  engine.prepare(48000, makeBank());
  engine.loadDeck(0, makeClickTrack(48000, 120));
  engine.loadDeck(1, makeClickTrack(48000, 100));
  assert(std::abs(engine.deckBpm(1) - 100) < 2);
  engine.activate();
  assert(!engine.deckSync(1));
  assert(engine.deckPlay(0, true));
  assert(!engine.deckSync(1)); // A stopped target cannot remain phase-aligned.
  assert(engine.deckPlay(1, true));
  assert(engine.deckSync(1));
  assert(std::abs(engine.deckPlaybackRate(1) - 1.2F) < 0.03F);
  std::array<float, 1024> left{}, right{};
  render(engine, left.data(), right.data(), left.size());
  const double sourcePhase = (engine.deckPosition(0) * 12 - 0.25) * engine.deckBpm(0) / 60;
  const double targetPhase = (engine.deckPosition(1) * 12 - 0.25) * engine.deckBpm(1) / 60;
  const double phaseDifference = std::abs((sourcePhase - targetPhase) - std::round(sourcePhase - targetPhase));
  assert(phaseDifference < 0.05);
  engine.rejectCommands();
  engine.deactivateAfterStop();
}

void render(AudioEngine& engine, float* left, float* right, std::uint32_t frames) {
  inRender = true;
  engine.render(left, right, frames);
  inRender = false;
}

void validationAndVoiceLifecycle() {
  AudioEngine engine;
  engine.activate();
  assert(!engine.running());
  assert(!engine.trigger(0, 1));
  bool rejected = false;
  try { engine.prepare(48000, {}); } catch (const std::invalid_argument&) { rejected = true; }
  assert(rejected);
  engine.prepare(48000, makeBank());
  engine.activate();
  assert(!engine.trigger(8, 1));
  assert(!engine.trigger(0, std::numeric_limits<float>::quiet_NaN()));
  assert(!engine.trigger(0, 0));
  assert(!engine.setMaster(2));
  assert(!engine.setMaster(std::numeric_limits<float>::infinity()));
  rejected = false;
  try { engine.prepare(48000, makeBank()); } catch (const std::logic_error&) { rejected = true; }
  assert(rejected);
  std::array<float, 512> left{}, right{};
  assert(engine.trigger(0, 1));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.peak() > 0.1F);
  assert(engine.progress(0) > 0);
  assert(engine.progress(1) == -1);
  assert(left[0] == 0);  // attack starts at zero, even for DC test PCM.
  assert(engine.renderedFrames() == 512);
  assert(engine.allNotesOff());
  render(engine, left.data(), right.data(), left.size());
  assert(std::abs(left.back()) < 1.0e-6F);
  assert(engine.progress(0) == -1);
  engine.rejectCommands();
  engine.deactivateAfterStop();
  assert(!engine.running());
  assert(engine.peak() == 0);
  render(engine, left.data(), right.data(), left.size());
  for (auto x : left) assert(x == 0);
}

void limiterRampAndStaleCommands() {
  AudioEngine engine;
  engine.prepare(48000, makeBank());
  engine.activate();
  for (std::size_t i = 0; i < kVoiceCount * 2; ++i) assert(engine.trigger(i % kPadCount, 1));
  std::array<float, 1024> left{}, right{};
  render(engine, left.data(), right.data(), left.size());
  for (const auto value : left) assert(std::isfinite(value) && std::abs(value) <= 0.960001F);
  assert(engine.triggeredVoices() == kVoiceCount * 2);
  assert(engine.setMaster(0));
  render(engine, left.data(), right.data(), left.size());
  assert(std::abs(left.back()) < 1.0e-6F);
  assert(engine.setMaster(0.75F));
  assert(engine.trigger(0, 1));
  const auto before = engine.triggeredVoices();
  engine.rejectCommands();
  engine.deactivateAfterStop();
  engine.activate();
  render(engine, left.data(), right.data(), left.size());
  assert(engine.triggeredVoices() == before);  // stale trigger never survives restart.
  for (const auto value : left) assert(value == 0);
}

void queuePressureAndWaveforms() {
  AudioEngine engine;
  engine.prepare(44100, makeBank(8, 0.5F));
  for (const auto& waveform : engine.waveforms()) for (const auto value : waveform) assert(value == 0.5F);
  engine.activate();
  std::size_t accepted = 0;
  while (engine.trigger(0, 1)) ++accepted;
  assert(accepted == 512);
  assert(engine.droppedCommands() == 1);
  std::array<float, 16> left{}, right{};
  for (int i = 0; i < 4; ++i) render(engine, left.data(), right.data(), left.size());
  assert(engine.triggeredVoices() == 512);
  assert(engine.progress(0) == -1);
}

void panicBypassesFullQueue() {
  AudioEngine engine;
  engine.prepare(48000, makeBank());
  engine.activate();
  for (int i = 0; i < 512; ++i) assert(engine.trigger(0, 1));
  assert(engine.allNotesOff());
  std::array<float, 128> left{}, right{};
  for (int i = 0; i < 5; ++i) render(engine, left.data(), right.data(), left.size());
  assert(engine.triggeredVoices() == 0);
  assert(engine.trigger(0, 1));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.triggeredVoices() == 1);
  assert(engine.allNotesOff());
  for (int i = 0; i < 16; ++i) render(engine, left.data(), right.data(), left.size());
  assert(std::abs(left.back()) < 1.0e-6F);
}

void restartRecoversQueueAndLimiter() {
  AudioEngine engine;
  engine.prepare(48000, makeBank());
  engine.activate();
  for (int i = 0; i < 512; ++i) assert(engine.trigger(0, 1));
  engine.rejectCommands();
  engine.deactivateAfterStop();
  engine.activate();
  // A fresh trigger must fit before the first callback of the new session.
  assert(engine.trigger(0, 1));
  std::array<float, 512> left{}, right{};
  render(engine, left.data(), right.data(), left.size());
  assert(engine.triggeredVoices() == 1);
  const float singleVoicePeak = engine.peak();
  assert(singleVoicePeak > 0.1F);
  for (std::size_t i = 0; i < kVoiceCount; ++i) assert(engine.trigger(0, 1));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.peak() > 0.95F);  // exercise actual limiter attenuation.
  engine.rejectCommands();
  engine.deactivateAfterStop();
  engine.prepare(48000, makeBank());
  engine.activate();
  assert(engine.trigger(0, 1));
  render(engine, left.data(), right.data(), left.size());
  assert(std::abs(engine.peak() - singleVoicePeak) < 1.0e-6F);
}

void acceptedMasterSurvivesRestartBeforeRendering() {
  AudioEngine engine;
  engine.prepare(48000, makeBank());
  engine.activate();
  for (int i = 0; i < 512; ++i) assert(engine.trigger(0, 1));
  assert(engine.setMaster(0));  // accepted even when the trigger queue is full.
  engine.rejectCommands();
  engine.deactivateAfterStop();
  engine.activate();
  assert(engine.trigger(0, 1));
  std::array<float, 512> left{}, right{};
  render(engine, left.data(), right.data(), left.size());
  for (const auto value : left) assert(value == 0);
  assert(engine.peak() == 0);
  assert(engine.setMaster(0.25F));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.peak() > 0.05F && engine.peak() < 0.07F);
  engine.rejectCommands();
  engine.deactivateAfterStop();
  engine.activate();
  assert(engine.trigger(0, 1));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.peak() > 0.05F && engine.peak() < 0.07F);
}

void multiProducerQueue() {
  struct Item { std::uint32_t producer{}, sequence{}; };
  BoundedQueue<Item, 64> queue;
  constexpr std::size_t count = 5000;
  std::array<std::thread, 4> producers;
  for (std::size_t i = 0; i < producers.size(); ++i) {
    producers[i] = std::thread([&, i] {
      for (std::size_t j = 0; j < count; ++j) {
        while (!queue.tryPush({static_cast<std::uint32_t>(i), static_cast<std::uint32_t>(j)})) std::this_thread::yield();
      }
    });
  }
  std::array<std::uint32_t, 4> next{};
  std::size_t received = 0;
  while (received < count * producers.size()) {
    Item value;
    if (queue.tryPop(value)) {
      assert(value.producer < next.size());
      assert(value.sequence == next[value.producer]++);
      ++received;
    } else std::this_thread::yield();
  }
  for (auto& producer : producers) producer.join();
  for (const auto expected : next) assert(expected == count);
}

void concurrentRenderStress() {
  AudioEngine engine;
  engine.prepare(48000, makeBank());
  engine.activate();
  std::atomic<int> done{0};
  std::array<std::thread, 4> producers;
  for (std::size_t i = 0; i < producers.size(); ++i) {
    producers[i] = std::thread([&, i] {
      for (int j = 0; j < 3000; ++j) {
        engine.trigger(static_cast<std::uint32_t>(i), 0.8F);
        engine.setMaster(static_cast<float>(j % 100) / 100);
        (void)engine.progress(i);
        (void)engine.peak();
      }
      done.fetch_add(1, std::memory_order_release);
    });
  }
  std::array<float, 128> left{}, right{};
  std::uint32_t blocks = 0;
  while (done.load(std::memory_order_acquire) != 4 || blocks < 64) {
    render(engine, left.data(), right.data(), left.size());
    for (const auto value : left) assert(std::isfinite(value) && std::abs(value) <= 0.960001F);
    if (++blocks % 8 == 0) {
      // Emulate a stopped Audio Unit handing consumer ownership to lifecycle
      // while UI/RN producers may still finish a reserved queue publication.
      engine.rejectCommands();
      engine.deactivateAfterStop();
      engine.activate();
    }
  }
  for (auto& producer : producers) producer.join();
  for (int i = 0; i < 8; ++i) render(engine, left.data(), right.data(), left.size());
}

void twoDeckMixingAndSeeking() {
  AudioEngine engine;
  engine.prepare(48000, makeBank(8, 0.0F));
  Sample leftTrack, rightTrack;
  leftTrack.stereo.assign(48000 * 2, 0.8F);
  rightTrack.stereo.assign(48000 * 2, -0.8F);
  engine.loadDeck(0, std::move(leftTrack));
  engine.loadDeck(1, std::move(rightTrack));
  assert(engine.deckDuration(0, 48000) == 1);
  assert(engine.deckWaveform(0)[0] == 0.8F);
  engine.activate();
  assert(!engine.deckSeek(2, 0.5F));
  assert(!engine.deckRate(0, 0));
  assert(!engine.deckLoop(0, 0.8F, 0.2F));
  assert(engine.crossfade(0));
  assert(engine.deckPlay(0, true));
  std::array<float, 1024> left{}, right{};
  render(engine, left.data(), right.data(), left.size());
  assert(left.back() > 0.1F);
  assert(engine.deckPosition(0) > 0);
  assert(engine.deckSeek(0, 0.5F));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.deckPosition(0) > 0.5F);
  assert(engine.deckLoop(0, 0.4F, 0.51F));
  for (int i = 0; i < 6; ++i) render(engine, left.data(), right.data(), left.size());
  assert(engine.deckPosition(0) >= 0.4F && engine.deckPosition(0) < 0.51F);
  assert(engine.deckPlay(0, false));
  for (int i = 0; i < 3; ++i) render(engine, left.data(), right.data(), left.size());
  assert(std::abs(left.back()) < 1.0e-6F);
  engine.rejectCommands();
  engine.deactivateAfterStop();
  engine.activate();
  assert(engine.deckPlay(1, true));
  assert(engine.crossfade(1));
  for (int i = 0; i < 4; ++i) render(engine, left.data(), right.data(), left.size());
  assert(left.back() < -0.1F);
  assert(engine.deckSeek(1, 0.9999F));
  render(engine, left.data(), right.data(), left.size());
  assert(!engine.deckPlaying(1));
  assert(engine.deckPlay(1, true));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.deckPosition(1) < 0.1F);
}

float eqToneRms(double sampleRate, double frequency, float low, float mid, float high) {
  AudioEngine engine;
  engine.prepare(sampleRate, makeBank(8, 0));
  Sample tone;
  const auto frames = static_cast<std::size_t>(sampleRate / 2);
  tone.stereo.resize(frames * 2);
  for (std::size_t i = 0; i < frames; ++i) {
    const float sample = 0.18F * std::sin(2 * 3.141592653589793 * frequency * i / sampleRate);
    tone.stereo[2 * i] = tone.stereo[2 * i + 1] = sample;
  }
  engine.loadDeck(0, std::move(tone));
  assert(!engine.setEQ(NAN, 0, 0));
  assert(!engine.setEQ(0, 13, 0));
  assert(engine.setEQ(low, mid, high));
  engine.activate();
  assert(engine.crossfade(0));
  assert(engine.deckPlay(0, true));
  std::array<float, 1024> left{}, right{};
  for (int i = 0; i < 8; ++i) render(engine, left.data(), right.data(), left.size());
  double energy = 0;
  for (const float sample : left) {
    assert(std::isfinite(sample) && std::abs(sample) <= 0.960001F);
    energy += static_cast<double>(sample) * sample;
  }
  return std::sqrt(energy / left.size());
}

void equalizerAndTrackBudget() {
  const float bass = eqToneRms(48000, 60, 0, 0, 0);
  const float attenuatedBass = eqToneRms(48000, 60, -12, 0, 0);
  const float treble = eqToneRms(48000, 7000, 0, 0, 0);
  const float attenuatedTreble = eqToneRms(48000, 7000, 0, 0, -12);
  assert(attenuatedBass < bass * 0.6F);
  assert(attenuatedTreble < treble * 0.8F);
  assert(std::abs(bass - eqToneRms(44100, 60, 0, 0, 0)) < bass * 0.08F);
  assert(std::abs(attenuatedBass / bass -
      eqToneRms(44100, 60, -12, 0, 0) / eqToneRms(44100, 60, 0, 0, 0)) < 0.08F);

  AudioEngine engine;
  engine.prepare(8000, makeBank(8, 0));
  auto duration = [](int minutes) {
    Sample track;
    track.stereo.resize(static_cast<std::size_t>(minutes) * 60 * 8000 * 2);
    return track;
  };
  engine.loadDeck(0, duration(7));
  assert(engine.remainingTrackSeconds(1) == 7 * 60);
  bool rejected = false;
  try { engine.loadDeck(1, duration(6)); } catch (const std::invalid_argument&) { rejected = true; }
  assert(rejected && engine.deckDuration(1, 8000) == 0);
  engine.loadDeck(1, duration(5));
  assert(engine.deckDuration(1, 8000) == 5 * 60);
  engine.loadDeck(0, duration(6));
  assert(engine.remainingTrackSeconds(0) == 5 * 60);
}

void jogAndLiveSeek() {
  AudioEngine engine;
  engine.prepare(48000, makeBank(8, 0));
  engine.activate();
  assert(!engine.deckJog(0, 1, true));
  engine.rejectCommands();
  Sample tone;
  tone.stereo.resize(48000 * 2);
  for (int i = 0; i < 48000; ++i) {
    const float value = 0.3F * std::sin(2 * 3.141592653589793 * 440 * i / 48000);
    tone.stereo[2 * i] = tone.stereo[2 * i + 1] = value;
  }
  engine.loadDeck(0, std::move(tone));
  engine.activate();
  assert(engine.crossfade(0));
  assert(!engine.deckJog(2, 1, true));
  assert(!engine.deckJog(0, NAN, true));
  assert(!engine.deckJog(0, 5, true));
  assert(engine.deckSeek(0, 0.5F));
  std::array<float, 4096> left{}, right{};
  render(engine, left.data(), right.data(), 256);
  assert(engine.deckPosition(0) > 0.49F && engine.deckPosition(0) < 0.51F);
  assert(engine.deckJog(0, -1, true));
  render(engine, left.data(), right.data(), 1024);
  assert(engine.deckPosition(0) < 0.49F);
  assert(engine.peak() > 0.01F);
  for (float value : left) assert(std::isfinite(value) && std::abs(value) <= 0.960001F);
  render(engine, left.data(), right.data(), left.size());
  const float heldPosition = engine.deckPosition(0);
  render(engine, left.data(), right.data(), 1024);
  assert(std::abs(engine.deckPosition(0) - heldPosition) < 1.0e-5F);
  assert(engine.peak() < 0.001F);
  assert(engine.deckJog(0, -1, true));
  render(engine, left.data(), right.data(), 1024);
  assert(engine.deckPosition(0) < heldPosition);
  assert(engine.deckJog(0, 0, true));
  render(engine, left.data(), right.data(), left.size());
  render(engine, left.data(), right.data(), left.size());
  assert(engine.peak() < 0.001F);
  assert(engine.deckJog(0, 0, false));
  assert(engine.deckPlay(0, true));
  const float before = engine.deckPosition(0);
  render(engine, left.data(), right.data(), 1024);
  assert(engine.deckPosition(0) > before);
  assert(engine.deckSeek(0, 0.85F));
  render(engine, left.data(), right.data(), 1024);
  assert(engine.deckPosition(0) > 0.85F);
  for (float value : left) assert(std::isfinite(value) && std::abs(value) <= 0.960001F);
  assert(engine.deckSeek(0, 0.0002F));
  assert(engine.deckJog(0, -4, true));
  render(engine, left.data(), right.data(), 1024);
  assert(engine.deckJog(0, 0, false));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.deckPosition(0) >= 0 && engine.deckPosition(0) <= 1);
  for (float value : left) assert(std::isfinite(value) && std::abs(value) <= 0.960001F);
  engine.rejectCommands();
  engine.deactivateAfterStop();
  assert(!engine.deckJog(0, 1, true));
}
}

void deckFilterResponse() {
  constexpr unsigned sampleRate = 48000;
  const auto sine = [](float hz) {
    Sample track;
    track.stereo.resize(sampleRate * 3 * 2);
    for (unsigned i = 0; i < sampleRate * 3; ++i) {
      const auto value = 0.6F * std::sin(6.283185307179586F * hz * i / sampleRate);
      track.stereo[2 * i] = track.stereo[2 * i + 1] = value;
    }
    return track;
  };
  const auto measure = [&](float hz, float filterAmount) {
    AudioEngine engine;
    engine.prepare(sampleRate, makeBank());
    engine.loadDeck(0, sine(hz));
    engine.activate();
    assert(engine.crossfade(0));
    assert(engine.deckPlay(0, true));
    assert(!engine.deckFilter(0, 1.01F));
    assert(engine.deckFilter(0, filterAmount));
    std::array<float, 4096> left{}, right{};
    render(engine, left.data(), right.data(), left.size());
    render(engine, left.data(), right.data(), left.size());
    double sum = 0;
    for (auto value : left) sum += static_cast<double>(value) * value;
    return std::sqrt(sum / left.size());
  };
  assert(measure(4000, -1) < measure(4000, 0) * 0.35);
  assert(measure(100, 1) < measure(100, 0) * 0.35);
  assert(measure(1000, 0) > 0.05);
  AudioEngine engine;
  engine.prepare(sampleRate, makeBank());
  engine.loadDeck(0, sine(1000));
  engine.activate();
  assert(engine.crossfade(0) && engine.deckPlay(0, true));
  assert(engine.deckFilter(0, -1));
  std::array<float, 4096> left{}, right{};
  render(engine, left.data(), right.data(), left.size());
  assert(engine.deckFilter(0, 1));
  const float previous = left.back();
  render(engine, left.data(), right.data(), left.size());
  assert(std::abs(left.front() - previous) < 0.08F);
  for (float value : left) assert(std::isfinite(value) && std::abs(value) <= 0.960001F);
}

void transitionRegressions() {
  // Full-range sweeps must remain stable below 44.1 kHz as well as on iPhone.
  for (unsigned sr : {8000U, 16000U, 44100U, 96000U}) {
    AudioEngine e; e.prepare(sr, makeBank(1024));
    Sample track; track.stereo.resize(sr * 2);
    for (unsigned i = 0; i < sr; ++i)
      track.stereo[2*i] = track.stereo[2*i+1] = 0.7F * std::sin(6.283185307179586 * 700 * i / sr);
    e.loadDeck(0, std::move(track), {}); e.activate(); e.deckPlay(0, true);
    std::array<float, 64> l{}, r{};
    for (int pass = 0; pass < 128; ++pass) {
      assert(e.deckFilter(0, -1 + 2.0F * (pass % 33) / 32));
      assert(e.setDeckEQ(0, pass % 2 ? -24 : 6, 0, 6));
      render(e,l.data(),r.data(),64);
      for (auto v : l) assert(std::isfinite(v) && std::abs(v) <= 0.960001F);
    }
    assert(!e.setDeckEQ(2,0,0,0)); assert(!e.setDeckEQ(0,NAN,0,0));
    assert(!e.setDeckGain(0,INFINITY)); assert(!e.setDeckGain(0,-1));
  }
  // Correlated bass must not gain 3 dB at the crossfader midpoint.
  AudioEngine e; e.prepare(48000, makeBank());
  Sample dc; dc.stereo.assign(48000 * 2,0.6F);
  e.loadDeck(0,dc,{}); e.loadDeck(1,std::move(dc),{});
  e.activate(); e.deckPlay(0,true); e.deckPlay(1,true); e.crossfade(0);
  std::array<float,8192> l{},r{}; render(e,l.data(),r.data(),l.size());
  const float edge=l.back(); e.crossfade(0.5F); render(e,l.data(),r.data(),l.size());
  assert(edge>0.05F && std::abs(l.back()/edge-1)<0.02F);
  // Replacing B while output is stopped must preserve A and sequencer intent.
  e.setSequencer(true); e.rejectCommands(); Sample replacement; replacement.stereo.assign(48000,0.2F);
  e.loadDeck(1,std::move(replacement),{}); e.activate();
  assert(e.deckPlaying(0));
  render(e,l.data(),r.data(),512); assert(e.deckPosition(0)>0.3F);
}

void automatedMixTransitions() {
  std::array<float, 24960> clap{};
  assert(artss::renderDrum(artss::Drum::Clap909,clap.data(),clap.size(),48000,7)>0);
  float clapPeak=0;
  for (float sample : clap) { assert(std::isfinite(sample)); clapPeak=std::max(clapPeak,std::abs(sample)); }
  assert(clapPeak>0.01F && clapPeak<0.75F && clap.front()==0 && clap.back()==0);
  AudioEngine e; e.prepare(8000,makeBank(1024));
  e.activate(); assert(!e.startAutoMix(4)); e.rejectCommands(); e.deactivateAfterStop();
  Sample a; a.stereo.assign(8000 * 6 * 2,0.4F);
  Sample b = a; e.loadDeck(0,std::move(a),{120,0,1}); e.loadDeck(1,std::move(b),{120,0,1});
  e.activate(); assert(e.crossfade(0)); assert(e.deckPlay(0,true));
  std::array<float,256> l{},r{}; render(e,l.data(),r.data(),256);
  assert(e.startAutoMix(1));
  for (int i=0;i<70;++i) { render(e,l.data(),r.data(),256); for (float v:l) assert(std::isfinite(v) && std::abs(v)<=0.960001F); }
  assert(e.autoMixState()==2 && !e.deckPlaying(0) && e.deckPlaying(1));
  assert(e.crossfadePosition()>0.99F);
  bool sawReturn=false;
  for (int i=0;i<210;++i) { render(e,l.data(),r.data(),256); sawReturn |= e.deckPlaying(0) && e.crossfadePosition()<0.9F; }
  assert(e.autoMixState()!=0 && sawReturn);
  assert(e.crossfade(0.4F)); render(e,l.data(),r.data(),256);
  assert(e.autoMixState()==0 && std::abs(e.crossfadePosition()-0.4F)<0.01F);
}

void cueTransportRegression() {
  AudioEngine engine;
  engine.prepare(48000, makeBank(8, 0));
  Sample track;
  track.stereo.assign(48000 * 2, 0.25F);
  engine.loadDeck(0, track, {120, 0, 1});
  engine.loadDeck(1, std::move(track), {120, 0, 1});
  assert(!engine.deckSetCue(0) && !engine.deckCue(0)); // Session stopped.
  engine.activate();
  assert(!engine.deckSetCue(2) && !engine.deckCue(2));
  assert(engine.deckCuePosition(0) == 0 && engine.deckCuePosition(1) == 0);
  // A cue set immediately after a seek must capture the pending target.
  assert(engine.deckSeek(0, 0.25F) && engine.deckSetCue(0));
  assert(engine.deckSeek(1, 0.75F) && engine.deckSetCue(1));
  assert(std::abs(engine.deckCuePosition(0) - 0.25F) < 0.00001F);
  assert(std::abs(engine.deckCuePosition(1) - 0.75F) < 0.00001F);
  std::array<float, 256> left{}, right{};
  assert(engine.deckPlay(0, true));
  render(engine, left.data(), right.data(), left.size());
  assert(!engine.deckSetCue(0)); // Never move a cue while playing.
  assert(engine.deckPosition(0) > 0.25F);
  assert(engine.deckCue(0));
  render(engine, left.data(), right.data(), left.size());
  assert(!engine.deckPlaying(0));
  assert(std::abs(engine.deckPosition(0) - 0.25F) < 0.0001F);
  assert(engine.deckPlay(0, true));
  render(engine, left.data(), right.data(), left.size());
  assert(engine.deckPosition(0) > 0.25F);
  assert(engine.deckCue(1));
  render(engine, left.data(), right.data(), left.size());
  assert(std::abs(engine.deckPosition(1) - 0.75F) < 0.0001F);
  assert(std::abs(engine.deckCuePosition(0) - 0.25F) < 0.00001F);
  for (float value : left) assert(std::isfinite(value) && std::abs(value) <= 0.960001F);
  engine.rejectCommands();
  engine.deactivateAfterStop();
  Sample nextTrack;
  nextTrack.stereo.assign(48000 * 2, 0.25F);
  engine.loadDeck(0, std::move(nextTrack), {120, 0, 1});
  assert(engine.deckCuePosition(0) == 0);
  assert(std::abs(engine.deckCuePosition(1) - 0.75F) < 0.00001F);
}

void selectableCrossfadeCurves() {
  AudioEngine engine;
  engine.prepare(48000, makeBank(8, 0));
  Sample positive, negative;
  positive.stereo.assign(48000 * 2, 0.4F);
  negative.stereo.assign(48000 * 2, -0.4F);
  engine.loadDeck(0, std::move(positive), {120, 0, 1});
  engine.loadDeck(1, std::move(negative), {120, 0, 1});
  assert(!engine.setCrossfadeCurve(3));
  assert(engine.setCrossfadeCurve(2));
  engine.activate();
  assert(engine.deckPlay(0, true) && engine.deckPlay(1, true));
  assert(engine.crossfade(0.25F));
  std::array<float, 2048> left{}, right{};
  auto measure = [&](std::uint32_t curve) {
    assert(engine.setCrossfadeCurve(curve));
    render(engine, left.data(), right.data(), left.size());
    for (float v : left) assert(std::isfinite(v) && std::abs(v) <= 0.960001F);
    return left.back();
  };
  const float smooth = measure(0);
  const float sharp = measure(1);
  const float dipless = measure(2);
  assert(sharp > smooth + 0.005F);
  assert(std::isfinite(dipless));
  const float before = left.back();
  assert(engine.setCrossfadeCurve(1));
  render(engine, left.data(), right.data(), left.size());
  // Curve switching uses a per-sample gain slew rather than a discontinuity.
  assert(std::abs(left.front() - before) < 0.025F);
  assert(engine.crossfade(0.5F));
  for (auto curve : {0U, 1U, 2U}) {
    assert(engine.setCrossfadeCurve(curve));
    render(engine, left.data(), right.data(), left.size());
    assert(std::abs(left.back()) < 0.025F);
  }
}

int main() {
  for (const unsigned sampleRate : {44100U, 48000U, 96000U}) {
    Sample click;
    click.stereo.assign(sampleRate * 12 * 2, 0);
    for (unsigned beat = 0; beat < 23; ++beat) {
      const auto start = static_cast<std::size_t>((0.25 + beat * 0.5) * sampleRate);
      for (std::size_t frame = start; frame < start + sampleRate / 100; ++frame)
        click.stereo[2 * frame] = click.stereo[2 * frame + 1] = 0.8F;
    }
    const auto grid = analyzeBeatGrid(click, sampleRate);
    assert(std::abs(grid.bpm - 120) < 1);
    assert(std::abs(grid.firstBeatSeconds - 0.25F) < 0.02F);
    AudioEngine engine;
    engine.prepare(sampleRate, makeBank());
    engine.loadDeck(0, std::move(click));
    assert(std::abs(engine.deckBpm(0) - 120) < 1);
    assert(std::abs(engine.deckFirstBeat(0) - 0.25F) < 0.02F);
    assert(engine.deckBpm(1) == 0);
  }
  Sample silence;
  silence.stereo.assign(48000 * 4 * 2, 0);
  assert(analyzeBeatGrid(silence, 48000).bpm == 0);
  for (const double bpm : {90.0, 128.0, 150.0}) {
    auto clicks = makeClickTrack(48000, bpm);
    for (std::size_t i = 1; i < clicks.stereo.size(); i += 2) clicks.stereo[i] *= -1;
    const auto grid = analyzeBeatGrid(clicks, 48000);
    assert(std::abs(grid.bpm - bpm) < 0.6);
    assert(grid.firstBeatSeconds >= 0 && grid.firstBeatSeconds < 1);
  }
  {
    AudioEngine engine;
    engine.prepare(48000, makeBank());
    assert(!engine.setKit(4));
    assert(!engine.setTempo(NAN));
    assert(!engine.setStep(8, 0, 1));
    assert(!engine.setStep(0, 16, 1));
    assert(!engine.setStep(0, 0, NAN));
    assert(engine.setTempo(120));
    assert(engine.setStep(0, 0, 1));
    assert(engine.setStep(2, 1, 0.8F));
    assert(engine.setKit(3));
    engine.activate();
    engine.setSequencer(true);
    std::vector<float> left(6000), right(6000);
    render(engine, left.data(), right.data(), 6000);
    assert(engine.currentStep() == 0 && engine.triggeredVoices() == 1);
    render(engine, left.data(), right.data(), 1);
    assert(engine.currentStep() == 1 && engine.triggeredVoices() == 2);
    for (unsigned kit = 1; kit <= 3; ++kit) {
      assert(engine.setKit(kit));
      assert(engine.trigger(0, 1));
      render(engine, left.data(), right.data(), 512);
      assert(engine.peak() > 0.001F);
      for (unsigned i = 0; i < 512; ++i) assert(std::isfinite(left[i]) && std::abs(left[i]) <= 0.960001F);
    }
  }

  selectableCrossfadeCurves();
  cueTransportRegression();
  automatedMixTransitions();
  transitionRegressions();
  validationAndVoiceLifecycle();
  limiterRampAndStaleCommands();
  queuePressureAndWaveforms();
  panicBypassesFullQueue();
  restartRecoversQueueAndLimiter();
  acceptedMasterSurvivesRestartBeforeRendering();
  multiProducerQueue();
  concurrentRenderStress();
  twoDeckMixingAndSeeking();
  equalizerAndTrackBudget();
  jogAndLiveSeek();
  syncBeatGrids();
  deckFilterResponse();
  assert(renderAllocations.load() == 0);
  std::cout << "PASS: lifecycle, PCM validation, polyphony, limiter, ramps, restart recovery, stale commands, queue overflow,\n"
               "      20,000 ordered MPSC messages, concurrent rendering, EQ, jog, seek, deck budget; zero render allocations\n";
}
