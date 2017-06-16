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

const app = require('./app');
const commandLineArgs = require('command-line-args');

exports.runApp = function runApp(argv) {
  const optionDefinitions = [
    { name: 'debug', type: Boolean },
    { name: 'jsdebugger', type: Boolean },
    { name: 'path', type: String, defaultOption: true, defaultValue: process.cwd() },
    { name: 'wait-for-jsdebugger', type: Boolean },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv, partial: true });

  app.run(options)
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
};
