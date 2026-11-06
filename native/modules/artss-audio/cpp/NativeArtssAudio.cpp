#include "NativeArtssAudio.hpp"

#include <cmath>

namespace facebook::react {
namespace {
class RealtimeControls final : public jsi::HostObject {
 public:
  explicit RealtimeControls(std::shared_ptr<artss::audio::IOSAudioBackend> backend)
      : backend_(std::move(backend)), engine_(backend_->engine()) {}

  jsi::Value get(jsi::Runtime& runtime, const jsi::PropNameID& property) override {
    const auto name = property.utf8(runtime);
    if (name == "running") return engine_->running();
    if (name == "peak") return engine_->peak();
    if (name == "meterRmsL") return engine_->meterRmsL();
    if (name == "meterRmsR") return engine_->meterRmsR();
    if (name == "frames") return static_cast<double>(engine_->renderedFrames());
    if (name == "droppedCommands") return static_cast<double>(engine_->droppedCommands());
    if (name == "renderOverruns") return static_cast<double>(backend_->overruns());
    if (name == "maximumRenderMs") return backend_->maximumRenderMs();
    if (name == "invalidBuffers") return static_cast<double>(backend_->invalidBuffers());
    if (name == "deckPosition0") return engine_->deckPosition(0);
    if (name == "deckPosition1") return engine_->deckPosition(1);
    if (name == "deckCuePosition0") return engine_->deckCuePosition(0);
    if (name == "deckCuePosition1") return engine_->deckCuePosition(1);
    if (name == "deckBpm0") return engine_->deckBpm(0);
    if (name == "deckBpm1") return engine_->deckBpm(1);
    if (name == "deckRate0") return engine_->deckPlaybackRate(0);
    if (name == "deckRate1") return engine_->deckPlaybackRate(1);
    if (name == "deckFirstBeat0") return engine_->deckFirstBeat(0);
    if (name == "deckFirstBeat1") return engine_->deckFirstBeat(1);
    if (name == "deckCue" || name == "deckSetCue") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_, name](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isNumber()) return false;
            const double deck = args[0].asNumber();
            if (!std::isfinite(deck) || deck != std::floor(deck) || deck < 0 || deck >= 2) return false;
            const auto index = static_cast<std::uint32_t>(deck);
            return name == "deckCue" ? engine->deckCue(index) : engine->deckSetCue(index);
          });
    }
    if (name == "deckSetHotCue" || name == "deckHotCue" || name == "deckHotCuePosition" ||
        name == "deckBeatJump") {
      return jsi::Function::createFromHostFunction(runtime, property, 2,
          [engine = engine_, name](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 2 || !args[0].isNumber() || !args[1].isNumber())
              return name == "deckHotCuePosition" ? jsi::Value(-1.0) : jsi::Value(false);
            const double deck = args[0].asNumber(), value = args[1].asNumber();
            if (!std::isfinite(deck) || deck != std::floor(deck) || deck < 0 || deck >= 2 ||
                !std::isfinite(value) || value != std::floor(value))
              return name == "deckHotCuePosition" ? jsi::Value(-1.0) : jsi::Value(false);
            const auto index = static_cast<std::uint32_t>(deck);
            if (name == "deckBeatJump") {
              if (value < -64 || value > 64 || value == 0) return false;
              return engine->deckBeatJump(index, static_cast<std::int32_t>(value));
            }
            if (value < 0 || value >= artss::audio::kHotCueCount)
              return name == "deckHotCuePosition" ? jsi::Value(-1.0) : jsi::Value(false);
            const auto slot = static_cast<std::uint32_t>(value);
            if (name == "deckSetHotCue") return engine->deckSetHotCue(index, slot);
            if (name == "deckHotCue") return engine->deckHotCue(index, slot);
            return engine->deckHotCuePosition(index, slot);
          });
    }
    if (name == "deckSync") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isNumber()) return false;
            const double deck = args[0].asNumber();
            return std::isfinite(deck) && deck == std::floor(deck) && deck >= 0 && deck < 2 &&
                   engine->deckSync(static_cast<std::uint32_t>(deck));
          });
    }
    if (name == "deckSetBeatGrid") {
      return jsi::Function::createFromHostFunction(runtime, property, 3,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isNumber()) return false;
            const double deck = args[0].asNumber();
            const double bpm = args[1].asNumber(), firstBeat = args[2].asNumber();
            return std::isfinite(deck) && deck == std::floor(deck) && deck >= 0 && deck < 2 &&
                   std::isfinite(bpm) && std::isfinite(firstBeat) &&
                   engine->deckSetBeatGrid(static_cast<std::uint32_t>(deck),
                                           static_cast<float>(bpm), static_cast<float>(firstBeat));
          });
    }
    if (name == "deckFilter") {
      return jsi::Function::createFromHostFunction(runtime, property, 2,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 2 || !args[0].isNumber() || !args[1].isNumber()) return false;
            const double deck = args[0].asNumber(), amount = args[1].asNumber();
            return std::isfinite(deck) && deck == std::floor(deck) && deck >= 0 && deck < 2 &&
                   std::isfinite(amount) && engine->deckFilter(static_cast<std::uint32_t>(deck), static_cast<float>(amount));
          });
    }
    if (name == "deckPlaying0") return engine_->deckPlaying(0);
    if (name == "deckPlaying1") return engine_->deckPlaying(1);
    if (name == "currentStep") return static_cast<double>(engine_->currentStep());
    if (name == "deckPlay" || name == "deckSeek" || name == "deckRate") {
      return jsi::Function::createFromHostFunction(runtime, property, 2,
          [engine = engine_, name](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 2 || !args[0].isNumber() || (name == "deckPlay" ? !args[1].isBool() : !args[1].isNumber())) return false;
            const double deck = args[0].asNumber();
            const double value = name == "deckPlay" ? (args[1].getBool() ? 1 : 0) : args[1].asNumber();
            if (!std::isfinite(deck) || deck < 0 || deck >= 2 || deck != std::floor(deck) || !std::isfinite(value)) return false;
            const auto index = static_cast<std::uint32_t>(deck);
            if (name == "deckPlay") return (value == 0 || value == 1) && engine->deckPlay(index, value == 1);
            if (name == "deckSeek") return engine->deckSeek(index, static_cast<float>(value));
            return engine->deckRate(index, static_cast<float>(value));
          });
    }
    if (name == "deckLoop") {
      return jsi::Function::createFromHostFunction(runtime, property, 3,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isNumber()) return false;
            const double deck = args[0].asNumber();
            return std::isfinite(deck) && deck >= 0 && deck < 2 && deck == std::floor(deck) &&
                engine->deckLoop(static_cast<std::uint32_t>(deck), static_cast<float>(args[1].asNumber()), static_cast<float>(args[2].asNumber()));
          });
    }
    if (name == "deckJog") {
      return jsi::Function::createFromHostFunction(runtime, property, 3,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isBool()) return false;
            const double deck = args[0].asNumber(), speed = args[1].asNumber();
            if (!std::isfinite(deck) || deck < 0 || deck >= 2 || deck != std::floor(deck) ||
                !std::isfinite(speed) || speed < -4 || speed > 4) return false;
            return engine->deckJog(static_cast<std::uint32_t>(deck), static_cast<float>(speed), args[2].getBool());
          });
    }
    if (name == "crossfadePosition") return engine_->crossfadePosition();
    if (name == "autoMixState") return static_cast<double>(engine_->autoMixState());
    if (name == "startAutoMix") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isNumber()) return false;
            const double bars = args[0].asNumber();
            return std::isfinite(bars) && bars >= 1 && bars <= 16 && bars == std::floor(bars) && engine->startAutoMix(static_cast<std::uint32_t>(bars));
          });
    }
    if (name == "stopAutoMix") {
      return jsi::Function::createFromHostFunction(runtime, property, 0,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value*, std::size_t) -> jsi::Value {
            engine->stopAutoMix(); return true;
          });
    }
    if (name == "setCrossfadeCurve") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isNumber()) return false;
            const double curve = args[0].asNumber();
            if (!std::isfinite(curve) || curve != std::floor(curve) || curve < 0 || curve > 2) return false;
            return engine->setCrossfadeCurve(static_cast<std::uint32_t>(curve));
          });
    }
    if (name == "crossfade") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            return count >= 1 && args[0].isNumber() && engine->crossfade(static_cast<float>(args[0].asNumber()));
          });
    }
    if (name == "setDeckGain" || name == "setDeckEQ") {
      return jsi::Function::createFromHostFunction(runtime, property, name == "setDeckEQ" ? 4 : 2,
          [engine = engine_, name](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            const std::size_t needed = name == "setDeckEQ" ? 4 : 2;
            if (count < needed) return false;
            for (std::size_t i = 0; i < needed; ++i) if (!args[i].isNumber() || !std::isfinite(args[i].asNumber())) return false;
            const double deck = args[0].asNumber();
            if (deck < 0 || deck >= 2 || deck != std::floor(deck)) return false;
            if (name == "setDeckGain") return engine->setDeckGain(static_cast<std::uint32_t>(deck), static_cast<float>(args[1].asNumber()));
            return engine->setDeckEQ(static_cast<std::uint32_t>(deck), static_cast<float>(args[1].asNumber()),
                                    static_cast<float>(args[2].asNumber()), static_cast<float>(args[3].asNumber()));
          });
    }
    if (name == "setEQ") {
      return jsi::Function::createFromHostFunction(runtime, property, 3,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isNumber()) return false;
            const double low = args[0].asNumber(), mid = args[1].asNumber(), high = args[2].asNumber();
            if (!std::isfinite(low) || !std::isfinite(mid) || !std::isfinite(high)) return false;
            return engine->setEQ(static_cast<float>(low), static_cast<float>(mid), static_cast<float>(high));
          });
    }
    if (name == "setKit" || name == "setTempo" || name == "setSequencer") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_, name](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 1) return false;
            if (name == "setSequencer") {
              if (!args[0].isBool()) return false;
              engine->setSequencer(args[0].getBool());
              return true;
            }
            if (!args[0].isNumber()) return false;
            const double value = args[0].asNumber();
            if (!std::isfinite(value)) return false;
            if (name == "setTempo") return engine->setTempo(static_cast<float>(value));
            return value == std::floor(value) && value >= 1 && value <= 3 &&
                   engine->setKit(static_cast<std::uint32_t>(value));
          });
    }
    if (name == "setStep") {
      return jsi::Function::createFromHostFunction(runtime, property, 3,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isNumber()) return false;
            const double pad = args[0].asNumber(), step = args[1].asNumber(), velocity = args[2].asNumber();
            if (!std::isfinite(pad) || pad != std::floor(pad) || pad < 0 || pad >= artss::audio::kPadCount ||
                !std::isfinite(step) || step != std::floor(step) || step < 0 || step >= artss::audio::kSteps) return false;
            return engine->setStep(static_cast<std::uint32_t>(pad), static_cast<std::uint32_t>(step), static_cast<float>(velocity));
          });
    }
    if (name.size() == 9 && name.compare(0, 8, "position") == 0 && name[8] >= '0' && name[8] <= '7') {
      return engine_->progress(static_cast<std::uint32_t>(name[8] - '0'));
    }
    if (name == "padWaveform") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (!count || !args[0].isNumber()) return jsi::Value::undefined();
            const double pad = args[0].asNumber();
            if (!std::isfinite(pad) || pad < 0 || pad >= artss::audio::kPadCount || pad != std::floor(pad)) return jsi::Value::undefined();
            const auto& peaks = engine->waveforms()[static_cast<std::size_t>(pad)];
            jsi::Array values(rt, peaks.size());
            for (std::size_t i = 0; i < peaks.size(); ++i) values.setValueAtIndex(rt, i, peaks[i]);
            return values;
          });
    }
    if (name == "trigger") {
      return jsi::Function::createFromHostFunction(runtime, property, 2,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 2 || !args[0].isNumber() || !args[1].isNumber()) return false;
            const double pad = args[0].asNumber(), velocity = args[1].asNumber();
            if (!std::isfinite(pad) || pad < 0 || pad >= artss::audio::kPadCount || pad != std::floor(pad) ||
                !std::isfinite(velocity) || velocity <= 0 || velocity > 1) return false;
            return engine->trigger(static_cast<std::uint32_t>(pad), static_cast<float>(velocity));
          });
    }
    if (name == "setMaster") {
      return jsi::Function::createFromHostFunction(runtime, property, 1,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value* args, std::size_t count) -> jsi::Value {
            if (count < 1 || !args[0].isNumber()) return false;
            const auto gain = args[0].asNumber();
            if (!std::isfinite(gain) || gain < 0 || gain > 1) return false;
            return engine->setMaster(static_cast<float>(gain));
          });
    }
    if (name == "allNotesOff") {
      return jsi::Function::createFromHostFunction(runtime, property, 0,
          [engine = engine_](jsi::Runtime&, const jsi::Value&, const jsi::Value*, std::size_t) -> jsi::Value {
            return engine->allNotesOff();
          });
    }
    return jsi::Value::undefined();
  }

 private:
  std::shared_ptr<artss::audio::IOSAudioBackend> backend_;
  std::shared_ptr<artss::audio::AudioEngine> engine_;
};
}

NativeArtssAudio::NativeArtssAudio(std::shared_ptr<CallInvoker> jsInvoker)
    : NativeArtssAudioCxxSpec(jsInvoker), invoker_(std::move(jsInvoker)),
      backend_(std::make_shared<artss::audio::IOSAudioBackend>()) {}

NativeArtssAudio::~NativeArtssAudio() {
  // Stop on React instance teardown even if an old worklet still retains controls.
  backend_->stop([](std::string, std::string) {});
}

jsi::Object NativeArtssAudio::getControls(jsi::Runtime& runtime) {
  // Worklets shares this HostObject as native state, across both JS runtimes.
  return jsi::Object::createFromHostObject(runtime, std::make_shared<RealtimeControls>(backend_));
}

AsyncPromise<std::string> NativeArtssAudio::start(jsi::Runtime& runtime) {
  AsyncPromise<std::string> promise(runtime, invoker_);
  backend_->start([promise](std::string result, std::string error) mutable {
    if (error.empty()) promise.resolve(std::move(result));
    else promise.reject(Error{std::move(error)});
  });
  return promise;
}

AsyncPromise<> NativeArtssAudio::stop(jsi::Runtime& runtime) {
  AsyncPromise<> promise(runtime, invoker_);
  backend_->stop([promise](std::string, std::string error) mutable {
    if (error.empty()) promise.resolve();
    else promise.reject(Error{std::move(error)});
  });
  return promise;
}

AsyncPromise<std::string> NativeArtssAudio::pickTrack(jsi::Runtime& runtime, double deck) {
  AsyncPromise<std::string> promise(runtime, invoker_);
  if (!std::isfinite(deck) || deck < 0 || deck >= 2 || deck != std::floor(deck)) {
    promise.reject(Error{"Invalid deck"});
    return promise;
  }
  backend_->pickTrack(static_cast<std::uint32_t>(deck), [promise](std::string result, std::string error) mutable {
    if (error.empty()) promise.resolve(std::move(result));
    else promise.reject(Error{std::move(error)});
  });
  return promise;
}

AsyncPromise<std::string> NativeArtssAudio::loadPreset(jsi::Runtime& runtime, double deck, double preset) {
  AsyncPromise<std::string> promise(runtime, invoker_);
  if (!std::isfinite(deck) || deck < 0 || deck >= 2 || deck != std::floor(deck) ||
      !std::isfinite(preset) || preset < 0 || preset >= 18 || preset != std::floor(preset)) {
    promise.reject(Error{"Invalid preset or deck"});
    return promise;
  }
  backend_->loadPreset(static_cast<std::uint32_t>(deck), static_cast<std::uint32_t>(preset),
      [promise](std::string result, std::string error) mutable {
        if (error.empty()) promise.resolve(std::move(result));
        else promise.reject(Error{std::move(error)});
      });
  return promise;
}

}  // namespace facebook::react
