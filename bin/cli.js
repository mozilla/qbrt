#!/usr/bin/env node

/* Copyright 2017 Mozilla
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

const commandLineArgs = require('command-line-args');
const commandLineCommands = require('command-line-commands');
const fs = require('fs-extra');
const os = require('os');
const package = require('../package.json');
const path = require('path');
const ChildProcess = require('child_process');

const validCommands = [ null, 'run' ];
const { command, argv } = commandLineCommands(validCommands);
const optionDefinitions = [
  { name: 'jsdebugger', type: Boolean },
  { name: 'path', type: String, defaultOption: true },
  { name: 'pause-on-startup', type: Boolean },
];
const options = commandLineArgs(optionDefinitions, { argv: argv });

const DIST_DIR = path.join(__dirname, '..', 'dist');

const EXECUTABLE_DIR = process.platform === 'darwin' ?
                       path.join(DIST_DIR, 'Runtime.app', 'Contents', 'MacOS') :
                       path.join(DIST_DIR, 'runtime');

const EXECUTABLE = process.platform === 'win32' ?
                   path.join(EXECUTABLE_DIR, 'firefox.exe') :
                   path.join(EXECUTABLE_DIR, 'firefox');

const applicationIni = path.join(__dirname, '..', 'application.ini');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `${package.name}-profile-`));

let executableArgs = [
  '--app', applicationIni,
  '--profile', profileDir,
  options.path,
];

// The Mac and Linux runtimes accept either -jsdebugger or --jsdebugger,
// but Windows needs the former, so we use it for all platforms.
options.jsdebugger && executableArgs.push('-jsdebugger');
options['pause-on-startup'] && executableArgs.push('--pause-on-startup');

process.env.MOZ_NO_REMOTE = 1;

const childProcess = ChildProcess.spawn(EXECUTABLE, executableArgs, {
  stdio: 'inherit',
});
childProcess.on('close', code => {
  fs.removeSync(profileDir);
  process.exit(code);
});
