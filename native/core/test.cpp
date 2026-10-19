#include "AudioCore.hpp"
#include <cassert>
#include <cmath>
#include <vector>
#include <iostream>
int main(){
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
 std::cout<<"PASS AudioCore 48k DSP: finite, bounded, sample upload, queue saturation"<<std::endl;
}