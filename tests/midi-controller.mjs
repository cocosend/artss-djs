import assert from 'node:assert/strict';
import { createMidiController, decodeMidiNote, DEFAULT_PAD_NOTES } from '../midi-controller.js';

assert.deepEqual(decodeMidiNote([0x90, 36, 127]), { note: 36, velocity: 1 });
assert.equal(decodeMidiNote([0x80, 36, 127]), null);
assert.equal(decodeMidiNote([0x90, 36, 0]), null);
assert.equal(decodeMidiNote([0xb0, 36, 127]), null);
assert.equal(decodeMidiNote([0x91, 50, 64])?.note, 50);
assert.equal(decodeMidiNote([0x90, 128, 127]), null);

const db = new Map();
const store = {
  getItem: key => db.get(key) || null,
  setItem: (key, value) => db.set(key, value),
  removeItem: key => db.delete(key)
};
const input = { id: 'controller-1', state: 'connected', onmidimessage: null };
const access = { inputs: new Map([['controller-1', input]]), onstatechange: null };
const events = [], statuses = [];
let requests = 0;
const nav = { requestMIDIAccess: async ({ sysex }) => {
  assert.equal(sysex, false);
  requests++;
  return access;
}};
const controller = createMidiController({
  navigatorRef: nav, storageRef: store,
  onPad: (index, velocity) => events.push({ index, velocity }),
  onStatus: status => statuses.push(status)
});
assert.deepEqual(controller.getMap(), DEFAULT_PAD_NOTES);
assert.equal(controller.startLearn(), false);
assert.equal(await controller.connect(), true);
assert.equal(await controller.connect(), true);
assert.equal(requests, 1);
input.onmidimessage({ data: [0x90, 36, 127] });
assert.deepEqual(events[0], { index: 0, velocity: 1 });
assert.equal(controller.startLearn(), true);
for (let i = 0; i < 16; i++) {
  input.onmidimessage({ data: [0x90, 52 + i, 127] });
  if (i === 0) input.onmidimessage({ data: [0x90, 52, 127] });
}
assert.deepEqual(controller.getMap(), Array.from({ length: 16 }, (_, i) => i + 52));
assert.equal(statuses.at(-1).learning, false);
input.onmidimessage({ data: [0x90, 52, 64] });
assert.equal(events.at(-1).index, 0);
assert.equal(events.at(-1).velocity, 64 / 127);
assert.equal(createMidiController({ navigatorRef: nav, storageRef: store, onPad: () => {} }).getMap()[0], 52);
controller.resetMap();
assert.deepEqual(controller.getMap(), DEFAULT_PAD_NOTES);
input.state = 'disconnected';
access.onstatechange();
assert.equal(input.onmidimessage, null);
assert.equal(statuses.at(-1).connected, false);
const touch = createMidiController({ navigatorRef: {}, storageRef: store, onPad: () => {} });
assert.equal(touch.available, false);
assert.equal(await touch.connect(), false);
console.log('MIDI controller: 21 checks passed');
