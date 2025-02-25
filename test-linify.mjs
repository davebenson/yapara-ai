
import {bufferArrayLinify} from './linify.mjs';
import assert from 'node:assert';
import test from 'node:test';

function mk_buffer(x) {
  if (Buffer.isBuffer(x))
    return x;
  else
    return Buffer.from(x);
}

function test_linify(input, expected_new_state, expected_output) {
  const buffers = input.map(mk_buffer);
  const next_buffers = expected_new_state.map(mk_buffer);
  const output = bufferArrayLinify(buffers);
  assert.deepEqual(buffers, next_buffers);
  assert.deepEqual(output, expected_output.map(mk_buffer));
}

test('simple one-line', (t) => {
  test_linify(["a\n"], [], ["a\n"]);
});
test('simple one-line with partial line', (t) => {
  test_linify(["a\nb"], ["b"], ["a\n"]);
});
test('simple one-line with newline in 2nd part, with partial', (t) => {
  test_linify(["abc", "\nb"], ["b"], ["abc\n"]);
});
test('simple one-line with newline in 2nd part', (t) => {
  test_linify(["abc", "\n"], [], ["abc\n"]);
});
test('multiple lines in one buffer', (t) => {
  test_linify(["abc\ndef\n"], [], ["abc\n", "def\n"]);
});

