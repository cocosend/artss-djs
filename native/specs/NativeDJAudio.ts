import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';
export interface Spec extends TurboModule {
 start(): boolean;
 stop(): void;
 trigger(pad:number,velocity:number):boolean;
 setMaster(level:number):void;
 setFilter(position:number):void;
 setTempo(bpm:number):void;
 getMeter():number;
}
export default TurboModuleRegistry.getEnforcing<Spec>('NativeDJAudio');