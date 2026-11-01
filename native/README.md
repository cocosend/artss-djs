# ARTSS DJ Creator — Native Audio Core foundation

This directory is **native iOS source**, not the Vercel/PWA build. It contains:

- `core/AudioCore.*` — fixed-voice DSP, lock-free SPSC trigger queue, sample-accurate 16-step pattern schedule, equal-power A/B crossfader, smoothed three-band EQ and filter, protected stereo output, and per-voice sample playback. The render callback performs no allocation, locking or file I/O.
- `core/DrumSynth.*` — sixteen deterministic, original 303/606/909-inspired percussion and acid/sub voices rendered on a control thread. `render_kits.cpp` uses the same source to author the 32 WAVs on the PWA's second page at build time. The browser playback itself remains Web Audio.
- `ios/ARTSSAudioDevice.mm` — iOS `RemoteIO` AudioUnit render callback and AVAudioSession setup.
- `ios/RCTDJAudio.*` / `specs/NativeDJAudio.ts` — New Architecture TurboModule Codegen/JSI typed interface.
- `app/CreatorScreen.tsx` — React Native Fabric screen using Gesture Handler, Reanimated 4 worklets and GPU Skia visual area.

This is a **compilable portable DSP kernel** and **unverified iOS integration source**. There is no signed `.ipa`, tested Xcode/CocoaPods build, actual on-device latency measurement, professional automatic beat matching/time-stretch, AI stems, nor fully wired sample importing for native. The tested PWA release 33 plays the C++ generated drum files with Web Audio; the native module is a separate integration source.

Use React Native New Architecture (0.82+), React 19, compatible Reanimated 4 + `react-native-worklets`, Gesture Handler, and `@shopify/react-native-skia`. Add the Codegen spec to your app's `codegenConfig` and compile `.mm` and `AudioCore.cpp` in the iOS target; regenerate Codegen before Xcode build. Verify exact generated `DJAudioSpec` headers and adjust module binding for the RN release. An Xcode/macOS environment and physical iPhone are required before any native release quality claim.

DSP kernel validation (Linux/macOS):

```bash
g++ -std=c++20 -O2 -Wall -Wextra -pedantic native/core/AudioCore.cpp native/core/DrumSynth.cpp native/core/test.cpp -o /tmp/artss-native-dsp-test && /tmp/artss-native-dsp-test
```

RT contract: audio render thread only touches preallocated storage/atomics; no JS bridge, filesystem, logging, locks, allocations, network or decode inside render. Sample replacement is accepted only while stopped. Device output latency is not guaranteed by a preferred buffer duration setting.
