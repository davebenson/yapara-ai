import {bufferArrayLinify} from './linify.mjs';
import assert from 'node:assert';

class OutputHandler {
  handleOutput(task) { assert(false); }
}

class OutputHandlerRaw extends OutputHandler {
  handleOutput(task) {
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
      outbufs.push(data);
      const strs = bufferArrayLinify(outbufs);
      strs.forEach(s => this.handleStdout(task, s, out_lineno++));
    });
    task.proc.stderr.on('data', (data) => {
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

export const OUTPUT_HANDLERS_TYPES = {
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
}
