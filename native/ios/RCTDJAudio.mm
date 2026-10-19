#import "RCTDJAudio.h"
#import "ARTSSAudioDevice.h"
#import <ReactCommon/RCTTurboModule.h>

@implementation RCTDJAudio
RCT_EXPORT_MODULE(NativeDJAudio)
- (NSNumber *)start {NSError *error=nil;return @([[ARTSSAudioDevice shared] start:&error]);}
- (void)stop {[[ARTSSAudioDevice shared] stop];}
- (NSNumber *)trigger:(double)pad velocity:(double)velocity {return @([[ARTSSAudioDevice shared] triggerPad:(NSInteger)pad velocity:(float)velocity]);}
- (void)setMaster:(double)level {[[ARTSSAudioDevice shared] setMaster:(float)level];}
- (void)setFilter:(double)position {[[ARTSSAudioDevice shared] setFilter:(float)position];}
- (void)setTempo:(double)bpm {[[ARTSSAudioDevice shared] setTempo:(float)bpm];}
- (NSNumber *)getMeter {return @([[ARTSSAudioDevice shared] meter]);}
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
 return std::make_shared<facebook::react::NativeDJAudioSpecJSI>(params);
}
@end