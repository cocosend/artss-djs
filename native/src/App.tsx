import {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Canvas, Path, Rect, Skia} from '@shopify/react-native-skia';
import {useDerivedValue, useFrameCallback, useSharedValue} from 'react-native-reanimated';
import {loadPreset, pickTrack, type PadIndex, type RealtimeControls, type TrackInfo} from 'react-native-artss-audio';
import {useAudioSession} from './audio/useAudioSession';
import {PerformancePad} from './components/PerformancePad';

type DeckIndex = 0 | 1;
const COLORS = ['#F6D527', '#FF4569'] as const;
const PRESETS = [
  {name: 'Maddix', genre: 'PEAK TECHNO', bpm: 145}, {name: 'ARTBAT', genre: 'MELODIC', bpm: 124},
  {name: 'Brejcha', genre: 'MINIMAL', bpm: 126}, {name: 'Guetta', genre: 'DANCE', bpm: 128},
  {name: 'Kazantip', genre: 'RAVE', bpm: 138}, {name: 'Legends', genre: 'CLASSIC', bpm: 130},
  {name: 'Modern', genre: 'FUTURE', bpm: 132},
] as const;
const EMPTY = Object.freeze(new Array<number>(96).fill(0));
const KIT_LABELS = [[], ['KICK', 'SUB', 'CLAP', 'HAT', 'OPEN', 'PERC', 'ACID', 'CRASH'],
  ['KICK', 'SNARE', 'CLAP', 'HAT', 'OPEN', 'RIM', 'BELL', 'PERC'],
  ['KICK', 'SNARE', 'CLAP', 'HAT', 'OPEN', 'TOM', 'RIDE', 'ACID']] as const;
const LANES = [0, 2, 3, 6] as const;
const INITIAL_PATTERN: number[][] = Array.from({length: 8}, (_, pad) => Array.from({length: 16}, (_, step) =>
  pad === 0 && step % 4 === 0 ? 1 : pad === 2 && (step === 4 || step === 12) ? 0.75 :
  pad === 3 && step % 2 === 0 ? 0.42 : 0));

function time(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

function WaveStrip({deck, controls, track, color, enabled}: {deck: DeckIndex; controls: RealtimeControls; track: TrackInfo | null; color: string; enabled: boolean}) {
  const [width, setWidth] = useState(1);
  const progress = useSharedValue(0);
  const dragging = useSharedValue(false);
  useFrameCallback(() => { if (!dragging.value) progress.value = deck === 0 ? controls.deckPosition0 : controls.deckPosition1; });
  const playhead = useDerivedValue(() => progress.value * width);
  const path = useMemo(() => {
    const result = Skia.Path.Make();
    (track?.waveform ?? EMPTY).forEach((peak, index) => {
      const x = (index + 0.5) * width / 96;
      const h = Math.max(1, peak * 33);
      result.moveTo(x, 38 - h);
      result.lineTo(x, 38 + h);
    });
    return result;
  }, [track, width]);
  const seek = Gesture.Pan().enabled(enabled).minDistance(0).onBegin(event => {
    'worklet';
    dragging.value = true;
    progress.value = Math.max(0, Math.min(0.9999, event.x / width));
    controls.deckSeek(deck, progress.value);
  }).onUpdate(event => {
    'worklet';
    if (!enabled) return;
    progress.value = Math.max(0, Math.min(1, event.x / width));
    controls.deckSeek(deck, Math.min(0.9999, progress.value));
  }).onEnd(event => {
    'worklet';
    if (enabled) controls.deckSeek(deck, Math.max(0, Math.min(0.9999, event.x / width)));
  }).onFinalize(() => { 'worklet'; dragging.value = false; });
  return <GestureDetector gesture={seek}><View onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))} style={styles.wave}>
    <Canvas style={styles.canvas} accessible={false}>
      <Path path={path} style="stroke" strokeWidth={Math.max(1.3, width / 110)} color={color} />
      <Rect x={playhead} y={2} width={2} height={72} color="#FFFFFF" />
    </Canvas>
  </View></GestureDetector>;
}

function Key({label, onPress, active, disabled, accent}: {label: string; onPress: () => void; active?: boolean; disabled?: boolean; accent?: string}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled, selected: active}} disabled={disabled}
    onPress={onPress} style={[styles.key, active && {borderColor: accent ?? '#F6D527', backgroundColor: '#F6D527'}, disabled && styles.disabled]}>
    <Text style={[styles.keyText, active && {color: '#0B0B0B'}]}>{label}</Text>
  </Pressable>;
}

function Deck({index, controls, enabled, track, loading, canLoad, load, position, playing}: {
  index: DeckIndex; controls: RealtimeControls; enabled: boolean; track: TrackInfo | null;
  loading: boolean; canLoad: boolean; load: () => void; position: number; playing: boolean;
}) {
  const [rate, setRate] = useState(1);
  const [filter, setFilter] = useState(0);
  const [cue, setCue] = useState(0);
  const [loop, setLoop] = useState(0);
  const previousTrack = useRef<TrackInfo | null>(null);
  useEffect(() => {
    if (previousTrack.current !== track) {
      previousTrack.current = track;
      setRate(1); setCue(0); setLoop(0); setFilter(0);
    }
  }, [track]);
  const color = COLORS[index];
  const ready = enabled && !!track && !loading;
  function toggle() { if (ready) controls.deckPlay(index, !playing); }
  function cueAction() {
    if (!ready) return;
    if (playing) { controls.deckPlay(index, false); controls.deckSeek(index, cue); }
    else { setCue(position); controls.deckSeek(index, position); }
  }
  function setLoopBeats(beats: number) {
    if (!ready || !track) return;
    if (loop === beats) { controls.deckLoop(index, 0, 1); setLoop(0); return; }
    const analyzedBpm = index === 0 ? controls.deckBpm0 : controls.deckBpm1;
    if (!analyzedBpm) return;
    const firstBeat = index === 0 ? controls.deckFirstBeat0 : controls.deckFirstBeat1;
    const beatSeconds = 60 / analyzedBpm;
    const span = Math.min(1, beats * beatSeconds / track.duration);
    const beatIndex = Math.ceil(Math.max(0, position * track.duration - firstBeat) / beatSeconds);
    const start = Math.min(Math.max(0, (firstBeat + beatIndex * beatSeconds) / track.duration), 1 - span);
    controls.deckLoop(index, start, start + span);
    setLoop(beats);
  }
  function changeRate(delta: number) {
    const next = Math.min(1.5, Math.max(0.5, Math.round((rate + delta) * 100) / 100));
    if (ready && controls.deckRate(index, next)) setRate(next);
  }
  function changeFilter(delta: number) {
    const next = Math.max(-1, Math.min(1, Math.round((filter + delta) * 4) / 4));
    if (ready && controls.deckFilter(index, next)) setFilter(next);
  }
  return <View style={[styles.deck, {borderTopColor: color}]}>
    <View style={styles.deckHeading}><View style={[styles.letter, {backgroundColor: color}]}><Text style={styles.letterText}>{index === 0 ? 'A' : 'B'}</Text></View>
      <Text style={styles.deckLabel}>DECK {index === 0 ? 'A' : 'B'}</Text><Text style={[styles.status, {color}]}>{playing ? '● LIVE' : track ? '○ READY' : '○ EMPTY'}</Text></View>
    <Pressable onPress={load} disabled={!canLoad || loading} style={[styles.load, !canLoad && styles.disabled]}>
      {loading ? <ActivityIndicator color={color} /> : <Text numberOfLines={2} style={styles.track}>{track?.title ?? '＋  ЗАГРУЗИТЬ ТРЕК'}</Text>}
      <Text style={styles.loadHint}>{track ? `${time(track.duration)}  ·  ЗАМЕНИТЬ ↗` : 'СВОЙ ФАЙЛ В ДЕКУ'}</Text>
    </Pressable>
    <WaveStrip deck={index} controls={controls} track={track} color={color} enabled={ready} />

    <View style={styles.timeline}><Text style={styles.time}>{time(position * (track?.duration ?? 0))}</Text><Text style={styles.time}>−{time((1 - position) * (track?.duration ?? 0))}</Text></View>
    <View style={styles.transport}><Key label="CUE" onPress={cueAction} disabled={!ready} accent={color} />
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Воспроизвести'} disabled={!ready} onPress={toggle}
        style={[styles.play, {backgroundColor: color}, !ready && styles.disabled]}><Text style={styles.playText}>{playing ? 'Ⅱ' : '▶'}</Text></Pressable></View>
    <Text style={styles.caption}>TEMPO</Text>
    <View style={styles.tempo}><Key label="−" onPress={() => changeRate(-0.01)} disabled={!ready} /><Text style={styles.rate}>{Math.round((rate - 1) * 100) >= 0 ? '+' : ''}{Math.round((rate - 1) * 100)}%</Text><Key label="＋" onPress={() => changeRate(0.01)} disabled={!ready} /></View>
    <Key label="SYNC" onPress={() => { if (controls.deckSync(index)) setRate(index === 0 ? controls.deckRate0 : controls.deckRate1); }} disabled={!ready || !playing || !(index === 0 ? controls.deckBpm0 && controls.deckBpm1 && controls.deckPlaying1 : controls.deckBpm0 && controls.deckBpm1 && controls.deckPlaying0)} />
    <View style={styles.tempo}><Key label="LP −" onPress={() => changeFilter(-0.25)} disabled={!ready} /><Text style={styles.filterValue}>{filter === 0 ? 'FILTER OFF' : `${filter < 0 ? 'LP' : 'HP'} ${Math.round(Math.abs(filter) * 100)}%`}</Text><Key label="＋ HP" onPress={() => changeFilter(0.25)} disabled={!ready} /></View>
    <View style={styles.loopRow}><Text style={styles.caption}>LOOP · {Math.round(index === 0 ? controls.deckBpm0 : controls.deckBpm1) || '—'} BPM</Text><Key label={loop ? '4 / OFF' : '4 BEATS'} active={loop !== 0} accent={color} disabled={!ready || !(index === 0 ? controls.deckBpm0 : controls.deckBpm1)} onPress={() => setLoopBeats(4)} /></View>
  </View>;
}

function Crossfader({controls, enabled}: {controls: RealtimeControls; enabled: boolean}) {
  const [width, setWidth] = useState(1);
  const value = useSharedValue(0.5);
  const thumb = useDerivedValue(() => value.value * Math.max(0, width - 24));
  const gesture = Gesture.Pan().enabled(enabled).minDistance(0).onBegin(event => {
    'worklet';
    const next = Math.max(0, Math.min(1, (event.x - 12) / Math.max(1, width - 24)));
    value.value = next;
    controls.crossfade(next);
  }).onUpdate(event => {
    'worklet';
    const next = Math.max(0, Math.min(1, (event.x - 12) / Math.max(1, width - 24)));
    value.value = next;
    controls.crossfade(next);
  });
  return <View style={styles.mixer}><View style={styles.mixHeading}><Text style={[styles.mixLetter, {color: COLORS[0]}]}>A</Text><Text style={styles.mixTitle}>CROSSFADER</Text><Text style={[styles.mixLetter, {color: COLORS[1]}]}>B</Text></View>
    <GestureDetector gesture={gesture}><View style={styles.faderTouch} onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))}>
      <View style={styles.faderRail} /><Canvas style={styles.faderCanvas} accessible={false}><Rect x={thumb} y={5} width={24} height={42} color="#F6F9FF" /></Canvas>
    </View></GestureDetector></View>;
}

function MasterEQ({controls, enabled}: {controls: RealtimeControls; enabled: boolean}) {
  const [bands, setBands] = useState<[number, number, number]>([0, 0, 0]);
  useEffect(() => { if (enabled) controls.setEQ(...bands); }, [controls, enabled, bands]);
  function adjust(index: 0 | 1 | 2, delta: number) {
    const next: [number, number, number] = [...bands];
    next[index] = Math.max(-12, Math.min(12, next[index] + delta));
    if (enabled && controls.setEQ(...next)) setBands(next);
  }
  return <View style={styles.eqPanel}>
    <Text style={styles.mixTitle}>MASTER EQ · ±12 dB</Text>
    <View style={styles.eqRow}>{(['LOW', 'MID', 'HIGH'] as const).map((label, index) =>
      <View key={label} style={styles.eqBand}>
        <Text style={styles.eqLabel}>{label}</Text>
        <View style={styles.eqControls}>
          <Key label="−" disabled={!enabled} onPress={() => adjust(index as 0 | 1 | 2, -1)} />
          <Text style={styles.eqValue}>{bands[index]! > 0 ? '+' : ''}{bands[index]} dB</Text>
          <Key label="+" disabled={!enabled} onPress={() => adjust(index as 0 | 1 | 2, 1)} />
        </View>
      </View>)}</View>
  </View>;
}

function DrumMachine({controls, enabled}: {controls: RealtimeControls; enabled: boolean}) {
  const [kit, setKit] = useState<1 | 2 | 3>(3);
  const [bpm, setBpm] = useState(136);
  const [running, setRunning] = useState(false);
  const [banks, setBanks] = useState(() => Array.from({length: 4}, () => INITIAL_PATTERN.map(row => [...row])));
  const [bank, setBank] = useState(0);
  const [recording, setRecording] = useState(false);
  const pattern = banks[bank]!;
  function setPattern(next: number[][]) { setBanks(old => old.map((rows, index) => index === bank ? next : rows)); }
  function recordHit(pad: PadIndex, at: number) {
    if (!recording || !running) return;
    if (at < 0 || at >= 16 || !controls.setStep(pad, at, 1)) return;
    setBanks(old => old.map((rows, b) => b !== bank ? rows : rows.map((row, p) =>
      p !== pad ? row : row.map((v, i) => i === at ? 1 : v))));
  }
  const [step, setStep] = useState(0);
  useEffect(() => {
    for (let pad = 0; pad < 8; ++pad) for (let at = 0; at < 16; ++at)
      controls.setStep(pad as PadIndex, at, pattern[pad]?.[at] ?? 0);
    controls.setTempo(bpm);
    controls.setKit(kit);
  }, [controls, enabled, bpm, kit, pattern]); // Reapply after RemoteIO is prepared or restarted.
  useEffect(() => {
    if (!enabled) { controls.setSequencer(false); setRunning(false); setStep(0); return; }
    const timer = setInterval(() => { if (running) setStep(controls.currentStep); }, 65);
    return () => clearInterval(timer);
  }, [controls, enabled, running]);
  function selectKit(next: 1 | 2 | 3) {
    if (controls.setKit(next)) setKit(next);
  }
  function changeBpm(delta: number) {
    const next = Math.max(60, Math.min(200, bpm + delta));
    if (controls.setTempo(next)) setBpm(next);
  }
  function toggleStep(pad: PadIndex, at: number) {
    const next = pattern.map(row => [...row]);
    next[pad]![at] = next[pad]![at] ? 0 : pad === 0 ? 1 : 0.7;
    if (controls.setStep(pad, at, next[pad]![at]!)) setPattern(next);
  }
  function toggleSequence() {
    const next = !running;
    if (controls.setSequencer(next)) { setRunning(next); if (!next) setStep(0); }
  }

  const kitName = kit === 1 ? '303 / ACID' : kit === 2 ? '606 / CLASSIC' : '909 / TECHNO';
  function generateRhythm() {
    const next = INITIAL_PATTERN.map((row, pad) => row.map((value, index) =>
      pad === 0 ? value : value || (LANES.some(lane => lane === pad) &&
        Math.random() < (index % 2 ? 0.12 : 0.23) ? 0.7 : 0)));
    setPattern(next);
  }
  return <View style={nexus.workspace}>
    <View style={nexus.performanceLine}>
      <Text style={nexus.performanceTitle}>01 / PERFORMANCE</Text>
      <Text style={nexus.performanceMeta}>LOCAL AUDIO · LIVE</Text>
    </View>
    <View style={nexus.padsPanel}>
      <View style={nexus.strip}><Text style={nexus.stripLeft}>01 / PLAY THE GRID</Text><Text style={nexus.stripRight}>8 VOICES · 4 BANKS</Text></View>
      <View style={nexus.padsHeading}>
        <Text style={nexus.padsTitle}>▦  ДРАМ-ПЭДЫ</Text>
        <View style={nexus.bankRow}>{(['A','B','C','D'] as const).map((name, index) =>
          <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Банк ${name}`}
            accessibilityState={{selected: bank === index}} onPress={() => setBank(index)}
            style={[nexus.bankButton, bank === index && nexus.bankSelected]}>
            <Text style={[nexus.bankText, bank === index && nexus.bankTextSelected]}>{name}</Text>
          </Pressable>)}</View>
      </View>
      <View style={styles.padGrid}>{KIT_LABELS[kit].map((label, index) =>
        <PerformancePad key={index} index={index as PadIndex} label={label} controls={controls}
          enabled={enabled} onSelect={recordHit} />)}</View>
    </View>
    <View style={nexus.transportPanel}>
      <Pressable accessibilityRole="button" accessibilityLabel={running ? 'Остановить ритм' : 'Запустить ритм'}
        accessibilityState={{disabled: !enabled, selected: running}} disabled={!enabled} onPress={toggleSequence}
        style={[nexus.transportSide, !enabled && styles.disabled]}>
        <View style={[nexus.playRing, running && nexus.playRingOn]}><Text style={nexus.playIcon}>{running ? 'Ⅱ' : '▶'}</Text></View>
        <Text style={nexus.transportLabel}>{running ? 'СТОП' : 'ПУСК'}</Text>
      </Pressable>
      <View style={nexus.signalPanel}>
        <View style={nexus.signalHeader}><Text style={nexus.signalName}>● {kitName}</Text>
          <Text style={nexus.signalTime}>{running ? `ШАГ ${String(step + 1).padStart(2, '0')}` : 'ОЖИДАНИЕ'}</Text></View>
        <View style={nexus.signalScreen}>{Array.from({length: 16}, (_, index) =>
          <View key={index} style={[nexus.signalBar, (pattern[0]?.[index] ?? 0) > 0 && nexus.signalActive,
            running && index === step && nexus.signalCursor]} />)}</View>
        <View style={nexus.signalFooter}><Text style={nexus.signalFootText}>16 STEPS · LIVE GRID</Text>
          <Text style={nexus.signalStatus}>{running ? 'ВОСПРОИЗВЕДЕНИЕ' : 'ОСТАНОВЛЕНО'}</Text></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Запись нажатий драм-пэдов в секвенсор"
        accessibilityState={{disabled: !enabled, selected: recording}} disabled={!enabled}
        onPress={() => setRecording(v => !v)} style={[nexus.transportSide, !enabled && styles.disabled]}>
        <View style={[nexus.recordRing, recording && nexus.recordRingOn]}><View style={nexus.recordCenter} /></View>
        <Text style={nexus.transportLabel}>{recording ? 'ЗАПИСЬ ●' : 'ЗАПИСЬ'}</Text>
      </Pressable>
    </View>
    <View style={nexus.settingsPanel}>
      <View style={nexus.settingCell}><Text style={nexus.settingCaption}>СТИЛЬ</Text>
        <View style={nexus.settingPicker}>
          <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий стиль" style={nexus.arrowButton}
            onPress={() => selectKit(((kit + 1) % 3 + 1) as 1 | 2 | 3)}><Text style={nexus.arrowText}>‹</Text></Pressable>
          <Text style={nexus.styleValue}>{kitName}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Следующий стиль" style={nexus.arrowButton}
            onPress={() => selectKit((kit % 3 + 1) as 1 | 2 | 3)}><Text style={nexus.arrowText}>›</Text></Pressable>
        </View>
      </View>
      <View style={nexus.bpmCell}><Text style={nexus.bpmCaption}>BPM</Text>
        <View style={nexus.bpmPicker}><Pressable accessibilityRole="button" accessibilityLabel="Темп минус один"
          style={nexus.bpmArrow} onPress={() => changeBpm(-1)} disabled={!enabled}><Text style={nexus.bpmArrowText}>‹</Text></Pressable>
          <Text style={nexus.bpmNumber}>{bpm}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Темп плюс один"
            style={nexus.bpmArrow} onPress={() => changeBpm(1)} disabled={!enabled}><Text style={nexus.bpmArrowText}>›</Text></Pressable></View>
      </View>
      <View style={nexus.settingCell}><Text style={nexus.settingCaption}>СЦЕНА</Text>
        <View style={nexus.settingPicker}>
          <Pressable accessibilityRole="button" accessibilityLabel="Предыдущая сцена" style={nexus.arrowButton}
            onPress={() => setBank((bank + 3) % 4)}><Text style={nexus.arrowText}>‹</Text></Pressable>
          <Text style={nexus.sceneValue}>BANK {(['A','B','C','D'] as const)[bank]}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Следующая сцена" style={nexus.arrowButton}
            onPress={() => setBank((bank + 1) % 4)}><Text style={nexus.arrowText}>›</Text></Pressable>
        </View>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Создать новый ритм" style={nexus.createRhythm}
      onPress={generateRhythm}><Text style={nexus.createStar}>✦</Text>
      <View style={nexus.createText}><Text style={nexus.createTitle}>СОЗДАТЬ РИТМ</Text><Text style={nexus.createDetail}>АВТОРИТМ · 16 ШАГОВ</Text></View>
      <Text style={nexus.createArrow}>›</Text></Pressable>
    <View style={nexus.sequencerPanel}>
      <View style={nexus.sequenceTitleRow}><Text style={nexus.sequenceTitle}>02 / STEP SEQUENCER</Text>
        <Text style={nexus.sequenceSub}>4 LANES · 16 STEPS</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={true} nestedScrollEnabled>
        <View>{LANES.map(pad => <View style={nexus.stepsRow} key={pad}>
          <Text style={nexus.stepsName}>{KIT_LABELS[kit][pad]}</Text>
          {pattern[pad]?.map((value, at) =>
            <Pressable key={at} accessibilityRole="button" accessibilityLabel={`${KIT_LABELS[kit][pad]} шаг ${at + 1}`}
              accessibilityState={{selected: value > 0, disabled: !enabled}} disabled={!enabled}
              onPress={() => toggleStep(pad, at)} style={[nexus.stepCell, value > 0 && nexus.stepActive,
                running && step === at && nexus.stepCurrent]} />)}</View>)}</View>
      </ScrollView>
      <Text style={nexus.sequenceHint}>ЗАПИСЬ фиксирует нажатия на пэды в текущем банке при запущенном ритме.</Text>
    </View>
  </View>;
}

function Studio() {
  const {controls, session, busy, error, toggleAudio} = useAudioSession();
  const [mix, setMix] = useState(false);
  const [tracks, setTracks] = useState<[TrackInfo | null, TrackInfo | null]>([null, null]);
  const [loading, setLoading] = useState<DeckIndex | null>(null);
  const loadingLock = useRef(false);
  const [selected, setSelected] = useState<DeckIndex>(0);
  const [playback, setPlayback] = useState({positions: [0, 0], playing: [false, false]});
  const {width} = useWindowDimensions();
  useEffect(() => {
    const id = setInterval(() => setPlayback({positions: [controls.deckPosition0, controls.deckPosition1],
      playing: [controls.deckPlaying0, controls.deckPlaying1]}), 200);
    return () => clearInterval(id);
  }, [controls]);
  useEffect(() => { if (!session) setTracks([null, null]); }, [session]);
  const [importError, setImportError] = useState<string | null>(null);
  async function load(index: DeckIndex, preset?: number) {
    if (loadingLock.current) return;
    loadingLock.current = true;
    setLoading(index); setImportError(null);
    try {
      if (!session && !(await toggleAudio())) return;
      const track = preset === undefined ? await pickTrack(index) : await loadPreset(index, preset);
      setTracks(previous => { const next = [...previous] as [TrackInfo | null, TrackInfo | null]; next[index] = track; return next; });
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Не удалось загрузить трек';
      if (!message.includes('отменён')) setImportError(message);
    } finally { loadingLock.current = false; setLoading(null); }
  }
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}><StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={[styles.content, {maxWidth: width > 800 ? 960 : 540}]} bounces={false}>
      <View style={styles.header}><View><Text style={styles.brand}>NEXUS</Text><Text style={styles.sub}>DJ CREATOR · 33</Text></View>
        <Pressable accessibilityRole="button" onPress={() => { void toggleAudio(); }} disabled={busy || loading !== null} style={[styles.power, session && styles.powerOn]}>
          <Text style={styles.powerText}>{busy ? '…' : session ? '● ON' : '◯ AUDIO'}</Text></Pressable></View>
      <View style={{display: mix ? 'none' : 'flex'}}><DrumMachine controls={controls} enabled={!!session && !busy} /></View>
      <View style={{display: mix ? 'flex' : 'none'}}><View style={styles.libraryHead}><View><Text style={styles.eyebrow}>01 / MUSIC LIBRARY</Text><Text style={styles.sectionTitle}>Начни с трека</Text></View>
        <View style={styles.target}><Text style={styles.targetLabel}>В ДЕКУ</Text>{([0, 1] as const).map(index => <Pressable key={index}
          accessibilityRole="button" accessibilityState={{selected: selected === index}} onPress={() => setSelected(index)}
          style={[styles.targetButton, selected === index && {backgroundColor: COLORS[index]}]}><Text style={[styles.targetText, selected === index && styles.targetTextOn]}>{index === 0 ? 'A' : 'B'}</Text></Pressable>)}</View></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll} contentContainerStyle={styles.presetList}>
        {PRESETS.map((preset, index) => <Pressable key={preset.name} accessibilityRole="button"
          accessibilityLabel={`Загрузить демолуп ${preset.name} в деку ${selected === 0 ? 'A' : 'B'}`}
          disabled={loading !== null || busy} onPress={() => { void load(selected, index); }} style={[styles.preset, (loading !== null || busy) && styles.disabled]}>
          <Text style={styles.presetIndex}>{String(index + 1).padStart(2, '0')} / DEMO</Text>
          <Text style={styles.presetName}>{preset.name}</Text><View style={styles.presetBottom}><Text style={styles.presetGenre}>{preset.genre}</Text><Text style={styles.presetBpm}>{preset.bpm} BPM</Text></View>
        </Pressable>)}</ScrollView>
      <Pressable accessibilityRole="button" disabled={loading !== null || busy} onPress={() => { void load(selected); }} style={[styles.import, (loading !== null || busy) && styles.disabled]}>
        <Text style={styles.importIcon}>＋</Text><View style={styles.importText}><Text style={styles.importTitle}>Загрузить свой трек</Text>
          <Text style={styles.importHint}>Файлы iPhone · дека {selected === 0 ? 'A' : 'B'}</Text></View><Text style={styles.importArrow}>↗</Text></Pressable>
      {error || importError ? <Text accessibilityRole="alert" style={styles.error}>{error ?? importError}</Text> : null}
      <View style={styles.mixHeader}><Text style={styles.eyebrow}>02 / MIX STATION</Text><Text style={styles.mixNote}>ДВА КАНАЛА · ОДИН МИКС</Text></View>
      <View style={styles.deckRow}>{([0, 1] as const).map(index => <Deck key={index} index={index} controls={controls} enabled={!!session && !busy} track={tracks[index]}
        loading={loading === index} canLoad={!busy && loading === null} load={() => { void load(index); }} position={playback.positions[index] ?? 0} playing={playback.playing[index] ?? false} />)}</View>
      <Crossfader controls={controls} enabled={!!session} />
      <MasterEQ controls={controls} enabled={!!session && !busy} />
      </View>
      <Text style={styles.footer}>{session ? `${session.routes.join(' · ')}  ·  ${session.ioBufferMs.toFixed(1)} ms` : 'Включите звук для игры'}</Text>
    </ScrollView><View style={nexus.bottomNav}>
      <Pressable accessibilityRole="tab" accessibilityState={{selected: !mix}} onPress={() => setMix(false)}
        style={[nexus.navButton, !mix && nexus.navSelected]}><Text style={nexus.navIcon}>◇</Text><Text style={[nexus.navLabel, !mix && nexus.navLabelSelected]}>СОЗДАТЬ</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{selected: mix}} onPress={() => setMix(true)}
        style={[nexus.navButton, mix && nexus.navSelected]}><Text style={nexus.navIcon}>≋</Text><Text style={[nexus.navLabel, mix && nexus.navLabelSelected]}>MIX</Text></Pressable>
    </View></SafeAreaView>;
}

export default function App() {
  return <GestureHandlerRootView style={{flex: 1}}><SafeAreaProvider><Studio /></SafeAreaProvider></GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#050506'}, content: {padding: 14, paddingBottom: 34, width: '100%', alignSelf: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 8, paddingBottom: 13, borderBottomWidth: 1, borderColor: '#5B5642'},
  brand: {fontSize: 27, fontWeight: '900', letterSpacing: -1, color: '#FFFFFF', marginTop: 4}, brandAccent: {color: '#F6D527'},
  sub: {fontSize: 10, letterSpacing: 2.8, color: '#F6D527', fontWeight: '900'},
  power: {paddingHorizontal: 12, height: 38, justifyContent: 'center', borderRadius: 19, backgroundColor: '#26303F'},
  powerOn: {backgroundColor: '#1B564D'}, powerText: {fontSize: 9, fontWeight: '800', color: '#FFFFFF'},
  eyebrow: {fontSize: 9, letterSpacing: 1.7, fontWeight: '900', color: '#8D9BAE'},
  sectionTitle: {color: '#F7FAFF', fontSize: 23, fontWeight: '900', marginTop: 5, letterSpacing: -0.7},
  libraryHead: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14},
  target: {flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, padding: 4, backgroundColor: '#1A2331'},
  targetLabel: {fontSize: 8, fontWeight: '900', color: '#A3B1C3', marginHorizontal: 4},
  targetButton: {height: 29, width: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center'},
  targetText: {color: '#B4C4D5', fontWeight: '900', fontSize: 12}, targetTextOn: {color: '#071018'},
  presetScroll: {marginHorizontal: -14}, presetList: {paddingHorizontal: 14, gap: 9},
  preset: {width: 146, height: 122, borderRadius: 14, borderWidth: 1, borderColor: '#6A6250', backgroundColor: '#201E19', padding: 12, justifyContent: 'space-between'},
  presetIndex: {color: '#F6D527', fontSize: 9, fontWeight: '900', letterSpacing: 1.2},
  presetName: {color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.5},
  presetBottom: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  presetGenre: {color: '#ABB9CB', fontSize: 8, fontWeight: '800'}, presetBpm: {color: '#F6D527', fontSize: 9, fontWeight: '900'},
  import: {height: 66, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#496179', backgroundColor: '#201E19', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14},
  importIcon: {color: '#F6D527', fontSize: 29, marginRight: 12}, importText: {flex: 1},
  importTitle: {color: '#FFFFFF', fontSize: 13, fontWeight: '900'}, importHint: {color: '#A5B4C6', fontSize: 10, marginTop: 4}, importArrow: {color: '#FFFFFF', fontSize: 20},
  mixHeader: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 27, marginBottom: 12},
  mixNote: {color: '#8193A8', fontSize: 8, fontWeight: '900'},
  deckRow: {flexDirection: 'row', gap: 8}, deck: {flex: 1, minWidth: 0, borderTopWidth: 4, borderRadius: 5, padding: 9, backgroundColor: '#211F1A', borderWidth: 1, borderColor: '#575148'},
  deckHeading: {flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26},
  letter: {width: 23, height: 23, borderRadius: 5, alignItems: 'center', justifyContent: 'center'}, letterText: {fontSize: 13, fontWeight: '900', color: '#071018'},
  deckLabel: {fontSize: 10, fontWeight: '900', color: '#F6F9FF', flex: 1}, status: {fontSize: 7, fontWeight: '700'},
  load: {height: 62, justifyContent: 'center', marginTop: 8, padding: 9, backgroundColor: '#302D24', borderRadius: 8},
  track: {fontSize: 11, fontWeight: '800', color: '#F7F8FA'}, loadHint: {fontSize: 8, color: '#9DAABA', marginTop: 4, letterSpacing: 0.4},
  wave: {marginTop: 9, height: 104, borderRadius: 5, overflow: 'hidden', backgroundColor: '#050505'}, canvas: {flex: 1},
  platterGroup: {alignItems: 'center', marginTop: 8}, platterLabel: {color: '#C5BEAD', fontSize: 8, fontWeight: '800', marginBottom: 4},
  platter: {width: 104, height: 104}, platterCanvas: {width: 104, height: 104},
  timeline: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5}, time: {color: '#B1BDCC', fontSize: 9, fontVariant: ['tabular-nums']},
  transport: {flexDirection: 'row', gap: 7, marginTop: 6}, key: {flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#232322', borderWidth: 1, borderColor: '#66635D', borderRadius: 5},
  keyText: {fontSize: 11, fontWeight: '800', color: '#E4ECF6'}, play: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7},
  playText: {fontSize: 19, fontWeight: '900', color: '#071018'}, caption: {fontSize: 8, fontWeight: '800', letterSpacing: 1.2, color: '#C5BEAD', marginTop: 16, marginBottom: 6},
  tempo: {flexDirection: 'row', alignItems: 'center', gap: 4}, rate: {fontSize: 11, width: 38, textAlign: 'center', color: '#F6F9FF', fontWeight: '800'},
  filterValue: {fontSize: 9, width: 54, textAlign: 'center', color: '#F6F9FF', fontWeight: '800'},
  loopRow: {flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7}, disabled: {opacity: 0.38},
  mixer: {marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#201E19'}, mixHeading: {flexDirection: 'row', justifyContent: 'space-between'},
  mixLetter: {fontSize: 15, fontWeight: '900'}, mixTitle: {fontSize: 9, color: '#E7E2D5', fontWeight: '800', letterSpacing: 1.6},
  faderTouch: {height: 54, justifyContent: 'center', marginTop: 8}, faderRail: {height: 5, marginHorizontal: 12, backgroundColor: '#696250', borderRadius: 3},
  faderCanvas: {...StyleSheet.absoluteFillObject}, error: {color: '#FF8397', padding: 10, fontSize: 12},
  eqPanel: {marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#201E19'},
  eqRow: {flexDirection: 'row', gap: 6, marginTop: 10}, eqBand: {flex: 1, minWidth: 0},
  eqLabel: {color: '#E7E2D5', textAlign: 'center', fontSize: 9, fontWeight: '800', marginBottom: 6},
  eqControls: {flexDirection: 'row', alignItems: 'center', gap: 2},
  eqValue: {color: '#F6F9FF', fontSize: 9, fontWeight: '800', textAlign: 'center', minWidth: 32},
  footer: {marginTop: 18, textAlign: 'center', color: '#7F91A5', fontSize: 10},
  drumMachine: {marginTop: 18, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#3B4149', backgroundColor: '#181B20'},
  drumHeading: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  drumTitle: {color: '#F6D527', fontWeight: '900', fontSize: 15},
  kitRow: {flexDirection: 'row', gap: 8, marginBottom: 10},
  kitButton: {flex: 1, minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: '#414852', alignItems: 'center', justifyContent: 'center'},
  kitSelected: {backgroundColor: '#F6D527', borderColor: '#F6D527'},
  kitText: {color: '#E8EDF2', fontWeight: '900'}, kitTextSelected: {color: '#121417'},
  padGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7},
  sequenceHeader: {marginTop: 16, marginBottom: 8, gap: 8},
  sequenceTransport: {flexDirection: 'row', alignItems: 'center', gap: 5},
  sequenceBpm: {color: '#F6D527', minWidth: 72, textAlign: 'center', fontSize: 11, fontWeight: '900'},
  stepsRow: {flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 5},
  stepsName: {width: 39, fontSize: 7, color: '#DEE4EB', fontWeight: '900'},
  stepCell: {flex: 1, height: 26, minWidth: 8, borderRadius: 3, backgroundColor: '#2B3038', borderWidth: 1, borderColor: '#414852'},
  stepActive: {backgroundColor: '#F6D527', borderColor: '#FFE66A'}, stepCurrent: {borderColor: '#FF435B', borderWidth: 2},
});


const nexus = StyleSheet.create({
  workspace: {gap: 12},
  performanceLine: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 2},
  performanceTitle: {color: '#F6D527', fontWeight: '900', fontSize: 12, letterSpacing: 2.5},
  performanceMeta: {color: '#B8B0A2', fontSize: 9, fontWeight: '900', letterSpacing: 1.2},
  padsPanel: {borderColor: '#6A6458', borderWidth: 1, backgroundColor: '#11100E', paddingBottom: 10},
  strip: {height: 34, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#242119', paddingHorizontal: 11},
  stripLeft: {fontSize: 10, fontWeight: '900', color: '#F6D527', letterSpacing: 1.4},
  stripRight: {fontSize: 9, fontWeight: '900', color: '#C6BCA4', letterSpacing: 1.1},
  padsHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingHorizontal: 10, paddingVertical: 13, gap: 10},
  padsTitle: {color: '#F7F4EF', fontSize: 18, fontWeight: '900', letterSpacing: 0.5},
  bankRow: {flexDirection: 'row', borderWidth: 1, borderColor: '#73736B', padding: 3, borderRadius: 9, gap: 3},
  bankButton: {width: 34, height: 39, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242321', borderWidth: 1, borderColor: '#5A594F', borderRadius: 3},
  bankSelected: {backgroundColor: '#F6D527', borderColor: '#F6D527'},
  bankText: {fontSize: 14, fontWeight: '900', color: '#F7F4EF'},
  bankTextSelected: {color: '#060606'},
  transportPanel: {minHeight: 154, borderWidth: 1, borderColor: '#68655D', backgroundColor: '#191817', borderRadius: 3, flexDirection: 'row'},
  transportSide: {width: 78, minHeight: 154, alignItems: 'center', justifyContent: 'center', gap: 8},
  transportLabel: {fontSize: 10, fontWeight: '900', color: '#FFFFFF', textAlign: 'center'},
  playRing: {height: 67, width: 67, borderWidth: 3, borderColor: '#F6D527', borderRadius: 40, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center'},
  playRingOn: {backgroundColor: '#282312'},
  playIcon: {fontSize: 29, color: '#C5FFF8'},
  recordRing: {height: 67, width: 67, borderWidth: 3, borderColor: '#ED403F', borderRadius: 40, backgroundColor: '#110909', alignItems: 'center', justifyContent: 'center'},
  recordRingOn: {backgroundColor: '#4D1618'},
  recordCenter: {width: 32, height: 32, borderRadius: 20, backgroundColor: '#FC173C', borderWidth: 3, borderColor: '#FF6D6D'},
  signalPanel: {flex: 1, minWidth: 0, padding: 7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#5A554A', justifyContent: 'space-around'},
  signalHeader: {flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 3},
  signalName: {color: '#F6D527', fontSize: 9, fontWeight: '900'},
  signalTime: {color: '#E0DDE1', fontSize: 9, fontWeight: '800'},
  signalScreen: {height: 63, backgroundColor: '#050505', borderRadius: 4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, gap: 2},
  signalBar: {flex: 1, height: 3, backgroundColor: '#56524B'},
  signalActive: {backgroundColor: '#F6D527', height: 4},
  signalCursor: {height: 45, backgroundColor: '#F83558'},
  signalFooter: {flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 3},
  signalFootText: {fontSize: 8, color: '#AFA793', fontWeight: '800'},
  signalStatus: {fontSize: 8, color: '#64E8D3', fontWeight: '900'},
  settingsPanel: {flexDirection: 'row', borderWidth: 1, borderColor: '#666157', backgroundColor: '#171615', minHeight: 130, borderRadius: 3},
  settingCell: {flex: 1, minWidth: 0, padding: 6, justifyContent: 'center', alignItems: 'center'},
  settingCaption: {fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#B6AC9B', marginBottom: 15},
  settingPicker: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 1},
  arrowButton: {minWidth: 27, height: 44, justifyContent: 'center', alignItems: 'center'},
  arrowText: {fontSize: 30, color: '#F6D527'},
  styleValue: {color: '#FFFFFF', fontSize: 9, fontWeight: '900', textAlign: 'center', flexShrink: 1},
  sceneValue: {color: '#FFFFFF', fontSize: 10, fontWeight: '900', textAlign: 'center', flexShrink: 1},
  bpmCell: {width: 116, padding: 5, backgroundColor: '#F6D527', justifyContent: 'center', alignItems: 'center'},
  bpmCaption: {color: '#0B0B0B', fontSize: 10, fontWeight: '900', letterSpacing: 2},
  bpmPicker: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%'},
  bpmArrow: {width: 29, height: 44, alignItems: 'center', justifyContent: 'center'},
  bpmArrowText: {color: '#000000', fontSize: 31},
  bpmNumber: {fontSize: 32, fontWeight: '900', color: '#030303', fontVariant: ['tabular-nums']},
  createRhythm: {backgroundColor: '#F6D527', minHeight: 76, borderRadius: 14, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 13},
  createStar: {fontSize: 30, color: '#151009'},
  createText: {flex: 1},
  createTitle: {fontSize: 18, fontWeight: '900', letterSpacing: 0.3, color: '#111111'},
  createDetail: {fontSize: 9, color: '#151515', fontWeight: '700', marginTop: 4, letterSpacing: 1},
  createArrow: {fontSize: 36, color: '#111111'},
  sequencerPanel: {backgroundColor: '#181715', borderWidth: 1, borderColor: '#666057', padding: 10, borderRadius: 4, gap: 9},
  sequenceTitleRow: {flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4},
  sequenceTitle: {fontSize: 10, fontWeight: '900', color: '#F6D527', letterSpacing: 1.3},
  sequenceSub: {fontSize: 8, color: '#BBB2A0', fontWeight: '800'},
  stepsRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5},
  stepsName: {fontSize: 9, fontWeight: '900', color: '#FFFFFF', width: 43},
  stepCell: {width: 33, height: 36, borderRadius: 4, borderWidth: 1, borderColor: '#5C584C', backgroundColor: '#292825'},
  stepActive: {backgroundColor: '#F6D527', borderColor: '#FFE76E'},
  stepCurrent: {borderColor: '#FF3857', borderWidth: 3},
  sequenceHint: {color: '#AFA798', fontSize: 9, lineHeight: 14},
  bottomNav: {flexDirection: 'row', backgroundColor: '#111111', borderTopWidth: 1, borderColor: '#5B594F', paddingHorizontal: 10, paddingVertical: 5, gap: 8},
  navButton: {flex: 1, minHeight: 59, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3},
  navSelected: {backgroundColor: '#F6D527'},
  navIcon: {fontSize: 22, color: '#A6A6A6'},
  navLabel: {fontSize: 10, fontWeight: '900', color: '#B7B3AB'},
  navLabelSelected: {color: '#080808'},
});
