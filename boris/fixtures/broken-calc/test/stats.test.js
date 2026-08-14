import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, median, range } from '../src/stats.js';

test('mean averages the samples', () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(mean([]), 0);
});

test('median of an odd number of samples is the middle value', () => {
  assert.equal(median([3, 1, 2]), 2);
});

test('median of an even number of samples averages the two middle values', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([10, 20]), 15);
});

test('range is the spread between the extremes', () => {
  assert.equal(range([4, 9, 1]), 8);
  assert.equal(range([]), 0);
});
