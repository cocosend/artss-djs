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
  float best = 0, runnerUp = 0;
  std::size_t bestLag = 0;
  for (std::size_t lag = 30; lag <= 100; ++lag) { // 60–200 BPM.
    double score = 0, normA = 0, normB = 0;
    for (std::size_t i = lag; i < bins; ++i) {
      score += onset[i] * onset[i - lag];
      normA += onset[i] * onset[i];
      normB += onset[i - lag] * onset[i - lag];
    }
    const auto correlation = static_cast<float>(score / std::sqrt(normA * normB + 1.e-20));
    if (correlation > best) { runnerUp = best; best = correlation; bestLag = lag; }
    else if (correlation > runnerUp) runnerUp = correlation;
  }
  if (best < 0.18F) return {};
  // A half-time harmonic is expected; prefer the shorter pulse when scores agree.
  if (bestLag * 2 <= 100) {
    const auto doubleLag = bestLag * 2;
    double score = 0, a = 0, b = 0;
    for (std::size_t i = doubleLag; i < bins; ++i) {
      score += onset[i] * onset[i - doubleLag];
      a += onset[i] * onset[i]; b += onset[i - doubleLag] * onset[i - doubleLag];
    }
    if (score / std::sqrt(a * b + 1.e-20) > best * 1.12) bestLag = doubleLag;
  }
  const auto maximum = *std::max_element(onset.begin(), onset.end());
  const auto threshold = maximum * 0.25F;
  std::size_t first = 0;
  while (first < bins && onset[first] < threshold) ++first;
  if (first == bins) return {};
  return {static_cast<float>(60.0 / (bestLag * hop / sampleRate)),
          static_cast<float>(first * hop / sampleRate), best};
}

} // namespace artss::audio
