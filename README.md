# Yapara: Yet Another Process Parallelizer

Yapara is a lightweight command-line tool for running multiple processes in parallel with powerful output management. It was created as an experiment in AI-assisted coding, with implementation guidance from Claude AI.

## Features

- Run multiple commands in parallel with configurable concurrency
- Multiple output formatting options (raw, basic, with task names, with line numbers, or colorized)
- Configurable error handling policies
- Accept commands directly from command line or from standard input
- Proper handling of quoted arguments
- Ability to save each task's output to separate files

## Installation

```bash
git clone https://github.com/davebenson/yapara.git
cd yapara
npm install
npm link  # Optional: makes yapara available as a global command
```

## Usage

```
Usage: yapara [options] command [args...]
   or: yapara [options] - < commands-or-args.txt
   or: some_command | yapara [options] --stdin

Options:
  --help, -h        Show this help
  --version, -v     Show version
  --max=N           Maximum number of concurrent tasks (default: 4)
  --format=FMT      Output format (default: colored)
  --terminate-on-failure Terminate if any process fails.
  --output-dir=DIR  Save each task's output to separate files in this directory
  --input=FILENAME  TODO

Available output formats:
    raw_mixed    - raw binary, mixed together
    bare         - line-by-line, no header
    task_header  - line-by-line, header based on task number
    numbered     - line-by-line with header and line-number
    colored      - line-by-line, colored by process-index
    jsonl        - JSONL output (output assumed to be UTF8)
    jsonl_mixed  - line-by-line (output is UTF-8 strings, or binary)
    jsonl_binary - line-by-line (output is binary)
    protobuf     - protobuf encoded entries, with 32-bit little-endian size prefix

Examples:
  yapara --max=8 ls -la find . -name "*.js"
  yapara --format=numbered grep -r "TODO" . python test.py
  find . -type f -name "*.log" | yapara --stdin --format=bare cat
  yapara --max=16 - < my_commands.txt
  yapara --output-dir=./logs grep -r "ERROR" ./logs/* find /var/log -type f -mtime -1

```


Template syntax:
```
  Most characters are passed through, except '%'.
  The following %-sequences are recognized.
  Unknown %-sequences will cause an error.
    %%              A literal percent.
    %i              The index of the task.
    %I              The index of the task, 0-based.

  Numeric values may be prefixed with the similar modifiers
  to printf. For example %06i is the 6-digit index, zero-padded.
  The padding specifiers are recognized, as is 'x' for hex
  and 'o' for octal.
```


### Available Output Formats

- `raw_mixed` - Raw binary output, mixed together
- `bare` - Line-by-line, no header
- `line_by_line` - Line-by-line, with task name header
- `numbered` - Line-by-line with task name and line number
- `colored` - Line-by-line, colored by process index
- `jsonl` - Output events in JSONL format.
- `protobuf` - Output events in 

#### JSONL Options



### Termination Policy

Ideally, all your tasks would complete succesfully.

How do we handle processes that terminate unsuccessfully,
either due to a signal or a non-zero exit status?

By default, we let all processes run.

The exit status is:
- 0: all processes succeeded
- 1: usage errors, etc.
- 2: some process was killed by a signal
- 3: some processes failed with nonzero exit-status
- 4: all processes failed with nonzero exit-status

- --abort-on-error - Terminate all tasks if any task exits with an error

Some error conditions can be ignored:
- --ignore-errors[=CODES] - Treat these error codes as success.
- --ignore-signals[=SIGNALS] - Treat these signals as success.

## Examples

Run multiple commands with 8 parallel processes maximum:
```bash
yapara --max=8 ls -la find . -name "*.js" echo "Task complete"
```

Run with numbered output format:
```bash
yapara --format=numbered grep -r "TODO" . python test.py
```

Read commands from a file:
```bash
yapara --max=16 - < my_commands.txt
```

Read commands from another command:
```bash
find . -type f -name "*.log" | yapara --stdin --format=bare cat

Save each command's output to separate files in the logs directory:
```bash
yapara --output-dir=./logs --format=numbered grep -r "ERROR" ./src find /var/log -type f -mtime -1
```

## Development

This project was developed as an experiment in AI-assisted coding, with major implementation help from Claude AI. The goal was to explore how an AI assistant can contribute to developing a functional command-line utility.

### Running Tests

```bash
npm test
```

## License

ISC

## Contributing

This project is primarily an experiment in AI-assisted coding. However, issues and pull requests are welcome if you'd like to contribute improvements.

## Acknowledgments

- This project was implemented with guidance from Claude AI as an experiment in collaborative coding between humans and AI systems.
- Special thanks to the Node.js community for providing the foundation for this tool.
