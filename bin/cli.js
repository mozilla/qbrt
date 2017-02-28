#!/usr/bin/env node

const commandLineArgs = require('command-line-args');
const commandLineCommands = require('command-line-commands');
const path = require('path');
const ChildProcess = require('child_process');

const validCommands = [ null, 'run' ];
const { command, argv } = commandLineCommands(validCommands);
const optionDefinitions = [
  { name: 'jsdebugger', type: Boolean },
  { name: 'path', type: String, defaultOption: true },
];
const options = commandLineArgs(optionDefinitions, { argv: argv });

const DIST_DIR = path.join(__dirname, '..', 'dist');

const EXECUTABLE_DIR = process.platform === 'darwin' ?
                       path.join(DIST_DIR, 'Runtime.app', 'Contents', 'MacOS') :
                       path.join(DIST_DIR, 'runtime');

const EXECUTABLE = process.platform === 'win32' ?
                   path.join(EXECUTABLE_DIR, 'firefox.exe') :
                   path.join(EXECUTABLE_DIR, 'firefox');

let executableArgs = [
  '--app', path.join(__dirname, '..', 'application.ini'),
  options.path,
];

// The Mac and Linux runtimes accept either -jsdebugger or --jsdebugger,
// but Windows needs the former, so we use it for all platforms.
options.jsdebugger && executableArgs.push('-jsdebugger');

process.env.MOZ_NO_REMOTE = 1;

const childProcess = ChildProcess.spawn(EXECUTABLE, executableArgs, {
  stdio: 'inherit',
});
childProcess.on('close', code => process.exit(code));
