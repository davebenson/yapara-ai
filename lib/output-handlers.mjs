import {bufferArrayLinify} from './linify.mjs';
import assert from 'node:assert';
import {isUtf8} from 'node:buffer';
import {encodeEventProtobuf} from './proto-event-encoder.mjs';
import {parseFormat, evaluateFormat} from './format-string.mjs';

class OutputHandler {
  constructor(options = {}) {
    this.outputDir = options.outputDir;
  }

  initialize() { }
  finalize(exitStatus) { }
  
  handleOutput(task) { assert(false); }
}

class OutputHandlerRaw extends OutputHandler {
  handleOutput(task) {
    // Pipe to stdout/stderr
    task.proc.stdout.pipe(process.stdout);
    task.proc.stderr.pipe(process.stderr);
  }
}


const ANSI_COLORS = [
  '\x1b[31m', // red
  '\x1b[32m', // green
  '\x1b[33m', // yellow
  '\x1b[34m', // blue
  '\x1b[35m', // magenta
  '\x1b[36m', // cyan
];
const ANSI_RESET = '\x1b[0m';

const formatConfig = {
      t: 'task index',
      l: 'line index',
      e: 'error indicator',
      c: 'ansi color',
      r: 'ansi color reset'
};

class OutputHandlerLineByLine extends OutputHandler {
  constructor(options) {
    super(options);
    if (options?.header)
      this.header = parseFormat(options.header, formatConfig);
    if (options?.trailer)
      this.trailer = parseFormat(options.trailer, formatConfig);
  }

  handleOutput(task) {
    const outbufs = [];
    let out_lineno = 0;
    const errbufs = [];
    let err_lineno = 0;
    
    task.proc.stdout.on('data', (data) => {
      // Process line by line for console output
      outbufs.push(data);
      const strs = bufferArrayLinify(outbufs);
      strs.forEach(s => this.handleStdout(task, s, out_lineno++));
    });
    
    task.proc.stderr.on('data', (data) => {
      // Process line by line for console output
      errbufs.push(data);
      const strs = bufferArrayLinify(errbufs);
      strs.forEach(s => this.handleStderr(task, s, err_lineno++));
    });
  }

  handleLine(task, line, lineNumber, isErr) {
    const dst = isErr ? process.stderr : process.stdout;
    if (!this.header && !this.trailer) {
      dst.write(line);
      return;
    }

    let bareline = line, endline = '';
    const terminal = line[line.length - 1];
    if (terminal === "\n" || terminal === 10) {
      bareline = line.slice(0, -1);
      endline = "\n";
    }
    const info = {
      t: task.index,
      l: lineNumber,
      e: isErr ? '!' : ':',
      c: ANSI_COLORS[task.index % ANSI_COLORS.length],
      r: ANSI_RESET
    };
    const p = [];
    if (this.header) {
      p.push(evaluateFormat(this.header, info));
    }
    p.push(bareline);
    if (this.trailer) {
      p.push(evaluateFormat(this.trailer, info));
    }
    p.push(endline);
    //console.log(`line pieces: ${JSON.stringify(p)}`);

    dst.write(p.join(''));
  }
  
  handleStdout(task, line, lineNumber) { this.handleLine(task, line, lineNumber, false); }
  handleStderr(task, line, lineNumber) { this.handleLine(task, line, lineNumber, true); }
}

//type JsonlMode = 'always_binary' | 'always_utf8' | 'guess_if_utf8';
//type JsonlBinaryEncoding = 'base64' | 'hex';

const JSONL_BINARY_ENCODERS = {
  base64: (binary) => binary.toString('base64'),
  hex: (binary) => binary.toString('hex'),
};

class OutputHandlerJsonl extends OutputHandler {
  constructor({ alwaysBinary, alwaysUtf8, binaryEncoding='hex' }) {
    if (alwaysBinary) {
      if (alwaysUtf8) {
        throw new Error('alwaysBinary and alwaysUtf8 conflict');
      }
      this.jsonlMode = JSONL_ALWAYS_BINARY;
    } else {
      this.jsonlMode = alwaysUtf8 ? JSONL_ALWAYS_UTF8 : JSONL_GUESS_IF_BINARY
    }
    if (this.jsonlMode !== JSONL_ALWAYS_UTF8) {
      this.binaryEncoder = JSONL_BINARY_ENCODERS[binaryEncoding];
      if (!this.binaryEncoder) {
        throw new Error(`unknown binary encoding '${binaryEncoding}'`);
      }
    }
  }
  writeJSONL(json) {
    json.timestamp ??= Date.now();
    let info = null;
    if (this.header || this.trailer) {
      info = {
        t: task.index,
        l: lineNumber,
        e: isErr ? '!' : ':',
        c: ANSI_COLORS[task.index % ANSI_COLORS.length],
        r: ANSI_RESET
      };
    }
    if (this.header) {
      process.stdout.write(evaluateFormat(this.header, info));
    }
    process.stdout.write(JSON.stringify(json));
    if (this.trailer) {
      process.stdout.write(evaluateFormat(this.trailer, info));
    }
    process.stdout.write("\n");
  }
  handleOutput(task) {
    let getDataMembers;  // function that takes (data) and returns json
    switch (this.jsonlMode) {
      case JSONL_ALWAYS_UTF8: {
        task.proc.stdout.setEncoding('utf8');
        task.proc.stderr.setEncoding('utf8');
        getDataMembers = (data) => ({ str: data });
        break;
      }
      case JSONL_GUESS_IF_BINARY: {
        getDataMembers = (data) => 
            (isUtf8(data)
             ? ({ str: data.toString('utf8') })
             : ({ data: this.binaryEncoder(data) }));
        break;
      }
      case JSONL_ALWAYS_BINARY: {
        getDataMembers = (data) => ({ data: this.binaryEncoder(data) });
        break;
      }
    }
    const handleData = (data, fd) => {
      const dataJson = getDataMembers(data);
      const json = {
        ...dataJson,
        type: 'data',
        fd,
        taskIndex: task.index
      };
      this.writeJSONL(json);
    };
    const handleClose = (fd) => {
      this.writeJSONL({
        type: 'job_stream_close',
        fd
      });
    };
    task.proc.stdout.on('data', (data) => handleData(data, 1));
    task.proc.stdout.on('close', () => handleClose(1));
    task.proc.stderr.on('data', (data) => handleData(data, 2));
    task.proc.stderr.on('close', () => handleClose(2));
    task.proc.on('exit', (code, signal) => {
      this.writeJSONL({
        type: 'job_end',
        exitCode: code,
        signal,
        taskIndex: task.index
      });
    });
  }
  initialize() {
    this.writeJSONL({ type: 'start', env: process.env, cmdline: process.args });
  }
  finalize(exitCode) {
    this.writeJSONL({ type: 'end', exitCode: exitCode });
  }
}

class OutputHandlerProto extends OutputHandlerJsonl {
  constructor() {
    super({alwaysBinary: true});
    this.binaryEncoder = (binary) => binary;
  }
  writeJSONL(json) {
    json.timestamp ??= Date.now();
    const buf = encodeEventProtobuf(json);
    process.stdout.write(buf);
  }
}

//
// variables available to the header format string
//    %t - task index
//    %l - line index

export const OUTPUT_HANDLER_TYPES = {
  raw_mixed: {
    description: 'raw binary, mixed together',
    make: (options) => new OutputHandlerRaw(options)
  },
  bare: {
    description: 'line-by-line, no header',
    make: (options) => new OutputHandlerLineByLine(options),
  },
  task_header: {
    description: 'line-by-line, header based on task number',
    make: (options) => new OutputHandlerLineByLine({
      ...options,
      header: '%5^t%e '
    })
  },
  numbered: {
    description: 'line-by-line with header and line-number',
    make: (options) => new OutputHandlerLineByLine({
      ...options,
      header: '%5^t:%5^l%e '
    })
  },
  colored: {
    description: 'line-by-line, colored by process-index',
    make: (options) => new OutputHandlerLineByLine({
      ...options,
      header: '%5^t:%5^l%e %c',
      trailer: '%r'
    })
  },
  jsonl: {
    description: 'JSONL output (output assumed to be UTF8)',
    make: (options) => new OutputHandlerJsonl({...options, alwaysUtf8: true })
  },
  jsonl_mixed: {
    description: 'line-by-line (output is UTF-8 strings, or binary)',
    make: (options) => new OutputHandlerJsonl(options)
  },
  jsonl_binary: {
    description: 'line-by-line (output is binary)',
    make: (options) => new OutputHandlerJsonl({...options, alwaysBinary: true})
  },
  protobuf: {
    description: 'protobuf encoded entries, with 32-bit little-endian size prefix',
    make: (options) => new OutputHandlerProto(options)
  },
};
