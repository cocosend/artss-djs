import React, {useCallback, useMemo, useState} from 'react';
import {Dimensions, Pressable, StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {Canvas, Rect, vec, LinearGradient} from '@shopify/react-native-skia';
import NativeDJAudio from '../specs/NativeDJAudio';

const LABELS = ['KICK','SUB','CLAP','HAT','OPEN','PERC','ACID','HIT'] as const;
const WIDTH=Dimensions.get('window').width;
const ACCENT='#fd855b';

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
 const onHit=useCallback((index:number)=>{if(!playing)setPlaying(NativeDJAudio.start());NativeDJAudio.trigger(index,1);},[playing]);
 const toggle=useCallback(()=>{if(playing){NativeDJAudio.stop();setPlaying(false)}else{setPlaying(NativeDJAudio.start())}},[playing]);
 const setTempo=useCallback((value:number)=>{const next=Math.max(80,Math.min(175,value));NativeDJAudio.setTempo(next);setBpm(next)},[]);
 return <View style={styles.root}>
  <View style={styles.header}><Text style={styles.brand}>ARTSS <Text style={{color:ACCENT}}>CREATOR</Text></Text><Text style={styles.tag}>NATIVE TECHNO ENGINE</Text></View>
  <View style={styles.visual}><Canvas style={styles.canvas}><Rect x={0} y={0} width={WIDTH-34} height={88} rx={17}>
   <LinearGradient start={vec(0,0)} end={vec(WIDTH,88)} colors={['#27313c','#101820']}/>
  </Rect></Canvas><Text style={styles.visualText}>TECHNO AUTOMIX</Text></View>
  <View style={styles.transport}><Pressable style={styles.play} onPress={toggle}><Text style={styles.dark}>{playing?'■ STOP':'▶ PLAY'}</Text></Pressable>
   <Pressable style={styles.tempo} onPress={()=>setTempo(bpm+1)}><Text style={styles.light}>{bpm} BPM  +</Text></Pressable>
  </View>
  <View style={styles.grid}>{LABELS.map((_,i)=><Pad key={i} index={i} onHit={onHit}/>)}</View>
  <Text style={styles.caption}>AUDIO UNIT · NATIVE C++ · UI WORKLETS</Text>
 </View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#090c11',paddingTop:54,paddingHorizontal:13},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:15},brand:{fontSize:18,color:'white',fontWeight:'900',letterSpacing:1},tag:{fontSize:8,color:'#98a6b5',fontWeight:'800'},visual:{height:88,marginBottom:13,justifyContent:'center'},canvas:{position:'absolute',width:'100%',height:88},visualText:{fontSize:16,fontWeight:'900',color:'white',marginLeft:18,letterSpacing:2},transport:{flexDirection:'row',gap:9,marginBottom:12},play:{flex:1,height:52,borderRadius:12,backgroundColor:'#ef9270',justifyContent:'center',alignItems:'center'},tempo:{width:120,height:52,borderWidth:1,borderColor:'#51616c',borderRadius:12,justifyContent:'center',alignItems:'center'},dark:{color:'#151a20',fontWeight:'900'},light:{color:'#e6f0f6',fontWeight:'900'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},pad:{width:'23%',aspectRatio:1.05,borderWidth:1,borderColor:'#526071',borderBottomColor:ACCENT,borderBottomWidth:3,borderRadius:12,backgroundColor:'#1b2733',padding:8},hitArea:{flex:1,justifyContent:'space-between'},number:{fontSize:10,color:'#8397aa',fontWeight:'900'},padText:{color:'white',fontSize:12,fontWeight:'900'},caption:{fontSize:9,color:'#657888',marginTop:17,textAlign:'center',letterSpacing:2}});