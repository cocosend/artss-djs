#import "ARTSSAudioDevice.h"
#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#include "../core/AudioCore.hpp"
#include <memory>
#include <cmath>
#include <array>
#include <algorithm>

@interface ARTSSAudioDevice () { @public
 AudioUnit _output;
 std::unique_ptr<artss::AudioCore> _core;
 double _coreSampleRate;
 std::array<std::array<float,16>,artss::kPads> _pattern;
 float _master,_filter,_tempo,_cross,_eqLow,_eqMid,_eqHigh;
}
@end

static OSStatus ARTSSRender(void *ref,AudioUnitRenderActionFlags *flags,const AudioTimeStamp *time,UInt32 bus,UInt32 count,AudioBufferList *io) {
 auto *self=(__bridge ARTSSAudioDevice *)ref;
 if(!io||io->mNumberBuffers<2||!self->_core)return noErr;
 self->_core->render((float *)io->mBuffers[0].mData,(float *)io->mBuffers[1].mData,count);
 return noErr;
}

@implementation ARTSSAudioDevice
+ (instancetype)shared {static ARTSSAudioDevice *instance;static dispatch_once_t once;dispatch_once(&once,^{instance=[ARTSSAudioDevice new];});return instance;}
- (instancetype)init {
 if((self=[super init])){_coreSampleRate=0.;_master=.82f;_filter=1.f;_tempo=136.f;_cross=.5f;
  for(auto& row:_pattern)row.fill(0.f);
 }
 return self;
}
- (BOOL)start:(NSError **)error {
 if(_output){_core->setRunning(true);return AudioOutputUnitStart(_output)==noErr;}
 AVAudioSession *session=[AVAudioSession sharedInstance];
 if(![session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:AVAudioSessionCategoryOptionMixWithOthers error:error])return NO;
 [session setPreferredSampleRate:48000 error:nil];
 [session setPreferredIOBufferDuration:256.0/48000 error:nil];
 if(![session setActive:YES error:error])return NO;
 if(!_core||std::abs(_coreSampleRate-session.sampleRate)>1.0){
  _core=std::make_unique<artss::AudioCore>((float)session.sampleRate);
  _coreSampleRate=session.sampleRate;
 }
 _core->setMaster(_master);_core->setFilter(_filter);_core->setTempo(_tempo);
 _core->setCrossfader(_cross);_core->setEQ(_eqLow,_eqMid,_eqHigh);
 for(uint8_t pad=0;pad<artss::kPads;pad++)for(uint8_t step=0;step<16;step++)
  _core->setStep(pad,step,_pattern[pad][step]);
 AudioComponentDescription description={};description.componentType=kAudioUnitType_Output;description.componentSubType=kAudioUnitSubType_RemoteIO;description.componentManufacturer=kAudioUnitManufacturer_Apple;
 AudioComponent component=AudioComponentFindNext(NULL,&description);
 OSStatus status=component?AudioComponentInstanceNew(component,&_output):kAudio_ParamError;
 if(status!=noErr){_output=nullptr;return NO;}
 AudioStreamBasicDescription format={};format.mSampleRate=session.sampleRate;format.mFormatID=kAudioFormatLinearPCM;format.mFormatFlags=kAudioFormatFlagIsFloat|kAudioFormatFlagIsPacked|kAudioFormatFlagIsNonInterleaved;format.mFramesPerPacket=1;format.mChannelsPerFrame=2;format.mBitsPerChannel=32;format.mBytesPerFrame=4;format.mBytesPerPacket=4;
 status=AudioUnitSetProperty(_output,kAudioUnitProperty_StreamFormat,kAudioUnitScope_Input,0,&format,sizeof(format));
 AURenderCallbackStruct callback={ARTSSRender,(__bridge void *)self};
 if(status==noErr)status=AudioUnitSetProperty(_output,kAudioUnitProperty_SetRenderCallback,kAudioUnitScope_Input,0,&callback,sizeof(callback));
 if(status==noErr)status=AudioUnitInitialize(_output);
 if(status==noErr){_core->setRunning(true);status=AudioOutputUnitStart(_output);}
 if(status!=noErr){[self stop];return NO;}return YES;
}
- (void)stop {
 if(_core)_core->setRunning(false);
 if(_output){AudioOutputUnitStop(_output);AudioUnitUninitialize(_output);AudioComponentInstanceDispose(_output);_output=nullptr;}
 // Preserve the user-edited pattern and factory/user sounds across stop/start.
 if(_core)_core->resetStopped();
}
- (BOOL)triggerPad:(NSInteger)pad velocity:(float)velocity {return _core&&pad>=0&&pad<8?_core->trigger((uint8_t)pad,velocity):NO;}
- (void)setMaster:(float)value {if(!std::isfinite(value))return;_master=std::clamp(value,0.f,1.f);if(_core)_core->setMaster(_master);}
- (void)setFilter:(float)value {if(!std::isfinite(value))return;_filter=std::clamp(value,0.f,1.f);if(_core)_core->setFilter(_filter);}
- (void)setTempo:(float)value {if(!std::isfinite(value))return;_tempo=std::clamp(value,80.f,175.f);if(_core)_core->setTempo(_tempo);}
- (void)setCrossfader:(float)value {if(!std::isfinite(value))return;_cross=std::clamp(value,0.f,1.f);if(_core)_core->setCrossfader(_cross);}
- (void)setEQLow:(float)low mid:(float)mid high:(float)high {
 if(std::isfinite(low))_eqLow=std::clamp(low,-12.f,12.f);
 if(std::isfinite(mid))_eqMid=std::clamp(mid,-12.f,12.f);
 if(std::isfinite(high))_eqHigh=std::clamp(high,-12.f,12.f);
 if(_core)_core->setEQ(_eqLow,_eqMid,_eqHigh);
}
- (BOOL)setStepPad:(NSInteger)pad step:(NSInteger)step velocity:(float)velocity {
 if(pad<0||pad>=8||step<0||step>=16||!std::isfinite(velocity)||velocity<0)return NO;
 _pattern[pad][step]=std::clamp(velocity,0.f,1.f);
 if(_core)_core->setStep((uint8_t)pad,(uint8_t)step,_pattern[pad][step]);
 return YES;
}
- (void)clearPattern {for(auto& row:_pattern)row.fill(0.f);if(_core)_core->clearPattern();}
- (NSInteger)currentStep {return _core?_core->currentStep():0;}
- (float)meter {return _core?_core->meter():0.f;}
@end
