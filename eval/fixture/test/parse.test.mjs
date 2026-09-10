import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, parseDuration, parseFlags } from '../src/parse.js';
import { slug } from '../src/format.js';

test('parseSize handles lowercase units', () => {
  assert.equal(parseSize('2 kb'), 2048);
});

test('parseSize handles uppercase units', () => {
  assert.equal(parseSize('2 KB'), 2048);
});

test('parseDuration converts minutes', () => {
  assert.equal(parseDuration('3m'), 180000);
});

test('parseFlags reads key=value', () => {
  assert.deepEqual(parseFlags(['--a=1', '--b']), { a: '1', b: 'true' });
});

test('slug strips punctuation', () => {
  assert.equal(slug('Hello, World!'), 'hello-world');
});
