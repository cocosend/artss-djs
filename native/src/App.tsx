import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View,
  requireNativeComponent, type StyleProp, type ViewStyle} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Canvas, Circle, LinearGradient, Path, Rect, Skia, vec} from '@shopify/react-native-skia';
import Animated, {useAnimatedProps, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, type SharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import {generateTrack, loadPreset, pickTrack, type PadIndex, type RealtimeControls, type TrackInfo} from 'react-native-artss-audio';
import {useAudioSession} from './audio/useAudioSession';
import {PerformancePad} from './components/PerformancePad';
import {MasterFader} from './components/MasterFader';
import {WOLF_GROOVES, buildWolfPattern} from './audio/stripewolfGrooves';

type Deck = 0 | 1;
const ACCENT = ['#39D9EE', '#FF8655'] as const;
const TABS = ['ПЭДЫ', 'МИКС', 'ТРЕКИ'] as const;
const LABELS = [[], ['KICK','SUB','CLAP','HAT','OPEN','PERC','ACID','CRASH'],
  ['KICK','SNARE','CLAP','HAT','OPEN','RIM','BELL','PERC'], ['KICK','SNARE','CLAP','HAT','OPEN','TOM','RIDE','ACID']];
const EMPTY = Object.freeze(new Array<number>(96).fill(0));
const LANES = [0, 2, 3, 6] as const;
const initialBank = () => buildWolfPattern(0);

function Button({text, onPress, onLongPress, active = false, disabled = false, color = ACCENT[0]}: {
  text: string; onPress: () => void; onLongPress?: () => void; active?: boolean; disabled?: boolean; color?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled, selected: active}}
    disabled={disabled} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
    accessibilityHint={onLongPress ? "Удерживайте, чтобы установить точку CUE" : undefined}
    style={[s.button, active && {borderColor: color, backgroundColor: '#183137'}, disabled && s.disabled]}>
    <Text style={[s.buttonText, active && {color}]}>{text}</Text></Pressable>;
}

type MetalWaveformProps = {
  cache: string; zoom: number; duration: number;
  position?: number; visibleStart?: number; bpm?: number; firstBeat?: number;
  style?: StyleProp<ViewStyle>;
};
const MetalWaveform = Platform.OS === 'ios'
  ? Animated.createAnimatedComponent(requireNativeComponent<MetalWaveformProps>('ARTSSWaveformMetal'))
  : null;

// Native Metal texture is uploaded only when the PCM track changes. The display
// link renders the three precomputed RGBA8 rows, grid and moving playhead.
const Stripe = memo(function StripeView({controls, deck, track, samples, pad, enabled}: {
  controls: RealtimeControls; deck: Deck; track: TrackInfo | null; samples: readonly number[];
  pad: PadIndex; enabled: boolean;
}) {
  const [width, setWidth] = useState(1);
  const [zoom, setZoom] = useState<0 | 1 | 2>(0);
  const progress = useSharedValue(0);
  const dragging = useSharedValue(false);
  const gestureStart = useSharedValue(0);
  const visibleSpan = zoom === 0 ? 1 : zoom === 1 ? 0.25 : 0.0625;
  const metalProps = useAnimatedProps(() => ({
    position: progress.value,
    visibleStart: dragging.value ? gestureStart.value
      : Math.max(0, Math.min(1 - visibleSpan, progress.value - visibleSpan / 2)),
    bpm: deck === 0 ? controls.deckBpm0 : controls.deckBpm1,
    firstBeat: deck === 0 ? controls.deckFirstBeat0 : controls.deckFirstBeat1,
  }));
  useFrameCallback(() => {
    if (dragging.value) return;
    progress.value = track ? (deck === 0 ? controls.deckPosition0 : controls.deckPosition1)
      : Math.max(0, controls[`position${pad}`]);
  });
  const x = useDerivedValue(() => Math.max(0, Math.min(width - 2, progress.value * width)));
  const path = useMemo(() => {
    const result = Skia.Path.Make();
    const peaks = track?.waveform ?? samples;
    peaks.forEach((peak, i) => {
      const at = (i + 0.5) * width / Math.max(1, peaks.length);
      const height = Math.max(0.6, Math.min(1, peak) * 30);
      result.moveTo(at, 35 - height); result.lineTo(at, 35 + height);
    });
    return result;
  }, [samples, track, width]);
  const seek = Gesture.Pan().enabled(enabled && !!track).minDistance(0)
    .onBegin(event => {
      dragging.value = true;
      gestureStart.value = Math.max(0, Math.min(1 - visibleSpan, progress.value - visibleSpan / 2));
      progress.value = Math.max(0, Math.min(0.9999,
        gestureStart.value + (event.x / width) * visibleSpan));
      controls.deckSeek(deck, progress.value);
    })
    .onUpdate(event => {
      progress.value = Math.max(0, Math.min(0.9999,
        gestureStart.value + (event.x / width) * visibleSpan));
      controls.deckSeek(deck, progress.value);
    })
    .onFinalize(() => { dragging.value = false; });
  return <View>
    <GestureDetector gesture={seek}>
      <View style={s.stripe} onLayout={e => setWidth(Math.max(1, e.nativeEvent.layout.width))}>
        {track?.waveformCache && MetalWaveform
          ? <MetalWaveform cache={track.waveformCache} zoom={zoom} duration={track.duration}
              animatedProps={metalProps} style={s.fill} />
          : <Canvas style={s.fill} accessible={false}>
              <Path path={path} style="stroke" strokeWidth={Math.max(1, width / 180)}>
                <LinearGradient start={vec(0, 0)} end={vec(width, 0)}
                  colors={['#32D9EF','#677EFF','#BB74F2','#F9CD56','#FF8655']} />
              </Path>
              <Rect x={x} y={3} width={2} height={64} color="#FFFFFF" />
            </Canvas>}
      </View>
    </GestureDetector>
    {track && <View style={s.waveZoomControls}>
      <Pressable accessibilityRole="button" disabled={zoom === 0}
        onPress={() => setZoom(z => (z - 1) as 0 | 1 | 2)}>
        <Text style={s.waveZoomText}>− ZOOM</Text>
      </Pressable>
      <Text style={s.waveZoomText}>{zoom === 0 ? 'OVERVIEW' : zoom === 1 ? 'MID 4×' : 'DETAIL 16×'}</Text>
      <Pressable accessibilityRole="button" disabled={zoom === 2}
        onPress={() => setZoom(z => (z + 1) as 0 | 1 | 2)}>
        <Text style={s.waveZoomText}>+ ZOOM</Text>
      </Pressable>
    </View>}
  </View>;
});


function StereoMeter({controls}: {controls: RealtimeControls}) {
  const [width, setWidth] = useState(1);
  const levelL = useSharedValue(0);
  const levelR = useSharedValue(0);
  useFrameCallback(() => {
    // -54 dBFS through 0 dBFS, log-domain display; render publishes RMS once per audio block.
    const dbL = 20 * Math.log10(Math.max(0.00001, controls.meterRmsL));
    const dbR = 20 * Math.log10(Math.max(0.00001, controls.meterRmsR));
    levelL.value = Math.max(0, Math.min(1, (dbL + 54) / 54));
    levelR.value = Math.max(0, Math.min(1, (dbR + 54) / 54));
  });
  const barL = useDerivedValue(() => levelL.value * width);
  const barR = useDerivedValue(() => levelR.value * width);
  return <View style={s.vuRow}>
    <Text style={s.vuCaption}>L / R</Text>
    <View style={s.vuCanvas} onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))}>
      <Canvas style={s.fill}>
        <Rect x={0} y={1} width={barL} height={5} color="#39D9EE" />
        <Rect x={0} y={10} width={barR} height={5} color="#FF8655" />
      </Canvas>
    </View>
  </View>;
}


const JOG_TICKS = Array.from({length: 64}, (_, index) => {
  const angle = 2 * Math.PI * index / 64;
  return {x: 67 + 59 * Math.cos(angle), y: 67 + 59 * Math.sin(angle)};
});

const Jog = memo(function JogWheel({deck, controls, enabled, track}: {
  deck: Deck; controls: RealtimeControls; enabled: boolean; track: TrackInfo | null;
}) {
  const angle = useSharedValue(0);
  const previous = useSharedValue(0);
  const touching = useSharedValue(false);
  const inertia = useSharedValue(0);
  const canScratch = enabled && !!track;

  useFrameCallback(frame => {
    if (!canScratch || touching.value) return;
    const dt = Math.min(0.05, Math.max(0, (frame.timeSincePreviousFrame ?? 16.67) / 1000));
    const playing = deck === 0 ? controls.deckPlaying0 : controls.deckPlaying1;
    const rate = deck === 0 ? controls.deckRate0 : controls.deckRate1;
    angle.value += (playing ? rate * 3.49 : 0) * dt + inertia.value * dt;
    inertia.value *= Math.exp(-dt * 9);
    if (Math.abs(inertia.value) < 0.002) inertia.value = 0;
  });

  const gesture = Gesture.Pan().enabled(canScratch).minDistance(0)
    .onBegin(event => {
      touching.value = true;
      inertia.value = 0;
      previous.value = Math.atan2(event.y - 67, event.x - 67);
      controls.deckJog(deck, 0, true);
    })
    .onUpdate(event => {
      const next = Math.atan2(event.y - 67, event.x - 67);
      const delta = Math.atan2(Math.sin(next - previous.value), Math.cos(next - previous.value));
      previous.value = next;
      angle.value += delta;
      controls.deckJog(deck, Math.max(-4, Math.min(4, delta * 32)), true);
    })
    .onFinalize(event => {
      touching.value = false;
      controls.deckJog(deck, 0, false);
      // Inertial disc animation is UI-only; native DSP returns to regular playback.
      inertia.value = Math.max(-9, Math.min(9, event.velocityX / 190));
    });

  const markerX = useDerivedValue(() => 67 + 41 * Math.sin(angle.value));
  const markerY = useDerivedValue(() => 67 - 41 * Math.cos(angle.value));
  return <View style={s.jogColumn}>
    <GestureDetector gesture={gesture}>
      <View style={s.jogHousing} accessibilityLabel={`Джог деки ${deck === 0 ? 'A' : 'B'}`}>
        <Canvas style={s.fill}>
          <Circle cx={67} cy={67} r={62}>
            <LinearGradient start={vec(0,0)} end={vec(134,134)}
              colors={['#C5D0DD','#4B6174','#D0D8E0','#202E3E','#8899AA']} />
          </Circle>
          <Circle cx={67} cy={67} r={55} color="#0C121B" />
          {JOG_TICKS.map((point, index) =>
            <Circle key={index} cx={point.x} cy={point.y} r={1.1} color="#111C26" />)}
          <Circle cx={67} cy={67} r={49} color="#222E3D" />
          <Circle cx={67} cy={67} r={46}>
            <LinearGradient start={vec(0,8)} end={vec(127,129)}
              colors={['#263B4A','#101926','#0B0E17','#324455']} />
          </Circle>
          <Circle cx={markerX} cy={markerY} r={5} color={ACCENT[deck]} />
          <Circle cx={67} cy={67} r={10} color="#172536" />
          <Circle cx={67} cy={67} r={5} color="#C2D3DF" />
        </Canvas>
      </View>
    </GestureDetector>
    <Text style={[s.jogCaption, {color: ACCENT[deck]}]}>DECK {deck === 0 ? 'A' : 'B'} · JOG</Text>
  </View>;
});

function Pads({controls, enabled, onSelect}: {controls: RealtimeControls; enabled: boolean; onSelect: (pad: PadIndex) => void}) {
  const [kit, setKit] = useState<1 | 2 | 3>(1);
  const [bpm, setBpm] = useState(132);
  const [bank, setBank] = useState(0);
  const [banks, setBanks] = useState(() => Array.from({length: 4}, initialBank));
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const pattern = banks[bank]!;
  useEffect(() => {
    controls.setKit(kit); controls.setTempo(bpm);
    for (let p = 0; p < 8; p++) for (let at = 0; at < 16; at++) controls.setStep(p as PadIndex, at, pattern[p]?.[at] ?? 0);
  }, [controls, enabled, pattern, kit, bpm]);
  useEffect(() => {
    if (!enabled) { setRunning(false); controls.setSequencer(false); return; }
    if (!running) return;
    const id = setInterval(() => setStep(controls.currentStep), 80);
    return () => clearInterval(id);
  }, [controls, enabled, running]);
  const record = useCallback((pad: PadIndex, at: number) => {
    onSelect(pad);
    if (!recording || !running || !controls.setStep(pad, at, 1)) return;
    setBanks(old => old.map((rows, b) => b === bank ? rows.map((row, p) => p === pad ? row.map((v, i) => i === at ? 1 : v) : row) : rows));
  }, [bank, controls, onSelect, recording, running]);
  function groove(index: number) {
    const preset = WOLF_GROOVES[index]; if (!preset) return;
    setBanks(old => old.map((rows, at) => at === bank ? buildWolfPattern(index) : rows));
    setKit(preset.kit); setBpm(preset.bpm);
  }
  function createRhythm() {
    if (!enabled) return;
    const index = Math.floor(Math.random() * WOLF_GROOVES.length);
    const preset = WOLF_GROOVES[index]!;
    const next = buildWolfPattern(index).map(row => [...row]);
    // Keep the kick and backbeat anchored; vary hats and short fills.
    for (const at of [1,5,9,13]) if (Math.random() < 0.45) next[3]![at] = 0.18 + Math.random() * 0.17;
    if (Math.random() < 0.6) next[5]![15] = 0.24 + Math.random() * 0.26;
    if (Math.random() < 0.4) next[6]![14] = 0.3;
    setBanks(old => old.map((rows, i) => i === bank ? next : rows));
    setKit(preset.kit); setBpm(preset.bpm);
    controls.setKit(preset.kit); controls.setTempo(preset.bpm);
    for (let p=0; p<8; p++) for (let at=0; at<16; at++) controls.setStep(p as PadIndex,at,next[p]?.[at] ?? 0);
    controls.setSequencer(true); setRunning(true);
  }
  return <ScrollView contentContainerStyle={s.page} nestedScrollEnabled showsVerticalScrollIndicator={false}>
    <View style={s.rowBetween}><Text style={s.section}>PERFORMANCE</Text><View style={s.row}>
      {['A','B','C','D'].map((name, i) => <Button key={name} text={name} active={bank === i} onPress={() => setBank(i)} />)}</View></View>
    <View style={s.pads}>{LABELS[kit]!.map((label, p) => <PerformancePad key={p} index={p as PadIndex}
      label={label} controls={controls} enabled={enabled} onSelect={record} />)}</View>
    <View style={s.row}>
      <Button text={running ? 'СТОП' : 'РИТМ'} active={running} disabled={!enabled} onPress={() => { if (controls.setSequencer(!running)) setRunning(!running); }} />
      <Button text={recording ? 'REC ●' : 'REC'} color="#FF536B" active={recording} disabled={!enabled} onPress={() => setRecording(v => !v)} />
      <Button text="−" disabled={!enabled} onPress={() => setBpm(v => Math.max(60, v - 1))} />
      <Text style={s.bpm}>{bpm}</Text>
      <Button text="+" disabled={!enabled} onPress={() => setBpm(v => Math.min(200, v + 1))} />
    </View>
    <Button text="СОЗДАТЬ РИТМ" disabled={!enabled} onPress={createRhythm} />
    <View style={s.row}>{([1,2,3] as const).map(k => <Button key={k} text={k === 1 ? '303' : k === 2 ? '606' : '909'} active={kit === k} onPress={() => setKit(k)} />)}
      <Button text={expanded ? 'СВЕРНУТЬ' : 'ШАГИ'} onPress={() => setExpanded(v => !v)} /></View>
    {expanded && <ScrollView horizontal nestedScrollEnabled><View>{LANES.map(p => <View key={p} style={s.steps}>
      <Text style={s.lane}>{LABELS[kit]![p]}</Text>{pattern[p]!.map((v, i) => <Pressable key={i} accessibilityRole="button"
        accessibilityLabel={`${LABELS[kit]![p]} шаг ${i + 1}`} accessibilityState={{selected: v > 0}}
        onPress={() => setBanks(old => old.map((rows, b) => b === bank ? rows.map((row, at) => at === p ? row.map((value, x) => x === i ? (value ? 0 : 0.7) : value) : row) : rows))}
        style={[s.step, v > 0 && s.stepOn, running && i === step && s.stepCurrent]} />)}</View>)}</View></ScrollView>}
    <Text style={s.section}>GROOVES</Text>
    <View style={s.grooves}>{WOLF_GROOVES.map((preset, i) => <Pressable key={preset.id} onPress={() => groove(i)} style={s.groove}>
      <Text style={s.grooveName}>{preset.title}</Text><Text style={s.hint}>{preset.bpm} BPM · {preset.style.toUpperCase()}</Text></Pressable>)}</View>
  </ScrollView>;
}

type Channel = {LOW: number; MID: number; HIGH: number; FILTER: number; GAIN: number};
function Dial({name, deck, state, controls, enabled}: {name: keyof Channel; deck: Deck; state: SharedValue<Channel>; controls: RealtimeControls; enabled: boolean}) {
  const min = name === 'GAIN' ? 0 : name === 'FILTER' ? -1 : -24;
  const max = name === 'GAIN' ? 1.5 : name === 'FILTER' ? 1 : 6;
  const origin = useSharedValue(0);
  const [display, setDisplay] = useState(name === 'GAIN' ? '100%' : name === 'FILTER' ? 'OFF' : '0 dB');
  function show(value: number) { setDisplay(name === 'GAIN' ? `${Math.round(value * 100)}%` : name === 'FILTER' ? Math.abs(value) < 0.02 ? 'OFF' : `${value < 0 ? 'LP' : 'HP'} ${Math.round(Math.abs(value) * 100)}` : `${value > 0 ? '+' : ''}${value.toFixed(0)} dB`); }
  const gesture = Gesture.Pan().enabled(enabled).minDistance(0)
    .onBegin(() => { origin.value = state.value[name]; })
    .onUpdate(event => {
      const value = Math.max(min, Math.min(max, origin.value - event.translationY * (max - min) / 180));
      const next = {...state.value, [name]: value}; state.value = next;
      if (name === 'GAIN') controls.setDeckGain(deck, value);
      else if (name === 'FILTER') controls.deckFilter(deck, value);
      else controls.setDeckEQ(deck, next.LOW, next.MID, next.HIGH);
    }).onFinalize(() => { scheduleOnRN(show, state.value[name]); });
  const rotation = useAnimatedStyle(() => ({transform: [{rotate: `${-135 + (state.value[name] - min) / (max - min) * 270}deg`}]}));
  function reset() {
    const value = name === 'GAIN' ? 1 : 0; const next = {...state.value, [name]: value}; state.value = next;
    if (name === 'GAIN') controls.setDeckGain(deck, value); else if (name === 'FILTER') controls.deckFilter(deck, value); else controls.setDeckEQ(deck, next.LOW, next.MID, next.HIGH);
    show(value);
  }
  return <View style={s.dialCell}><Text style={s.dialName}>{name}</Text><GestureDetector gesture={gesture}>
    <View style={[s.dial, {borderColor: ACCENT[deck]}]} accessibilityLabel={`${name}, дека ${deck === 0 ? 'A' : 'B'}`}>
      <Animated.View style={[s.dialRotor, rotation]}><View style={[s.dialTick, {backgroundColor: ACCENT[deck]}]} /></Animated.View>
    </View></GestureDetector><Pressable disabled={!enabled} onPress={reset} accessibilityRole="button" accessibilityLabel={`Сброс ${name}`}><Text style={s.dialValue}>{display}</Text></Pressable></View>;
}

function ChannelFader({deck, controls, enabled, state}: {
  deck: Deck; controls: RealtimeControls; enabled: boolean; state: SharedValue<Channel>;
}) {
  const origin = useSharedValue(1);
  const gesture = Gesture.Pan().enabled(enabled).minDistance(0)
    .onBegin(() => { origin.value = state.value.GAIN; })
    .onUpdate(event => {
      const gain = Math.max(0, Math.min(1.5, origin.value - event.translationY * 1.5 / 130));
      state.value = {...state.value, GAIN: gain};
      controls.setDeckGain(deck, gain);
    });
  const thumb = useAnimatedStyle(() => ({
    transform: [{translateY: (1 - state.value.GAIN / 1.5) * 130}],
  }));
  function reset() {
    state.value = {...state.value, GAIN: 1};
    controls.setDeckGain(deck, 1);
  }
  return <View style={s.channelFader}>
    <Text style={s.dialName}>LEVEL</Text>
    <GestureDetector gesture={gesture}>
      <View style={s.channelFaderTouch} accessibilityLabel={`Громкость деки ${deck === 0 ? 'A' : 'B'}`}>
        <View style={s.channelFaderRail}/>
        <Animated.View style={[s.channelFaderThumb, {borderColor: ACCENT[deck]}, thumb]}/>
      </View>
    </GestureDetector>
    <Pressable accessibilityRole="button" accessibilityLabel="Сброс уровня" disabled={!enabled}
      onPress={reset}><Text style={s.dialValue}>0 dB</Text></Pressable>
  </View>;
}

function ChannelStrip({deck, controls, enabled}: {deck: Deck; controls: RealtimeControls; enabled: boolean}) {
  const state = useSharedValue<Channel>({LOW:0, MID:0, HIGH:0, FILTER:0, GAIN:1});
  useEffect(() => { if (enabled) { const v = state.value; controls.setDeckEQ(deck,v.LOW,v.MID,v.HIGH); controls.setDeckGain(deck,v.GAIN); controls.deckFilter(deck,v.FILTER); } }, [controls, deck, enabled, state]);
  return <View style={s.channel}><Text style={[s.channelName, {color: ACCENT[deck]}]}>DECK {deck === 0 ? 'A' : 'B'}</Text>
    {(['FILTER','HIGH','MID','LOW'] as const).map(name => <Dial key={name} name={name} deck={deck} controls={controls} state={state} enabled={enabled} />)}
    <ChannelFader deck={deck} controls={controls} enabled={enabled} state={state} /></View>;
}

type FxBus = 0 | 1 | 2;
type FxId = 0 | 1 | 2 | 3 | 4 | 5;
type FxTriple = [number, number, number];
const FX_NAMES = ['SVF FILTER','PING-PONG','REVERB','FLANGER','BITCRUSH','ROLL'] as const;
const FX_LABELS = [
  ['MODE','CUTOFF Hz','RESONANCE'],
  ['MIX','TIME ms','FEEDBACK'],
  ['MIX','ROOM','DAMPING'],
  ['MIX','SPEED Hz','DEPTH'],
  ['MIX','BITS','HOLD'],
  ['BEATS','—','—'],
] as const;
const FX_MIN = [
  [0,20,0],[0,50,0],[0,0,0],[0,0.05,0],[0,4,1],[0,0,0],
] as const;
const FX_MAX = [
  [2,18000,1],[1,1500,0.85],[1,1,1],[1,5,1],[1,16,32],[5,0,0],
] as const;
const FX_STEP = [
  [1,200,0.05],[0.1,25,0.05],[0.1,0.05,0.05],
  [0.1,0.1,0.1],[0.1,1,1],[1,0,0],
] as const;
const FX_START = (): FxTriple[][] => Array.from({length:3}, () => [
  [0,1200,0.35],[0,375,0.45],[0,0.65,0.4],
  [0,0.5,0.5],[0,10,3],[0,0,0],
]);

function FxPanel({controls, enabled}: {controls: RealtimeControls; enabled: boolean}) {
  const [open, setOpen] = useState(false);
  const [bus, setBus] = useState<FxBus>(0);
  const [fx, setFx] = useState<FxId>(0);
  const [values, setValues] = useState(FX_START);
  const current = values[bus][fx];
  function write(index: 0 | 1 | 2, next: number) {
    if (!enabled) return;
    const fixed = [...current] as FxTriple;
    const min = FX_MIN[fx][index], max = FX_MAX[fx][index];
    fixed[index] = Math.min(max, Math.max(min, Math.round(next * 1000) / 1000));
    if (!controls.setFx(bus, fx, fixed[0], fixed[1], fixed[2])) return;
    setValues(old => old.map((groups, b) => b === bus
      ? groups.map((triple, e) => e === fx ? fixed : triple)
      : groups));
  }
  const enabledFlag = current[0] > 0;
  const parameter = (index: 0 | 1 | 2) => {
    const step = FX_STEP[fx][index];
    if (step === 0) return null;
    const value = current[index];
    const name = FX_LABELS[fx][index];
    const display = fx === 5 && index === 0
      ? ['OFF','1/4','1/2','1','2','4'][Math.round(value)]
      : fx === 0 && index === 0
        ? ['OFF','LPF','HPF'][Math.round(value)]
        : value.toFixed(step < 1 ? 2 : 0);
    return <View key={name} style={s.fxParameter}>
      <Text style={s.fxParamTitle}>{name}</Text>
      <View style={s.fxParamButtons}>
        <Pressable accessibilityRole="button" disabled={!enabled || value <= FX_MIN[fx][index]}
          onPress={() => write(index, value - step)}>
          <Text style={s.fxStep}>−</Text>
        </Pressable>
        <Text style={s.fxParamValue}>{display}</Text>
        <Pressable accessibilityRole="button" disabled={!enabled || value >= FX_MAX[fx][index]}
          onPress={() => write(index, value + step)}>
          <Text style={s.fxStep}>+</Text>
        </Pressable>
      </View>
    </View>;
  };
  return <View style={s.fxContainer}>
    <Pressable accessibilityRole="button" onPress={() => setOpen(v => !v)} style={s.fxHeader}>
      <Text style={s.fxTitle}>ARTSS FX · A / B / MASTER</Text>
      <Text style={s.fxTitle}>{open ? '−' : '+'}</Text>
    </Pressable>
    {open && <>
      <View style={s.row}>{(['DECK A','DECK B','MASTER'] as const).map((label,index) =>
        <Button key={label} text={label} active={bus === index}
          color={ACCENT[index === 2 ? 0 : index]}
          disabled={!enabled}
          onPress={() => setBus(index as FxBus)} />)}</View>
      <View style={s.fxChoices}>{FX_NAMES.map((label,index) =>
        <Pressable key={label} accessibilityRole="button" disabled={!enabled}
          onPress={() => setFx(index as FxId)}
          style={[s.fxChoice,fx === index && s.fxChoiceActive]}>
          <Text style={[s.fxChoiceText,fx === index && s.fxChoiceTextActive]}>
            {label}
          </Text>
        </Pressable>)}</View>
      <View style={s.fxParameters}>
        {parameter(0)}{parameter(1)}{parameter(2)}
      </View>
      {fx !== 0 && fx !== 5
        ? <Button text={enabledFlag ? 'BYPASS FX' : 'ENABLE FX'}
            active={enabledFlag} disabled={!enabled}
            onPress={() => write(0, enabledFlag ? 0 : 0.5)} />
        : null}
    </>}
  </View>;
}

function Mixer({controls, enabled, track, deck}: {controls: RealtimeControls; enabled: boolean; track: TrackInfo | null; deck: Deck}) {
  const [rate, setRate] = useState<[number, number]>([1,1]);
  const [loop, setLoop] = useState<[number, number]>([0,0]);
  const [loopIn, setLoopIn] = useState<[number | null, number | null]>([null, null]);
  const [manualLoop, setManualLoop] = useState<[boolean, boolean]>([false, false]);
  const [grid, setGrid] = useState({bpm: 0, firstBeat: 0});
  const [hotCues, setHotCues] = useState<[boolean[], boolean[]]>([
    Array.from({length: 8}, () => false), Array.from({length: 8}, () => false),
  ]);
  const sources = useRef<[TrackInfo | null, TrackInfo | null]>([null, null]);
  useEffect(() => {
    if (sources.current[deck] === track) return;
    sources.current[deck] = track;
    setRate([controls.deckRate0, controls.deckRate1]);
    setGrid({bpm: deck === 0 ? controls.deckBpm0 : controls.deckBpm1,
      firstBeat: deck === 0 ? controls.deckFirstBeat0 : controls.deckFirstBeat1});
    setLoop(old => old.map((v,i) => i === deck ? 0 : v) as [number,number]);
    setLoopIn(old => old.map((v,i) => i === deck ? null : v) as [number | null, number | null]);
    setManualLoop(old => old.map((v,i) => i === deck ? false : v) as [boolean, boolean]);
    setHotCues(old => old.map((row, i) =>
      i === deck ? Array.from({length: 8}, () => false) : row) as [boolean[], boolean[]]);
  }, [controls, deck, track]);
  function tempo(delta: number) { const next = Math.max(0.5, Math.min(1.5, rate[deck] + delta)); if (controls.deckRate(deck, next)) setRate(old => old.map((v,i) => i === deck ? next : v) as [number,number]); }
  function loopBeats(beats: number) {
    if (!track) return;
    const bpm = deck === 0 ? controls.deckBpm0 : controls.deckBpm1; if (!bpm) return;
    const at = deck === 0 ? controls.deckPosition0 : controls.deckPosition1;
    const first = deck === 0 ? controls.deckFirstBeat0 : controls.deckFirstBeat1;
    const span = Math.min(1, beats * 60 / bpm / track.duration);
    const start = Math.max(0, Math.min(1 - span, (first + Math.floor((at * track.duration - first) * bpm / 60) * 60 / bpm) / track.duration));
    const next = loop[deck] === beats ? 0 : beats;
    if (controls.deckLoop(deck, next ? start : 0, next ? start + span : 1)) {
      setLoop(old => old.map((v,i) => i === deck ? next : v) as [number,number]);
      setManualLoop(old => old.map((v,i) => i === deck ? false : v) as [boolean,boolean]);
    }
  }
  function manualLoopIn() {
    if (!enabled || !track) return;
    const pos = Math.max(0, Math.min(0.99999,
      deck === 0 ? controls.deckPosition0 : controls.deckPosition1));
    setLoopIn(old => old.map((v,i) => i === deck ? pos : v) as [number | null, number | null]);
  }
  function manualLoopOut() {
    if (!enabled || !track) return;
    const start = loopIn[deck];
    if (start === null) return;
    const end = Math.max(0, Math.min(0.99999,
      deck === 0 ? controls.deckPosition0 : controls.deckPosition1));
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    if (high - low < Math.max(0.0001, 0.05 / track.duration)) return;
    if (controls.deckLoop(deck, low, high)) {
      setManualLoop(old => old.map((v,i) => i === deck ? true : v) as [boolean,boolean]);
      setLoop(old => old.map((v,i) => i === deck ? 0 : v) as [number,number]);
    }
  }
  function clearManualLoop() {
    if (!controls.deckLoop(deck, 0, 1)) return;
    setManualLoop(old => old.map((v,i) => i === deck ? false : v) as [boolean,boolean]);
    setLoop(old => old.map((v,i) => i === deck ? 0 : v) as [number,number]);
    setLoopIn(old => old.map((v,i) => i === deck ? null : v) as [number | null, number | null]);
  }
  function shiftGrid(bpmDelta: number, offsetDelta: number) {
    if (!enabled || !track) return;
    const baseBpm = grid.bpm >= 60 ? grid.bpm : 128;
    const nextBpm = Math.max(60, Math.min(200, Math.round((baseBpm + bpmDelta) * 10) / 10));
    const nextFirst = Math.max(0, Math.min(track.duration - 0.001,
      Math.round((grid.firstBeat + offsetDelta) * 1000) / 1000));
    if (controls.deckSetBeatGrid(deck, nextBpm, nextFirst)) {
      setGrid({bpm: nextBpm, firstBeat: nextFirst});
    }
  }
  function activateHotCue(slot: number) {
    if (!enabled || !track) return;
    if (controls.deckHotCuePosition(deck, slot) >= 0) {
      controls.deckHotCue(deck, slot);
    } else if (controls.deckSetHotCue(deck, slot)) {
      setHotCues(old => old.map((row, index) =>
        index === deck ? row.map((value, at) => at === slot ? true : value) : row) as [boolean[], boolean[]]);
    }
  }
  function setHotCue(slot: number) {
    if (!enabled || !track || !controls.deckSetHotCue(deck, slot)) return;
    setHotCues(old => old.map((row, index) =>
      index === deck ? row.map((value, at) => at === slot ? true : value) : row) as [boolean[], boolean[]]);
  }
  return <ScrollView contentContainerStyle={s.page} nestedScrollEnabled showsVerticalScrollIndicator={false}>
    <View style={s.channels}><ChannelStrip deck={0} controls={controls} enabled={enabled} /><View style={s.channelDivider} /><ChannelStrip deck={1} controls={controls} enabled={enabled} /></View>
    <Text style={s.section}>DECK {deck === 0 ? 'A' : 'B'} · TEMPO / LOOP</Text>
    <View style={s.row}><Button text="−" onPress={() => tempo(-0.01)} disabled={!track || !enabled} /><Text style={s.bpm}>{((rate[deck]-1)*100).toFixed(0)}%</Text>
      <Button text="+" onPress={() => tempo(0.01)} disabled={!track || !enabled} /><Button text="SYNC" onPress={() => { if (controls.deckSync(deck)) setRate([controls.deckRate0,controls.deckRate1]); }} disabled={!track || !enabled} /></View>
    <View style={s.row}>{[1,2,4,8].map(beats => <Button key={beats} text={`${beats}`} active={loop[deck] === beats} disabled={!enabled || !track} onPress={() => loopBeats(beats)} />)}</View>
    <Text style={s.section}>MANUAL LOOP · DECK {deck === 0 ? 'A' : 'B'}</Text>
    <View style={s.row}>
      <Button text="IN" active={loopIn[deck] !== null} disabled={!enabled || !track} onPress={manualLoopIn} />
      <Button text="OUT" active={manualLoop[deck]} disabled={!enabled || !track || loopIn[deck] === null} onPress={manualLoopOut} />
      <Button text="EXIT" disabled={!enabled || !track} onPress={clearManualLoop} />
    </View>
    <Text style={s.section}>BEAT GRID · MANUAL CORRECTION</Text>
    <View style={s.row}>
      <Button text="BPM −" disabled={!enabled || !track} onPress={() => shiftGrid(-1, 0)} />
      <Text style={s.gridValue}>{grid.bpm.toFixed(1)}</Text>
      <Button text="BPM +" disabled={!enabled || !track} onPress={() => shiftGrid(1, 0)} />
    </View>
    <View style={s.row}>
      <Button text="GRID −10ms" disabled={!enabled || !track} onPress={() => shiftGrid(0, -0.01)} />
      <Text style={s.gridValue}>{(grid.firstBeat * 1000).toFixed(0)} ms</Text>
      <Button text="GRID +10ms" disabled={!enabled || !track} onPress={() => shiftGrid(0, 0.01)} />
    </View>
    <Text style={s.section}>HOT CUES · DECK {deck === 0 ? 'A' : 'B'}</Text>
    <View style={s.hotCueGrid}>{Array.from({length: 8}, (_, slot) =>
      <Pressable key={slot} accessibilityRole="button"
        accessibilityLabel={`Hot Cue ${slot + 1}, дека ${deck === 0 ? 'A' : 'B'}`}
        accessibilityHint="Нажатие запускает точку; удержание сохраняет текущую позицию"
        disabled={!enabled || !track}
        onPress={() => activateHotCue(slot)}
        onLongPress={() => setHotCue(slot)}
        style={[s.hotCueButton, (hotCues[deck][slot] ?? false) && {borderColor: ACCENT[deck], backgroundColor:'#20313E'}]}>
        <Text style={[s.hotCueLabel, (hotCues[deck][slot] ?? false) && {color: ACCENT[deck]}]}>
          CUE {slot + 1}
        </Text>
      </Pressable>)}</View>
    <Text style={s.section}>BEAT JUMP</Text>
    <View style={s.row}>{([-16,-4,-1,1,4,16] as const).map(beats =>
      <Button key={beats} text={beats > 0 ? `+${beats}` : `${beats}`}
        disabled={!enabled || !track} onPress={() => { controls.deckBeatJump(deck, beats); }} />)}</View>
    <FxPanel controls={controls} enabled={enabled} />
    <MasterFader controls={controls} enabled={enabled} />
  </ScrollView>;
}
function Crossfade({controls, enabled}: {controls: RealtimeControls; enabled: boolean}) {
  const [width,setWidth] = useState(1); const position = useSharedValue(0.5); const dragging = useSharedValue(false);
  const [curve, setCurve] = useState<0 | 1 | 2>(2);
  useFrameCallback(() => { if (!dragging.value) position.value = controls.crossfadePosition; });
  const gesture = Gesture.Pan().enabled(enabled).minDistance(0).onBegin(e => { dragging.value = true; position.value=Math.max(0,Math.min(1,(e.x-14)/Math.max(1,width-28))); controls.crossfade(position.value); })
    .onUpdate(e => { position.value=Math.max(0,Math.min(1,(e.x-14)/Math.max(1,width-28))); controls.crossfade(position.value); }).onFinalize(() => { dragging.value = false; });
  const thumb=useAnimatedStyle(() => ({transform:[{translateX:position.value*Math.max(0,width-28)}]}));
  return <View>
    <View style={s.curveRow}>
      {(['SMOOTH', 'SHARP', 'DIPLESS'] as const).map((label, index) => {
        const mode = index as 0 | 1 | 2;
        return <Pressable key={label} accessibilityRole="button" accessibilityState={{selected: curve === mode}}
          disabled={!enabled} onPress={() => { if (controls.setCrossfadeCurve(mode)) setCurve(mode); }}
          style={[s.curveButton, curve === mode && s.curveSelected]}>
          <Text style={[s.curveLabel, curve === mode && s.curveLabelActive]}>{label}</Text>
        </Pressable>;
      })}
    </View>
    <GestureDetector gesture={gesture}>
      <View style={s.faderTouch} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        <View style={s.faderRail}/><Animated.View style={[s.faderThumb,thumb]}/>
      </View>
    </GestureDetector>
  </View>;
}

function Studio() {
  const {controls,session,busy,error,toggleAudio}=useAudioSession();
  const [waveform,setWaveform]=useState<readonly number[]>(EMPTY);
  const selectPad=useCallback((index:PadIndex) => { setPad(index); setWaveform(controls.padWaveform(index)); },[controls]);
  const [tracks,setTracks]=useState<[TrackInfo|null,TrackInfo|null]>([null,null]);
  const [selected,setSelected]=useState<Deck>(0); const [pad,setPad]=useState<PadIndex>(0);
  const [loading,setLoading]=useState(false); const loadingLock=useRef(false);
  const [importError,setImportError]=useState<string|null>(null);
  const [page,setPage]=useState(0); const [width,setWidth]=useState(1); const pager=useRef<ScrollView>(null); const pageRef=useRef(0); pageRef.current=page;
  const [playing,setPlaying]=useState<[boolean,boolean]>([false,false]);
  const [autoMix,setAutoMix]=useState(false);
  useEffect(() => { const id=setInterval(() => { const a=controls.deckPlaying0,b=controls.deckPlaying1; setPlaying(old => old[0]===a && old[1]===b ? old : [a,b]); setAutoMix(controls.autoMixState !== 0); },150); return () => clearInterval(id); },[controls]);
  useEffect(() => { if (!session) setTracks([null,null]); },[session]);
  useEffect(() => { pager.current?.scrollTo({x:pageRef.current*width,animated:false}); },[width]);
  async function load(preset?:number, generated=false) {
    if (loadingLock.current) return; loadingLock.current=true;setLoading(true);setImportError(null);
    const deck=selected;
    try {
      if (!session && !(await toggleAudio())) return;
      const track=preset===undefined ? await pickTrack(deck) : generated ? await generateTrack(deck,preset) : await loadPreset(deck,preset);
      setTracks(old => old.map((v,i) => i===deck ? track : v) as [TrackInfo|null,TrackInfo|null]);
      if (generated) {
        const otherPlaying = deck === 0 ? controls.deckPlaying1 : controls.deckPlaying0;
        if (!otherPlaying) controls.crossfade(deck === 0 ? 0 : 1);
        controls.deckPlay(deck,true);
      }
    } catch(reason:unknown) { const message=reason instanceof Error ? reason.message : 'Ошибка импорта'; if (!message.includes('отменён')) setImportError(message); }
    finally { loadingLock.current=false;setLoading(false); }
  }
  const enabled=!!session&&!busy;
  return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}>
    <StatusBar barStyle="light-content"/><View style={s.header}><Text style={s.brand}>ARTSS <Text style={s.brandAccent}>DJS</Text></Text>
      <Button text={busy ? '…' : session ? 'AUDIO ON' : 'ВКЛЮЧИТЬ ЗВУК'} active={!!session} disabled={busy||loading} onPress={() => { void toggleAudio(); }}/></View>
    <View style={s.trackRow}>{([0,1] as const).map(deck => <Pressable key={deck} onPress={() => setSelected(deck)} style={[s.trackTitle,selected===deck&&{borderColor:ACCENT[deck]}]}>
      <Text style={[s.deckBadge,{color:ACCENT[deck]}]}>{deck===0?'A':'B'}</Text><Text numberOfLines={1} style={s.trackName}>{tracks[deck]?.title??'Загрузить трек'}</Text></Pressable>)}</View>
    <Stripe controls={controls} deck={selected} track={tracks[selected]} samples={waveform} pad={pad} enabled={enabled}/>
    <StereoMeter controls={controls} />
    <View style={s.jogRow}>
      <Jog deck={0} controls={controls} enabled={enabled} track={tracks[0]} />
      <Jog deck={1} controls={controls} enabled={enabled} track={tracks[1]} />
    </View>
    <View style={s.stripeCaption}><Text style={s.hint}>{tracks[selected] ? `DECK ${selected===0?'A':'B'} · ${(selected===0?controls.deckBpm0:controls.deckBpm1).toFixed(0)} BPM` : 'PAD PCM · Нажми пэд для волны'}</Text>
      <Pressable accessibilityRole="button" disabled={!enabled || !tracks[0] || !tracks[1]} onPress={() => { if (autoMix) controls.stopAutoMix(); else controls.startAutoMix(4); }}>
        <Text style={[s.importLabel, (!enabled || !tracks[0] || !tracks[1]) && s.disabled]}>{autoMix ? 'СТОП МИКС' : 'AUTO MIX'}</Text></Pressable>
      <Pressable disabled={loading||busy} onPress={() => { void load(); }}><Text style={s.importLabel}>{loading?'ЗАГРУЗКА…':'ИМПОРТ'}</Text></Pressable></View>
    {(error||importError) ? <Text accessibilityRole="alert" style={s.error}>{error??importError}</Text>:null}
    <View style={s.pocket} onLayout={e => setWidth(Math.max(1,e.nativeEvent.layout.width))}><ScrollView horizontal pagingEnabled directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false}
      ref={pager} onMomentumScrollEnd={e => setPage(Math.max(0,Math.min(2,Math.round(e.nativeEvent.contentOffset.x/width))))}>
      <View style={{width}}><Pads controls={controls} enabled={enabled} onSelect={selectPad}/></View>
      <View style={{width}}><Mixer controls={controls} enabled={enabled} deck={selected} track={tracks[selected]}/></View>
      <View style={{width}}><ScrollView contentContainerStyle={s.page} nestedScrollEnabled><Text style={s.section}>БИБЛИОТЕКА · DECK {selected===0?'A':'B'}</Text>
        <Button text="ЗАГРУЗИТЬ СВОЙ ТРЕК" disabled={loading||busy} onPress={() => { void load(); }}/>
        <Button text="СОЗДАТЬ ДЕМОТРЕК" disabled={loading||busy} onPress={() => { void load(Math.floor(Math.random()*WOLF_GROOVES.length),true); }}/>
        {loading&&<ActivityIndicator color={ACCENT[selected]}/>}
        {WOLF_GROOVES.map((preset,i)=><Pressable key={preset.id} disabled={loading||busy} onPress={() => { void load(i); }} style={s.libraryCard}>
          <Text style={s.libraryName}>{preset.title}</Text><Text style={s.hint}>{preset.bpm} BPM · {preset.style.toUpperCase()} · ORIGINAL DEMO</Text></Pressable>)}
      </ScrollView></View>
    </ScrollView></View>
    <View style={s.tabRow}>{TABS.map((title,i)=><Pressable key={title} accessibilityRole="tab" accessibilityState={{selected:page===i}} onPress={() => { setPage(i);pager.current?.scrollTo({x:i*width,animated:true}); }} style={[s.tab,page===i&&s.tabActive]}>
      <Text style={[s.tabText,page===i&&s.tabTextActive]}>{title}</Text></Pressable>)}</View>
    <View style={s.bottom}><View style={s.transportRow}>{([0,1] as const).map(deck=><View key={deck} style={s.deckTransport}>
      <Button text={`${deck===0?'A':'B'} CUE`} disabled={!enabled||!tracks[deck]} color={ACCENT[deck]} onPress={() => { controls.deckCue(deck); }} onLongPress={() => { controls.deckSetCue(deck); }}/>
      <Button text={playing[deck]?'Ⅱ':'▶'} disabled={!enabled||!tracks[deck]} color={ACCENT[deck]} active={playing[deck]} onPress={() => controls.deckPlay(deck,!playing[deck])}/></View>)}</View>
      <Crossfade controls={controls} enabled={enabled}/></View>
  </SafeAreaView>;
}
export default function App(){return <GestureHandlerRootView style={s.fill}><SafeAreaProvider><Studio/></SafeAreaProvider></GestureHandlerRootView>;}
const s=StyleSheet.create({
  fill:{flex:1},safe:{flex:1,backgroundColor:'#080B10'},header:{paddingHorizontal:16,paddingVertical:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  brand:{color:'#F6F7FA',fontSize:19,fontWeight:'900',letterSpacing:1},brandAccent:{color:ACCENT[0]},
  button:{minHeight:42,minWidth:38,paddingHorizontal:9,borderWidth:1,borderColor:'#34414D',borderRadius:8,alignItems:'center',justifyContent:'center',flexGrow:1},
  buttonText:{color:'#D8E0E7',fontSize:10,fontWeight:'800'},disabled:{opacity:.35},row:{flexDirection:'row',gap:7,alignItems:'center',marginVertical:7},rowBetween:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
  jogRow:{flexDirection:'row',justifyContent:'space-evenly',paddingHorizontal:10,paddingTop:3,paddingBottom:2},
  jogColumn:{alignItems:'center'},
  jogHousing:{width:134,height:134,borderRadius:67,overflow:'hidden',backgroundColor:'#0A0E15'},
  jogCaption:{fontSize:9,fontWeight:'800',letterSpacing:1,marginTop:4},
  vuRow:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:8,paddingTop:4},
  vuCaption:{fontSize:9,color:'#7E8C9E',fontWeight:'700',width:30},
  vuCanvas:{height:17,flex:1,backgroundColor:'#151E29',borderRadius:3,overflow:'hidden'},
  waveZoomControls:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingTop:3},
  waveZoomText:{fontSize:9,fontWeight:'800',letterSpacing:0.5,color:'#80BCCA'},
  trackRow:{flexDirection:'row',gap:10,paddingHorizontal:14},trackTitle:{flex:1,flexDirection:'row',alignItems:'center',gap:7,borderBottomWidth:2,borderColor:'#202A36',paddingVertical:7},
  deckBadge:{fontWeight:'900',fontSize:15},trackName:{flex:1,color:'#EDF3F7',fontSize:12,fontWeight:'600'},stripe:{height:70,marginHorizontal:14,backgroundColor:'#0B1119',borderRadius:6,overflow:'hidden'},
  stripeCaption:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:16,paddingTop:5,paddingBottom:10},hint:{fontSize:9,color:'#8695A9',letterSpacing:.5},importLabel:{color:ACCENT[0],fontSize:10,fontWeight:'800'},
  pocket:{flex:1,borderTopWidth:1,borderBottomWidth:1,borderColor:'#27313E',backgroundColor:'#10161F'},page:{padding:14,paddingBottom:24,gap:9},section:{color:'#9CAEC1',fontSize:10,fontWeight:'800',letterSpacing:1.5,marginVertical:5},
  pads:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:8},bpm:{color:'#FFF',fontSize:23,fontWeight:'700',textAlign:'center',minWidth:50,fontVariant:['tabular-nums']},
  steps:{flexDirection:'row',gap:3,alignItems:'center',marginBottom:5},lane:{width:34,color:'#94A5B8',fontSize:8},step:{width:24,height:29,borderWidth:1,borderColor:'#34414D',borderRadius:4,backgroundColor:'#182230'},stepOn:{backgroundColor:'#278B9D'},stepCurrent:{borderColor:'#FFF'},
  fxContainer:{borderWidth:1,borderColor:'#263C4A',borderRadius:10,padding:10,backgroundColor:'#0D1823',marginTop:6},
  fxHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:7},
  fxTitle:{fontSize:11,fontWeight:'900',color:'#3EDCEE',letterSpacing:0.6},
  fxChoices:{flexDirection:'row',flexWrap:'wrap',gap:6,marginVertical:7},
  fxChoice:{width:'31%',minHeight:37,justifyContent:'center',alignItems:'center',borderWidth:1,borderRadius:7,borderColor:'#344455',padding:4},
  fxChoiceActive:{borderColor:'#3EDCEE',backgroundColor:'#15303B'},
  fxChoiceText:{fontSize:9,fontWeight:'800',color:'#8598AA'},
  fxChoiceTextActive:{color:'#E5FCFF'},
  fxParameters:{gap:5,marginVertical:7},
  fxParameter:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:5},
  fxParamTitle:{fontSize:10,color:'#9DB3C3',fontWeight:'700'},
  fxParamButtons:{flexDirection:'row',alignItems:'center',gap:15},
  fxStep:{color:'#3EDCEE',fontSize:18,fontWeight:'900',minWidth:24,textAlign:'center'},
  fxParamValue:{minWidth:65,color:'#EAF7FA',fontSize:12,fontWeight:'800',textAlign:'center'},
  gridValue:{color:'#E4F1F7',fontSize:12,fontWeight:'700',minWidth:76,textAlign:'center'},
  hotCueGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,justifyContent:'space-between'},
  hotCueButton:{width:'23%',minHeight:45,backgroundColor:'#18222F',borderRadius:8,
    borderWidth:1,borderColor:'#394656',alignItems:'center',justifyContent:'center'},
  hotCueLabel:{fontSize:11,fontWeight:'800',color:'#C1CDD9'},
  grooves:{flexDirection:'row',flexWrap:'wrap',gap:7},groove:{width:'48%',padding:11,borderRadius:8,borderWidth:1,borderColor:'#2B3949'},grooveName:{color:'#DCEAF2',fontSize:10,fontWeight:'800',marginBottom:5},
  channels:{flexDirection:'row',justifyContent:'space-around'},channel:{flex:1,alignItems:'center'},channelName:{fontSize:13,fontWeight:'800',letterSpacing:1},channelDivider:{width:1,backgroundColor:'#2B3949',marginHorizontal:14},
  channelFader:{alignItems:'center',paddingTop:10},
  channelFaderTouch:{width:62,height:154,alignItems:'center',paddingTop:12},
  channelFaderRail:{position:'absolute',top:14,width:5,height:130,borderRadius:3,backgroundColor:'#4E6075'},
  channelFaderThumb:{width:44,height:22,backgroundColor:'#D3E3F0',borderWidth:3,borderRadius:7},
  dialCell:{alignItems:'center',marginVertical:8},dialName:{color:'#A7B4C5',fontSize:9,fontWeight:'700',letterSpacing:1,marginBottom:8},dial:{width:62,height:62,borderRadius:31,borderWidth:2,backgroundColor:'#1B2532'},dialRotor:{width:58,height:58,alignItems:'center'},dialTick:{width:3,height:15,borderRadius:2,marginTop:4},dialValue:{color:'#DCE7F0',fontSize:10,paddingTop:8,paddingHorizontal:10,minHeight:30},
  libraryCard:{borderBottomWidth:1,borderColor:'#2A3746',paddingVertical:17,gap:7},libraryName:{color:'#EEF5F7',fontSize:15,fontWeight:'700'},
  tabRow:{flexDirection:'row',paddingHorizontal:14,gap:12,backgroundColor:'#0D131B'},tab:{flex:1,alignItems:'center',paddingVertical:13,borderBottomWidth:2,borderColor:'transparent'},tabActive:{borderColor:ACCENT[0]},tabText:{color:'#74869A',fontSize:11,fontWeight:'800',letterSpacing:1},tabTextActive:{color:ACCENT[0]},
  curveRow:{flexDirection:'row',justifyContent:'center',gap:10,paddingTop:2},
  curveButton:{minWidth:68,paddingVertical:5,paddingHorizontal:8,borderRadius:7,borderWidth:1,borderColor:'#303C4B',alignItems:'center'},
  curveSelected:{borderColor:'#39D9EE',backgroundColor:'#122B35'},
  curveLabel:{fontSize:9,color:'#75859A',fontWeight:'700'},
  curveLabelActive:{color:'#39D9EE'},
  bottom:{paddingHorizontal:14,paddingTop:7,paddingBottom:3},transportRow:{flexDirection:'row',justifyContent:'space-between',gap:26},deckTransport:{flex:1,flexDirection:'row',gap:7},faderTouch:{height:45,justifyContent:'center'},faderRail:{height:3,marginHorizontal:14,backgroundColor:'#485463'},faderThumb:{position:'absolute',width:28,height:30,borderRadius:5,backgroundColor:'#DFEAF1',borderWidth:3,borderColor:'#647687'},error:{color:'#FF8A9A',fontSize:11,padding:9},
});
