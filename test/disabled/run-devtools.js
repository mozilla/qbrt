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

const path = require('path');
const spawn = require('child_process').spawn;
const tap = require('tap');

let exitCode = 0;

const expectedOutput = [
  'Developer Tools - data:text/plain;charset=US-ASCII,browser-chrome',
  'Developer Tools - data:text/plain;charset=US-ASCII,browser-content-primary',
  'Developer Tools - data:text/plain;charset=US-ASCII,browser-content',
  'Developer Tools - chrome://app/content/window.xul',
];


new Promise((resolve, reject) => {
  // Paths are relative to the top-level directory in which `npm test` is run.
  const child = spawn('node', [ path.join('bin', 'cli.js'), 'run', 'test/devtools/' ]);

  let totalOutput = '';

  child.stdout.on('data', data => {
    const output = data.toString('utf8');
    console.log(output.trim());
    totalOutput += output;
  });

  child.stderr.on('data', data => {
    console.error(data.toString('utf8').trim());
  });

  child.on('close', code => {
    tap.true(totalOutput.indexOf(expectedOutput[0]) !== -1);
    tap.true(totalOutput.indexOf(expectedOutput[1]) !== -1);
    tap.true(totalOutput.indexOf(expectedOutput[2]) !== -1);
    tap.true(totalOutput.indexOf(expectedOutput[3]) !== -1);
    tap.equal(code, 0, 'app exited with success code');
  });

  child.on('close', (code, signal) => {
    resolve();
  });
})
.catch(error => {
  console.error(error);
  exitCode = 1;
})
.finally(() => {
  process.exit(exitCode);
});
