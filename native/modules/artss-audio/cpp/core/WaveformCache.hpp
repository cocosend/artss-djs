#pragma once

// Fixed RGBA8 waveform texture cache. One PCM scan, before deck installation.
// Every column occupies three RGBA8 texels: L(min,max,rms,255),
// R(min,max,rms,255), and spectrum(low,mid,high,255).
// Each level's rows are tightly packed, suitable for Metal replaceRegion().
#include "AudioEngine.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>

namespace artss::audio {

inline constexpr std::array<std::size_t, 3> kWaveformWidths{96, 384, 1536};
inline constexpr std::size_t kWaveformRows = 3;
inline constexpr std::size_t kWaveformChannels = 4;
inline constexpr std::size_t kWaveformCacheBytes =
    (96 + 384 + 1536) * kWaveformRows * kWaveformChannels;

inline constexpr std::size_t waveformLevelOffset(std::size_t level) noexcept {
  return level == 0 ? 0 : level == 1 ? 96 * 12 : (96 + 384) * 12;
}

struct WaveformCache final {
  std::array<std::uint8_t, kWaveformCacheBytes> rgba8{};
};
static_assert(sizeof(WaveformCache) == kWaveformCacheBytes);

namespace waveform_detail {
struct Accumulator final {
  float minL{1}, maxL{-1}, minR{1}, maxR{-1};
  double squaresL{0}, squaresR{0};
  double bass{0}, mids{0}, treble{0};
  std::uint32_t count{0};
};
inline std::uint8_t normalized(float value) noexcept {
  return static_cast<std::uint8_t>(std::clamp(
      std::lround(std::clamp(value, 0.0F, 1.0F) * 255.0F), 0L, 255L));
}
inline std::uint8_t signedPcm(float value) noexcept {
  return normalized((value + 1.0F) * 0.5F);
}
template <std::size_t N>
void encodeLevel(const std::array<Accumulator, N>& stats,
                 WaveformCache& cache, std::size_t offset) noexcept {
  auto* pixels = cache.rgba8.data() + offset;
  for (std::size_t i = 0; i < N; ++i) {
    const auto& bin = stats[i];
    const auto count = std::max<std::uint32_t>(1, bin.count);
    const auto channel = [&](std::size_t row, float minimum, float maximum,
                             double squares) noexcept {
      auto* texel = pixels + (row * N + i) * kWaveformChannels;
      texel[0] = signedPcm(bin.count ? minimum : 0.0F);
      texel[1] = signedPcm(bin.count ? maximum : 0.0F);
      texel[2] = normalized(static_cast<float>(std::sqrt(squares / count)));
      texel[3] = 255;
    };
    channel(0, bin.minL, bin.maxL, bin.squaresL);
    channel(1, bin.minR, bin.maxR, bin.squaresR);
    auto* spectrum = pixels + (2 * N + i) * kWaveformChannels;
    spectrum[0] = normalized(static_cast<float>(std::sqrt(bin.bass / count)));
    spectrum[1] = normalized(static_cast<float>(std::sqrt(bin.mids / count)));
    spectrum[2] = normalized(static_cast<float>(std::sqrt(bin.treble / count)));
    spectrum[3] = 255;
  }
}
}  // namespace waveform_detail

// Offline-only: run on the lifecycle/decoder queue while RemoteIO remains
// active. Never call from render() or another audio callback.
inline WaveformCache precomputeWaveform(const Sample& track, double sampleRate) {
  if (!std::isfinite(sampleRate) || sampleRate < 8000.0 || sampleRate > 192000.0 ||
      track.stereo.empty() || (track.stereo.size() & 1U) != 0 ||
      track.stereo.size() / 2 > std::numeric_limits<std::uint32_t>::max()) {
    throw std::invalid_argument("Invalid waveform PCM or sample rate");
  }

  const std::size_t frames = track.stereo.size() / 2;
  std::array<waveform_detail::Accumulator, 96> overview{};
  std::array<waveform_detail::Accumulator, 384> mid{};
  std::array<waveform_detail::Accumulator, 1536> zoom{};
  const double tau = 6.28318530717958647692;
  const double lowFactor = -std::expm1(-tau * 220.0 / sampleRate);
  const double highFactor = -std::expm1(-tau * 3600.0 / sampleRate);
  double lowPassL = 0.0, lowPassR = 0.0, highPassL = 0.0, highPassR = 0.0;

  for (std::size_t i = 0; i < frames; ++i) {
    const float l = track.stereo[2 * i], r = track.stereo[2 * i + 1];
    if (!std::isfinite(l) || !std::isfinite(r) ||
        std::abs(l) > 1.0F || std::abs(r) > 1.0F)
      throw std::invalid_argument("Waveform PCM must be finite and normalized");

    // Split both channels independently. A mono average would erase
    // antiphase bass/treble even though both stereo channels are audible.
    lowPassL += lowFactor * (static_cast<double>(l) - lowPassL);
    lowPassR += lowFactor * (static_cast<double>(r) - lowPassR);
    highPassL += highFactor * (static_cast<double>(l) - highPassL);
    highPassR += highFactor * (static_cast<double>(r) - highPassR);
    const double bass = 0.5 * (lowPassL * lowPassL + lowPassR * lowPassR);
    const double midL = highPassL - lowPassL, midR = highPassR - lowPassR;
    const double mids = 0.5 * (midL * midL + midR * midR);
    const double highL = static_cast<double>(l) - highPassL;
    const double highR = static_cast<double>(r) - highPassR;
    const double treble = 0.5 * (highL * highL + highR * highR);

    const auto capture = [i, frames, l, r, bass, mids, treble](auto& bins) noexcept {
      const auto index = static_cast<std::size_t>(
          (static_cast<std::uint64_t>(i) * bins.size()) / frames);
      auto& a = bins[index];
      a.minL = std::min(a.minL, l);
      a.maxL = std::max(a.maxL, l);
      a.minR = std::min(a.minR, r);
      a.maxR = std::max(a.maxR, r);
      a.squaresL += static_cast<double>(l) * l;
      a.squaresR += static_cast<double>(r) * r;
      a.bass += bass;
      a.mids += mids;
      a.treble += treble;
      ++a.count;
    };
    capture(overview);
    capture(mid);
    capture(zoom);
  }

  WaveformCache cache{};
  waveform_detail::encodeLevel(overview, cache, waveformLevelOffset(0));
  waveform_detail::encodeLevel(mid, cache, waveformLevelOffset(1));
  waveform_detail::encodeLevel(zoom, cache, waveformLevelOffset(2));
  return cache;
}

}  // namespace artss::audio
