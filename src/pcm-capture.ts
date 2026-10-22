/** Capture stereo PCM on the audio rendering thread, without MediaStream or ScriptProcessor. */
declare abstract class AudioWorkletProcessor {
 readonly port:MessagePort;
 abstract process(inputs:Float32Array[][],outputs:Float32Array[][],parameters:Record<string,Float32Array>):boolean;
}
declare function registerProcessor(name:string,processorCtor:new()=>AudioWorkletProcessor):void;
class PcmCapture extends AudioWorkletProcessor {
 private samples=new Float32Array(4096);private offset=0;
 constructor(){super();this.port.onmessage=e=>{
  if(e.data!=='flush')return;
  if(this.offset){const tail=this.samples.slice(0,this.offset);this.samples=new Float32Array(4096);this.offset=0;this.port.postMessage(tail.buffer,[tail.buffer]);}
  this.port.postMessage('flushed');
 };}
 process(inputs:Float32Array[][]):boolean {
  const channels=inputs[0],left=channels?.[0];if(!left)return true;
  const right=channels?.[1]??left;
  for(let i=0;i<left.length;i++){
   this.samples[this.offset++]=left[i]??0;
   this.samples[this.offset++]=right[i]??0;
   if(this.offset===this.samples.length){
    const chunk=this.samples;
    this.samples=new Float32Array(4096);this.offset=0;
    this.port.postMessage(chunk.buffer,[chunk.buffer]);
   }
  }
  return true;
 }
}
registerProcessor('artss-pcm-capture',PcmCapture);

export {};
