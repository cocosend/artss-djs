#pragma once
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <vector>

namespace artss::audio {

// 0 SVF, 1 ping-pong delay, 2 reverb, 3 flanger, 4 bitcrusher, 5 roll.
// Three independent instances are owned by AudioEngine (decks A/B and master).
// Storage is allocated in the constructor; process() is allocation-free.
class FxChain final {
 public:
  explicit FxChain(double sampleRate)
      : delay_(static_cast<std::size_t>(kMaxSampleRate * 1.6) * 2 + 16),
        flange_(static_cast<std::size_t>(kMaxSampleRate * 0.025) * 2 + 16),
        roll_(static_cast<std::size_t>(kMaxSampleRate * 4.1) * 2 + 16) {
    static_assert(std::atomic<float>::is_always_lock_free);
    static_assert(std::atomic<int>::is_always_lock_free);
    const std::array<double, 4> combMs{29.7, 37.1, 41.1, 43.7};
    for (std::size_t i = 0; i < combL_.size(); ++i) {
      combL_[i].allocate(combMs[i] + 2.0);
      combR_[i].allocate(combMs[i] + 2.7);
    }
    allpassL_[0].allocate(5.1); allpassL_[1].allocate(1.7);
    allpassR_[0].allocate(5.8); allpassR_[1].allocate(2.1);
    configure(sampleRate);
  }
  FxChain(const FxChain&) = delete;
  FxChain& operator=(const FxChain&) = delete;

  // Lifecycle thread only, while RemoteIO is stopped; never reallocates.
  void configure(double sampleRate) {
    if (!std::isfinite(sampleRate) || sampleRate < 8000 ||
        sampleRate > kMaxSampleRate)
      throw std::invalid_argument("Invalid FX sample rate");
    sampleRate_ = static_cast<float>(sampleRate);
    coeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (sampleRate * 0.012)));
    for (auto& c : combL_) c.configure(sampleRate);
    for (auto& c : combR_) c.configure(sampleRate);
    for (auto& c : allpassL_) c.configure(sampleRate);
    for (auto& c : allpassR_) c.configure(sampleRate);
    reset();
  }

  void reset() noexcept {
    std::fill(delay_.begin(), delay_.end(), 0.0F);
    std::fill(flange_.begin(), flange_.end(), 0.0F);
    std::fill(roll_.begin(), roll_.end(), 0.0F);
    for (auto& c : combL_) c.reset();
    for (auto& c : combR_) c.reset();
    for (auto& c : allpassL_) c.reset();
    for (auto& c : allpassR_) c.reset();
    filterL_ = {}; filterR_ = {};
    delayWrite_ = flangeWrite_ = rollWrite_ = rollStored_ = 0;
    rollStart_ = rollPos_ = rollLength_ = 0;
    rollBeat_ = std::numeric_limits<std::int64_t>::min();
    rollCode_ = 0;
    rollActive_ = false;
    rollBlend_ = lfoPhase_ = 0.0F;
    heldL_ = heldR_ = 0; holdCount_ = 0;
    delayTimeSmooth_ = 0.25F * sampleRate_;
    filterG_ = 0.1F; filterK_ = 1.0F;
    lpMix_ = hpMix_ = reverbMix_ = delayMix_ =
        flangeMix_ = crushMix_ = 0.0F;
  }

  // Called from JSI/UI; no lock/alloc:
  // 0 SVF(mode 0/off,1/LP,2/HP; cutoff Hz; resonance 0..1)
  // 1 Delay(mix, time ms 50..1500, feedback 0..0.85)
  // 2 Reverb(mix, room 0..1, damping 0..1)
  // 3 Flanger(mix, speed Hz 0.05..5, depth 0..1)
  // 4 Bitcrusher(mix, bit depth 4..16, downsample factor 1..32)
  // 5 Roll(index 0 off, 1 quarter, 2 half, 3 one, 4 two, 5 four beats; 0,0)
  bool set(std::uint32_t effect, float a, float b, float c) noexcept {
    if (!std::isfinite(a) || !std::isfinite(b) || !std::isfinite(c)) return false;
    switch (effect) {
      case 0: {
        if (a < 0 || a > 2 || a != std::floor(a) || b < 20 ||
            b > std::min(20000.0F, sampleRate_ * 0.45F) || c < 0 || c > 1)
          return false;
        const float g = std::tan(3.14159265358979323846F * b / sampleRate_);
        if (!std::isfinite(g)) return false;
        targetG_.store(g, std::memory_order_relaxed);
        targetK_.store(2.0F - 1.8F * c, std::memory_order_relaxed);
        filterMode_.store(static_cast<int>(a), std::memory_order_release);
        return true;
      }
      case 1:
        if (a < 0 || a > 1 || b < 50 || b > 1500 || c < 0 || c > 0.85F) return false;
        targetDelayTime_.store(b * 0.001F * sampleRate_, std::memory_order_relaxed);
        targetDelayFb_.store(c, std::memory_order_relaxed);
        targetDelayMix_.store(a, std::memory_order_release);
        return true;
      case 2:
        if (a < 0 || a > 1 || b < 0 || b > 1 || c < 0 || c > 1) return false;
        targetRoom_.store(b, std::memory_order_relaxed);
        targetDamp_.store(c, std::memory_order_relaxed);
        targetReverbMix_.store(a, std::memory_order_release);
        return true;
      case 3:
        if (a < 0 || a > 1 || b < 0.05F || b > 5 || c < 0 || c > 1) return false;
        targetFlangeSpeed_.store(b, std::memory_order_relaxed);
        targetFlangeDepth_.store(c, std::memory_order_relaxed);
        targetFlangeMix_.store(a, std::memory_order_release);
        return true;
      case 4:
        if (a < 0 || a > 1 || b < 4 || b > 16 || b != std::floor(b) ||
            c < 1 || c > 32 || c != std::floor(c)) return false;
        targetBits_.store(static_cast<int>(b), std::memory_order_relaxed);
        targetHold_.store(static_cast<int>(c), std::memory_order_relaxed);
        targetCrushMix_.store(a, std::memory_order_release);
        return true;
      case 5:
        if (a < 0 || a > 5 || a != std::floor(a) || b != 0 || c != 0) return false;
        rollRequest_.store(static_cast<int>(a), std::memory_order_release);
        return true;
      default: return false;
    }
  }

  // Control-rate snapshot at start of hardware callback.
  void beginBlock() noexcept {
    const auto mode = filterMode_.load(std::memory_order_acquire);
    block_.g = targetG_.load(std::memory_order_relaxed);
    block_.k = targetK_.load(std::memory_order_relaxed);
    block_.lp = mode == 1 ? 1.0F : 0.0F;
    block_.hp = mode == 2 ? 1.0F : 0.0F;
    block_.delayMix = targetDelayMix_.load(std::memory_order_acquire);
    block_.delayTime = targetDelayTime_.load(std::memory_order_relaxed);
    block_.delayFb = targetDelayFb_.load(std::memory_order_relaxed);
    block_.reverbMix = targetReverbMix_.load(std::memory_order_acquire);
    block_.room = targetRoom_.load(std::memory_order_relaxed);
    block_.damp = targetDamp_.load(std::memory_order_relaxed);
    block_.flangeMix = targetFlangeMix_.load(std::memory_order_acquire);
    block_.flangeSpeed = targetFlangeSpeed_.load(std::memory_order_relaxed);
    block_.flangeDepth = targetFlangeDepth_.load(std::memory_order_relaxed);
    block_.crushMix = targetCrushMix_.load(std::memory_order_acquire);
    block_.bits = targetBits_.load(std::memory_order_relaxed);
    block_.hold = targetHold_.load(std::memory_order_relaxed);
    block_.roll = rollRequest_.load(std::memory_order_acquire);
  }

  // Single audio owner: no alloc, syscall, lock, I/O or std::function.
  void process(float& l, float& r, double transportFrame, float bpm,
               double firstBeatFrame) noexcept {
    filterG_ += coeff_ * (block_.g - filterG_);
    filterK_ += coeff_ * (block_.k - filterK_);
    lpMix_ += coeff_ * (block_.lp - lpMix_);
    hpMix_ += coeff_ * (block_.hp - hpMix_);
    const auto filter = [this](float in, SVF& state) noexcept {
      const float denominator = 1.0F / (1.0F + filterG_ * (filterG_ + filterK_));
      const float v1 = (state.s1 + filterG_ * (in - state.s2)) * denominator;
      const float v2 = state.s2 + filterG_ * v1;
      state.s1 = 2.0F * v1 - state.s1;
      state.s2 = 2.0F * v2 - state.s2;
      if (std::abs(state.s1) < 1.e-20F) state.s1 = 0;
      if (std::abs(state.s2) < 1.e-20F) state.s2 = 0;
      const float dry = std::max(0.0F, 1.0F - lpMix_ - hpMix_);
      return dry * in + lpMix_ * v2 + hpMix_ * (in - filterK_ * v1 - v2);
    };
    l = filter(l, filterL_); r = filter(r, filterR_);

    crushMix_ += coeff_ * (block_.crushMix - crushMix_);
    if (++holdCount_ >= block_.hold) {
      holdCount_ = 0;
      const float q = std::ldexp(1.0F, block_.bits - 1);
      heldL_ = std::round(std::clamp(l, -1.0F, 1.0F) * q) / q;
      heldR_ = std::round(std::clamp(r, -1.0F, 1.0F) * q) / q;
    }
    l += crushMix_ * (heldL_ - l);
    r += crushMix_ * (heldR_ - r);

    flangeMix_ += coeff_ * (block_.flangeMix - flangeMix_);
    lfoPhase_ += block_.flangeSpeed / sampleRate_;
    if (lfoPhase_ >= 1.0F) lfoPhase_ -= 1.0F;
    const float mod = 0.5F + 0.5F * std::sin(6.28318530718F * lfoPhase_);
    const float flangeFrames = sampleRate_ * (0.001F + 0.008F * block_.flangeDepth * mod);
    const float flangeL = tap(flange_, flangeWrite_, flangeFrames, 0);
    const float flangeR = tap(flange_, flangeWrite_, flangeFrames * 1.07F, 1);
    writeStereo(flange_, flangeWrite_, l + flangeL * 0.3F, r + flangeR * 0.3F);
    l += flangeMix_ * 0.6F * flangeL;
    r += flangeMix_ * 0.6F * flangeR;

    delayMix_ += coeff_ * (block_.delayMix - delayMix_);
    delayTimeSmooth_ += coeff_ * (block_.delayTime - delayTimeSmooth_);
    const float echoL = tap(delay_, delayWrite_, delayTimeSmooth_, 0);
    const float echoR = tap(delay_, delayWrite_, delayTimeSmooth_, 1);
    const float dryL = l, dryR = r;
    writeStereo(delay_, delayWrite_, dryL + echoR * block_.delayFb,
                dryR + echoL * block_.delayFb);
    l += delayMix_ * echoL;
    r += delayMix_ * echoR;

    reverbMix_ += coeff_ * (block_.reverbMix - reverbMix_);
    const float feedback = 0.60F + 0.25F * block_.room;
    const float damping = 0.15F + 0.7F * block_.damp;
    float wetL = 0.0F, wetR = 0.0F;
    for (std::size_t i = 0; i < combL_.size(); ++i) {
      wetL += combL_[i].process(l, feedback, damping);
      wetR += combR_[i].process(r, feedback, damping);
    }
    wetL *= 0.25F; wetR *= 0.25F;
    for (auto& ap : allpassL_) wetL = ap.process(wetL);
    for (auto& ap : allpassR_) wetR = ap.process(wetR);
    l += reverbMix_ * 0.6F * wetL;
    r += reverbMix_ * 0.6F * wetR;

    processRoll(l, r, transportFrame, bpm, firstBeatFrame);
  }

 private:
  static constexpr double kMaxSampleRate = 192000.0;
  struct SVF { float s1{}, s2{}; };
  struct Comb {
    std::vector<float> data;
    double milliseconds{};
    std::size_t length{1}, cursor{0};
    float lp{};
    void allocate(double ms) {
      milliseconds = ms;
      data.assign(static_cast<std::size_t>(std::ceil(kMaxSampleRate * ms * .001)) + 2, 0);
    }
    void configure(double sr) noexcept {
      length = std::max<std::size_t>(1, static_cast<std::size_t>(std::lround(sr * milliseconds * .001)));
      cursor = 0;
    }
    void reset() noexcept { std::fill(data.begin(), data.end(), 0); cursor = 0; lp = 0; }
    float process(float input, float feedback, float damp) noexcept {
      const float past = data[cursor];
      lp += (1.0F - damp) * (past - lp);
      if (std::abs(lp) < 1.e-20F) lp = 0;
      data[cursor] = input + feedback * lp;
      if (++cursor >= length) cursor = 0;
      return past;
    }
  };
  struct Allpass {
    std::vector<float> data;
    double milliseconds{};
    std::size_t length{1}, cursor{0};
    void allocate(double ms) {
      milliseconds = ms;
      data.assign(static_cast<std::size_t>(std::ceil(kMaxSampleRate * ms * .001)) + 2, 0);
    }
    void configure(double sr) noexcept {
      length = std::max<std::size_t>(1, static_cast<std::size_t>(std::lround(sr * milliseconds * .001)));
      cursor = 0;
    }
    void reset() noexcept { std::fill(data.begin(), data.end(), 0); cursor = 0; }
    float process(float input) noexcept {
      const float past = data[cursor];
      const float out = past - input;
      data[cursor] = input + 0.5F * out;
      if (++cursor >= length) cursor = 0;
      return out;
    }
  };
  struct Block {
    float g{0.1F}, k{1.0F}, lp{}, hp{};
    float delayMix{}, delayTime{12000}, delayFb{0.4F};
    float reverbMix{}, room{0.6F}, damp{0.35F};
    float flangeMix{}, flangeSpeed{0.5F}, flangeDepth{0.5F};
    float crushMix{};
    int bits{12}, hold{1}, roll{};
  } block_;
  static float tap(const std::vector<float>& data, std::size_t write,
                   float frames, unsigned channel) noexcept {
    const std::size_t len = data.size() / 2;
    const float distance = std::clamp(frames, 1.0F, static_cast<float>(len - 2));
    const auto age = static_cast<std::size_t>(distance);
    const float fraction = distance - static_cast<float>(age);
    const auto recent = (write + len - age) % len;
    const auto old = (recent + len - 1) % len;
    return data[recent * 2 + channel] * (1.0F - fraction) +
           data[old * 2 + channel] * fraction;
  }
  static void writeStereo(std::vector<float>& data, std::size_t& write,
                          float l, float r) noexcept {
    data[write * 2] = l; data[write * 2 + 1] = r;
    if (++write >= data.size() / 2) write = 0;
  }
  void processRoll(float& l, float& r, double transportFrame, float bpm,
                   double firstBeatFrame) noexcept {
    const int request = block_.roll;
    if (request != rollCode_) {
      rollCode_ = request;
      rollActive_ = false;
      rollBlend_ = 0;
      rollStored_ = 0;
      rollBeat_ = std::numeric_limits<std::int64_t>::min();
    }
    if (request == 0) {
      writeStereo(roll_, rollWrite_, l, r);
      if (rollStored_ < roll_.size() / 2) ++rollStored_;
      return;
    }
    const double beatFrames = bpm >= 60.0F && bpm <= 200.0F
        ? static_cast<double>(sampleRate_) * 60.0 / bpm : 0;
    if (!rollActive_) {
      writeStereo(roll_, rollWrite_, l, r);
      if (rollStored_ < roll_.size() / 2) ++rollStored_;
      if (beatFrames <= 0 || !std::isfinite(transportFrame)) return;
      const double beatPosition = (transportFrame - firstBeatFrame) / beatFrames;
      if (beatPosition < 0 || beatPosition > 9.e15) return;
      const auto beat = static_cast<std::int64_t>(std::floor(beatPosition));
      if (rollBeat_ == std::numeric_limits<std::int64_t>::min()) {
        rollBeat_ = beat;
        return;
      }
      const float beatCount = request == 1 ? 0.25F : request == 2 ? 0.5F :
                              request == 3 ? 1.0F : request == 4 ? 2.0F : 4.0F;
      const auto length = static_cast<std::size_t>(std::llround(beatFrames * beatCount));
      if (beat != rollBeat_ && length >= 2 && length < roll_.size() / 2 &&
          rollStored_ >= length) {
        rollActive_ = true;
        rollLength_ = length;
        rollPos_ = 0;
        rollStart_ = (rollWrite_ + roll_.size() / 2 - length) % (roll_.size() / 2);
        rollBlend_ = 0;
      }
      rollBeat_ = beat;
    }
    if (rollActive_) {
      const auto index = (rollStart_ + rollPos_) % (roll_.size() / 2);
      float capturedL = roll_[index * 2], capturedR = roll_[index * 2 + 1];
      const auto fade = std::min<std::size_t>(64, rollLength_ / 4);
      if (fade > 0 && rollPos_ >= rollLength_ - fade) {
        const auto cross = (rollStart_ + rollPos_ - (rollLength_ - fade)) % (roll_.size() / 2);
        const float t = static_cast<float>(rollPos_ - (rollLength_ - fade)) / fade;
        capturedL += t * (roll_[cross * 2] - capturedL);
        capturedR += t * (roll_[cross * 2 + 1] - capturedR);
      }
      rollBlend_ = std::min(1.0F, rollBlend_ + 1.0F / 64.0F);
      l += (capturedL - l) * rollBlend_;
      r += (capturedR - r) * rollBlend_;
      if (++rollPos_ >= rollLength_) rollPos_ = 0;
    }
  }

  std::vector<float> delay_, flange_, roll_;
  std::array<Comb, 4> combL_, combR_;
  std::array<Allpass, 2> allpassL_, allpassR_;
  std::size_t delayWrite_{}, flangeWrite_{}, rollWrite_{}, rollStored_{};
  std::size_t rollStart_{}, rollPos_{}, rollLength_{};
  std::int64_t rollBeat_{std::numeric_limits<std::int64_t>::min()};
  int rollCode_{};
  bool rollActive_{};
  float rollBlend_{}, sampleRate_{48000}, coeff_{0.001F};
  float lfoPhase_{}, delayTimeSmooth_{12000};
  float filterG_{0.1F}, filterK_{1};
  float lpMix_{}, hpMix_{}, delayMix_{}, reverbMix_{}, flangeMix_{}, crushMix_{};
  float heldL_{}, heldR_{};
  int holdCount_{};
  SVF filterL_{}, filterR_{};
  std::atomic<int> filterMode_{0}, targetBits_{12}, targetHold_{1}, rollRequest_{0};
  std::atomic<float> targetG_{0.1F}, targetK_{1.0F};
  std::atomic<float> targetDelayMix_{0}, targetDelayTime_{12000}, targetDelayFb_{0.4F};
  std::atomic<float> targetReverbMix_{0}, targetRoom_{0.6F}, targetDamp_{0.35F};
  std::atomic<float> targetFlangeMix_{0}, targetFlangeSpeed_{0.5F}, targetFlangeDepth_{0.5F};
  std::atomic<float> targetCrushMix_{0};
};

}  // namespace artss::audio
