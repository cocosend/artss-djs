#include "DrumSynth.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace {
using artss::Drum;
constexpr int kRate=22050, kBpm=124;
constexpr float kBar=240.f/kBpm;
constexpr std::array<const char*,32> names={
 "909_foundation","909_warehouse","909_shuffle","909_ride",
 "606_classic","606_break","606_hats","606_toms",
 "303_acid","303_resonance","303_subline","303_drive",
 "hybrid_peak","hybrid_rolling","hybrid_minimal","hybrid_fill",
 "909_kick","606_kick","909_snare","606_snare","909_clap","606_hat",
 "909_open_hat","606_rim","909_tom","606_cowbell","909_ride_hit",
 "303_acid_hit","303_sub_hit","606_perc","909_shaker","909_crash"};
constexpr std::array<Drum,16> instruments={
 Drum::Kick909,Drum::Kick606,Drum::Snare909,Drum::Snare606,Drum::Clap909,
 Drum::Hat606,Drum::OpenHat909,Drum::Rim606,Drum::Tom909,Drum::Cowbell606,
 Drum::Ride909,Drum::Acid303,Drum::Sub303,Drum::Perc606,Drum::Shaker909,Drum::Crash909};
void add(std::vector<float>& mix,Drum d,float at,float level,uint32_t variation) {
 std::array<float,kRate*2> hit{};
 const auto n=artss::renderDrum(d,hit.data(),hit.size(),kRate,variation);
 const auto start=static_cast<size_t>(std::round(at*kRate));
 for(size_t i=0;i<n&&start+i<mix.size();++i) mix[start+i]+=hit[i]*level;
}
void groove(std::vector<float>& data,int index) {
 const int family=index/4,variation=index%4;
 const bool has909=family==0||family==3,has606=family==1||family==3;
 for(int step=0;step<16;step++){
  const float at=kBar*step/16.f;
  const uint32_t seed=static_cast<uint32_t>(index*37+step);
  const float accent=step%4==0?1.f:.73f;
  if(step%4==0||(variation==1&&step==14)||(variation==3&&step==15))
    add(data,has909?Drum::Kick909:Drum::Kick606,at,.68f*accent,seed);
  if(step==4||step==12)
    add(data,has606&&variation%2?Drum::Snare606:Drum::Clap909,at,.54f,seed);
  if((step%2==0)||(variation>=2&&step%2==1))
    add(data,has909&&variation==3?Drum::Shaker909:Drum::Hat606,at,
        step%2?.18f:.27f,seed);
  if((step==6||step==14)&&variation!=2)
    add(data,variation==3?Drum::Ride909:Drum::OpenHat909,at,.17f,seed);
  if(family==1&&(step==3||step==11||(variation==3&&step==15)))
    add(data,variation==3?Drum::Tom909:Drum::Rim606,at,.29f,seed);
  if((family==2||family==3)&&(step==0||step==3||step==6||step==10||step==13))
    add(data,variation==2?Drum::Sub303:Drum::Acid303,at,.42f,seed);
  if(family==2&&step==8) add(data,Drum::Kick606,at,.18f,seed);
 }
}
void write16(std::ofstream& file,uint16_t x){file.put(static_cast<char>(x));file.put(static_cast<char>(x>>8));}
void write32(std::ofstream& file,uint32_t x){write16(file,static_cast<uint16_t>(x));write16(file,static_cast<uint16_t>(x>>16));}
void wav(const std::filesystem::path& path,std::vector<float>& data){
 float peak=0.f;
 for(float v:data)peak=std::max(peak,std::abs(v));
 const float gain=std::min(1.f,.77f/std::max(peak,.00001f));
 std::ofstream out(path,std::ios::binary);
 if(!out)throw std::runtime_error("cannot write "+path.string());
 out.write("RIFF",4);write32(out,36+static_cast<uint32_t>(data.size()*2));
 out.write("WAVEfmt ",8);write32(out,16);write16(out,1);write16(out,1);
 write32(out,kRate);write32(out,kRate*2);write16(out,2);write16(out,16);
 out.write("data",4);write32(out,static_cast<uint32_t>(data.size()*2));
 for(size_t i=0;i<data.size();i++){
  const float edge=std::min({1.f,static_cast<float>(i)/64.f,
                                 static_cast<float>(data.size()-1-i)/128.f});
  write16(out,static_cast<int16_t>(std::round(
    std::clamp(data[i]*gain*edge,-.95f,.95f)*32767.f)));
 }
 if(!out)throw std::runtime_error("incomplete WAV "+path.string());
}
}  // namespace
int main(int argc,char** argv){
 if(argc!=2){std::cerr<<"usage: render_kits OUTPUT_DIRECTORY\n";return 2;}
 try{
  std::filesystem::create_directories(argv[1]);
  for(size_t i=0;i<names.size();i++){
   const size_t frames=i<16?static_cast<size_t>(std::round(kBar*kRate)):
      static_cast<size_t>(kRate*1.5f);
   std::vector<float> pcm(frames);
   if(i<16)groove(pcm,static_cast<int>(i));
   else add(pcm,instruments[i-16],0.f,.87f,static_cast<uint32_t>(i));
   wav(std::filesystem::path(argv[1])/(std::string(names[i])+".wav"),pcm);
  }
  std::cout<<"PASS 32 original native C++ drum sounds (16 grooves, 16 hits)\n";
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
