import {parseFormat, evaluateFormat} from '../lib/format-string.mjs';
import assert from 'node:assert';
import test from 'node:test';

test('parseFormat - simple literal string', (t) => {
  const result = parseFormat('hello world');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0], 'hello world');
});

test('parseFormat - escaped percent', (t) => {
  const result = parseFormat('hello %% world');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0], 'hello % world');
});

test('parseFormat - single parameter', (t) => {
  const result = parseFormat('hello %a world');
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0], 'hello ');
  assert.strictEqual(typeof result[1], 'function');
  assert.strictEqual(result[2], ' world');
});

test('parseFormat - hex format lowercase', (t) => {
  const result = parseFormat('%xa');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(typeof result[0], 'function');
  const formatted = result[0]({a: 255});
  assert.strictEqual(formatted, 'ff');
});

test('parseFormat - hex format uppercase', (t) => {
  const result = parseFormat('%Xa');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(typeof result[0], 'function');
  const formatted = result[0]({a: 255});
  assert.strictEqual(formatted, 'FF');
});

test('parseFormat - octal format', (t) => {
  const result = parseFormat('%oa');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(typeof result[0], 'function');
  const formatted = result[0]({a: 64});
  assert.strictEqual(formatted, '100');
});

test('parseFormat - padded number with spaces', (t) => {
  const result = parseFormat('%5a');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(typeof result[0], 'function');
  const formatted = result[0]({a: 42});
  assert.strictEqual(formatted, '   42');
});

test('parseFormat - padded number with zeros', (t) => {
  const result = parseFormat('%05a');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(typeof result[0], 'function');
  const formatted = result[0]({a: 42});
  assert.strictEqual(formatted, '00042');
});

test('parseFormat - padded hex with zeros', (t) => {
  const result = parseFormat('%04xa');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(typeof result[0], 'function');
  const formatted = result[0]({a: 255});
  assert.strictEqual(formatted, '00ff');
});

test('parseFormat - multiple parameters', (t) => {
  const result = parseFormat('Value %a is %xb');
  assert.strictEqual(result.length, 4);
  assert.strictEqual(result[0], 'Value ');
  assert.strictEqual(typeof result[1], 'function');
  assert.strictEqual(result[2], ' is ');
  assert.strictEqual(typeof result[3], 'function');
});

test('parseFormat - complex format with padding and base conversion', (t) => {
  const result = parseFormat('Dec: %3a, Hex: %04Xb, Oct: %oc');
  assert.strictEqual(result.length, 6);
  assert.strictEqual(result[0], 'Dec: ');
  assert.strictEqual(typeof result[1], 'function');
  assert.strictEqual(result[2], ', Hex: ');
  assert.strictEqual(typeof result[3], 'function');
  assert.strictEqual(result[4], ', Oct: ');
  assert.strictEqual(typeof result[5], 'function');
});

test('evaluateFormat - simple literal', (t) => {
  const parsed = parseFormat('hello world');
  const result = evaluateFormat(parsed, {});
  assert.strictEqual(result, 'hello world');
});

test('evaluateFormat - single parameter', (t) => {
  const parsed = parseFormat('hello %a world');
  const result = evaluateFormat(parsed, {a: 'beautiful'});
  assert.strictEqual(result, 'hello beautiful world');
});

test('evaluateFormat - multiple parameters with formatting', (t) => {
  const parsed = parseFormat('Value: %a, Hex: %xb, Padded: %05c');
  const result = evaluateFormat(parsed, {a: 42, b: 255, c: 7});
  assert.strictEqual(result, 'Value: 42, Hex: ff, Padded: 00007');
});

test('evaluateFormat - complex example with all formats', (t) => {
  const parsed = parseFormat('Dec: %3a, Hex: %04Xb, Oct: %oc, Literal: %%');
  const result = evaluateFormat(parsed, {a: 42, b: 255, c: 64});
  assert.strictEqual(result, 'Dec:  42, Hex: 00FF, Oct: 100, Literal: %');
});

test('evaluateFormat - string parameters', (t) => {
  const parsed = parseFormat('Name: %a, Value: %5b');
  const result = evaluateFormat(parsed, {a: 'test', b: 'value'});
  assert.strictEqual(result, 'Name: test, Value: value');
});

test('parseFormat - empty format string', (t) => {
  const result = parseFormat('');
  assert.strictEqual(result.length, 0);
});

test('parseFormat - only percent signs', (t) => {
  const result = parseFormat('%%%%');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0], '%%');
});

test('evaluateFormat - empty format', (t) => {
  const parsed = parseFormat('');
  const result = evaluateFormat(parsed, {});
  assert.strictEqual(result, '');
});
