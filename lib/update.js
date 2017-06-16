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
const runtime = require('./runtime');

module.exports = () => {
  let exitCode = 0;
  Promise.resolve()
  .then(() => {
    cli.spinner('  Updating runtime …');
  })
  .then(runtime.update)
  .then(() => {
    cli.spinner(chalk.green.bold('✓ ') + 'Updating runtime … done!', true);
  })
  .catch(error => {
    exitCode = 1;
    cli.spinner(chalk.red.bold('✗ ') + 'Updating runtime … failed!', true);
    console.error(error);
  })
  .finally(() => {
    process.exit(exitCode);
  });
};
