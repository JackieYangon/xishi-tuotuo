const { loadModule } = require('./vue-harness.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { progress, countdown } = loadModule(require('node:path').join(__dirname, '../src/utils/presentation.js'));

test('wedding progress is based on completed tasks with a defined empty state', () => {
  assert.deepEqual(progress([]), { total: 0, done: 0, percent: 0 });
  assert.deepEqual(progress([{ done: true }, { done: false }, { done: true }]), { total: 3, done: 2, percent: 67 });
  assert.equal(progress([{ done: true }]).percent, 100);
});

test('countdown uses calendar days across month and leap-year boundaries', () => {
  const today = new Date(2028, 1, 28, 23, 59);
  assert.equal(countdown('2028-03-01', today), 2);
  assert.equal(countdown('2028-02-28', today), 0);
  assert.equal(countdown('2028-02-27', today), -1);
  assert.equal(countdown('', today), null);
});
