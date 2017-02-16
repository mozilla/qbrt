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

const executable = process.platform === 'darwin' ? 'Firefox.app/Contents/MacOS/firefox' : 'firefox';
if (process.platform === 'win32') {
  executable += '.exe';
}

let executableArgs = [
  '--app', path.join(__dirname, 'application.ini'),
  options.path,
];

options.jsdebugger && executableArgs.push('--jsdebugger');

const childProcess = ChildProcess.spawn(executable, executableArgs, {
  env: {
    MOZ_NO_REMOTE: 1,
  },
  stdio: 'inherit',
});
childProcess.on('close', code => process.exit(code));
