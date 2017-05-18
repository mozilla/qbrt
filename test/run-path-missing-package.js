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

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const spawn = require('child_process').spawn;
const tap = require('tap');

let exitCode = 0;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbrt-test-'));

new Promise((resolve, reject) => {
  // Copy the app to a temporary directory to avoid qbrt finding
  // the package.json file for qbrt itself when looking for the package
  // for the test app.
  const sourceDir = path.join('test', 'hello-world-missing-package');
  const destDir = path.join(tempDir, 'hello-world-missing-package');
  fs.copySync(sourceDir, destDir);

  // Paths are relative to the top-level directory in which `npm test` is run.
  const child = spawn('node', [ path.join('bin', 'cli.js'), 'run', destDir ]);

  let totalOutput = '';

  child.stdout.on('data', data => {
    const output = data.toString('utf8').trim();
    console.log(output);
    totalOutput += output;
  });

  child.stderr.on('data', data => {
    console.error(data.toString('utf8').trim());
  });

  child.on('close', code => {
    tap.equal(totalOutput, 'console.log: Hello, World!');
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
  fs.removeSync(tempDir);
  process.exit(exitCode);
});
