import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';
export interface Spec extends TurboModule {
 start(): boolean;
 stop(): void;
 trigger(pad:number,velocity:number):boolean;
 setMaster(level:number):void;
 setFilter(position:number):void;
 setTempo(bpm:number):void;
 setCrossfader(position:number):void;
 setEQ(low:number,mid:number,high:number):void;
 setStep(pad:number,step:number,velocity:number):boolean;
 clearPattern():void;
 getCurrentStep():number;
 getMeter():number;
}
export default TurboModuleRegistry.getEnforcing<Spec>('NativeDJAudio');
