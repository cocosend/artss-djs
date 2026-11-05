#include "DrumSynth.hpp"
#include <algorithm>
#include <cmath>

namespace artss {
namespace {
constexpr float kPi = 3.14159265358979323846f;
float noise(uint32_t& state) noexcept {
  state ^= state << 13; state ^= state >> 17; state ^= state << 5;
  return static_cast<float>((state >> 8) & 0xffff) / 32767.5f - 1.f;
}
float duration(Drum d) noexcept {
  switch (d) {
    case Drum::OpenHat909: return .62f;
    case Drum::Ride909: return .84f;
    case Drum::Crash909: return 1.4f;
    case Drum::Acid303: return .42f;
    case Drum::Sub303: return .73f;
    default: return .52f;
  }
}
}  // namespace
size_t renderDrum(Drum drum, float* output, size_t capacity,
                  float sampleRate, uint32_t variation) noexcept {
  if (!output || !std::isfinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      static_cast<unsigned>(drum) >= kDrumCount) return 0;
  const auto frames = std::min(capacity, static_cast<size_t>(duration(drum)*sampleRate));
  if (!frames) return 0;
  uint32_t state=0xAC1D909u ^ (static_cast<unsigned>(drum)*0x9e3779b9u) ^ (variation*0x85ebca6bu);
  if (!state) state=1;
  float phase=0.f, noiseLow=0.f, acidLow=0.f, high=0.f;
  float clapLow=0.f, clapHigh=0.f;
  const float clapLoAlpha=-std::expm1(-2*kPi*std::min(850.f,sampleRate*.2f)/sampleRate);
  const float clapHiAlpha=-std::expm1(-2*kPi*std::min(5500.f,sampleRate*.42f)/sampleRate);
  const float noiseAlpha = -std::expm1(-2 * kPi * 350.f / sampleRate);
  const float toneOffset=(static_cast<int>(variation%5)-2)*.018f;
  for (size_t i=0;i<frames;++i) {
    const float t=static_cast<float>(i)/sampleRate;
    const float n=noise(state);
    noiseLow+=noiseAlpha*(n-noiseLow); high=n-noiseLow;
    const auto osc=[&](float hz) noexcept {return std::sin(2*kPi*hz*t);};
    float v=0.f;
    switch (drum) {
      case Drum::Kick909:
      case Drum::Kick606: {
        const bool big=drum==Drum::Kick909;
        const float f=(big?48.f:62.f)+(big?170.f:105.f)*std::exp(-t*(big?28.f:38.f));
        phase+=2*kPi*f/sampleRate;
        v=std::sin(phase)*std::exp(-t*(big?10.f:17.f))*.84f+
          n*std::exp(-t*180.f)*.12f; break;
      }
      case Drum::Snare909: case Drum::Snare606:
        v=(high*(drum==Drum::Snare909?.65f:.48f)*std::exp(-t*19.f)+
          osc(drum==Drum::Snare909?181.f:232.f)*.32f*std::exp(-t*26.f)); break;
      case Drum::Clap909: {
        // Band-limit the transient and use smooth, overlapping bursts.
        // The previous fmod envelope restarted abruptly every 12 ms and
        // injected clicks plus excessive high-frequency noise into every clap.
        clapLow += clapLoAlpha * (n-clapLow);
        clapHigh += clapHiAlpha * (n-clapHigh);
        const auto burst = [](float x) noexcept {
          return x <= 0 ? 0.f : (1.f-std::exp(-x*1500.f))*std::exp(-x*130.f);
        };
        const float env=.62f*burst(t)+.48f*burst(t-.011f)+.36f*burst(t-.022f)
          + .30f*(1.f-std::exp(-t*350.f))*std::exp(-t*18.f);
        v=(clapHigh-clapLow)*env*.48f; break;
      }
      case Drum::Hat606: case Drum::OpenHat909: case Drum::Shaker909:
        v=high*std::exp(-t*(drum==Drum::OpenHat909?8.f:drum==Drum::Shaker909?24.f:55.f))*.57f; break;
      case Drum::Rim606:
        v=(osc(752.f)+osc(1291.f))*.35f*std::exp(-t*47.f); break;
      case Drum::Tom909:
        phase+=2*kPi*(112.f+75.f*std::exp(-t*19.f))/sampleRate;
        v=std::sin(phase)*std::exp(-t*13.f)*.72f; break;
      case Drum::Cowbell606:
        v=(osc(542.f)+osc(800.f))*.27f*std::exp(-t*15.f); break;
      case Drum::Ride909: case Drum::Crash909:
        v=(high*.47f+osc(527.f)*.10f)*
          std::exp(-t*(drum==Drum::Ride909?5.f:3.8f)); break;
      case Drum::Sub303:
        phase+=2*kPi*(48.f+18.f*std::exp(-t*20.f))/sampleRate;
        v=std::sin(phase)*std::exp(-t*6.2f)*.63f; break;
      case Drum::Acid303: {
        const float f=110.f*(1.f+toneOffset);
        const float p=std::fmod(f*t,1.f), dt=f/sampleRate;
        float correction=0;
        if (p<dt) {const float x=p/dt; correction=x+x-x*x-1;}
        else if (p>1-dt) {const float x=(p-1)/dt; correction=x*x+x+x+1;}
        const float saw=2.f*p-1.f-correction;
        const float hz=220.f+2400.f*std::exp(-t*14.f);
        const float cutoff=-std::expm1(-2*kPi*std::min(hz,sampleRate*.4f)/sampleRate);
        acidLow+=cutoff*(saw-acidLow);
        v=(acidLow*.52f+osc(f)*.12f)*std::exp(-t*7.f); break;
      }
      case Drum::Perc606:
        v=(osc(328.f)*.42f+high*.26f)*std::exp(-t*28.f); break;
    }
    // Shared short attack and ending ramp: no DC jump on start, no click on retrigger.
    const float edge=std::min({1.f,static_cast<float>(i)/32.f,
                                static_cast<float>(frames-1-i)/96.f});
    output[i]=std::clamp(v*edge,-.95f,.95f);
  }
  return frames;
}
}  // namespace artss
