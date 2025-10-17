
import {Buffer} from 'node:buffer';

const NEWLINE = 10;

// Invariant:  only the last element may including a newline.
// Array must not be empty on input, may be empty on output.
//
// Modifies bufArray to swallow lines, full lines are returned as
// an array of buffers, each element (a line) is newline-terminated.
export function bufferArrayLinify(bufArray) {
  const last = bufArray[bufArray.length - 1];
  let nl = last.indexOf(NEWLINE);
  if (nl < 0)
    return [];

  // First line swallows all data.
  if (nl === last.length - 1) {
    const rv = bufArray.length === 1
             ? [last]
             : [Buffer.concat(bufArray)];
    bufArray.splice(0, bufArray.length);
    return rv;
  }

  // First line has stuff after it.
  const rv = [];
  if (bufArray.length === 1) {
    rv.push(last.slice(0, nl+1));
  } else {
    rv.push(Buffer.concat(bufArray.slice(0, bufArray.length - 1).concat([last.slice(0, nl+1)])));
  }
  let at = nl + 1;

  // Subsequent lines (all from 'last').
  while (at < last.length) {
    nl = last.indexOf(NEWLINE, at);
    if (nl < 0)
      break;
    rv.push(last.subarray(at, nl + 1));
    at = nl + 1;
  }
  if (at === last.length) {
    bufArray.splice(0, bufArray.length);
  } else {
    bufArray.splice(0, bufArray.length, last.slice(at));
  }
  return rv;
}
  
