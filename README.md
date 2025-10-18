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
```

### Available Output Formats

- `raw_mixed` - Raw binary output, mixed together
- `bare` - Line-by-line, no header
- `line_by_line` - Line-by-line, with task name header
- `numbered` - Line-by-line with task name and line number
- `colored` - Line-by-line, colored by process index

### Termination Policies

- `any-error` - Terminate all tasks if any task exits with an error
- `all-error` - Continue running tasks until all are complete, even if some fail
- `none` - Never terminate tasks based on exit codes

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