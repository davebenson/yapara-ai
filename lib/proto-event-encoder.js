//
// Depdendency-free encoding of the Event structure
// defined in binary-data.proto

const WIRE_TYPE_INT32 = ...;
const WIRE_TYPE_INT64 = ...;
const WIRE_TYPE_STRING = ...;
const WIRE_TYPE_BINARY = ...;

function varuintEncode(i) {
  if (i < 128) { // 2**7
    return Buffer.of([i]);
  } else if (i < 16384) { // 2**14
    return Buffer.of([128 | (i % 128), (i >> 7)]);
  } else if (i < 2097152) { // 2**21
    return Buffer.of([128 | (i % 128), 128 | ((i >> 7) % 128), i>>14]);
  } else if (i < 268435456) { // 2**28
    return Buffer.of([128 | (i % 128), 128 | ((i >> 7) % 128), 128 | ((i>>14) % 128), i>>21]);
  } else if (i < 34359738368) { // 2**35
    return Buffer.of([128 | (i % 128), 128 | ((i >> 7) % 128), 128 | ((i>>14) % 128), 128 | ((i >> 21) % 128), i >> 28]);
  } else if (i < 4398046511104) { // 2**42
    return Buffer.of([128 | (i % 128), 128 | ((i >> 7) % 128), 128 | ((i>>14) % 128), 128 | ((i >> 21) % 128), 128 | ((i >> 28) % 128), i >> 35]);
  } else if (i < 562949953421312) { // 2**49
    return Buffer.of([128 | (i % 128), 128 | ((i >> 7) % 128), 128 | ((i>>14) % 128), 128 | ((i >> 21) % 128), 128 | ((i >> 28) % 128), 128 | ((i >> 35) % 128), i >> 42]);
  } else {              // handle up to 2**56, but 2**52 is the boundary where exact integers can be represented
    return Buffer.of([128 | (i % 128), 128 | ((i >> 7) % 128), 128 | ((i>>14) % 128), 128 | ((i >> 21) % 128), 128 | ((i >> 28) % 128), 128 | ((i >> 35) % 128), 128 | ((i >> 42) % 128), i >> 49]);
  }
}

function tagEncode(tag, wireType) {
  ...
}


function encodeEventProtobuf(ev) {
  // This 'null' will be replaced with a length-prefix.
  const rv = [ null ];

  if (ev.type !== undefined) {
    rv.push(tagEncode(1, WIRE_TYPE_INT32));
    if (typeof(ev.type) === 'number') {
      rv.push(varintEncode(ev.type));
    } else {
      const typeNum = EVENT_TYPE_TO_VALUE[ev.type];
      if (typeNum === undefined) {
        throw new Error('value event type');
      }
      rv.push(varintEncode(typeNum));
    }
  }
  if (ev.timestamp !== undefined) {
    rv.push(tagEncode(2, WIRE_TYPE_INT64));
    rv.push(varintEncode(ev.timestamp));
  }
  if (ev.taskIndex !== undefined) {
    rv.push(tagEncode(3, WIRE_TYPE_INT32));
    rv.push(varintEncode(ev.taskIndex));
  }
  if (ev.data !== undefined) {
    rv.push(tagEncode(4, WIRE_TYPE_BINARY_DATA));
    rv.push(varintEncode(ev.data.length));
    rv.push(ev.data);
  }
  if (ev.fd !== undefined) {
    rv.push(tagEncode(5, WIRE_TYPE_INT32));
    rv.push(varintEncode(ev.fd));
  }
  if (ev.killed) {
    rv.push(tagEncode(6, WIRE_TYPE_BOOLEAN));
    rv.push(Buffer.of([1]));
  }
  if (ev.exitStatus !== undefined) {
    rv.push(tagEncode(7, WIRE_TYPE_INT32));
    rv.push(varintEncode(ev.exitStatus));
  }
  if (ev.signalNumber !== undefined) {
    rv.push(tagEncode(8, WIRE_TYPE_INT32));
    rv.push(varintEncode(ev.signalNumber));
  }
  if (ev.env !== undefined) {
    Object.entries(ev.env).forEach((k,v) => {
      rv.push(tagEncode(9, WIRE_TYPE_MESSAGE));
      const lengthIndex = rv.length;
      rv.push(null);

      rv.push(tagEncode(1, WIRE_TYPE_STRING));
      const keyBuf = Buffer.of(k);
      const keyLenBuf = varintEncode(keyBuf.length);
      rv.push(keyLenBuf);
      rv.push(keyBuf);

      rv.push(tagEncode(2, WIRE_TYPE_STRING));
      const valueBuf = Buffer.of(v);
      const valueLenBuf = varintEncode(valueBuf.length);
      rv.push(valueLenBuf);
      rv.push(valueBuf);

      rv[lengthIndex] = varintEncode(1 + keyLenBuf.length + keyBuf.length
                                   + 1 + valueLenBuf.length + valueBuf.length);
    });
  }

  map<string, string> env = 9;  // for START
  if (ev.cmdline !== undefined) {
    for (const piece of ev.cmdline) {
      rv.push(tagEncode(9, WIRE_TYPE_STRING));
      const buf = Buffer.of(piece);
      rv.push(varintEncode(buf.length));
      rv.push(buf);
    }
  }

  //
  // Set rv[0] to the length of the remaining pieces.
  //
  let len = 0;
  for (let i = 1; i < rv.length; i++)
    len += rv[i].length;
  rv[0] = Buffer.allocUnsafe(4);
  rv[0].writeUInt32(len);

  return Buffer.concat(rv, len + 4);
}
