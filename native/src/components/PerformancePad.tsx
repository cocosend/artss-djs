import {Text, StyleSheet, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {scheduleOnRN, scheduleOnUI} from 'react-native-worklets';
import type {PadIndex, RealtimeControls} from 'react-native-artss-audio';

interface Props {
  index: PadIndex;
  label: string;
  controls: RealtimeControls;
  enabled: boolean;
  onSelect: (index: PadIndex) => void;
}

const NAMES: Record<string, string> = {
  KICK: 'БОЧКА', SUB: 'САБ', SNARE: 'СНЭР', CLAP: 'ХЛОПОК',
  HAT: 'ХЭТ', OPEN: 'ОТКР. ХЭТ', PERC: 'ПЕРК', RIM: 'РИМ',
  BELL: 'КОЛОКОЛ', TOM: 'ТОМ', RIDE: 'РАЙД', ACID: 'ЭЙСИД',
  CRASH: 'УДАР',
};
const ICONS: Record<string, string> = {
  KICK: '◉', SUB: '∿', SNARE: '⊕', CLAP: '✋',
  HAT: '⌁', OPEN: '⌢', PERC: '▥', RIM: '◎',
  BELL: '◇', TOM: '◌', RIDE: '✳', ACID: '⌁',
  CRASH: '✳',
};
const TONES = ['#FF4569', '#69E5D8', '#FFFFFF', '#6DE4C8',
  '#DBE9F7', '#B4C4D6', '#FE5E92', '#69E5D8'] as const;

export function PerformancePad({index, label, controls, enabled, onSelect}: Props) {
  const pressed = useSharedValue(0);
  const failed = useSharedValue(0);
  const tone = TONES[index];
  const gesture = Gesture.Tap()
    .enabled(enabled)
    .maxDuration(30000)
    .onBegin(() => {
      // UI worklet invokes C++ JSI; the audio callback never crosses React Native JS.
      pressed.value = 1;
      failed.value = controls.trigger(index, 1) ? 0 : 1;
      scheduleOnRN(onSelect, index);
    })
    .onFinalize(() => { pressed.value = withTiming(0, {duration: 90}); });
  const animated = useAnimatedStyle(() => ({
    transform: [{scale: 1 - pressed.value * 0.035}],
    backgroundColor: failed.value ? '#55242B' : pressed.value > 0.1 ? '#443021' : '#25231D',
  }));

  function accessibleTrigger() {
    onSelect(index);
    scheduleOnUI(() => {
      'worklet';
      failed.value = controls.trigger(index, 1) ? 0 : 1;
      pressed.value = 1;
      pressed.value = withTiming(0, {duration: 140});
    });
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
        <Text style={[styles.glyph, {color: tone}]}>{ICONS[label] ?? '✳'}</Text>
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
  disabled: {opacity: 0.43},
  number: {color: '#B5BAD4', fontSize: 9, fontWeight: '800', alignSelf: 'flex-start'},
  glyph: {fontSize: 29, lineHeight: 33, textAlign: 'center'},
  label: {color: '#FFF', fontSize: 11, fontWeight: '900', textAlign: 'center'},
  track: {width: '100%', height: 5, borderRadius: 5, backgroundColor: '#45434B', overflow: 'hidden'},
  trackLead: {height: 5, width: '24%', backgroundColor: '#F2F3F4'},
});
