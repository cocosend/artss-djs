// ARTSS DJS — Metal waveform renderer. Textures are uploaded on the UI
// thread only when the track changes. Audio render() never accesses Metal.
#import <UIKit/UIKit.h>
#import <MetalKit/MetalKit.h>
#import <React/RCTViewManager.h>

#include "../cpp/core/WaveformCache.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace {
struct WaveUniforms final {
  float progress;
  float visibleStart;
  float visibleSpan;
  float bpm;
  float firstBeat;
  float duration;
  std::uint32_t columns;
  std::uint32_t firstBeatIndex;
};
static_assert(sizeof(WaveUniforms) == 32);

// Shaders compile once per view initialization, never in AudioUnit RemoteIO.
// Three rows of RGBA8: L, R, and low/mid/high frequency energy.
static const char* kMetalSource = R"METAL(
#include <metal_stdlib>
using namespace metal;

struct Params {
  float progress;
  float visibleStart;
  float visibleSpan;
  float bpm;
  float firstBeat;
  float duration;
  uint columns;
  uint firstBeatIndex;
};
struct Varyings {
  float4 position [[position]];
  float4 color;
};
inline float2 quad(uint index, float x0, float x1, float y0, float y1) {
  const bool left = index == 0 || index == 1 || index == 4;
  const bool bottom = index == 0 || index == 2 || index == 3;
  return float2(left ? x0 : x1, bottom ? y0 : y1);
}

vertex Varyings waveform_vertex(uint vertexId [[vertex_id]],
                                 constant Params& p [[buffer(0)]],
                                 texture2d<float, access::read> texture [[texture(0)]]) {
  const uint channel = vertexId / (p.columns * 6u);
  const uint column = (vertexId / 6u) % p.columns;
  const uint corner = vertexId % 6u;
  const float4 pcm = texture.read(uint2(column, channel));
  if (pcm.a < 0.5f) {
    // A zero-count cache column is empty, not a sample with value -1.
    Varyings empty;
    empty.position = float4(2.0f, 2.0f, 0.0f, 1.0f);
    empty.color = float4(0.0f);
    return empty;
  }
  const float2 minMax = pcm.rg * 2.0f - 1.0f;
  const float rms = pcm.b;
  const float3 spectrum = texture.read(uint2(column, 2)).rgb;
  const float sum = spectrum.x + spectrum.y + spectrum.z;
  float3 rgb = sum > 0.0001f
    ? (spectrum.x * float3(0.02f, 0.91f, 0.84f) +
       spectrum.y * float3(0.39f, 0.53f, 1.0f) +
       spectrum.z * float3(1.0f, 0.34f, 0.34f)) / sum
    : float3(0.20f, 0.26f, 0.32f);
  const float normalized = (float(column) + 0.5f) / float(p.columns);
  const float isPlayed = normalized <= p.progress ? 1.0f : 0.34f;
  rgb *= isPlayed * (0.24f + min(0.76f, rms * 1.8f));
  const float x0 = (float(column) / float(p.columns) -
                    p.visibleStart) * 2.0f / p.visibleSpan - 1.0f;
  const float x1 = (float(column + 1u) / float(p.columns) -
                    p.visibleStart) * 2.0f / p.visibleSpan - 1.0f;
  const float center = channel == 0 ? 0.52f : -0.52f;
  const float y0 = center + minMax.x * 0.39f;
  const float y1 = center + minMax.y * 0.39f;
  const float2 xy = quad(corner, x0, x1, y0, y1);
  Varyings out;
  out.position = float4(xy, 0.0f, 1.0f);
  out.color = float4(rgb, 1.0f);
  return out;
}

vertex Varyings beatgrid_vertex(uint vertexId [[vertex_id]],
                                constant Params& p [[buffer(0)]]) {
  const uint beatIndex = p.firstBeatIndex + vertexId / 6u;
  const float beatSec = p.firstBeat + float(beatIndex) * 60.0f / max(p.bpm, 1.0f);
  const float x = (beatSec / max(p.duration, 0.00001f) -
                   p.visibleStart) * 2.0f / p.visibleSpan - 1.0f;
  const float2 xy = quad(vertexId % 6u, x - 0.0011f,
                         x + 0.0011f, -0.96f, 0.96f);
  Varyings out;
  out.position = float4(xy, 0.0f, 1.0f);
  out.color = float4(beatIndex % 4u == 0u
      ? float3(0.22f, 0.35f, 0.46f)
      : float3(0.11f, 0.17f, 0.24f), 1.0f);
  return out;
}

vertex Varyings playhead_vertex(uint vertexId [[vertex_id]],
                                constant Params& p [[buffer(0)]]) {
  const float x = (p.progress - p.visibleStart) * 2.0f /
                  p.visibleSpan - 1.0f;
  const float2 xy = quad(vertexId % 6u, x - 0.0035f,
                         x + 0.0035f, -0.98f, 0.98f);
  Varyings out;
  out.position = float4(xy, 0.0f, 1.0f);
  out.color = float4(0.92f, 0.97f, 1.0f, 1.0f);
  return out;
}

fragment float4 waveform_fragment(Varyings in [[stage_in]]) {
  return in.color;
}
)METAL";
} // namespace

@interface ARTSSWaveformMetalView : MTKView <MTKViewDelegate>
@property(nonatomic, copy) NSString* cache;
@property(nonatomic, strong) NSNumber* zoom;
@property(nonatomic, strong) NSNumber* position;
@property(nonatomic, strong) NSNumber* visibleStart;
@property(nonatomic, strong) NSNumber* bpm;
@property(nonatomic, strong) NSNumber* firstBeat;
@property(nonatomic, strong) NSNumber* duration;
@end

@implementation ARTSSWaveformMetalView {
  id<MTLCommandQueue> _commandQueue;
  id<MTLRenderPipelineState> _wavePipeline;
  id<MTLRenderPipelineState> _gridPipeline;
  id<MTLRenderPipelineState> _playheadPipeline;
  NSArray<id<MTLTexture>>* _levelTextures;
}
@synthesize cache = _cache;

- (id<MTLRenderPipelineState>)pipeline:(id<MTLLibrary>)library
                                vertex:(NSString*)name {
  id<MTLFunction> vertex = [library newFunctionWithName:name];
  id<MTLFunction> fragment = [library newFunctionWithName:@"waveform_fragment"];
  if (!vertex || !fragment) return nil;
  MTLRenderPipelineDescriptor* desc = [MTLRenderPipelineDescriptor new];
  desc.vertexFunction = vertex;
  desc.fragmentFunction = fragment;
  desc.colorAttachments[0].pixelFormat = MTLPixelFormatBGRA8Unorm;
  NSError* error = nil;
  return [self.device newRenderPipelineStateWithDescriptor:desc error:&error];
}

- (instancetype)initWithFrame:(CGRect)frame device:(id<MTLDevice>)device {
  self = [super initWithFrame:frame device:device];
  if (!self) return nil;
  self.opaque = YES;
  self.colorPixelFormat = MTLPixelFormatBGRA8Unorm;
  self.clearColor = MTLClearColorMake(0.035, 0.055, 0.085, 1.0);
  self.preferredFramesPerSecond = [UIScreen mainScreen].maximumFramesPerSecond;
  self.framebufferOnly = YES;
  self.enableSetNeedsDisplay = NO;
  self.paused = YES;
  self.delegate = self;
  _levelTextures = @[];
  _zoom = @0;
  _position = @0.0;
  _visibleStart = @0.0;
  _bpm = @0.0;
  _firstBeat = @0.0;
  _duration = @1.0;
  if (device) {
    _commandQueue = [device newCommandQueue];
    NSError* error = nil;
    NSString* source = [NSString stringWithUTF8String:kMetalSource];
    id<MTLLibrary> library = [device newLibraryWithSource:source options:nil error:&error];
    if (library) {
      _wavePipeline = [self pipeline:library vertex:@"waveform_vertex"];
      _gridPipeline = [self pipeline:library vertex:@"beatgrid_vertex"];
      _playheadPipeline = [self pipeline:library vertex:@"playhead_vertex"];
    }
  }
  return self;
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  self.paused = self.window == nil;
}

- (void)setCache:(NSString*)cache {
  if ((_cache == cache) || (_cache && [_cache isEqualToString:cache])) return;
  _cache = [cache copy];
  _levelTextures = @[];
  NSData* bytes = [[NSData alloc] initWithBase64EncodedString:_cache
                                                     options:0];
  if (!self.device || bytes.length != artss::audio::kWaveformCacheBytes) return;

  auto* raw = static_cast<const std::uint8_t*>(bytes.bytes);
  NSMutableArray<id<MTLTexture>>* textures = [NSMutableArray arrayWithCapacity:3];
  for (std::size_t level = 0; level < 3; ++level) {
    const auto width = artss::audio::kWaveformWidths[level];
    MTLTextureDescriptor* desc =
        [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm
                                                         width:width height:3 mipmapped:NO];
    desc.usage = MTLTextureUsageShaderRead;
    id<MTLTexture> texture = [self.device newTextureWithDescriptor:desc];
    if (!texture) return;
    const MTLRegion region = MTLRegionMake2D(0, 0, width, 3);
    [texture replaceRegion:region mipmapLevel:0
                 withBytes:raw + artss::audio::waveformLevelOffset(level)
               bytesPerRow:width * 4];
    [textures addObject:texture];
  }
  _levelTextures = [textures copy];
}

- (void)mtkView:(MTKView*)view drawableSizeWillChange:(CGSize)size {
  (void)view;
  (void)size;
}

- (void)drawInMTKView:(MTKView*)view {
  if (_levelTextures.count != 3 || !_commandQueue ||
      !_wavePipeline || !_playheadPipeline) return;
  id<CAMetalDrawable> drawable = view.currentDrawable;
  MTLRenderPassDescriptor* pass = view.currentRenderPassDescriptor;
  if (!drawable || !pass) return;

  const auto level = static_cast<std::size_t>(
      std::clamp(_zoom.integerValue, (NSInteger)0, (NSInteger)2));
  const float span = level == 0 ? 1.0F : level == 1 ? 0.25F : 0.0625F;
  const float current = std::clamp(_position.floatValue, 0.0F, 1.0F);
  const float visible = std::clamp(_visibleStart.floatValue, 0.0F, 1.0F - span);
  const float duration = std::max(0.001F, _duration.floatValue);
  const float bpm = std::clamp(_bpm.floatValue, 0.0F, 200.0F);
  const float firstBeat = std::max(0.0F, _firstBeat.floatValue);
  const auto width = artss::audio::kWaveformWidths[level];

  WaveUniforms params{current, visible, span, bpm, firstBeat, duration,
                      static_cast<std::uint32_t>(width), 0};
  id<MTLCommandBuffer> command = [_commandQueue commandBuffer];
  id<MTLRenderCommandEncoder> encoder = [command renderCommandEncoderWithDescriptor:pass];
  if (!command || !encoder) return;
  [encoder setVertexBytes:&params length:sizeof(params) atIndex:0];

  if (bpm >= 60.0F && _gridPipeline) {
    const double secondsPerBeat = 60.0 / bpm;
    const double minSecond = static_cast<double>(visible) * duration;
    const double maxSecond = static_cast<double>(visible + span) * duration;
    const auto first = std::max<std::int64_t>(
        0, static_cast<std::int64_t>(std::floor((minSecond - firstBeat) / secondsPerBeat)));
    const auto limit = std::max<std::int64_t>(
        first, static_cast<std::int64_t>(std::ceil((maxSecond - firstBeat) / secondsPerBeat)));
    params.firstBeatIndex = static_cast<std::uint32_t>(std::min<std::int64_t>(first, 100000000));
    const auto gridCount = static_cast<std::uint32_t>(
        std::min<std::int64_t>(4096, limit - first + 1));
    [encoder setRenderPipelineState:_gridPipeline];
    [encoder setVertexBytes:&params length:sizeof(params) atIndex:0];
    [encoder drawPrimitives:MTLPrimitiveTypeTriangle
               vertexStart:0 vertexCount:gridCount * 6];
  }
  [encoder setRenderPipelineState:_wavePipeline];
  [encoder setVertexTexture:_levelTextures[level] atIndex:0];
  [encoder drawPrimitives:MTLPrimitiveTypeTriangle
             vertexStart:0 vertexCount:static_cast<NSUInteger>(width * 2 * 6)];

  [encoder setRenderPipelineState:_playheadPipeline];
  [encoder drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:6];
  [encoder endEncoding];
  [command presentDrawable:drawable];
  [command commit];
}
@end

@interface ARTSSWaveformMetalManager : RCTViewManager
@end
@implementation ARTSSWaveformMetalManager
RCT_EXPORT_MODULE(ARTSSWaveformMetal)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (UIView*)view {
  return [[ARTSSWaveformMetalView alloc] initWithFrame:CGRectZero
                                               device:MTLCreateSystemDefaultDevice()];
}
RCT_EXPORT_VIEW_PROPERTY(cache, NSString)
RCT_EXPORT_VIEW_PROPERTY(zoom, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(position, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(visibleStart, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(bpm, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(firstBeat, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(duration, NSNumber)
@end
