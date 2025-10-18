//
// Depdendency-free encoding of the Event structure
// defined in binary-data.proto

const WIRE_TYPE_INT32 = ...;
const WIRE_TYPE_INT64 = ...;
const WIRE_TYPE_STRING = ...;
const WIRE_TYPE_BINARY = ...;

function varuintBigintEncode(i) {
  ...
}
function varuintEncode(i) {
  ...
}
function tagEncode(tag, wireType) {
  ...
}


function encodeEvent(ev) {
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
  int32 fd = 5;                 // for DATA: 1 for stdout, 2 for stderr
  boolean killed = 6;           // for JOB_END, if terminated by signal
  int exit_status = 7;          // for JOB_END and !killed, or END
  int signal_number = 8;        // for JOB_END and killed
  map<string, string> env = 9;  // for START
  repeated string cmdline = 10; // for START




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
