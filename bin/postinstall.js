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
const installRuntime = require('./install-runtime');

Promise.resolve()
.then(() => {
  cli.spinner('  Installing runtime …');
})
.then(installRuntime)
.then(() => {
  cli.spinner(chalk.green.bold('✓ ') + 'Installing runtime … done!', true);
})
.catch(error => {
  cli.spinner(chalk.red.bold('✗ ') + 'Installing runtime … failed!', true);
  console.error(error);
})
.finally(() => {
  process.exit();
});
