import {bufferArrayLinify} from './linify.mjs';
import assert from 'node:assert';
import {isUtf8} from 'node:buffer';


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

class OutputHandlerLineByLine extends OutputHandler {
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
  
  handleStdout(task, line, lineNumber) { assert(false); }
  handleStderr(task, line, lineNumber) { assert(false); }
}

class OutputHandlerLineByLineBare extends OutputHandlerLineByLine {
  handleStdout(task, line, lineNumber) { process.stdout.write(line); }
  handleStderr(task, line, lineNumber) { process.stderr.write(line); }
}
class OutputHandlerLineByLineWithName extends OutputHandlerLineByLine {
  handleStdout(task, line, lineNumber) { 
    process.stdout.write(`[${task.name}] ${line}`); 
  }
  handleStderr(task, line, lineNumber) { 
    process.stderr.write(`[${task.name}] ${line}`); 
  }
}

class OutputHandlerLineByLineWithNameAndNumber extends OutputHandlerLineByLine {
  handleStdout(task, line, lineNumber) { 
    process.stdout.write(`[${task.name}:${lineNumber}] ${line}`); 
  }
  handleStderr(task, line, lineNumber) { 
    process.stderr.write(`[${task.name}:${lineNumber}] ${line}`); 
  }
}

class OutputHandlerLineByLineColored extends OutputHandlerLineByLine {
  constructor() {
    super();
    this.colors = [
      '\x1b[31m', // red
      '\x1b[32m', // green
      '\x1b[33m', // yellow
      '\x1b[34m', // blue
      '\x1b[35m', // magenta
      '\x1b[36m', // cyan
    ];
    this.reset = '\x1b[0m';
  }
  
  handleStdout(task, line, lineNumber) {
    const color = this.colors[task.index % this.colors.length];
    process.stdout.write(`${color}[${task.name}] ${line}${this.reset}`);
  }
  
  handleStderr(task, line, lineNumber) {
    const color = this.colors[task.index % this.colors.length];
    process.stderr.write(`${color}[${task.name}] ${line}${this.reset}`);
  }
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
    process.stdout.write(JSON.stringify(json));
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

export const OUTPUT_HANDLER_TYPES = {
  raw_mixed: {
    description: 'raw binary, mixed together',
    make: () => new OutputHandlerRaw()
  },
  bare: {
    description: 'line-by-line, no header',
    make: () => new OutputHandlerLineByLineBare(),
  },
  line_by_line: {
    description: 'line-by-line, with header',
    make: () => new OutputHandlerLineByLineWithName(),
  },
  numbered: {
    description: 'line-by-line with header and line-number',
    make: () => new OutputHandlerLineByLineWithNameAndNumber(),
  },
  colored: {
    description: 'line-by-line, colored by process-index',
    make: () => new OutputHandlerLineByLineColored(),
  },
  jsonl: {
    description: 'JSONL output (output assumed to be UTF8)',
    make: () => new OutputHandlerJsonl({alwaysUtf8: true })
  },
  jsonl_mixed: {
    description: 'line-by-line (output is UTF-8 strings, or binary)',
    make: () => new OutputHandlerJsonl()
  },
  jsonl_binary: {
    description: 'line-by-line (output is binary)',
    make: () => new OutputHandlerJsonl({alwaysBinary: true})
  }
}
