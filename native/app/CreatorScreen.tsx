import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Dimensions, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {Canvas, Rect, vec, LinearGradient} from '@shopify/react-native-skia';
import NativeDJAudio from '../specs/NativeDJAudio';

const LABELS = ['KICK','SUB','CLAP','HAT','OPEN','PERC','ACID','HIT'] as const;
const WIDTH=Dimensions.get('window').width;
const ACCENT='#f1d247';
const DEFAULT_PATTERN=Array.from({length:8},(_,pad)=>Array.from({length:16},(_,step)=>
 pad===0&&step%4===0?1:pad===2&&(step===4||step===12)?.8:pad===3&&step%2===0?.42:0));

const Pad=React.memo(({index,onHit}:{index:number;onHit:(pad:number)=>void})=>{
 const pressed=useSharedValue(0);
 const gesture=useMemo(()=>Gesture.Tap().onBegin(()=>{pressed.value=withTiming(1,{duration:35});})
 .onEnd(()=>{pressed.value=withTiming(0,{duration:95});})
 .onFinalize(()=>{pressed.value=withTiming(0,{duration:95});})
 .runOnJS(false),[pressed]);
 const style=useAnimatedStyle(()=>({transform:[{scale:1-pressed.value*.045}],opacity:1-pressed.value*.12}));
 return <GestureDetector gesture={gesture}><Animated.View style={[styles.pad,style]}>
  <Pressable style={styles.hitArea} onPressIn={()=>onHit(index)} accessibilityRole="button" accessibilityLabel={`Play ${LABELS[index]}`}>
   <Text style={styles.number}>{String(index+1).padStart(2,'0')}</Text><Text style={styles.padText}>{LABELS[index]}</Text>
  </Pressable></Animated.View></GestureDetector>;
});

/** Fabric + UI-thread Reanimated gestures and GPU Skia drawing. Audio DSP never touches JS render. */
export function CreatorScreen():React.ReactElement {
 const [playing,setPlaying]=useState(false);
 const [bpm,setBpm]=useState(136);
 const [pattern,setPattern]=useState(DEFAULT_PATTERN);
 const [step,setCurrentStep]=useState(0);
 const [meter,setMeter]=useState(0);
 const [eq,setEq]=useState<[number,number,number]>([0,0,0]);
 const [cross,setCross]=useState(.5);
 useEffect(()=>{
  for(let pad=0;pad<8;pad++)for(let at=0;at<16;at++)NativeDJAudio.setStep(pad,at,DEFAULT_PATTERN[pad]![at]!);
  NativeDJAudio.setTempo(136);
  return ()=>NativeDJAudio.stop();
 },[]);
 useEffect(()=>{
  if(!playing){setCurrentStep(0);setMeter(0);return;}
  const timer=setInterval(()=>{setCurrentStep(NativeDJAudio.getCurrentStep());setMeter(NativeDJAudio.getMeter());},50);
  return ()=>clearInterval(timer);
 },[playing]);
 const onHit=useCallback((index:number)=>{
  if(!playing){if(!NativeDJAudio.start())return;setPlaying(true)}
  NativeDJAudio.trigger(index,1);
 },[playing]);
 const toggle=useCallback(()=>{if(playing){NativeDJAudio.stop();setPlaying(false)}else{setPlaying(NativeDJAudio.start())}},[playing]);
 const setTempo=useCallback((value:number)=>{const next=Math.max(80,Math.min(175,value));NativeDJAudio.setTempo(next);setBpm(next)},[]);
 const toggleStep=useCallback((pad:number,at:number)=>{
  setPattern(old=>{
   const next=old.map(row=>[...row]);next[pad]![at]=next[pad]![at]?0:pad===0?1:.65;
   NativeDJAudio.setStep(pad,at,next[pad]![at]!);return next;
  });
 },[]);
 const changeEq=useCallback((band:number,delta:number)=>{
  setEq(old=>{const next:[number,number,number]=[...old];next[band]=Math.max(-12,Math.min(12,next[band]!+delta));NativeDJAudio.setEQ(...next);return next});
 },[]);
 const changeCross=useCallback((delta:number)=>{
  setCross(old=>{const next=Math.max(0,Math.min(1,Math.round((old+delta)*20)/20));NativeDJAudio.setCrossfader(next);return next});
 },[]);
 return <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="always">
  <View style={styles.header}><Text style={styles.brand}>ARTSS <Text style={{color:ACCENT}}>CREATOR</Text></Text><Text style={styles.tag}>NATIVE TECHNO ENGINE</Text></View>
  <View style={styles.visual}><Canvas style={styles.canvas}><Rect x={0} y={0} width={WIDTH-34} height={88} rx={17}>
   <LinearGradient start={vec(0,0)} end={vec(WIDTH,88)} colors={['#27313c','#101820']}/>
  </Rect></Canvas><Text style={styles.visualText}>NATIVE AUDIO · {Math.round(meter*100)}%</Text><View style={styles.meterTrack}><View style={[styles.meterFill,{width:`${Math.round(meter*100)}%` as `${number}%`}]}/></View></View>
  <View style={styles.transport}><Pressable style={styles.play} onPress={toggle}><Text style={styles.dark}>{playing?'■ STOP':'▶ PLAY'}</Text></Pressable>
   <Pressable style={styles.tempo} onPress={()=>setTempo(bpm-1)} accessibilityLabel="Decrease BPM"><Text style={styles.light}>−</Text></Pressable>
   <Text style={styles.bpm}>{bpm} BPM</Text>
   <Pressable style={styles.tempo} onPress={()=>setTempo(bpm+1)} accessibilityLabel="Increase BPM"><Text style={styles.light}>＋</Text></Pressable>
  </View>
  <View style={styles.grid}>{LABELS.map((_,i)=><Pad key={i} index={i} onHit={onHit}/>)}</View>
  <Text style={styles.sectionLabel}>16-STEP SEQUENCER · 4 LANES</Text>
  <View style={styles.sequence}>{[0,2,3,6].map(pad=><View style={styles.seqRow} key={pad}>
   <Text style={styles.lane}>{LABELS[pad]}</Text>{pattern[pad]!.map((value,at)=><Pressable key={at} accessibilityRole="button" accessibilityLabel={`${LABELS[pad]} step ${at+1}`} accessibilityState={{selected:value>0}} onPress={()=>toggleStep(pad,at)} style={[styles.step,value>0&&styles.stepOn,playing&&step===at&&styles.stepPlaying]}/>)}
  </View>)}</View>
  <Text style={styles.sectionLabel}>MIX · EQ · A/B</Text>
  <View style={styles.mixer}>{(['LOW','MID','HIGH'] as const).map((name,index)=><View style={styles.eq} key={name}>
   <Text style={styles.eqLabel}>{name} {eq[index]!>0?'+':''}{eq[index]} dB</Text><View style={styles.eqControls}>
    <Pressable accessibilityLabel={`Decrease ${name}`} onPress={()=>changeEq(index,-1)} style={styles.eqButton}><Text style={styles.light}>−</Text></Pressable>
    <Pressable accessibilityLabel={`Increase ${name}`} onPress={()=>changeEq(index,1)} style={styles.eqButton}><Text style={styles.light}>＋</Text></Pressable>
   </View></View>)}</View>
  <View style={styles.cross}><Pressable accessibilityLabel="Mix towards A" onPress={()=>changeCross(-.05)} style={styles.eqButton}><Text style={styles.light}>A</Text></Pressable>
   <View style={styles.crossTrack}><View style={[styles.crossThumb,{left:`${Math.round(cross*88)}%` as `${number}%`}]}/></View>
   <Pressable accessibilityLabel="Mix towards B" onPress={()=>changeCross(.05)} style={styles.eqButton}><Text style={styles.light}>B</Text></Pressable></View>
  <Text style={styles.caption}>AUDIO UNIT · NATIVE C++ · UI WORKLETS</Text>
 </ScrollView>;
}
const styles=StyleSheet.create({
 root:{flexGrow:1,backgroundColor:'#090c11',paddingTop:54,paddingHorizontal:13,paddingBottom:32},
 header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:15},
 brand:{fontSize:18,color:'white',fontWeight:'900',letterSpacing:1},tag:{fontSize:8,color:'#98a6b5',fontWeight:'800'},
 visual:{height:88,marginBottom:13,justifyContent:'center'},canvas:{position:'absolute',width:'100%',height:88},
 visualText:{fontSize:16,fontWeight:'900',color:'white',marginLeft:18,letterSpacing:2},
 meterTrack:{height:5,marginHorizontal:18,marginTop:12,backgroundColor:'#1b242c',borderRadius:3,overflow:'hidden'},
 meterFill:{height:5,backgroundColor:'#f1d247'},
 transport:{flexDirection:'row',alignItems:'center',gap:9,marginBottom:12},
 play:{flex:1,height:52,borderRadius:12,backgroundColor:'#f1d247',justifyContent:'center',alignItems:'center'},
 tempo:{width:40,height:52,borderWidth:1,borderColor:'#51616c',borderRadius:9,justifyContent:'center',alignItems:'center'},
 bpm:{color:'white',fontWeight:'900',fontSize:14,minWidth:72,textAlign:'center'},
 dark:{color:'#151a20',fontWeight:'900'},light:{color:'#e6f0f6',fontWeight:'900'},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},
 pad:{width:'23%',aspectRatio:1.05,borderWidth:1,borderColor:'#526071',borderBottomColor:ACCENT,borderBottomWidth:3,borderRadius:12,backgroundColor:'#1b2733',padding:8},
 hitArea:{flex:1,justifyContent:'space-between'},number:{fontSize:10,color:'#8397aa',fontWeight:'900'},padText:{color:'white',fontSize:12,fontWeight:'900'},
 sectionLabel:{color:'#f1d247',fontSize:11,letterSpacing:1.5,fontWeight:'900',marginTop:20,marginBottom:8},
 sequence:{paddingVertical:9,paddingHorizontal:5,borderColor:'#51616c',borderWidth:1,borderRadius:9,gap:5},
 seqRow:{flexDirection:'row',alignItems:'center',gap:2},lane:{width:45,color:'#f1f5f7',fontSize:8,fontWeight:'900'},
 step:{flex:1,height:24,minWidth:8,backgroundColor:'#202934',borderRadius:3,borderWidth:1,borderColor:'#33414e'},
 stepOn:{backgroundColor:'#f1d247',borderColor:'#fff0a8'},stepPlaying:{borderColor:'#ff584a',borderWidth:2},
 mixer:{flexDirection:'row',gap:5},eq:{flex:1,alignItems:'center',padding:6,borderColor:'#42515e',borderWidth:1,borderRadius:8},
 eqLabel:{color:'white',fontSize:9,fontWeight:'900'},eqControls:{flexDirection:'row',gap:12,marginTop:6},
 eqButton:{minWidth:38,minHeight:36,justifyContent:'center',alignItems:'center',backgroundColor:'#26323e',borderRadius:6},
 cross:{marginTop:11,flexDirection:'row',alignItems:'center',gap:9},
 crossTrack:{height:8,flex:1,backgroundColor:'#1b2730',borderRadius:4},
 crossThumb:{height:22,width:25,backgroundColor:'#f1d247',borderRadius:5,position:'absolute',top:-7},
 caption:{fontSize:9,color:'#657888',marginTop:17,textAlign:'center',letterSpacing:2}
});
