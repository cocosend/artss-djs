#include "AudioCore.hpp"
#include "DrumSynth.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
namespace artss {
namespace {
constexpr float pi=3.14159265358979323846f;
constexpr Drum stock[kPads]={Drum::Kick909,Drum::Sub303,Drum::Clap909,Drum::Hat606,
                            Drum::OpenHat909,Drum::Perc606,Drum::Acid303,Drum::Crash909};
}
AudioCore::AudioCore(float sampleRate):sampleRate_(std::clamp(sampleRate,8000.f,192000.f)) {
 for(size_t pad=0;pad<kPads;pad++){
  auto& sample=samples_[pad];
  sample.pcm=std::make_unique<float[]>(kMaxSampleFrames);
  sample.frames=renderDrum(stock[pad],sample.pcm.get(),kMaxSampleFrames,sampleRate_);
 }
}
bool AudioCore::trigger(uint8_t pad,float velocity) noexcept {
 if(pad>=kPads||!std::isfinite(velocity)||velocity<=0)return false;
 return queue_.push(Trigger{pad,std::clamp(velocity,0.f,1.f),0});
}
void AudioCore::setMaster(float value) noexcept {if(std::isfinite(value))master_.store(std::clamp(value,0.f,1.f));}
void AudioCore::setFilter(float value) noexcept {if(std::isfinite(value))filter_.store(std::clamp(value,0.f,1.f));}
void AudioCore::setTempo(float bpm) noexcept {if(std::isfinite(bpm))tempo_.store(std::clamp(bpm,80.f,175.f));}
void AudioCore::setRunning(bool running) noexcept {running_.store(running,std::memory_order_release);}
void AudioCore::resetStopped() noexcept {
 if(running_.load(std::memory_order_acquire))return;
 Trigger command;while(queue_.pop(command)){}
 for(auto& v:voices_)v.active=false;
 wasRunning_=false;step_=0;masterSmooth_=0.f;
 lowpassL_=lowpassR_=bassL_=bassR_=trebleL_=trebleR_=0.f;
 currentStep_.store(0,std::memory_order_relaxed);meter_.store(0.f,std::memory_order_relaxed);
}
void AudioCore::setCrossfader(float position) noexcept {if(std::isfinite(position))crossfader_.store(std::clamp(position,0.f,1.f));}
void AudioCore::setEQ(float low,float mid,float high) noexcept {
 if(std::isfinite(low))eqLow_.store(std::clamp(low,-12.f,12.f));
 if(std::isfinite(mid))eqMid_.store(std::clamp(mid,-12.f,12.f));
 if(std::isfinite(high))eqHigh_.store(std::clamp(high,-12.f,12.f));
}
bool AudioCore::setStep(uint8_t pad,uint8_t step,float velocity) noexcept {
 if(pad>=kPads||step>=16||!std::isfinite(velocity)||velocity<0.f)return false;
 pattern_[pad][step].store(std::clamp(velocity,0.f,1.f),std::memory_order_release);
 return true;
}
void AudioCore::clearPattern() noexcept {
 for(auto& row:pattern_)for(auto& step:row)step.store(0.f,std::memory_order_release);
}
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
 *target=Voice{};target->active=true;target->pad=pad;target->velocity=velocity;
}
float AudioCore::voiceSample(Voice& v) noexcept {
 const auto& s=samples_[v.pad];
 if(s.frames&&s.pcm){
  const auto i=static_cast<size_t>(v.pos);
  if(i>=s.frames){v.active=false;return 0.f;}
  const float frac=v.pos-static_cast<float>(i);
  const float a=s.pcm[i],b=s.pcm[std::min(i+1,s.frames-1)];v.pos+=1.f;
  const float remain=static_cast<float>(s.frames-i);
  const float edge=std::min({1.f,static_cast<float>(i)/64.f,remain/256.f});
  return (a+(b-a)*frac)*edge*v.velocity;
 }
 v.active=false;return 0.f;
}
void AudioCore::render(float* left,float* right,size_t count) noexcept {
 if(!left||!right)return;
 Trigger command;
 if(!running_.load(std::memory_order_acquire)){
  while(queue_.pop(command)){}
  for(auto& v:voices_)v.active=false;
  std::fill_n(left,count,0.f);std::fill_n(right,count,0.f);
  wasRunning_=false;masterSmooth_=0.f;currentStep_.store(0,std::memory_order_relaxed);
  meter_.store(0.f,std::memory_order_relaxed);
  frames_.fetch_add(count,std::memory_order_relaxed);return;
 }
 while(queue_.pop(command))startVoice(command.pad,command.velocity);
 const uint64_t base=frames_.load(std::memory_order_relaxed);
 if(!wasRunning_){step_=0;nextStepFrame_=static_cast<double>(base);wasRunning_=true;}
 const float master=master_.load(std::memory_order_relaxed);
 const float filter=filter_.load(std::memory_order_relaxed);
 const float cross=crossfader_.load(std::memory_order_relaxed);
 const float lowTarget=std::pow(10.f,eqLow_.load(std::memory_order_relaxed)/20.f);
 const float midTarget=std::pow(10.f,eqMid_.load(std::memory_order_relaxed)/20.f);
 const float highTarget=std::pow(10.f,eqHigh_.load(std::memory_order_relaxed)/20.f);
 const float bassAlpha=std::min(1.f,2*pi*150.f/sampleRate_);
 const float highAlpha=std::min(1.f,2*pi*3800.f/sampleRate_);
 const double framesPerStep=static_cast<double>(sampleRate_)*15./tempo_.load(std::memory_order_relaxed);
 float maxValue=0.f;
 for(size_t i=0;i<count;i++){
  if(static_cast<double>(base+i)+1e-7>=nextStepFrame_){
   for(uint8_t pad=0;pad<kPads;pad++){
    const float velocity=pattern_[pad][step_].load(std::memory_order_acquire);
    if(velocity>0.f)startVoice(pad,velocity);
   }
   currentStep_.store(step_,std::memory_order_relaxed);
   step_=static_cast<uint8_t>((step_+1)%16);
   nextStepFrame_+=framesPerStep;
  }
  masterSmooth_+=.001f*(master-masterSmooth_);
  crossSmooth_+=.0008f*(cross-crossSmooth_);
  filterSmooth_+=.002f*(filter-filterSmooth_);
  lowGainSmooth_+=.001f*(lowTarget-lowGainSmooth_);
  midGainSmooth_+=.001f*(midTarget-midGainSmooth_);
  highGainSmooth_+=.001f*(highTarget-highGainSmooth_);
  const float gainA=std::sqrt(std::max(0.f,1.f-crossSmooth_));
  const float gainB=std::sqrt(std::max(0.f,crossSmooth_));
  float mixL=0.f,mixR=0.f;
  for(auto& voice:voices_)if(voice.active){
   const float value=voiceSample(voice)*(voice.pad==1||voice.pad>=6?gainB:gainA);
   const float pan=voice.pad==3?.23f:voice.pad==4?-.21f:voice.pad==5?.18f:voice.pad==6?-.13f:0.f;
   mixL+=value*(pan>0.f?1.f-pan:1.f);
   mixR+=value*(pan<0.f?1.f+pan:1.f);
   ++voice.age;
  }
  const float cutoff=120.f+19800.f*filterSmooth_*filterSmooth_;
  const float alpha=std::min(1.f,2*pi*cutoff/sampleRate_);
  lowpassL_+=alpha*(mixL-lowpassL_);lowpassR_+=alpha*(mixR-lowpassR_);
  const auto eq=[&](float x,float& bass,float& treble) noexcept {
   bass+=bassAlpha*(x-bass);treble+=highAlpha*(x-treble);
   return bass*lowGainSmooth_+(treble-bass)*midGainSmooth_+(x-treble)*highGainSmooth_;
  };
  const float l=std::tanh(eq(lowpassL_,bassL_,trebleL_)*masterSmooth_);
  const float r=std::tanh(eq(lowpassR_,bassR_,trebleR_)*masterSmooth_);
  left[i]=l;right[i]=r;
  maxValue=std::max({maxValue,std::abs(l),std::abs(r)});
 }
 meter_.store(maxValue,std::memory_order_relaxed);
 frames_.fetch_add(count,std::memory_order_relaxed);
}
}
