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
  const child = spawn('node', [ path.join('bin', 'cli.js') ]);

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
    // Trailing spaces are intentional in the "wanted" string, as that's how
    // the help text gets displayed.
    tap.equal(totalOutput.trim(), `

qbrt

  qbrt is a command-line interface to a Gecko desktop app runtime. It's         
  designed to simplify the process of building and testing desktop apps using   
  Gecko.                                                                        

Synopsis

  $ qbrt <command> <path or URL> 

Command List

  run       Run an app.                               
  package   Package an app for distribution.          
  update    Update the runtime to its latest version. 

Examples

  1. Run an app at a URL.               $ qbrt run https://eggtimer.org/ 
  2. Run an app at a path.              $ qbrt run path/to/my/app/       
  3. Package an app for distribution.   $ qbrt package path/to/my/app/   

  Project home: https://github.com/mozilla/qbrt

    `.trim());
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
