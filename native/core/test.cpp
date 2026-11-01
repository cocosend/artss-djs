#include "AudioCore.hpp"
#include "DrumSynth.hpp"
#include <cassert>
#include <cmath>
#include <vector>
#include <iostream>
int main(){
 for(unsigned instrument=0;instrument<artss::kDrumCount;instrument++){
  std::vector<float> a(96000),b(96000);
  const auto x=artss::renderDrum(static_cast<artss::Drum>(instrument),a.data(),a.size(),48000,6);
  const auto y=artss::renderDrum(static_cast<artss::Drum>(instrument),b.data(),b.size(),48000,6);
  assert(x==y&&x>1000);
  float energy=0,peak=0;
  for(size_t i=0;i<x;i++){assert(std::isfinite(a[i])&&a[i]==b[i]);energy+=a[i]*a[i];peak=std::max(peak,std::abs(a[i]));}
  assert(peak<1&&energy/x>.00001f);
  assert(a[0]==0&&std::abs(a[x-1])<.0001f);
 }
 artss::AudioCore engine(48000);
 std::vector<float> left(256),right(256);
 assert(!engine.trigger(200,1));assert(engine.trigger(0,1));engine.setRunning(true);
 engine.render(left.data(),right.data(),256);
 float peak=0;for(float v:left){assert(std::isfinite(v));assert(std::abs(v)<=1.0f);peak=std::max(peak,std::abs(v));}assert(peak>.01f);
 engine.setRunning(false);engine.render(left.data(),right.data(),256);for(float v:left)assert(v==0);
 std::vector<float> custom(4800);for(size_t i=0;i<custom.size();i++)custom[i]=.3f*std::sin(i*.07f);
 assert(engine.replaceSample(5,custom.data(),custom.size()));engine.setRunning(true);
 assert(!engine.replaceSample(5,custom.data(),custom.size()));
 assert(engine.trigger(5,1));engine.render(left.data(),right.data(),256);assert(engine.meter()>0);
 for(int i=0;i<10000;i++)engine.trigger(i%8,1);
 for(int i=0;i<200;i++)engine.render(left.data(),right.data(),256);
 for(float v:left)assert(std::isfinite(v)&&std::abs(v)<=1.f);
 assert(engine.renderedFrames()>=256*203);
 artss::AudioCore sequencer(48000);
 sequencer.clearPattern();sequencer.setTempo(120);
 assert(!sequencer.setStep(8,0,1));assert(!sequencer.setStep(0,16,1));
 assert(!sequencer.setStep(0,1,NAN));
 assert(sequencer.setStep(0,0,.9f));assert(sequencer.setStep(3,1,.6f));
 sequencer.setRunning(true);
 std::vector<float> barL(6000),barR(6000);
 sequencer.render(barL.data(),barR.data(),barL.size());
 assert(sequencer.currentStep()==0);
 sequencer.render(left.data(),right.data(),1);
 assert(sequencer.currentStep()==1);
 sequencer.setCrossfader(0.f);sequencer.setEQ(12.f,0.f,-12.f);
 sequencer.render(barL.data(),barR.data(),barL.size());
 for(float v:barL)assert(std::isfinite(v)&&std::abs(v)<1.f);
 assert(sequencer.currentStep()==2);
 sequencer.setRunning(false);sequencer.render(left.data(),right.data(),256);
 assert(sequencer.currentStep()==0&&sequencer.meter()==0);
 sequencer.resetStopped();sequencer.setRunning(true);
 sequencer.render(left.data(),right.data(),256);
 assert(sequencer.currentStep()==0&&sequencer.meter()>0);
 artss::AudioCore stereo(48000);
 stereo.clearPattern();stereo.setRunning(true);assert(stereo.trigger(3,1));
 stereo.render(left.data(),right.data(),256);
 float separation=0;for(size_t i=0;i<left.size();i++)separation+=std::abs(left[i]-right[i]);
 assert(separation>.001f);
 artss::AudioCore cross(48000);
 cross.clearPattern();cross.setRunning(true);cross.setCrossfader(0.f);
 std::vector<float> settleL(20000),settleR(20000);
 cross.render(settleL.data(),settleR.data(),settleL.size());
 assert(cross.trigger(1,1));cross.render(left.data(),right.data(),256);
 float muted=0;for(float v:left)muted=std::max(muted,std::abs(v));
 cross.setCrossfader(1.f);cross.render(settleL.data(),settleR.data(),settleL.size());
 assert(cross.trigger(1,1));cross.render(left.data(),right.data(),256);
 float audible=0;for(float v:left)audible=std::max(audible,std::abs(v));
 assert(muted<.005f&&audible>.01f);
 std::cout<<"PASS AudioCore 48k DSP: 16 deterministic voices, sample-accurate steps, stereo EQ/mix, bounded render and queue"<<std::endl;
}
