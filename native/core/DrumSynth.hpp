#pragma once
#include <cstddef>
#include <cstdint>

namespace artss {
// Original, deterministic 303/606/909-inspired voices. The names identify a
// sound family; no factory ROM, samples, or vendor DSP are used.
enum class Drum : uint8_t {
  Kick909, Kick606, Snare909, Snare606, Clap909, Hat606, OpenHat909,
  Rim606, Tom909, Cowbell606, Ride909, Acid303, Sub303, Perc606,
  Shaker909, Crash909
};
constexpr size_t kDrumCount = 16;
// Offline on a control/build thread. No heap allocation in this function.
size_t renderDrum(Drum drum, float* output, size_t capacity,
                  float sampleRate, uint32_t variation = 0) noexcept;
}  // namespace artss
