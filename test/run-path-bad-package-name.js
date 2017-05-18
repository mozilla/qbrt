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

new Promise((resolve, reject) => {
  // Paths are relative to the top-level directory in which `npm test` is run.
  const child = spawn('node', [ path.join('bin', 'cli.js'), 'run', 'test/hello-world-bad-package-name/' ]);
  const outputRegex = /Error: Invalid name: "hello world"/;

  // let totalOutput = '';
  let totalError = '';

  child.stdout.on('data', data => {
    const output = data.toString('utf8');
    console.log(output);
    // totalOutput += output.trim();
  });

  child.stderr.on('data', data => {
    const error = data.toString('utf8');
    console.error(error);
    totalError += error.trim();
    // if (outputRegex.test(totalError) && !quitting) {
    //   child.kill('SIGINT');
    //   quitting = true;
    // }
  });

  child.on('exit', (code, signal) => {
    tap.true(outputRegex.test(totalError), 'output confirms `package.json` contains an invalid name');
    console.log(`exit code: ${code}`);
    console.log(`exit signal: ${signal}`);
  });

  child.on('close', (code, signal) => {
    console.log(`close code: ${code}`);
    console.log(`close signal: ${signal}`);
    tap.equal(code, 1, 'app exited with error code');
    resolve();
  });
})
.catch(error => {
  exitCode = 1;
})
.finally(() => {
  process.exit(exitCode);
});
