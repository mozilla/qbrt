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

'use strict';

const commandLineArgs = require('command-line-args');
const commandLineCommands = require('command-line-commands');
const fs = require('fs-extra');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const ChildProcess = require('child_process');

const DIST_DIR = path.join(__dirname, '..', 'dist');

const validCommands = [ null, 'package', 'run' ];
const { command, argv } = commandLineCommands(validCommands);

switch(command) {
  case 'package':
    packageApp();
    break;
  case 'run':
    run();
    break;
}

function run() {
  const optionDefinitions = [
    { name: 'jsdebugger', type: Boolean },
    { name: 'path', type: String, defaultOption: true },
    { name: 'wait-for-jsdebugger', type: Boolean },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });

  // TODO: refactor EXECUTABLE_DIR and EXECUTABLE using latest best practices.

  const EXECUTABLE_DIR = process.platform === 'darwin' ?
                         path.join(DIST_DIR, 'Runtime.app', 'Contents', 'MacOS') :
                         path.join(DIST_DIR, 'runtime');

  const EXECUTABLE = process.platform === 'win32' ?
                     path.join(EXECUTABLE_DIR, 'firefox.exe') :
                     path.join(EXECUTABLE_DIR, 'firefox');

  const installDir = path.join(DIST_DIR, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
  const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
  const applicationIni = path.join(resourcesDir, 'qbrt', 'application.ini');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-profile-`));

  let executableArgs = [
    '--app', applicationIni,
    '--profile', profileDir,
    '--new-instance',
    options.path,
  ];

  // The Mac and Linux runtimes accept either -jsdebugger or --jsdebugger,
  // but Windows needs the former, so we use it for all platforms.
  options.jsdebugger && executableArgs.push('-jsdebugger');
  options['wait-for-jsdebugger'] && executableArgs.push('--wait-for-jsdebugger');

  const childProcess = ChildProcess.spawn(EXECUTABLE, executableArgs, {
    stdio: 'inherit',
  });
  childProcess.on('close', code => {
    fs.removeSync(profileDir);
    process.exit(code);
  });
}

function packageApp() {
  const optionDefinitions = [
    { name: 'path', type: String, defaultOption: true },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });

  const runtimeDir = process.platform === 'darwin' ?
                     path.join(DIST_DIR, 'Runtime.app') :
                     path.join(DIST_DIR, 'runtime');

  // const appDir = path.resolve();

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
  console.log(targetDir);

  // Copy runtime to target directory.
  fs.copySync(runtimeDir, targetDir);

  // Copy webapp to target directory.
  const appSourcePath = path.resolve(options.path);
  if (fs.existsSync(appSourcePath)) {
    console.log(path.dirname(appSourcePath));
    const webAppSourceDir = path.dirname(appSourcePath);
    const webAppTargetDir = process.platform === 'darwin' ?
                            path.join(targetDir, 'Contents', 'Resources', 'webapp') :
                            path.join(targetDir, 'webapp');
    fs.copySync(webAppSourceDir, webAppTargetDir);

    const appPackageJson = path.join(webAppTargetDir, 'package.json');
    fs.writeFileSync(appPackageJson, JSON.stringify({ main: path.basename(appSourcePath) }));
  }
  else {
    const webAppSourceDir = path.join(__dirname, '..', 'shell');
    const webAppTargetDir = process.platform === 'darwin' ?
                            path.join(targetDir, 'Contents', 'Resources', 'webapp') :
                            path.join(targetDir, 'webapp');
    fs.copySync(webAppSourceDir, webAppTargetDir);

    const appPackageJson = path.join(webAppTargetDir, 'package.json');
    fs.writeFileSync(appPackageJson, JSON.stringify({ main: options.path }));
  }

  // Package target directory.
  // Delete target directory.
}
