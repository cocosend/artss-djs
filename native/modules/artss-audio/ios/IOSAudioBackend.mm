#import <AVFAudio/AVFAudio.h>
#import <AudioToolbox/AudioToolbox.h>
#import <TargetConditionals.h>
#import <mach/mach_time.h>
#import <os/proc.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <objc/runtime.h>

#include "IOSAudioBackend.hpp"
#include "../cpp/core/BeatGrid.hpp"
#include "ArtssAudioModuleProvider.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <utility>

@interface ARTSSFilePicker : NSObject <UIDocumentPickerDelegate>
@property (nonatomic, copy) void (^completion)(NSURL* _Nullable, BOOL);
@end
@implementation ARTSSFilePicker
- (void)documentPicker:(UIDocumentPickerViewController*)controller didPickDocumentsAtURLs:(NSArray<NSURL*>*)urls {
  if (self.completion) self.completion(urls.firstObject, NO);
}
- (void)documentPickerWasCancelled:(UIDocumentPickerViewController*)controller {
  if (self.completion) self.completion(nil, YES);
}
@end

namespace artss::audio {
namespace {
const void* kLifecycleQueueKey = &kLifecycleQueueKey;
constexpr UInt32 kMaximumFrames = 4096;
const std::array<const char*, kPadCount> kSampleNames{
    "kick", "snare", "clap", "closed-hat", "open-hat", "low-tom", "rim", "shaker"};
// Original eight-bar motifs adapted from Stripewolf Wave's 9 DemoPicker entries.
constexpr std::array<const char*, 9> kPresetNames{
    "Kazantip Retro Coast", "Kazantip Sunrise 303", "Acid Night Circuit",
    "303 Black Sea Warehouse", "Modern Midnight Pulse", "Maddix Rumble 909",
    "ARTBAT Orbital Dawn", "Brejcha Rubber Bass", "Guetta Neon Drive"};
constexpr std::array<int, 9> kPresetBpm{132, 138, 142, 146, 150, 148, 124, 128, 130};
constexpr std::array<int, 9> kPresetRoots{33, 33, 43, 43, 39, 38, 34, 41, 36};

void check(OSStatus status, const char* operation) {
  if (status != noErr) throw std::runtime_error(std::string(operation) + ": " + std::to_string(status));
}
void checkSession(BOOL success, NSError* error, const char* operation) {
  if (!success) throw std::runtime_error(std::string(operation) + ": " +
      (error ? error.localizedDescription.UTF8String : "unknown audio session error"));
}

Sample decode(NSURL* url, double sampleRate, double maxSeconds = 30) {
  ExtAudioFileRef file = nullptr;
  check(ExtAudioFileOpenURL((__bridge CFURLRef)url, &file), "Open bundled PCM sample");
  struct FileGuard {
    ExtAudioFileRef ref;
    ~FileGuard() { if (ref) ExtAudioFileDispose(ref); }
  } guard{file};
  AudioStreamBasicDescription input{};
  UInt32 bytes = sizeof(input);
  check(ExtAudioFileGetProperty(file, kExtAudioFileProperty_FileDataFormat, &bytes, &input), "Read sample format");
  SInt64 sourceFrames = 0;
  bytes = sizeof(sourceFrames);
  check(ExtAudioFileGetProperty(file, kExtAudioFileProperty_FileLengthFrames, &bytes, &sourceFrames), "Read sample length");
  if (!std::isfinite(input.mSampleRate) || input.mSampleRate <= 0 || sourceFrames <= 0 ||
      sourceFrames / input.mSampleRate > maxSeconds) {
    throw std::runtime_error("Трек слишком длинный или его формат не поддерживается");
  }
  AudioStreamBasicDescription client{};
  client.mSampleRate = sampleRate;
  client.mFormatID = kAudioFormatLinearPCM;
  client.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
  client.mBytesPerPacket = client.mBytesPerFrame = sizeof(float) * 2;
  client.mFramesPerPacket = 1;
  client.mChannelsPerFrame = 2;
  client.mBitsPerChannel = 32;
  check(ExtAudioFileSetProperty(file, kExtAudioFileProperty_ClientDataFormat, sizeof(client), &client), "Configure sample conversion");
  const double estimatedFrames = std::ceil(sourceFrames * sampleRate / input.mSampleRate) + 4096;
  if (!std::isfinite(estimatedFrames) || estimatedFrames > std::numeric_limits<UInt32>::max() || estimatedFrames <= 4096)
    throw std::runtime_error("Некорректная длительность трека");
  const auto capacity = static_cast<UInt32>(estimatedFrames);
  // iOS may terminate the process without a C++ exception if PCM exceeds its memory budget.
  const auto bytesNeeded = static_cast<std::size_t>(capacity) * 2 * sizeof(float);
  const auto available = os_proc_available_memory();
  constexpr std::size_t kReserveForApp = 64U * 1024U * 1024U;
  if ((available == 0 && !TARGET_OS_SIMULATOR) ||
      (available != 0 && (available <= kReserveForApp || bytesNeeded > available - kReserveForApp)))
    throw std::runtime_error("Недостаточно памяти для трека. Закройте другие приложения или выберите более короткий файл");
  Sample result;
  // One reservation avoids repeated copies and transient memory spikes.
  result.stereo.reserve(static_cast<std::size_t>(capacity) * 2);
  std::vector<float> chunk(8192 * 2);
  UInt32 written = 0;
  float maximumPeak = 0;
  while (written < capacity) {
    UInt32 count = std::min<UInt32>(8192, capacity - written);
    AudioBufferList buffer{};
    buffer.mNumberBuffers = 1;
    buffer.mBuffers[0] = {2, count * static_cast<UInt32>(sizeof(float) * 2), chunk.data()};
    check(ExtAudioFileRead(file, &count, &buffer), "Decode sample to negotiated hardware rate");
    if (count == 0) break;
    for (std::size_t i = 0; i < static_cast<std::size_t>(count) * 2; ++i) {
      if (!std::isfinite(chunk[i])) throw std::runtime_error("Трек содержит повреждённые аудиоданные");
      maximumPeak = std::max(maximumPeak, std::abs(chunk[i]));
    }
    result.stereo.insert(result.stereo.end(), chunk.begin(), chunk.begin() + count * 2);
    written += count;
  }
  if (written == 0 || written == capacity) throw std::runtime_error("Invalid decoded sample length");
  if (maximumPeak <= 1.e-8F) throw std::runtime_error("Трек не содержит слышимого звука");
  if (maximumPeak > 0.98F) {
    const float gain = 0.98F / maximumPeak;
    for (float& sample : result.stereo) sample *= gain;
  }
  return result;
}

// Original procedural demo grooves. Built once on the lifecycle queue, never in RemoteIO.
Sample synthPreset(std::uint32_t preset, double sampleRate, std::uint32_t variation = 0) {
  // Eight bars of ORIGINAL offline-rendered music. Nothing in here runs on RemoteIO.
  // The earlier synth used inharmonic 6/9 kHz beat tones and an unfiltered saw,
  // producing aliasing and an abrasive sound. Replace them with filtered
  // broadband percussion, a band-limited 303 oscillator and controlled headroom.
  constexpr double tau = 6.28318530717958647692;
  const double beat = 60.0 / kPresetBpm[preset];
  const double eighth = beat * 0.5;
  const auto frames = static_cast<std::size_t>(std::ceil(32.0 * beat * sampleRate));
  Sample result;
  result.stereo.resize(frames * 2);
  const int transpose = variation ? static_cast<int>(variation % 5) - 2 : 0;
  const double root = 440.0 * std::pow(2.0, (kPresetRoots[preset] + transpose - 69) / 12.0);
  constexpr int notes[9][4] = {{0, 3, -2, 5}, {0, 7, 5, 3}, {0, 7, 5, 3},
      {0, -2, 3, 7}, {0, 3, 7, 5}, {0, 0, 3, -2}, {0, 7, 3, 5},
      {0, -2, 5, 3}, {0, 5, 7, 3}};
  const bool acid303 = preset <= 4 || preset == 7;
  const bool sub808 = preset <= 1 || preset == 4 || preset == 5 || preset == 6;
  const bool punch909 = preset <= 1 || preset == 4 || preset == 5 || preset == 8;
  auto polyBlep = [](double phase, double step) noexcept {
    if (phase < step) {
      const double x = phase / step;
      return x + x - x * x - 1.0;
    }
    if (phase > 1.0 - step) {
      const double x = (phase - 1.0) / step;
      return x * x + x + x + 1.0;
    }
    return 0.0;
  };
  std::uint32_t randomState = 0x5f3759dfU ^ (preset * 0x9e3779b9U) ^ (variation * 0x85ebca6bU);
  if (!randomState) randomState = 1;
  double noiseLow = 0.0;
  double kickPhase = 0.0;
  double bassPhase = 0.0;
  double acidPhase = 0.0;
  double acidLow = 0.0;
  for (std::size_t i = 0; i < frames; ++i) {
    const double t = static_cast<double>(i) / sampleRate;
    const int beatNumber = static_cast<int>(t / beat);
    const double beatTime = t - beatNumber * beat;
    const double eighthTime = std::fmod(t, eighth);
    const double kickFreq = 49.0 + (punch909 ? 135.0 : 96.0) * std::exp(-beatTime * 34.0);
    kickPhase = std::fmod(kickPhase + tau * kickFreq / sampleRate, tau);
    const double kickEnv = std::exp(-beatTime * (punch909 ? 17.0 : 21.0))
        * std::min(1.0, beatTime * 850.0);
    const double kick = std::sin(kickPhase) * kickEnv * (punch909 ? 0.60 : 0.51);

    // Broadband cymbal texture: deterministic white noise, high-passed rather
    // than a pair of strong fixed tones that can fold into audible aliases.
    randomState ^= randomState << 13;
    randomState ^= randomState >> 17;
    randomState ^= randomState << 5;
    const double white = static_cast<double>(randomState) / 2147483648.0 - 1.0;
    noiseLow += 0.13 * (white - noiseLow);
    const double bright = white - noiseLow;
    const bool offbeat = static_cast<int>(t / eighth) % 2 != 0;
    const double hat = bright * std::exp(-eighthTime * (offbeat ? 39.0 : 77.0))
        * (offbeat ? 0.082 : 0.054) * std::min(1.0, eighthTime * 900.0);
    const bool backbeat = beatNumber % 4 == 1 || beatNumber % 4 == 3;
    const double snareAttack = std::min(1.0, beatTime * 850.0);
    const double snare = backbeat ? snareAttack * (
        bright * std::exp(-beatTime * 27.0) * 0.16 +
        std::sin(tau * 178.0 * beatTime) * std::exp(-beatTime * 24.0) * 0.072) : 0.0;

    const int note = notes[preset][(beatNumber / 2 + static_cast<int>(variation % 4)) % 4];
    const double freq = root * std::pow(2.0, note / 12.0);
    bassPhase = std::fmod(bassPhase + tau * freq / sampleRate, tau);
    const double noteAttack = std::min(1.0, eighthTime * 250.0);
    const double noteRelease = std::min(1.0, std::max(0.0, eighth - eighthTime) / 0.012);
    const double bassEnv = noteAttack * noteRelease * std::exp(-eighthTime * (preset == 7 ? 6.0 : 9.0));
    const double bass = (std::sin(bassPhase) + 0.16 * std::sin(2.0 * bassPhase))
        * bassEnv * (acid303 ? 0.16 : 0.20);

    const double acidFreq = freq * (preset == 3 ? 2.0 : 1.0);
    const double acidStep = acidFreq / sampleRate;
    acidPhase += acidStep;
    if (acidPhase >= 1.0) acidPhase -= 1.0;
    const double saw = 2.0 * acidPhase - 1.0 - polyBlep(acidPhase, acidStep);
    const double cutoff = 260.0 + 1750.0 * std::exp(-eighthTime * 14.0);
    const double alpha = 1.0 - std::exp(-tau * cutoff / sampleRate);
    acidLow += alpha * (saw - acidLow);
    const double acid = acid303 ? acidLow * bassEnv * (preset == 3 ? 0.155 : 0.105) : 0.0;
    const double sub = sub808 ? std::sin(tau * root * 0.5 * t) *
        std::exp(-beatTime * 7.0) * std::min(1.0, beatTime / 0.005) *
        std::min(1.0, (beat - beatTime) / 0.012) * 0.073 : 0.0;
    const double mix = kick + hat + snare + bass + acid + sub;
    const double ending = std::min({1.0, static_cast<double>(i) / 256.0,
        static_cast<double>(frames - i - 1) / 256.0});
    // Gentle offline saturation instead of per-track hard clipping.
    const float left = static_cast<float>(0.90 * std::tanh(0.95 * mix) * ending);
    const float right = static_cast<float>(0.90 * std::tanh(0.95 *
        (kick + hat * 0.88 + snare * 1.03 + bass + acid * 0.96 + sub)) * ending);
    result.stereo[i * 2] = left;
    result.stereo[i * 2 + 1] = right;
  }
  return result;
}
}

struct IOSAudioBackend::Impl {
  std::shared_ptr<AudioEngine> engine = std::make_shared<AudioEngine>();
  dispatch_queue_t queue = dispatch_queue_create("audio.artss.lifecycle",
      dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INITIATED, 0));
  AudioUnit unit = nullptr;
  id interruptionToken = nil, routeToken = nil, resetToken = nil;
  std::atomic<std::uint64_t> overruns{0}, maxRenderNanoseconds{0}, invalidBuffers{0};
  double sampleRate = 48000, nanosPerTick = 1;
  std::uint32_t generatedPresetSerial = 0;
  bool sessionActive = false;
  std::string snapshot;

  std::string installDeck(std::uint32_t deck, Sample track, NSString* title) {
    if (!engine->running() || !unit) throw std::runtime_error("Включите звук перед загрузкой");
    const auto grid = analyzeBeatGrid(track, sampleRate);
    engine->rejectCommands();
    check(AudioOutputUnitStop(unit), "Stop output before track swap");
    // RemoteIO is stopped, but retain the other deck, voices and sequencer clock.
    try { engine->loadDeck(deck, std::move(track), grid); }
    catch (...) {
      engine->activate();
      check(AudioOutputUnitStart(unit), "Restart output after failed track swap");
      throw;
    }
    NSMutableArray* peaks = [NSMutableArray arrayWithCapacity:kWaveformBins];
    for (float value : engine->deckWaveform(deck)) [peaks addObject:@(value)];
    NSDictionary* data = @{ @"title": title,
        @"duration": @(engine->deckDuration(deck, sampleRate)), @"waveform": peaks };
    NSData* json = [NSJSONSerialization dataWithJSONObject:data options:0 error:nil];
    if (!json) throw std::runtime_error("Track metadata serialization failed");
    engine->activate();
    try { check(AudioOutputUnitStart(unit), "Restart output after track swap"); }
    catch (...) { stopInternal(); throw; }
    return std::string(static_cast<const char*>(json.bytes), json.length);
  }

  Impl() {
    dispatch_queue_set_specific(queue, kLifecycleQueueKey, this, nullptr);
    mach_timebase_info_data_t timebase{};
    mach_timebase_info(&timebase);
    nanosPerTick = static_cast<double>(timebase.numer) / timebase.denom;
  }

  static OSStatus render(void* context, AudioUnitRenderActionFlags* flags,
                         const AudioTimeStamp*, UInt32, UInt32 frames, AudioBufferList* output) noexcept {
    auto* self = static_cast<Impl*>(context);
    if (!output) return noErr;
    if (output->mNumberBuffers != 2 || !output->mBuffers[0].mData || !output->mBuffers[1].mData ||
        output->mBuffers[0].mDataByteSize < frames * sizeof(float) ||
        output->mBuffers[1].mDataByteSize < frames * sizeof(float)) {
      for (UInt32 i = 0; i < output->mNumberBuffers; ++i) {
        if (output->mBuffers[i].mData) std::memset(output->mBuffers[i].mData, 0, output->mBuffers[i].mDataByteSize);
      }
      self->invalidBuffers.fetch_add(1, std::memory_order_relaxed);
      if (flags) *flags |= kAudioUnitRenderAction_OutputIsSilence;
      return noErr;
    }
    const auto begin = mach_absolute_time();
    self->engine->render(static_cast<float*>(output->mBuffers[0].mData),
                         static_cast<float*>(output->mBuffers[1].mData), frames);
    const auto nanos = static_cast<std::uint64_t>((mach_absolute_time() - begin) * self->nanosPerTick);
    if (nanos > self->maxRenderNanoseconds.load(std::memory_order_relaxed)) {
      self->maxRenderNanoseconds.store(nanos, std::memory_order_relaxed);
    }
    if (nanos > static_cast<std::uint64_t>(1.0e9 * frames / self->sampleRate)) {
      self->overruns.fetch_add(1, std::memory_order_relaxed);
    }
    return noErr;
  }

  void stopInternal() noexcept {
    engine->rejectCommands();
    if (unit) {
      AudioOutputUnitStop(unit);
      AudioUnitUninitialize(unit);
      AudioComponentInstanceDispose(unit);
      unit = nullptr;
    }
    // Audio Unit is disposed: no callback may access the sample bank now.
    engine->deactivateAfterStop();
    if (sessionActive) {
      [[AVAudioSession sharedInstance] setActive:NO
          withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
      sessionActive = false;
    }
  }

  std::string startInternal() {
    if (engine->running()) return snapshot;
    auto* session = [AVAudioSession sharedInstance];
    NSError* error = nil;
    const BOOL categoryOK = [session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault
                                      options:0 error:&error];
    checkSession(categoryOK, error, "Configure playback session");
    error = nil;
    const BOOL rateOK = [session setPreferredSampleRate:48000 error:&error];
    checkSession(rateOK, error, "Request 48 kHz");
    error = nil;
    const BOOL bufferOK = [session setPreferredIOBufferDuration:128.0 / 48000.0 error:&error];
    checkSession(bufferOK, error, "Request 128-frame buffer");
    error = nil;
    const BOOL activeOK = [session setActive:YES error:&error];
    checkSession(activeOK, error, "Activate playback session");
    sessionActive = true;
    sampleRate = session.sampleRate;

    NSBundle* containing = [NSBundle bundleForClass:[ArtssAudioModuleProvider class]];
    NSURL* resourceURL = [containing URLForResource:@"ARTSSAudioResources" withExtension:@"bundle"];
    NSBundle* resources = resourceURL ? [NSBundle bundleWithURL:resourceURL] : nil;
    if (!resources) throw std::runtime_error("ARTSSAudioResources.bundle is missing; reinstall CocoaPods");
    SampleBank bank;
    for (std::size_t pad = 0; pad < kPadCount; ++pad) {
      NSURL* url = [resources URLForResource:[NSString stringWithUTF8String:kSampleNames[pad]] withExtension:@"wav"];
      if (!url) throw std::runtime_error(std::string("Missing PCM sample: ") + kSampleNames[pad]);
      bank[pad] = decode(url, sampleRate);
    }
    engine->prepare(sampleRate, std::move(bank));
    engine->setKit(3);  // Start with the 909 kit; the 303/606/909 sets share this engine.

    AudioComponentDescription description{};
    description.componentType = kAudioUnitType_Output;
    description.componentSubType = kAudioUnitSubType_RemoteIO;
    description.componentManufacturer = kAudioUnitManufacturer_Apple;
    const auto component = AudioComponentFindNext(nullptr, &description);
    if (!component) throw std::runtime_error("RemoteIO Audio Unit unavailable");
    check(AudioComponentInstanceNew(component, &unit), "Create RemoteIO");
    AudioStreamBasicDescription format{};
    format.mSampleRate = sampleRate;
    format.mFormatID = kAudioFormatLinearPCM;
    format.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved;
    format.mBytesPerPacket = format.mBytesPerFrame = sizeof(float);
    format.mFramesPerPacket = 1;
    format.mChannelsPerFrame = 2;
    format.mBitsPerChannel = 32;
    check(AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input,
                              0, &format, sizeof(format)), "Configure stereo Float32 RemoteIO");
    UInt32 maximumFrames = kMaximumFrames;
    check(AudioUnitSetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global,
                              0, &maximumFrames, sizeof(maximumFrames)), "Configure render slice limit");
    AURenderCallbackStruct callback{render, this};
    check(AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input,
                              0, &callback, sizeof(callback)), "Install real-time render callback");
    check(AudioUnitInitialize(unit), "Initialize RemoteIO");

    NSMutableArray* waveforms = [NSMutableArray arrayWithCapacity:kPadCount];
    for (const auto& waveform : engine->waveforms()) {
      NSMutableArray* values = [NSMutableArray arrayWithCapacity:kWaveformBins];
      for (const auto value : waveform) [values addObject:@(value)];
      [waveforms addObject:values];
    }
    NSMutableArray* routes = [NSMutableArray array];
    bool wireless = false;
    for (AVAudioSessionPortDescription* port in session.currentRoute.outputs) {
      [routes addObject:port.portName];
      wireless |= [port.portType isEqualToString:AVAudioSessionPortBluetoothA2DP] ||
                  [port.portType isEqualToString:AVAudioSessionPortBluetoothHFP] ||
                  [port.portType isEqualToString:AVAudioSessionPortBluetoothLE] ||
                  [port.portType isEqualToString:AVAudioSessionPortAirPlay];
    }
    NSDictionary* info = @{@"sampleRate": @(sampleRate), @"ioBufferMs": @(session.IOBufferDuration * 1000),
        @"outputLatencyMs": @(session.outputLatency * 1000), @"wireless": @(wireless),
        @"routes": routes, @"waveforms": waveforms};
    NSData* data = [NSJSONSerialization dataWithJSONObject:info options:0 error:&error];
    if (!data) throw std::runtime_error("Could not serialize audio session information");
    snapshot = std::string(static_cast<const char*>(data.bytes), data.length);
    overruns.store(0, std::memory_order_relaxed);
    maxRenderNanoseconds.store(0, std::memory_order_relaxed);
    invalidBuffers.store(0, std::memory_order_relaxed);
    engine->activate();
    check(AudioOutputUnitStart(unit), "Start RemoteIO");
    return snapshot;
  }
};

IOSAudioBackend::IOSAudioBackend() : impl_(std::make_unique<Impl>()) {}

IOSAudioBackend::~IOSAudioBackend() {
  auto* impl = impl_.get();
  auto* center = [NSNotificationCenter defaultCenter];
  if (impl->interruptionToken) [center removeObserver:impl->interruptionToken];
  if (impl->routeToken) [center removeObserver:impl->routeToken];
  if (impl->resetToken) [center removeObserver:impl->resetToken];
  if (dispatch_get_specific(kLifecycleQueueKey) == impl) impl->stopInternal();
  else dispatch_sync(impl->queue, ^{ impl->stopInternal(); });
}

std::shared_ptr<AudioEngine> IOSAudioBackend::engine() const noexcept { return impl_->engine; }
double IOSAudioBackend::maximumRenderMs() const noexcept {
  return static_cast<double>(impl_->maxRenderNanoseconds.load(std::memory_order_relaxed)) / 1.0e6;
}
std::uint64_t IOSAudioBackend::overruns() const noexcept { return impl_->overruns.load(std::memory_order_relaxed); }
std::uint64_t IOSAudioBackend::invalidBuffers() const noexcept { return impl_->invalidBuffers.load(std::memory_order_relaxed); }

void IOSAudioBackend::start(Completion completion) {
  auto self = shared_from_this();
  dispatch_async(impl_->queue, ^{
    @autoreleasepool {
      try {
        const auto result = self->impl_->startInternal();
        if (!self->impl_->interruptionToken) {
          const std::weak_ptr<IOSAudioBackend> weak = self;
          auto* center = [NSNotificationCenter defaultCenter];
          // Deliberately require a new user action after interruption/route change.
          self->impl_->interruptionToken = [center addObserverForName:AVAudioSessionInterruptionNotification
              object:[AVAudioSession sharedInstance] queue:nil usingBlock:^(NSNotification* note) {
                if ([note.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] != AVAudioSessionInterruptionTypeBegan) return;
                if (auto strong = weak.lock()) strong->stop([](std::string, std::string) {});
              }];
          self->impl_->routeToken = [center addObserverForName:AVAudioSessionRouteChangeNotification
              object:[AVAudioSession sharedInstance] queue:nil usingBlock:^(NSNotification* note) {
                const auto reason = [note.userInfo[AVAudioSessionRouteChangeReasonKey] unsignedIntegerValue];
                if (reason == AVAudioSessionRouteChangeReasonCategoryChange) return;
                if (auto strong = weak.lock()) strong->stop([](std::string, std::string) {});
              }];
          self->impl_->resetToken = [center addObserverForName:AVAudioSessionMediaServicesWereResetNotification
              object:[AVAudioSession sharedInstance] queue:nil usingBlock:^(NSNotification*) {
                if (auto strong = weak.lock()) strong->stop([](std::string, std::string) {});
              }];
        }
        completion(result, {});
      } catch (const std::exception& error) {
        self->impl_->stopInternal();
        completion({}, error.what());
      }
    }
  });
}

void IOSAudioBackend::stop(Completion completion) {
  auto self = shared_from_this();
  dispatch_async(impl_->queue, ^{
    self->impl_->stopInternal();
    completion({}, {});
  });
}

void IOSAudioBackend::pickTrack(std::uint32_t deck, Completion completion) {
  if (deck >= kDeckCount) { completion({}, "Invalid deck"); return; }
  const std::weak_ptr<IOSAudioBackend> weak = shared_from_this();
  dispatch_async(dispatch_get_main_queue(), ^{
    auto strong = weak.lock();
    if (!strong) { completion({}, "Audio engine closed"); return; }
    UIViewController* presenter = nil;
    for (UIScene* scene in [UIApplication sharedApplication].connectedScenes) {
      if (![scene isKindOfClass:[UIWindowScene class]] || scene.activationState != UISceneActivationStateForegroundActive) continue;
      for (UIWindow* window in ((UIWindowScene*)scene).windows) if (window.isKeyWindow) presenter = window.rootViewController;
    }
    while (presenter.presentedViewController) presenter = presenter.presentedViewController;
    if (!presenter) { completion({}, "No active iOS window"); return; }
    UIDocumentPickerViewController* picker = [[UIDocumentPickerViewController alloc]
        initForOpeningContentTypes:@[UTTypeAudio] asCopy:YES];
    ARTSSFilePicker* delegate = [ARTSSFilePicker new];
    picker.delegate = delegate;
    objc_setAssociatedObject(picker, @selector(documentPicker:didPickDocumentsAtURLs:), delegate, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    delegate.completion = ^(NSURL* url, BOOL cancelled) {
      if (cancelled || !url) { completion({}, "Выбор трека отменён"); return; }
      if (auto owner = weak.lock()) {
        dispatch_async(owner->impl_->queue, ^{
          @autoreleasepool {
            try {
              if (!owner->impl_->engine->running()) throw std::runtime_error("Включите звук перед импортом");
              const BOOL access = [url startAccessingSecurityScopedResource];
              Sample track;
              const double available = std::min(8 * 60.0,
                  12 * 60.0 - owner->impl_->engine->remainingTrackSeconds(deck));
              try { track = decode(url, owner->impl_->sampleRate, available); }
              catch (...) { if (access) [url stopAccessingSecurityScopedResource]; throw; }
              if (access) [url stopAccessingSecurityScopedResource];
              completion(owner->impl_->installDeck(deck, std::move(track), url.lastPathComponent ?: @"Track"), {});
            } catch (const std::exception& error) {
              if (!owner->impl_->engine->running()) owner->impl_->stopInternal();
              completion({}, error.what());
            }
          }
        });
      } else completion({}, "Audio engine closed");
    };
    [presenter presentViewController:picker animated:YES completion:nil];
  });
}

void IOSAudioBackend::loadPreset(std::uint32_t deck, std::uint32_t preset, Completion completion) {
  if (deck >= kDeckCount || preset >= kPresetNames.size() * 2) { completion({}, "Invalid preset or deck"); return; }
  auto self = shared_from_this();
  dispatch_async(impl_->queue, ^{
    @autoreleasepool {
      try {
        if (!self->impl_->engine->running()) throw std::runtime_error("Включите звук перед загрузкой");
        const bool generated = preset >= kPresetNames.size();
        const auto style = static_cast<std::uint32_t>(preset % kPresetNames.size());
        const auto variation = generated ? ++self->impl_->generatedPresetSerial : 0;
        Sample track = synthPreset(style, self->impl_->sampleRate, variation);
        NSString* title = [NSString stringWithFormat:@"%s · %@", kPresetNames[style], generated ? @"GENERATED" : @"DEMO"];
        completion(self->impl_->installDeck(deck, std::move(track), title), {});
      } catch (const std::exception& error) {
        if (!self->impl_->engine->running()) self->impl_->stopInternal();
        completion({}, error.what());
      }
    }
  });
}

}  // namespace artss::audio
