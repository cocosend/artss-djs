/**
 * Progressive MIDI input for 16-pad beatmaking.
 * No vendor-specific SLAB note map is assumed: users can learn any 16 note pads.
 * iOS Safari keeps the existing touch-first audio workflow.
 */
export const DEFAULT_PAD_NOTES = Object.freeze(Array.from({ length: 16 }, (_, i) => 36 + i));
const STORAGE_KEY = 'artss-djs-midi-pad-map-v1';

export function decodeMidiNote(data) {
  if (!data || data.length < 3 || (data[0] & 0xf0) !== 0x90) return null;
  const note = Number(data[1]);
  const velocity = Number(data[2]);
  if (!Number.isInteger(note) || note < 0 || note > 127 ||
      !Number.isInteger(velocity) || velocity <= 0 || velocity > 127) return null;
  return { note, velocity: velocity / 127 };
}

function isValidMap(value) {
  return Array.isArray(value) && value.length === 16 &&
    new Set(value).size === 16 &&
    value.every(n => Number.isInteger(n) && n >= 0 && n <= 127);
}

export function createMidiController({
  navigatorRef = globalThis.navigator,
  storageRef = globalThis.localStorage,
  onPad,
  onStatus = () => {}
}) {
  if (typeof onPad !== 'function') throw new TypeError('onPad callback is required');
  const available = typeof navigatorRef?.requestMIDIAccess === 'function';
  let notes = [...DEFAULT_PAD_NOTES];
  try {
    const saved = JSON.parse(storageRef?.getItem(STORAGE_KEY) || 'null');
    if (isValidMap(saved)) notes = saved;
  } catch {}
  let access = null;
  let connecting = null;
  let learning = null;
  const attached = new Set();

  function report(message) {
    onStatus({ message, available, connected: attached.size > 0, learning: learning !== null });
  }

  function onMessage(event) {
    const message = decodeMidiNote(event?.data);
    if (!message) return;
    if (learning) {
      if (learning.includes(message.note)) return;
      learning.push(message.note);
      if (learning.length === 16) {
        notes = learning.slice();
        learning = null;
        try { storageRef?.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch {}
        report('MIDI: 16 PADS MAPPED · READY');
      } else {
        report('MIDI LEARN: ' + learning.length + '/16 · PRESS NEXT PAD');
      }
      return;
    }
    const index = notes.indexOf(message.note);
    if (index !== -1) onPad(index, message.velocity);
  }

  function bindInputs() {
    if (!access) return;
    for (const old of attached) {
      if (!Array.from(access.inputs.values()).includes(old) || old.state !== 'connected') {
        if (old.onmidimessage === onMessage) old.onmidimessage = null;
        attached.delete(old);
      }
    }
    for (const input of access.inputs.values()) {
      if (input.state !== 'connected') continue;
      input.onmidimessage = onMessage;
      attached.add(input);
    }
    report(attached.size ? 'MIDI CONNECTED · ' + attached.size + ' INPUT' + (attached.size === 1 ? '' : 'S') : 'MIDI: CONNECT CONTROLLER');
  }

  async function connect() {
    if (!available) {
      report('MIDI: TOUCH MODE · WEB MIDI UNAVAILABLE');
      return false;
    }
    if (access) { bindInputs(); return true; }
    if (connecting) return connecting;
    connecting = (async () => {
      try {
        const next = await navigatorRef.requestMIDIAccess({ sysex: false });
        access = next;
        access.onstatechange = bindInputs;
        bindInputs();
        return true;
      } catch {
        report('MIDI: CONNECTION BLOCKED · CHECK PERMISSIONS');
        return false;
      } finally {
        connecting = null;
      }
    })();
    return connecting;
  }

  function startLearn() {
    if (attached.size === 0) {
      report('MIDI: CONNECT A CONTROLLER FIRST');
      return false;
    }
    learning = [];
    report('MIDI LEARN: 0/16 · PRESS PAD 1');
    return true;
  }

  function resetMap() {
    learning = null;
    notes = [...DEFAULT_PAD_NOTES];
    try { storageRef?.removeItem(STORAGE_KEY); } catch {}
    report('MIDI: DEFAULT NOTES RESTORED (36–51)');
  }

  report(available ? 'MIDI: CONNECT FOR HARDWARE PADS' : 'MIDI: TOUCH MODE · IOS / SAFARI');
  return { available, connect, startLearn, resetMap, getMap: () => notes.slice() };
}
