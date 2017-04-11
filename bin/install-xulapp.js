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

// Polyfill Promise.prototype.finally().
require('promise.prototype.finally').shim();

const chalk = require('chalk');
const cli = require('cli');
const fs = require('fs-extra');
const path = require('path');
const pify = require('pify');

const distDir = path.join(__dirname, '..', 'dist', process.platform);
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;

function installXULApp() {
  // Copy the qbrt xulapp to the target directory.

  // TODO: move qbrt xulapp files into a separate source directory
  // that we can copy in one fell swoop.

  const sourceDir = path.join(__dirname, '..');
  const targetDir = path.join(resourcesDir, 'qbrt');

  const files = [
    'application.ini',
    'chrome',
    'chrome.manifest',
    'components',
    'defaults',
    'devtools.manifest',
    'modules',
  ];

  return pify(fs.ensureDir)(targetDir)
  .then(() => {
    return Promise.all(files.map(file => pify(fs.copy)(path.join(sourceDir, file), path.join(targetDir, file))));
  });
}

module.exports = installXULApp;

if (require.main === module) {
  cli.spinner('  Installing XUL app…');
  installXULApp()
  .then(() => {
    cli.spinner(chalk.green.bold('✓ ') + 'Installing XUL app… done!', true);
  })
  .catch(error => {
    cli.spinner(chalk.red.bold('✗ ') + 'Installing XUL app… failed!', true);
    console.error(error);
  })
  .finally(() => {
    process.exit();
  });
}
