import {OUTPUT_HANDLER_TYPES} from './output-handlers.mjs';
import child_process from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import assert from 'node:assert';

const DEFAULT_MAX_CONCURRENT = 4;

class Task {
  constructor({command, args, index, inputBuffer, name, outputDir, parentState}) {
    this.proc = child_process.spawn(command, args);
    this.index = index;
    assert(index !== undefined);
    this.name = name;
    this.command = command;
    this.args = args;
    this.outputDir = outputDir;
    this.fileStreams = null;
    this.parentState = parentState;
    parentState.numRunningTasks += 1;

    if (inputBuffer) {
      this.proc.stdin.end(inputBuffer);
    }
    
    // Set up file output if outputDir is provided
    if (outputDir) {
      this.setupFileOutput();
    }
  }
  
  setupFileOutput() {
    try {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      
      // Sanitize task name for use in filenames
      const safeName = this.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      const stdoutFile = path.join(this.outputDir, `${safeName}.stdout.log`);
      const stderrFile = path.join(this.outputDir, `${safeName}.stderr.log`);
      
      console.log(`Writing output for task ${this.name} to files in ${this.outputDir}`);
      
      // Create file streams for this task
      const stdoutStream = fs.createWriteStream(stdoutFile);
      const stderrStream = fs.createWriteStream(stderrFile);
      
      // Set up piping
      this.proc.stdout.pipe(stdoutStream);
      this.proc.stderr.pipe(stderrStream);
      
      // Store the streams for later cleanup
      this.fileStreams = { stdout: stdoutStream, stderr: stderrStream };
      
      // Setup end event handlers
      this.proc.on('exit', () => {
        if (this.fileStreams) {
          this.fileStreams.stdout.end();
          this.fileStreams.stderr.end();
        }
        this.parentState.numRunningTasks -= 1;
      });
    } catch (err) {
      console.error(`Error setting up file output: ${err.message}`);
    }
  }
}

// Default values for options
const DEFAULT_OPTIONS = {
  maxConcurrentTasks: DEFAULT_MAX_CONCURRENT,
  outputFormat: 'colored',
  terminateOnFailure: false,
  outputDir: null,
  readFromStdin: true,
  commandPrefix: []
};

function parseArguments() {
  const argv = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };
  let readFromStdin = false;
  
  // Parse options and collect commands
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg.startsWith('--')) {
      // Handle options
      const opt = arg.substring(2);
      
      if (opt === 'help') {
        printHelp();
        process.exit(0);
      } else if (opt === 'version') {
        console.log(getVersion());
        process.exit(0);
      } else if (opt === 'stdin') {
        options.readFromStdin = true;
      } else if (opt.startsWith('max=')) {
        options.maxConcurrentTasks = parseInt(opt.substring(4), 10);
        if (isNaN(options.maxConcurrentTasks) || options.maxConcurrentTasks < 1) {
          console.error(`Invalid max tasks value: ${opt.substring(4)}`);
          process.exit(1);
        }
      } else if (opt.startsWith('format=')) {
        const format = opt.substring(7);
        if (!OUTPUT_HANDLER_TYPES[format]) {
          console.error(`Unknown output format: ${format}`);
          console.error(`Available formats: ${Object.keys(OUTPUT_HANDLER_TYPES).join(', ')}`);
          process.exit(1);
        }
        options.outputFormat = format;
      } else if (opt ==='terminate-on-failure') {
        options.terminateOnFailure = true;
      } else if (opt.startsWith('output-dir=')) {
        options.outputDir = opt.substring(11);
        if (!options.outputDir) {
          console.error('Output directory path cannot be empty');
          process.exit(1);
        }
      } else {
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
      }
    } else if (arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '-v') {
      console.log(getVersion());
      process.exit(0);
    } else if (arg[0] !== '-') {
      while (i < argv.length) {
        options.commandPrefix.push(argv[i]);
        i++;
      }
    } else {
      console.log(`error: unknown argument ${arg}`);
      process.exit(1);
    }
  }
  
  return options;
}

function printHelp() {
  const formatDescriptions = Object.entries(OUTPUT_HANDLER_TYPES)
    .map(([key, value]) => `    ${key.padEnd(12)} - ${value.description}`)
    .join('\n');
  
  console.log(`
Usage: yapara [options] command [args...]
   or: yapara [options] - < commands.txt
   or: some_command | yapara [options] --stdin

Options:
  --help, -h        Show this help
  --version, -v     Show version
  --max=N           Maximum number of concurrent tasks (default: 4)
  --format=OUTFMT   Output format (default: colored)
  --terminate-on-failure Terminate if any process fails.
  --output-dir=DIR  Save each task's output to separate files in this directory
  --input=FILENAME  TODO
  --input-mode=MODE How to construct commands from input and command-line args.

Available output formats: (for --format=OUTFMT options)
${formatDescriptions}

For line-by-line output formats:
  --header=FMT       text added at the beginning of each line
  --trailer=FMT      text added at the end of each line

The FMT arguments are strings with % sequences which 
have meanings:
  %t       Task index.
  %l       Line index.
  %c       ANSI Color code for the task.
  %r       Reset ANSI Color.
  %e       '!' for std-err lines, and ':' for std-out lines.
They may have modifiers in between the % and the primary character:
  ^        Add one to the value, to convert 0-indexed numbers to 1-indexed.
  [DIGITS] Right-pad the argument (if it starts with a 0, zero-pad)
  x        Render number as hex.
  o        Render number as octal.

For example %05^l is a 0-padded line-number
with 1 being the first line.

Input Modes
  sh       Parse args with shell quoting.
  argument Supply input line as an argument.
  auto     Use 'sh' if no command given on command line and
           'argument' if command/args given on command line.
  sub      Replace {} with the input, and {...} with shell-parsed input.
           {index} gives the task index.

Examples:
  yapara --max=8 ls -la find . -name "*.js"
  yapara --format=numbered grep -r "TODO" . python test.py
  find . -type f -name "*.log" | yapara --stdin --format=bare cat
  yapara -max=16 < my_commands.txt
  yapara --output-dir=./logs grep -r "ERROR" ./logs/* find /var/log -type f -mtime -1
`);
}

function getVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname), 'package.json'),
      'utf8'
    ));
    return packageJson.version;
  } catch (error) {
    return '1.0.0';
  }
}

function constructOutputHandler(formatName, options) {
  const handlerType = OUTPUT_HANDLER_TYPES[formatName];
  if (!handlerType) {
    console.error(`Unknown output format: ${formatName}`);
    console.error(`Available formats: ${Object.keys(OUTPUT_HANDLER_TYPES).join(', ')}`);
    process.exit(1);
  }
  return handlerType.make(options);
}

function parseShellComponents(line) {
    // Parse the line as a command with arguments
    const parts = line.trim().split(/\s+/);
    // Handle quoted arguments properly
    const command = parts[0];
    const argsText = line.trim().substring(command.length).trim();
    const args = [];
    
    // Simple parsing for quoted arguments
    if (argsText) {
      let inQuotes = false;
      let quoteChar = '';
      let currentArg = '';
      
      for (let i = 0; i < argsText.length; i++) {
        const char = argsText[i];
        
        if ((char === '"' || char === "'") && (i === 0 || argsText[i-1] !== '\\')) {
          if (!inQuotes) {
            inQuotes = true;
            quoteChar = char;
          } else if (char === quoteChar) {
            inQuotes = false;
            if (currentArg) {
              args.push(currentArg);
              currentArg = '';
            }
          } else {
            currentArg += char;
          }
        } else if (char === ' ' && !inQuotes) {
          if (currentArg) {
            args.push(currentArg);
            currentArg = '';
          }
        } else {
          currentArg += char;
        }
      }
      
      if (currentArg) {
        args.push(currentArg);
      }
    }
}

const MAX_COMMANDS_QUEUED = 4;

class YaparaState {
  constructor({
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    terminateOnFailure,
    lineToCommand,
    outputHandler
  }) {
    this.numRunningTasks = 0;
    this.runningTasksByPid = {};
    this.maxConcurrent = DEFAULT_MAX_CONCURRENT;
    this.outputHandler = outputHandler;
    this.readlineInterface = readline.createInterface({
      input: process.stdin,
      output: null,
      terminal: false
    });
    this.commandsToStart = [];
    this.exitStatus = 0;
    this.readlineFinished = false;
    this.readlineBlocked = false;
    this.taskIndex = 0;
    this.terminateOnFailure = terminateOnFailure;
    this.readlineHandler = (line) => {
      const command = this.parseLineToCommand(line);
      if (!command) {
        return;
      }
      command.index = this.taskIndex;
      command.name = `task-${this.taskIndex}`;
      this.taskIndex += 1;
    
      this.commandsToStart.push(command);
      this.maybeSpawnTasks();
      this.setReadlineBlocked();
    };

    // Since !readlineBlocked, we must add the event handler.
    this.readlineInterface.on('line', this.readlineHandler);
    this.readlineInterface.once('close', () => {
      this.readlineFinished = true;
      if (this.commandsToStart.length == 0
        && this.numRunningTasks == 0) {
        process.exit(this.exitStatus);
      }
    });
  }

  setReadlineBlocked() {
    if (!this.readlineFinished) {
      const blocked = this.commandsToStart.length >= MAX_COMMANDS_QUEUED;
      if (this.readlineBlocked && !blocked) {
        this.readlineBlocked = false;
        this.addHandler('line', this.readlineHandler);
      } else if (!this.readlineBlocked && blocked) {
        this.readlineBlocked = true;
        this.removeHandler('line', this.readlineHandler);
      }
    }
  }

  parseLineToCommand(line) {
    // Skip empty lines
    if (!line.trim()) return null;

    const [command, ...args] = this.lineToCommand(line);
    return ({
      command,
      args,
    });
  }

  maybeSpawnTasks(outputHandler, tasks, maxConcurrent) {
    while (this.commandsToStart.length > 0
        && this.numRunningTasks < this.maxConcurrent) {
      const command = this.commandsToStart.shift();
      command.parentState = this;
      const task = new Task(command);
      this.runningTasksByPid[task.proc.pid] = task;
      
      this.outputHandler.handleOutput(task);

      // If there's an error with the process, handle it gracefully
      task.proc.on('error', (err) => {
        console.error(`Error starting task (${task.command} ${task.args.join(' ')}): ${err.message}`);
        task.exitCode = 1;
        //completedTasks.push(task);
        this.numRunningTasks--;
        
        // Continue with other tasks
        this.maybeSpawnTasks(outputHandler, tasks, maxConcurrent);
      });
      
      task.proc.on('exit', (code, signal) => {
        task.exitCode = code;
        task.signal = signal;
        //completedTasks.push(task);
        this.numRunningTasks--;
        delete this.runningTasksByPid[task.proc.pid];

        // Update overall exit status.
        if (code) {
          this.exitStatus = Math.max(2, this.exitStatus);
          this.nFailures += 1;
        } else if (signal) {
          this.exitStatus = Math.max(3, this.exitStatus);
          this.nFailures += 1;
        }
          
        // Check if we should terminate based on the exit code
        if ((code || signal) && this.terminateOnFailure) {
          console.error('Terminating remaining tasks due to error...');
          this.outputHandler.finalize(this.exitStatus);
          for (const task of Object.values(this.runningTasksByPid)) {
            task.proc.kill();
          }
          process.exit(this.exitStatus);
          return;
        }
        this.maybeSpawnTasks();
      });
    }
  
    // If all tasks are complete, exit with proper status code
    this.maybeTerminate();
  }

  maybeTerminate() {
    if (this.numRunningTasks === 0 && this.commandsToStart.length == 0 && this.readlineFinished) {
      this.outputHandler.finalize(this.exitStatus);
      process.exit(this.exitStatus);
    }
  }
}

function constructInputMapping({inputMode, commandPrefix}) {
  const mode = inputMode === 'auto'
             ? (commandPrefix.length === 0 ? 'sh' : 'argument')
             : inputMode;
  switch (mode) {
    case 'sh':
      ...
    case 'argument':
      ...
    case 'tabsep':
      ...
    default:
      console.err(`unhandled --input-mode ${mode}`);
      process.exit(1);
      break;
  }
}

export async function main() {
  const options = parseArguments();
  
  // Set up output handler
  const outputHandler = constructOutputHandler(options.outputFormat, options);

  const lineToCommand = constructInputMapping(options);
  
  const yapara = new YaparaState({
    outputHandler, 
    lineToCommand,
    terminateOnFailure: options.terminateOnFailure ?? false,
    maxConcurrentTasks: options.maxConcurrentTasks
  });
}

