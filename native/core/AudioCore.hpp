#pragma once
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>

namespace artss {
constexpr size_t kPads = 8;
constexpr size_t kMaxVoices = 32;
constexpr size_t kQueueCapacity = 256;
constexpr size_t kMaxSampleFrames = 192000; // 4 seconds @48k

struct Trigger { uint8_t pad; float velocity; uint64_t whenFrame; };
struct Voice { bool active=false; uint8_t pad=0; float pos=0; float env=0; float velocity=0; uint32_t phase=0; uint32_t age=0; float lp=0; };

/** Single-producer control queue, single-consumer render thread; no allocations in callback. */
class TriggerQueue final {
 public:
  bool push(Trigger command) noexcept {
    const auto tail=tail_.load(std::memory_order_relaxed);
    const auto next=(tail+1)%kQueueCapacity;
    if(next==head_.load(std::memory_order_acquire))return false;
    values_[tail]=command;
    tail_.store(next,std::memory_order_release);
    return true;
  }
  bool pop(Trigger& command) noexcept {
    const auto head=head_.load(std::memory_order_relaxed);
    if(head==tail_.load(std::memory_order_acquire))return false;
    command=values_[head];head_.store((head+1)%kQueueCapacity,std::memory_order_release);return true;
  }
 private:
  std::array<Trigger,kQueueCapacity> values_{};
  std::atomic<size_t> head_{0},tail_{0};
};

class AudioCore final {
 public:
  explicit AudioCore(float sampleRate=48000.f);
  AudioCore(const AudioCore&)=delete;
  AudioCore& operator=(const AudioCore&)=delete;
  bool trigger(uint8_t pad,float velocity) noexcept;
  void setMaster(float level) noexcept;
  void setFilter(float amount) noexcept;
  void setTempo(float bpm) noexcept;
  void setRunning(bool running) noexcept;
  // Main-thread only, call while the AudioUnit is stopped.
  bool replaceSample(uint8_t pad,const float* mono,size_t frames) noexcept;
  void render(float* left,float* right,size_t frames) noexcept;
  uint64_t renderedFrames() const noexcept{return frames_.load(std::memory_order_relaxed);}
  float meter() const noexcept{return meter_.load(std::memory_order_relaxed);}
 private:
  struct Sample { std::unique_ptr<float[]> pcm;size_t frames=0; };
  float sampleRate_;
  TriggerQueue queue_;
  std::array<Sample,kPads> samples_{};
  std::array<Voice,kMaxVoices> voices_{};
  std::atomic<float> master_{.82f},filter_{1.f},tempo_{136.f},meter_{0.f};
  std::atomic<bool> running_{false};
  std::atomic<uint64_t> frames_{0};
  uint32_t noise_{0xD3AAB851u};
  float limiter_=1.f,lowpass_=0.f;
  void startVoice(uint8_t pad,float velocity) noexcept;
  float voiceSample(Voice& voice) noexcept;
};
}