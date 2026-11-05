import {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Canvas, Path, Skia} from '@shopify/react-native-skia';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {scheduleOnRN, scheduleOnUI} from 'react-native-worklets';
import type {PadIndex, RealtimeControls} from 'react-native-artss-audio';

interface Props {
  index: PadIndex;
  label: string;
  controls: RealtimeControls;
  enabled: boolean;
  onSelect: (index: PadIndex, step: number) => void;
}

const NAMES: Record<string, string> = {
  KICK: 'БОЧКА', SUB: 'САБ', SNARE: 'СНЭР', CLAP: 'ХЛОПОК',
  HAT: 'ХЭТ', OPEN: 'ОТКР. ХЭТ', PERC: 'ПЕРК', RIM: 'РИМ',
  BELL: 'КОЛОКОЛ', TOM: 'ТОМ', RIDE: 'РАЙД', ACID: 'ЭЙСИД',
  CRASH: 'УДАР',
};

// SVG path data is converted to native Skia geometry on the UI setup thread.
// No color-emoji fonts, images, or allocations in the native audio callback.
const ICON_PATHS: Record<string, string> = {
  KICK: 'M20 7 A13 13 0 1 1 19.99 7 Z M6 5 L11 10 M29 30 L34 35',
  SUB: 'M4 21 L10 21 L14 11 L20 29 L25 10 L29 21 L36 21',
  SNARE: 'M8 12 L32 12 L32 28 L8 28 Z M12 9 L28 31 M28 9 L12 31',
  CLAP: 'M12 30 L8 24 Q6 20 9 18 Q11 17 14 21 L14 10 Q14 7 17 7 Q20 7 20 10 L20 15 L21 8 Q22 5 25 7 Q27 8 27 11 L27 17 Q29 14 31 16 Q33 17 32 21 L29 29 Q25 34 20 34 L17 34 Q14 34 12 30 Z',
  HAT: 'M5 20 Q20 11 35 20 Q20 27 5 20 Z M20 24 L20 32 M13 34 L27 34',
  OPEN: 'M5 17 Q20 6 35 17 M7 22 Q20 15 33 22 M20 24 L20 33',
  PERC: 'M9 13 Q20 5 31 13 L31 29 Q20 36 9 29 Z M9 13 Q20 22 31 13 M16 17 L16 31 M24 17 L24 31',
  RIM: 'M6 20 A14 10 0 1 0 34 20 A14 10 0 1 0 6 20 Z M9 20 L31 20 M20 9 L20 31',
  BELL: 'M20 7 L27 12 L27 24 L32 29 L8 29 L13 24 L13 12 Z M18 32 Q20 36 22 32',
  TOM: 'M10 12 Q20 8 30 12 L30 29 Q20 34 10 29 Z M10 12 Q20 18 30 12 M14 16 L14 28 M26 16 L26 28',
  RIDE: 'M20 5 L20 12 M20 28 L20 35 M5 20 L12 20 M28 20 L35 20 M9 9 L14 14 M26 26 L31 31 M31 9 L26 14 M14 26 L9 31 M20 12 A8 8 0 1 0 20 28 A8 8 0 1 0 20 12',
  ACID: 'M5 30 L13 12 L19 27 L26 11 L35 30 M5 34 L35 34',
  CRASH: 'M20 4 L20 13 M20 27 L20 36 M4 20 L13 20 M27 20 L36 20 M8 8 L15 15 M25 25 L32 32 M32 8 L25 15 M15 25 L8 32 M20 14 A6 6 0 1 0 20 26 A6 6 0 1 0 20 14',
};
const TONES = ['#FF4569', '#69E5D8', '#FFFFFF', '#6DE4C8',
  '#DBE9F7', '#B4C4D6', '#FE5E92', '#69E5D8'] as const;

export function PerformancePad({index, label, controls, enabled, onSelect}: Props) {
  const pressed = useSharedValue(0);
  const failed = useSharedValue(0);
  const tone = TONES[index];
  const symbol = useMemo(
    () => Skia.Path.MakeFromSVGString(ICON_PATHS[label] ?? ICON_PATHS.CRASH),
    [label],
  );
  const gesture = Gesture.Tap()
    .enabled(enabled)
    .maxDuration(30000)
    .onBegin(() => {
      // Snapshot the native audio step before crossing to RN JS. Scheduling
      // delays must never shift a recorded hit into the next grid cell.
      const step = controls.currentStep;
      pressed.value = 1;
      failed.value = controls.trigger(index, 1) ? 0 : 1;
      if (!failed.value) scheduleOnRN(onSelect, index, step);
    })
    .onFinalize(() => { pressed.value = withTiming(0, {duration: 90}); });
  const animated = useAnimatedStyle(() => ({
    transform: [{scale: 1 - pressed.value * 0.035}],
    backgroundColor: failed.value ? '#55242B' : pressed.value > 0.1 ? '#443021' : '#25231D',
  }));

  function accessibleTrigger() {
    const step = controls.currentStep;
    scheduleOnUI(() => {
      'worklet';
      failed.value = controls.trigger(index, 1) ? 0 : 1;
      pressed.value = 1;
      pressed.value = withTiming(0, {duration: 140});
    });
    onSelect(index, step);
  }

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${NAMES[label] ?? label}, пэд ${index + 1}`}
        accessibilityState={{disabled: !enabled}}
        onAccessibilityTap={enabled ? accessibleTrigger : undefined}
        style={[styles.pad, !enabled && styles.disabled, animated]}>
        <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
        <Canvas style={styles.iconCanvas} accessible={false}>
          {symbol && <Path path={symbol} color={tone} style="stroke" strokeWidth={2.25}
            strokeCap="round" strokeJoin="round" />}
        </Canvas>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.label}>{NAMES[label] ?? label}</Text>
        <View style={styles.track}><View style={styles.trackLead} /></View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pad: {width: '23.5%', minHeight: 112, borderRadius: 3, borderWidth: 1,
    borderColor: '#666157', borderBottomWidth: 4, borderBottomColor: '#F6D527',
    padding: 7, justifyContent: 'space-between', alignItems: 'center'},
  disabled: {opacity: 0.72},
  number: {color: '#B5BAD4', fontSize: 9, fontWeight: '800', alignSelf: 'flex-start'},
  iconCanvas: {width: 40, height: 40},
  label: {color: '#FFF', fontSize: 11, fontWeight: '900', textAlign: 'center'},
  track: {width: '100%', height: 5, borderRadius: 5, backgroundColor: '#45434B', overflow: 'hidden'},
  trackLead: {height: 5, width: '24%', backgroundColor: '#F2F3F4'},
});
