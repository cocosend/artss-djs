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
  bool deckPlay(std::uint32_t deck, bool play) noexcept;
  bool deckSeek(std::uint32_t deck, float normalized) noexcept;
  bool deckRate(std::uint32_t deck, float rate) noexcept;
  bool deckLoop(std::uint32_t deck, float start, float end) noexcept;
  bool crossfade(float position) noexcept;
  bool setEQ(float lowDb, float midDb, float highDb) noexcept;
  bool setKit(std::uint32_t kit) noexcept;
  bool setTempo(float bpm) noexcept;
  bool setStep(std::uint32_t pad, std::uint32_t step, float velocity) noexcept;
  void setSequencer(bool playing) noexcept;
  std::uint32_t currentStep() const noexcept { return currentStep_.load(std::memory_order_relaxed); }
  float deckPosition(std::uint32_t deck) const noexcept;
  double deckDuration(std::uint32_t deck, double sampleRate) const noexcept;
  double remainingTrackSeconds(std::uint32_t replacingDeck) const noexcept;
  bool deckPlaying(std::uint32_t deck) const noexcept;
  const std::array<float, kWaveformBins>& deckWaveform(std::uint32_t deck) const noexcept;
  void render(float* left, float* right, std::uint32_t frames) noexcept;

  bool running() const noexcept { return active_.load(std::memory_order_acquire); }
  float peak() const noexcept { return peak_.load(std::memory_order_relaxed); }
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
  std::atomic<float> requestedMaster_{0.75F};
  std::array<std::atomic<float>, kPadCount> progress_{};
  float master_{0.75F};
  float limiter_{1};
  float gainSlew_{1.0F / 240.0F}, limiterRelease_{1.0F / 2400.0F};
  std::uint64_t voiceSerial_{0};
  std::uint64_t appliedNoteEpoch_{0};
  bool prepared_{false};
  struct Deck {
    Sample track;
    std::array<float, kWaveformBins> waveform{};
    std::atomic<float> seek{-1}, rate{1}, loopStart{0}, loopEnd{1}, position{0};
    std::atomic<bool> playing{false};
    double cursor{0};
    float envelope{0};
  };
  std::array<Deck, kDeckCount> decks_{};
  std::atomic<float> requestedCrossfade_{0.5F};
  float crossfade_{0.5F};
  std::atomic<float> lowDb_{0}, midDb_{0}, highDb_{0};
  float lowGain_{1}, midGain_{1}, highGain_{1};
  float lowL_{0}, lowR_{0}, highLpL_{0}, highLpR_{0};
  float lowCoefficient_{0}, highCoefficient_{0};
  double sampleRate_{48000};
};

}  // namespace artss::audio
