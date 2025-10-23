import {bufferArrayLinify} from './linify.mjs';
import assert from 'node:assert';
import {isUtf8} from 'node:buffer';
import {encodeEventProtobuf} from './proto-event-encoder.mjs';
import {parseFormat, evaluateFormat} from './format-string.mjs';
import {StringDecoder} from 'node:string_decoder';

const formatConfig = {
  t: 'task index',
  l: 'line index',
  e: 'error indicator',
  c: 'ansi color',
  r: 'ansi color reset'
};

class OutputHandlerForStream {
  constructor(options, isErr) {
    const prefix = isErr ? 'err' : 'out';
    const Prefix = isErr ? 'Err' : 'Out';
    const defaultFd = isErr ? 2 : 1;
    if (options[`raw${Prefix}Dir`]) {
      this.rawDstDir = options[`dst${Prefix}Dir`];
    } else if (options.rawDir) {
      this.rawDstDir = options.rawDir;
    } else {
      this.rawDstDir = null;
    }
    if (this.rawDstDir) {
      this.rawFilenameFmt = ...
    }

    const headerFmt = options[`${prefix}Header`] ?? options['header'] ?? null;
    const trailerFmt = options[`${prefix}Trailer`] ?? options['trailer'] ?? null;
    this.trailer = trailerFmt === null ? null : parseFormat(trailerFmt, formatConfig);
    this.header = headerFmt === null ? null : parseFormat(headerFmt, formatConfig);
    this.fd = options[`${prefix}Fd`];
    if (this.fd === undefined) {
      if (this.rawDstDir || options.jsonl) {
        this.fd = (this.header || this.trailer) ? defaultFd : null;
      } else {
        this.fd = defaultFd;
        this.header ??= parseFormat(DEFAULT_HEADER_FMT, formatConfig);
      }
    }
  }
}

class OutputHandler {
  constructor(options = {}) {
    this.streamInfo = [
      new OutputHandlerForStream(options, false),
      new OutputHandlerForStream(options, true)
    ];
    this.summary = {
      stdoutBytes: 0,
      stderrBytes: 0,
      totalMillis: 0,
      numSuccess: 0,
      numFailure: 0
    };
 
    this.closeTargetStreams = false;
    this.jsonlStream = options.jsonl === null
                     ? null
                     : options.jsonl === '-'
                     ? process.stdout
                     : fs.createWriteStream(options.jsonl);
  }

  handleOutputLine(task, line, index) {
    const oi = task.outputInfo[index];
    const lineNum = oi.line++;
    ...
  }

  //initialize() { }
  //finalize(exitStatus) { }
  //
  //taskStarted(task) { return { }; }
  //taskEnded(task, taskInfo) { }
  //taskOutput(task, taskInfo, data, fd) { }
  //taskOutputEnded(task, taskInfo, fd) { }
  //
  handleData(task, data, index) {
    const si = this.streamInfo[index];
    const oi = task.outputInfo[index];
    oi.bytes += data.length;
    const outbufs = oi.outbufs;
    if (outbufs) {
      const lines = bufferArrayLinify(outbufs);
      for (const line of lines) {
        handleOutputLine(task, line, index);
      }
    }
    if (si.rawDstDir) {
      if (!oi.rawStream) {
        oi.rawStream = fs.createWriteStream(...);
      }
      oi.rawStream.write(data);
    }
  }

  handleClose(task, index) {
    const oi = task.outputInfo[index];
    const outbufs = oi.outbufs;
    if (outbufs) {
      const line = Buffer.concat(outbufs).toString();
      if (line.length > 0) {
        this.handleOutputLine(task, line, index);
      }
    }
    const si = this.streamInfo[index];
    if (si.rawStream) {
      si.rawStream.close();
    }
  }

  initTaskOutput(task, stream, index) {
    const si = this.streamInfo[index];
    if (si.fd > 0) {
      task.outputInfo[index].outbufs = [];
    }
    stream.on('data', (data) => this.handleData(task, data, index))
          .on('close', () => this.handleClose(task, index));
  }

  handleTaskEnd(task) {
    this.summary.stdoutBytes += task.outputInfo[0].bytes;
    this.summary.stderrBytes += task.outputInfo[1].bytes;
    this.summary.numTasks += 1;
    this.summary.totalMillis += Date.now() - task.startTime;
    if (task.proc.exitStatus > 0 || task.process.killed) {
      this.summary.numFailure += 1;
    } else {
      this.summary.numSuccess += 1;
    }
  }

  // WAS handleOutput
  handleTaskStart(task) {
    task.outputInfo = [{bytes: 0}, {bytes: 0}];
    task.startTime ??= Date.now();
    this.initTaskOutput(task, task.proc.stdout, 0);
    this.initTaskOutput(task, task.proc.stderr, 1);
    task.proc.on('exit', () => this.handleTaskEnd(task));
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

const JSONL_ALWAYS_UTF8 = 1;
const JSONL_GUESS_IF_BINARY = 2;
const JSONL_ALWAYS_BINARY = 3;

class OutputHandlerJsonl extends OutputHandler {
  constructor(options) {
    const { alwaysBinary, alwaysUtf8, binaryEncoding='hex' } = options;
    super(options);
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
    let stringDecoders;
    switch (this.jsonlMode) {
      case JSONL_ALWAYS_UTF8: {
        stringDecoders = [new StringDecoder('utf8'), new StringDecoder('utf8')];
        getDataMembers = (data, fd) => ({ str: stringDecoders[fd-1].write(data) });
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
      const dataJson = getDataMembers(data, fd);
      const json = {
        ...dataJson,
        type: 'data',
        fd,
        taskIndex: task.index
      };
      this.writeJSONL(json);
    };
    const handleClose = (fd) => {
      if (stringDecoders) {
        const str = stringDecoders[fd-1].end();
        if (str !== '') {
          const json = {
            str,
            type: 'data',
            fd,
            taskIndex: task.index
          };
        }
      }
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
    super.initialize();
    this.writeJSONL({ type: 'start', env: process.env, cmdline: process.args });
  }
  finalize(exitCode) {
    this.writeJSONL({ type: 'end', exitCode: exitCode });
    super.finalize(exitCode);
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


function parseOptionalFormat(fmt, cfg) {
  return fmt ? parseFormat(fmt, cfg) : null;
}

export class OutputHandlerSeparateFiles extends OutputHandler {
  constructor({rawOutputDir,
               rawStdoutFormat, rawStdoutCreateOnDemand,
               rawStderrFormat, rawStderrCreateOnDemand}) {
    this.cod = [
      rawStdoutCreateOnDemand,
      rawStderrCreateOnDemand
    ];
    this.formats = [
      parseOptionalFormat(rawStdoutFormat, formatConfig),
      parseOptionalFormat(rawStderrFormat, formatConfig),
    ];
  }
  handleOutputStream(task, i) {
    const stream = i == 0 ? task.proc.stdout : task.proc.stderr;
    const cod = this.cod[i];
    if (this.formats[i]) {
      const filename = evaluateFormat(this.formats[i], info);
      let dstStream = this.cod[i]
                    ? null
                    : fs.createWriteStream(filename);
      stream.on('data', data => {
        if (!dstStream) {
          dstStream = fs.createWriteStream(filename);
        }
        dstStream.write(data);
      }).on('end', () => {
        dstStream?.close();
      });
    }
  }
  handleOutput(task) {
    for (let i = 0; i < 2; i++) {
      this.handleOutputStream(task, i);
    }
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
