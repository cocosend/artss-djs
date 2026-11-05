/**
 * ARTSS DJS / NEXUS 34: editable, original grooves adapted from
 * cocosend/stripewolf-wave-base44/src/DemoPicker.tsx and recovered.js.
 * These are synthesis patterns, NOT recordings by the named artists.
 * A groove selects an existing native 303/606/909 PCM kit and provides
 * sixteen 16th-note velocities for each of eight pads.
 */
export type WolfStyle = 'maddix' | 'artbat' | 'brejcha' | 'guetta' | 'kazantip' | 'legends' | 'modern';
export type NativeKit = 1 | 2 | 3;

export const WOLF_STYLES: ReadonlyArray<{
  key: WolfStyle; name: string; genre: string; bpm: number;
}> = [
  {key: 'maddix', name: 'Maddix', genre: 'PEAK TECHNO', bpm: 148},
  {key: 'artbat', name: 'ARTBAT', genre: 'MELODIC TECHNO', bpm: 124},
  {key: 'brejcha', name: 'Brejcha', genre: 'HIGH-TECH MINIMAL', bpm: 128},
  {key: 'guetta', name: 'Guetta', genre: 'FUTURE RAVE', bpm: 130},
  {key: 'kazantip', name: 'Kazantip', genre: 'ACID RAVE', bpm: 132},
  {key: 'legends', name: 'Legends', genre: '303 ACID', bpm: 142},
  {key: 'modern', name: 'Modern', genre: 'INDUSTRIAL', bpm: 150},
];

export type WolfGroove = Readonly<{
  id: string;
  title: string;
  style: WolfStyle;
  bpm: number;
  kit: NativeKit;
  flavor: 'retro' | 'sunrise' | 'night' | 'warehouse' | 'industrial' | 'peak' | 'orbital' | 'rubber' | 'neon';
}>;

export const WOLF_GROOVES: ReadonlyArray<WolfGroove> = [
  {id: 'retro', title: 'KAZANTIP · RETRO COAST', style: 'kazantip', bpm: 132, kit: 1, flavor: 'retro'},
  {id: 'sunrise', title: 'KAZANTIP · SUNRISE 303', style: 'kazantip', bpm: 138, kit: 1, flavor: 'sunrise'},
  {id: 'night', title: 'ACID · NIGHT CIRCUIT', style: 'legends', bpm: 142, kit: 1, flavor: 'night'},
  {id: 'warehouse', title: '303 · BLACK SEA', style: 'legends', bpm: 146, kit: 1, flavor: 'warehouse'},
  {id: 'industrial', title: 'MODERN · MIDNIGHT', style: 'modern', bpm: 150, kit: 3, flavor: 'industrial'},
  {id: 'peak', title: 'MADDIX · RUMBLE 909', style: 'maddix', bpm: 148, kit: 3, flavor: 'peak'},
  {id: 'orbital', title: 'ARTBAT · ORBITAL DAWN', style: 'artbat', bpm: 124, kit: 1, flavor: 'orbital'},
  {id: 'rubber', title: 'BREJCHA · RUBBER BASS', style: 'brejcha', bpm: 128, kit: 2, flavor: 'rubber'},
  {id: 'neon', title: 'GUETTA · NEON DRIVE', style: 'guetta', bpm: 130, kit: 3, flavor: 'neon'},
];

export function buildWolfPattern(index: number): number[][] {
  const groove = WOLF_GROOVES[index];
  if (!groove) throw new RangeError('Unknown Stripewolf groove');
  const grid = Array.from({length: 8}, () => Array<number>(16).fill(0));
  const put = (pad: number, steps: readonly number[], volume: number) => {
    for (const step of steps) grid[pad]![step] = Math.max(0, Math.min(1, volume));
  };
  // Source SynthGroove: 4-on-the-floor kick, clap at 4/12, offbeat hats
  // at 2/6/10/14, lighter 7/15, acid accent sequence 0/4/9/12/15.
  put(0, [0, 4, 8, 12], groove.style === 'artbat' ? 0.8 : 1);
  put(2, [4, 12], groove.style === 'brejcha' ? 0.58 : 0.79);
  put(3, [2, 6, 10, 14], groove.style === 'modern' ? 0.75 : 0.52);
  put(3, [7, 15], 0.28);
  put(4, [7, 15], groove.style === 'artbat' ? 0.30 : 0.52);

  switch (groove.style) {
    case 'maddix': // 909 kick + metallic drive
      put(1, [4, 12], 0.55);
      put(5, [3, 11], 0.25);
      put(6, [14], 0.34);
      break;
    case 'artbat': // airy sub and spacious percussion
      put(1, [0, 8, 10], 0.57);
      put(5, [3, 11], 0.29);
      break;
    case 'brejcha': // clicky minimal 606 / cowbell
      put(1, [4, 12], 0.42);
      put(5, [3, 11, 15], 0.47);
      put(6, [6, 14], 0.29);
      break;
    case 'guetta': // future-rave 909 response
      put(1, [4, 12], 0.72);
      put(5, [7, 15], 0.37);
      put(6, [14], 0.25);
      break;
    case 'kazantip': // actual native 303 acid and sub one-shot voices
      put(1, [0, 10], 0.67);
      put(5, [3, 11], 0.35);
      put(6, [0, 4, 9, 12], 0.76);
      put(7, [15], 0.23);
      break;
    case 'legends': // 303 line, no invented original-artist recording
      put(5, [7, 15], 0.42);
      put(6, [0, 3, 4, 9, 12, 15], 0.86);
      break;
    case 'modern': // hard 909 + 303
      put(1, [4, 12], 0.81);
      put(5, [3, 7, 11, 15], 0.49);
      put(6, [6, 14], 0.52);
      put(7, [0, 6, 10, 14], 0.75);
      break;
  }
  // Original demo variations differ in density and accent, never randomize
  // while changing banks: the stored project is deterministic and editable.
  switch (groove.flavor) {
    case 'sunrise':
      put(6, [2, 6, 10, 14], 0.67);
      put(4, [3, 7, 11, 15], 0.47);
      break;
    case 'warehouse':
      put(6, [1, 5, 7, 11, 13], 0.62);
      put(0, [14], 0.43);
      break;
    case 'night':
      put(6, [8, 10], 0.68);
      break;
    case 'industrial':
      put(0, [14], 0.78);
      put(7, [3, 11], 0.42);
      break;
    case 'peak':
      put(0, [15], 0.30);
      put(3, [1, 5, 9, 13], 0.23);
      break;
    case 'orbital':
      put(1, [14], 0.30);
      break;
    case 'rubber':
      put(5, [5, 13], 0.30);
      break;
    case 'neon':
      put(4, [3, 11], 0.40);
      break;
    case 'retro':
      break;
  }
  return grid;
}
