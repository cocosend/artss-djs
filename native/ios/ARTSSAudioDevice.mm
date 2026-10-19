#import "ARTSSAudioDevice.h"
#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#include "../core/AudioCore.hpp"
#include <memory>

@interface ARTSSAudioDevice () { @public
 AudioUnit _output;
 std::unique_ptr<artss::AudioCore> _core;
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
- (BOOL)start:(NSError **)error {
 if(_output){_core->setRunning(true);return AudioOutputUnitStart(_output)==noErr;}
 AVAudioSession *session=[AVAudioSession sharedInstance];
 if(![session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:AVAudioSessionCategoryOptionMixWithOthers error:error])return NO;
 [session setPreferredSampleRate:48000 error:nil];
 [session setPreferredIOBufferDuration:256.0/48000 error:nil];
 if(![session setActive:YES error:error])return NO;
 _core=std::make_unique<artss::AudioCore>((float)session.sampleRate);
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
 _core.reset();
}
- (BOOL)triggerPad:(NSInteger)pad velocity:(float)velocity {return _core&&pad>=0&&pad<8?_core->trigger((uint8_t)pad,velocity):NO;}
- (void)setMaster:(float)value {if(_core)_core->setMaster(value);}
- (void)setFilter:(float)value {if(_core)_core->setFilter(value);}
- (void)setTempo:(float)value {if(_core)_core->setTempo(value);}
- (float)meter {return _core?_core->meter():0.f;}
@end