#pragma once

#include "AudioEngine.hpp"

#include <algorithm>
#include <cmath>
#include <vector>

namespace artss::audio {

// Offline analysis on the track loading thread; never called by RemoteIO.
inline BeatGrid analyzeBeatGrid(const Sample& track, double sampleRate) {
  if (sampleRate < 8000 || track.frames() < sampleRate * 3) return {};
  constexpr double hopSeconds = 0.01;
  const auto hop = static_cast<std::size_t>(std::round(sampleRate * hopSeconds));
  const auto bins = std::min<std::size_t>(track.frames() / hop, 12000);
  if (bins < 300) return {};
  std::vector<float> energy(bins), onset(bins);
  for (std::size_t bin = 0; bin < bins; ++bin) {
    double sum = 0;
    for (std::size_t frame = bin * hop; frame < (bin + 1) * hop; ++frame) {
      const double left = track.stereo[2 * frame], right = track.stereo[2 * frame + 1];
      sum += (left * left + right * right) * 0.5;
    }
    energy[bin] = static_cast<float>(std::sqrt(sum / hop));
    if (bin > 0) onset[bin] = std::max(0.0F, energy[bin] - energy[bin - 1]);
  }
  std::array<float, 101> correlations{};
  float best = 0;
  std::size_t bestLag = 0;
  for (std::size_t lag = 30; lag <= 100; ++lag) { // 60–200 BPM.
    double score = 0, normA = 0, normB = 0;
    for (std::size_t i = lag; i < bins; ++i) {
      score += onset[i] * onset[i - lag];
      normA += onset[i] * onset[i];
      normB += onset[i - lag] * onset[i - lag];
    }
    const auto correlation = static_cast<float>(score / std::sqrt(normA * normB + 1.e-20));
    correlations[lag] = correlation;
    if (correlation > best) { best = correlation; bestLag = lag; }
  }
  if (best < 0.18F) return {};
  // A half-time harmonic is expected; prefer the shorter pulse when scores agree.
  if (bestLag * 2 <= 100 && correlations[bestLag * 2] > best * 1.12F) bestLag *= 2;
  double refinedLag = bestLag;
  if (bestLag > 30 && bestLag < 100) {
    const double before = correlations[bestLag - 1], middle = correlations[bestLag];
    const double after = correlations[bestLag + 1];
    const double curvature = before - 2 * middle + after;
    if (curvature < -1.e-8)
      refinedLag += std::clamp(0.5 * (before - after) / curvature, -0.5, 0.5);
  }
  const auto maximum = *std::max_element(onset.begin(), onset.end());
  const auto threshold = maximum * 0.25F;
  std::size_t first = 0;
  while (first < bins && onset[first] < threshold) ++first;
  if (first == bins) return {};
  return {static_cast<float>(60.0 / (refinedLag * hop / sampleRate)),
          static_cast<float>(first * hop / sampleRate), best};
}

} // namespace artss::audio
