import test from 'node:test';
import assert from 'node:assert/strict';
import {WOLF_GROOVES, WOLF_STYLES, buildWolfPattern} from '../src/audio/stripewolfGrooves.ts';

test('nine original editable Stripewolf grooves and seven sound styles', () => {
  assert.equal(WOLF_GROOVES.length, 9);
  assert.equal(WOLF_STYLES.length, 7);
  assert.equal(new Set(WOLF_STYLES.map(style => style.key)).size, 7);
  assert.equal(new Set(WOLF_GROOVES.map(groove => groove.id)).size, 9);
  const styleIds = new Set(WOLF_STYLES.map(style => style.key));
  for (const [index, groove] of WOLF_GROOVES.entries()) {
    assert.ok(styleIds.has(groove.style), groove.id);
    assert.ok(groove.bpm >= 60 && groove.bpm <= 200);
    assert.ok([1, 2, 3].includes(groove.kit));
    const pattern = buildWolfPattern(index);
    assert.equal(pattern.length, 8);
    for (const lane of pattern) {
      assert.equal(lane.length, 16);
      for (const velocity of lane) assert.ok(Number.isFinite(velocity) && velocity >= 0 && velocity <= 1);
    }
    assert.ok([0, 4, 8, 12].every(step => pattern[0][step] > 0), groove.id);
    assert.ok(pattern.some((lane, pad) => pad !== 0 && lane.some(velocity => velocity > 0)), groove.id);
  }
});

test('every groove is a distinct reproducible 16-step source pattern', () => {
  const patterns = WOLF_GROOVES.map((_, index) => buildWolfPattern(index));
  assert.equal(new Set(patterns.map(pattern => JSON.stringify(pattern))).size, 9);
  assert.deepEqual(buildWolfPattern(0), buildWolfPattern(0));
  const editable = buildWolfPattern(0);
  editable[0][0] = 0;
  assert.equal(buildWolfPattern(0)[0][0], 1, 'the original must not be mutated');
  assert.throws(() => buildWolfPattern(-1), RangeError);
  assert.throws(() => buildWolfPattern(9), RangeError);
});
