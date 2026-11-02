#include "AudioEngine.hpp"

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
}

void* operator new(std::size_t bytes) {
  if (inRender) renderAllocations.fetch_add(1, std::memory_order_relaxed);
  if (auto* p = std::malloc(bytes == 0 ? 1 : bytes)) return p;
  throw std::bad_alloc();
}
void* operator new[](std::size_t bytes) { return ::operator new(bytes); }
void operator delete(void* p) noexcept { std::free(p); }
void operator delete[](void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }
void operator delete[](void* p, std::size_t) noexcept { std::free(p); }

using namespace artss::audio;

namespace {
SampleBank makeBank(std::size_t frames = 8192, float value = 0.75F) {
  SampleBank bank;
  for (auto& sample : bank) sample.stereo.assign(frames * 2, value);
  return bank;
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
    energy += sample * sample;
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
}

int main() {
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
  assert(renderAllocations.load() == 0);
  std::cout << "PASS: lifecycle, PCM validation, polyphony, limiter, ramps, restart recovery, stale commands, queue overflow,\n"
               "      20,000 ordered MPSC messages, concurrent rendering; zero render allocations\n";
}
