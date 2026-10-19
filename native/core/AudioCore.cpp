#include "AudioCore.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
namespace artss {
namespace { constexpr float pi=3.14159265358979323846f; }
AudioCore::AudioCore(float sampleRate):sampleRate_(std::clamp(sampleRate,8000.f,192000.f)) {}
bool AudioCore::trigger(uint8_t pad,float velocity) noexcept {
 if(pad>=kPads||!std::isfinite(velocity)||velocity<=0)return false;
 return queue_.push(Trigger{pad,std::clamp(velocity,0.f,1.f),0});
}
void AudioCore::setMaster(float value) noexcept {if(std::isfinite(value))master_.store(std::clamp(value,0.f,1.f));}
void AudioCore::setFilter(float value) noexcept {if(std::isfinite(value))filter_.store(std::clamp(value,0.f,1.f));}
void AudioCore::setTempo(float bpm) noexcept {if(std::isfinite(bpm))tempo_.store(std::clamp(bpm,80.f,175.f));}
void AudioCore::setRunning(bool running) noexcept {running_.store(running,std::memory_order_release);}
bool AudioCore::replaceSample(uint8_t pad,const float* mono,size_t frames) noexcept {
 if(pad>=kPads||!mono||frames==0||frames>kMaxSampleFrames||running_.load(std::memory_order_acquire))return false;
 auto& s=samples_[pad];if(!s.pcm)s.pcm=std::make_unique<float[]>(kMaxSampleFrames);
 for(size_t i=0;i<frames;++i)s.pcm[i]=std::isfinite(mono[i])?std::clamp(mono[i],-1.f,1.f):0.f;
 s.frames=frames;return true;
}
void AudioCore::startVoice(uint8_t pad,float velocity) noexcept {
 Voice* target=nullptr;
 for(auto& voice:voices_)if(!voice.active){target=&voice;break;}
 if(!target){target=&voices_[0];for(auto& voice:voices_)if(voice.age>target->age)target=&voice;}
 *target=Voice{};target->active=true;target->pad=pad;target->velocity=velocity;target->env=1.f;
}
float AudioCore::voiceSample(Voice& v) noexcept {
 const auto& s=samples_[v.pad];
 if(s.frames&&s.pcm){
  const auto i=static_cast<size_t>(v.pos);
  if(i>=s.frames){v.active=false;return 0.f;}
  const float frac=v.pos-static_cast<float>(i);
  const float a=s.pcm[i],b=s.pcm[std::min(i+1,s.frames-1)];v.pos+=1.f;
  const float remain=static_cast<float>(s.frames-i);
  return (a+(b-a)*frac)*std::min(1.f,remain/256.f)*v.velocity;
 }
 // Fallback synthesizer for a pad with no decoded WAV, fully native with deterministic envelopes.
 noise_^=noise_<<13;noise_^=noise_>>17;noise_^=noise_<<5;
 const float white=(static_cast<float>(noise_&0xffffu)/32768.f)-1.f;
 const float t=v.pos/sampleRate_;v.pos+=1.f;
 const bool kick=v.pad==0,sub=v.pad==1,acid=v.pad==6;
 const float decay=kick?15.f:sub?3.8f:acid?6.f:48.f;
 const float amp=std::exp(-decay*t);
 if(amp<.0001f||t>(sub?1.8f:1.2f)){v.active=false;return 0.f;}
 const float f=kick?55.f+110.f*std::exp(-26.f*t):sub?49.f:acid?98.f:((v.pad==2)?210.f:600.f);
 v.phase+=static_cast<uint32_t>(4294967296.0 * (f/sampleRate_));
 const float wave=std::sin((static_cast<double>(v.phase)/4294967296.0)*2*pi);
 const float raw=kick?wave*.91f+white*.07f:sub?wave*.6f:acid?(wave+white*.09f)*.39f:white*(v.pad==2?.52f:.27f);
 return raw*amp*v.velocity;
}
void AudioCore::render(float* left,float* right,size_t count) noexcept {
 if(!left||!right)return;
 Trigger command;
 while(queue_.pop(command))startVoice(command.pad,command.velocity);
 if(!running_.load(std::memory_order_acquire)){for(auto& v:voices_)v.active=false;std::fill_n(left,count,0.f);std::fill_n(right,count,0.f);frames_.fetch_add(count,std::memory_order_relaxed);return;}
 const float target=master_.load(std::memory_order_relaxed);
 const float f=filter_.load(std::memory_order_relaxed);
 const float cutoff=120.f+19800.f*f*f;
 const float alpha=std::min(1.f,2*pi*cutoff/sampleRate_);
 float maxValue=0.f;
 for(size_t i=0;i<count;i++){
  float mixed=0.f;
  for(auto& voice:voices_)if(voice.active){mixed+=voiceSample(voice);++voice.age;}
  lowpass_+=alpha*(mixed-lowpass_);
  // Gentle soft clipping; never hard clip on summing.
  const float x=std::tanh(lowpass_*target);
  limiter_+=.007f*(1.f-limiter_);
  const float sample=x*limiter_;
  left[i]=sample;right[i]=sample;
  maxValue=std::max(maxValue,std::abs(sample));
 }
 meter_.store(maxValue,std::memory_order_relaxed);
 frames_.fetch_add(count,std::memory_order_relaxed);
}
}