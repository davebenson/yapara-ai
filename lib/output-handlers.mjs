import {bufferArrayLinify} from './linify.mjs';
import assert from 'node:assert';

class OutputHandler {
  constructor(options = {}) {
    this.outputDir = options.outputDir;
  }
  
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

class OutputHandlerJsonl {
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
      this.binaryEncoder = JSONL_BINARY_ENCODER[binaryEncoding];
      if (!this.binaryEncoder) {
        throw new Error(`unknown binary encoding '${binaryEncoding}'`);
      }
    }
