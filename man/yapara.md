YAPARA 1 "OCTOBER 2025" Linux "User Manuals"
=======================================

NAME
----

yapara - run programs in parallel

SYNOPSIS
--------

`yapara`  [*command* *arg-1* ...]

DESCRIPTION
-----------

`yapara` is Yet Another PARAllelizer. It runs a number of commands
(possibly large) with parallelism.

The initial part of the command may be given on the command-line
and the rest is supplied from standard-input (or an input file,
if given with --input).

For example:
```
   seq 1 100 | yapara factor
```
This should output factorizations of the first 100 natural
numbers, if you have a version of
`factor` on your command-line.

Here's an excerpt:
```
...
  3 = 3
  4 = 2 * 2
...
```

This will construct a series of command lines,
represented as JSON arrays:
```
   ['factor','1']
   ['factor','2']
   ['factor','3']
   ...
   ['factor','100']
```
(Because the string 'factor' does not
contain '/', it will be looked up on the $PATH
environment variable.)

If no command is given as a command-line argument
to yapara, then it will treat each line as a shell-script
(with an optimization to handle simple commands).

For example
```
   ./yapara <<EOF
make -C project1 > prj1.out
make -C project2 > prj2.out
EOF
```

Several aspects may be configured:

* Running

The maximum number of concurrent processes is configurable.

TODO: retry, throttling

* Output Mode

Normally the outputs are parsed into lines and intermixed.
But there are other options. It may also output JSONL or Binary 
protobuf data, for subsequent reanalysis.

* Summary

Optionally we can render statistics about the processes run.

OPTIONS
-------

Input Modes and Options
-----------------------

Each subprocess is spawned with an executable
and an array of arguments. At the first non-option
argument to `yapara`, the remaining arguments are
treated as a command and then an array of arguments.

* `sh`: If a command-line command is given,
input line will be broken into words
using shell quoting conventions.

If no command-line command is given,
input line will be interpreted as a shell-script
with 'sh -c'.

* `argument`: each line is passed as a single argument
to the `exec` command. This is recommended if you are
passing a filename or something, since it will
avoid quoting problems by directly passing the line as a string.

* `tabsep`: each line is split by tabs, appended to
any command-line commands and arguments.

* `jsonl`: each line is a JSON object.

* `yaml`: TODO

Running Options
---------------
* `max`: maximum number of concurrent processes to run
* `terminate-on-fail`: stop when any process fails, and kill any running processes.

Output Formats and Options
--------------------------
...

--output-mode??
--header
--trailer
--pass-error -- render stderr on stderr, instead of transferring to stdout

Summary Options
---------------
--summary   Print one-line report about processes.

FILES
-----

None used.

ENVIRONMENT
-----------

`FOOCONF`
  If non-null the full pathname for an alternate system wide */etc/foo.conf*.
  Overridden by the `-c` option.

DIAGNOSTICS
-----------

The following exit codes are known:

**0**
  All processed terminated successfully.

**1**
  Usage or startup error.

**2**
  Some process exited with non-zero status.

**3**
  Some process exited with a signal.

AUTHOR
------

Dave Benson <lahiker42@gmail.com>

SEE ALSO
--------

parallel(1).

