declare const currentTime:number;
declare abstract class AudioWorkletProcessor {readonly port:MessagePort;constructor(options?:unknown);abstract process(inputs:Float32Array[][],outputs:Float32Array[][],parameters:Record<string,Float32Array>):boolean;}
declare function registerProcessor(name:string,processorCtor:new()=>AudioWorkletProcessor):void;
class Pulse extends AudioWorkletProcessor {
 private frames=0;private active=false;
 constructor(){super();this.port.onmessage=event=>{this.active=event.data==='start';this.frames=0};}
 process():boolean{
  if(!this.active)return true;
  this.frames+=128;if(this.frames>=2048){this.frames=0;this.port.postMessage(currentTime)}
  return true;
 }
}
registerProcessor('artss-pulse',Pulse);