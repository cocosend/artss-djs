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
 std::cout<<"PASS AudioCore 48k DSP: 16 deterministic voices, finite, bounded, sample upload, queue saturation"<<std::endl;
}
