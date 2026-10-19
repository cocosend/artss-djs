#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
/** iOS CoreAudio service. All JSI/TurboModule calls enqueue only; audio callback is native RT thread. */
@interface ARTSSAudioDevice : NSObject
+ (instancetype)shared;
- (BOOL)start:(NSError * _Nullable * _Nullable)error;
- (void)stop;
- (BOOL)triggerPad:(NSInteger)pad velocity:(float)velocity;
- (void)setMaster:(float)value;
- (void)setFilter:(float)value;
- (void)setTempo:(float)bpm;
- (float)meter;
@end
NS_ASSUME_NONNULL_END