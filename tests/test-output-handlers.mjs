import assert from 'node:assert';
import test from 'node:test';
import { OUTPUT_HANDLERS_TYPES } from '../lib/output-handlers.mjs';
import { Writable } from 'node:stream';

// Mock output handler classes for testing
class MockHandlerTester {
  constructor() {
    // Create a backup of the original write functions
    this.originalStdoutWrite = process.stdout.write;
    this.originalStderrWrite = process.stderr.write;
    
    // Captured output
    this.capturedStdout = '';
    this.capturedStderr = '';
    
    // Override the write methods to capture output
    process.stdout.write = (chunk, encoding, callback) => {
      this.capturedStdout += chunk.toString();
      return true; // Indicate success
    };
    
    process.stderr.write = (chunk, encoding, callback) => {
      this.capturedStderr += chunk.toString();
      return true; // Indicate success
    };
  }
  
  // Clean up and restore original functions
  restore() {
    process.stdout.write = this.originalStdoutWrite;
    process.stderr.write = this.originalStderrWrite;
  }
  
  // Reset captured outputs
  reset() {
    this.capturedStdout = '';
    this.capturedStderr = '';
  }
}

// Mock process class to test output handling
class MockProcess {
  constructor() {
    this.stdout = new MockStream();
    this.stderr = new MockStream();
  }
}

// Mock stream implementation for testing
class MockStream {
  constructor() {
    this.listeners = {};
    this.piped = null;
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  pipe(target) {
    this.piped = target;
    return target;
  }

  emitData(data) {
    if (this.listeners['data']) {
      this.listeners['data'].forEach(callback => callback(Buffer.from(data)));
    }
  }
}

// Mock task for testing handlers
class MockTask {
  constructor(name, index = 0) {
    this.name = name;
    this.index = index;
    this.proc = new MockProcess();
  }
}

// Test each output handler type
test('OutputHandlerRaw', async (t) => {
  // Raw handler just pipes, so we can test if piping was set up
  const handler = OUTPUT_HANDLERS_TYPES.raw_mixed.make();
  const task = new MockTask('test-task');
  
  handler.handleOutput(task);
  
  assert.strictEqual(task.proc.stdout.piped, process.stdout);
  assert.strictEqual(task.proc.stderr.piped, process.stderr);
});

test('OutputHandlerLineByLineBare', async (t) => {
  const tester = new MockHandlerTester();
  
  try {
    const handler = OUTPUT_HANDLERS_TYPES.bare.make();
    const task = new MockTask('test-task');
    
    handler.handleOutput(task);
    
    // Test stdout
    tester.reset();
    task.proc.stdout.emitData("line1\nline2\n");
    
    assert.strictEqual(tester.capturedStdout, "line1\nline2\n");
    
    // Test stderr
    tester.reset();
    task.proc.stderr.emitData("error1\nerror2\n");
    
    assert.strictEqual(tester.capturedStderr, "error1\nerror2\n");
  } finally {
    tester.restore();
  }
});

test('OutputHandlerLineByLineWithName', async (t) => {
  const tester = new MockHandlerTester();
  
  try {
    const handler = OUTPUT_HANDLERS_TYPES.line_by_line.make();
    const task = new MockTask('test-task');
    
    handler.handleOutput(task);
    
    // Test stdout with task name
    tester.reset();
    task.proc.stdout.emitData("line1\nline2\n");
    
    assert.strictEqual(tester.capturedStdout, "[test-task] line1\n[test-task] line2\n");
    
    // Test stderr with task name
    tester.reset();
    task.proc.stderr.emitData("error1\n");
    
    assert.strictEqual(tester.capturedStderr, "[test-task] error1\n");
  } finally {
    tester.restore();
  }
});

test('OutputHandlerLineByLineWithNameAndNumber', async (t) => {
  const tester = new MockHandlerTester();
  
  try {
    const handler = OUTPUT_HANDLERS_TYPES.numbered.make();
    const task = new MockTask('test-task');
    
    handler.handleOutput(task);
    
    // Test stdout with task name and line numbers
    tester.reset();
    task.proc.stdout.emitData("line1\nline2\n");
    
    assert.strictEqual(tester.capturedStdout, "[test-task:0] line1\n[test-task:1] line2\n");
    
    // Test stderr with task name and line numbers
    tester.reset();
    task.proc.stderr.emitData("error1\n");
    
    assert.strictEqual(tester.capturedStderr, "[test-task:0] error1\n");
  } finally {
    tester.restore();
  }
});

test('OutputHandlerLineByLineColored', async (t) => {
  const tester = new MockHandlerTester();
  
  try {
    const handler = OUTPUT_HANDLERS_TYPES.colored.make();
    const task = new MockTask('test-task', 1); // Using index 1 for predictable color
    
    handler.handleOutput(task);
    
    // Test stdout with color
    tester.reset();
    task.proc.stdout.emitData("line1\n");
    
    // Color code for index 1 is green (\x1b[32m)
    assert.strictEqual(tester.capturedStdout, "\x1b[32m[test-task] line1\n\x1b[0m");
    
    // Test stderr with color
    tester.reset();
    task.proc.stderr.emitData("error1\n");
    
    assert.strictEqual(tester.capturedStderr, "\x1b[32m[test-task] error1\n\x1b[0m");
  } finally {
    tester.restore();
  }
});
