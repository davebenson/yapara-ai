import {OUTPUT_HANDLERS_TYPES} from './output-handlers.mjs';
import child_process from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';

let GLOBAL_INDEX = 0;

class Task {
  constructor({command, args, index, inputBuffer, name, outputDir}) {
    this.proc = child_process.spawn(command, args);
    this.index = index ?? GLOBAL_INDEX++;
    this.name = name ?? this.index.toString();
    this.command = command;
    this.args = args;
    this.outputDir = outputDir;
    this.fileStreams = null;
    
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
      });
    } catch (err) {
      console.error(`Error setting up file output: ${err.message}`);
    }
  }
}

// Default values for options
const DEFAULT_OPTIONS = {
  maxTasks: 4,
  outputFormat: 'colored',
  terminateOn: 'any-error',
  outputDir: null
};

function parseArguments() {
  const argv = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };
  const commands = [];
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
        readFromStdin = true;
      } else if (opt.startsWith('max=')) {
        options.maxTasks = parseInt(opt.substring(4), 10);
        if (isNaN(options.maxTasks) || options.maxTasks < 1) {
          console.error(`Invalid max tasks value: ${opt.substring(4)}`);
          process.exit(1);
        }
      } else if (opt.startsWith('format=')) {
        const format = opt.substring(7);
        if (!OUTPUT_HANDLERS_TYPES[format]) {
          console.error(`Unknown output format: ${format}`);
          console.error(`Available formats: ${Object.keys(OUTPUT_HANDLERS_TYPES).join(', ')}`);
          process.exit(1);
        }
        options.outputFormat = format;
      } else if (opt.startsWith('terminate=')) {
        const term = opt.substring(10);
        if (!['any-error', 'all-error', 'none'].includes(term)) {
          console.error(`Unknown termination option: ${term}`);
          console.error(`Available options: any-error, all-error, none`);
          process.exit(1);
        }
        options.terminateOn = term;
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
    } else if (arg === '-') {
      readFromStdin = true;
    } else {
      // Parse command and any arguments for this command
      const command = arg;
      const cmdArgs = [];
      
      // Collect all arguments for this command until we hit another command or option
      i++;
      while (i < argv.length && !argv[i].startsWith('-')) {
        cmdArgs.push(argv[i]);
        i++;
      }
      i--; // Step back to allow the main loop to process the next option
      
      commands.push({
        command,
        args: cmdArgs,
        name: `task-${commands.length}`
      });
    }
  }
  
  // If no commands specified and not reading from stdin, show help
  if (commands.length === 0 && !readFromStdin) {
    console.error('No commands specified.');
    printHelp();
    process.exit(1);
  }
  
  return { options, commands, readFromStdin };
}

function printHelp() {
  const formatDescriptions = Object.entries(OUTPUT_HANDLERS_TYPES)
    .map(([key, value]) => `    ${key.padEnd(12)} - ${value.description}`)
    .join('\n');
  
  console.log(`
Usage: yapara [options] command1 [args...] [command2 [args...]] ...
   or: yapara [options] - < commands.txt
   or: some_command | yapara [options] --stdin

Options:
  --help, -h        Show this help
  --version, -v     Show version
  --max=N           Maximum number of concurrent tasks (default: 4)
  --format=FMT      Output format (default: colored)
  --terminate=T     Termination policy (default: any-error)
                    Options: any-error, all-error, none
  --output-dir=DIR  Save each task's output to separate files in this directory
  --stdin           Read commands from standard input, one per line
  -                 Read commands from standard input, one per line

Available output formats:
${formatDescriptions}

Termination policies:
  any-error      Terminate all tasks if any task exits with an error
  all-error      Continue running tasks until all are complete, even if some fail
  none           Never terminate tasks based on exit codes

Examples:
  yapara --max=8 ls -la find . -name "*.js"
  yapara --format=numbered grep -r "TODO" . python test.py
  find . -type f -name "*.log" | yapara --stdin --format=bare cat
  yapara --max=16 - < my_commands.txt
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
  const handlerType = OUTPUT_HANDLERS_TYPES[formatName];
  if (!handlerType) {
    console.error(`Unknown output format: ${formatName}`);
    console.error(`Available formats: ${Object.keys(OUTPUT_HANDLERS_TYPES).join(', ')}`);
    process.exit(1);
  }
  return handlerType.make(options);
}

function constructTerminationHandler(terminateOn) {
  return {
    shouldTerminate: (tasks) => {
      if (terminateOn === 'none') {
        return false;
      }
      
      const hasError = tasks.some(task => task.exitCode !== 0);
      
      if (terminateOn === 'any-error' && hasError) {
        return true;
      }
      
      if (terminateOn === 'all-error') {
        return tasks.every(task => task.exitCode !== 0);
      }
      
      return false;
    }
  };
}

let n_running_tasks = 0;
let completedTasks = [];

async function maybeSpawnTasks(outputHandler, tasks, maxConcurrent, terminationHandler) {
  while (n_running_tasks < maxConcurrent && tasks.length > 0) {
    const task = tasks.shift();
    n_running_tasks++;
    
    // If there's an error with the process, handle it gracefully
    task.proc.on('error', (err) => {
      console.error(`Error starting task (${task.command} ${task.args.join(' ')}): ${err.message}`);
      task.exitCode = 1;
      completedTasks.push(task);
      n_running_tasks--;
      
      // Continue with other tasks
      maybeSpawnTasks(outputHandler, tasks, maxConcurrent, terminationHandler);
    });
    
    await outputHandler.handleOutput(task);
    
    task.proc.on('exit', (code) => {
      task.exitCode = code;
      completedTasks.push(task);
      n_running_tasks--;
      
      // Check if we should terminate based on the exit code
      if (terminationHandler.shouldTerminate(completedTasks)) {
        console.error('Terminating remaining tasks due to error...');
        process.exit(1);
      }
      
      maybeSpawnTasks(outputHandler, tasks, maxConcurrent, terminationHandler);
    });
  }
  
  // If all tasks are complete, exit with proper status code
  if (n_running_tasks === 0 && tasks.length === 0) {
    const hasErrors = completedTasks.some(task => task.exitCode !== 0);
    process.exit(hasErrors ? 1 : 0);
  }
}

// Read commands from stdin, one per line
async function readCommandsFromStdin() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: null,
    terminal: false
  });
  
  const commands = [];
  let taskIndex = 0;
  
  for await (const line of rl) {
    // Skip empty lines
    if (!line.trim()) continue;
    
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
    
    commands.push({
      command,
      args,
      name: `task-${taskIndex++}`
    });
  }
  
  return commands;
}

export async function main() {
  const { options, commands: argCommands, readFromStdin } = parseArguments();
  
  // Set up output handler
  const outputHandler = constructOutputHandler(options.outputFormat, options);
  
  // Set up termination handler
  const terminationHandler = constructTerminationHandler(options.terminateOn);
  
  // Collect all commands (from args and stdin if needed)
  // TODO: make commands into a async generator or stream of commands
  let allCommands = [...argCommands];
  
  if (readFromStdin) {
    const stdinCommands = await readCommandsFromStdin();
    allCommands = allCommands.concat(stdinCommands);
  }
  
  // Create task objects with outputDir if specified
  const tasks = allCommands.map(cmd => new Task({
    ...cmd, 
    outputDir: options.outputDir
  }));
  
  // Start processing tasks
  if (tasks.length > 0) {
    await maybeSpawnTasks(outputHandler, tasks, options.maxTasks, terminationHandler);
  }
}

