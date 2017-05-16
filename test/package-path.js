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

// Require *pify* out of order so we can use it to promisify other modules.
const pify = require('pify');

const decompress = require('decompress');
const extract = require('extract-zip');
const fs = pify(require('fs-extra'));
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const spawn = require('child_process').spawn;
const tap = require('tap');

const origWorkDir = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
const appDir = path.join(tempDir, process.platform === 'darwin' ? 'hello-world.app' : 'hello-world');
const commandLineScript = path.join(origWorkDir, 'bin', 'cli.js');
const helloWorldDir = path.join(origWorkDir, 'test', 'hello-world');

let exitCode = 0;

// Change into the temp dir so the package gets written to there.
process.chdir(tempDir);

new Promise((resolve, reject) => {
  const child = spawn('node', [commandLineScript, 'package', helloWorldDir]);

  child.stdout.on('data', data => {
    const output = data.toString('utf8');
    console.log(output.trim());
    // TODO: determine what package command should output and assert it does.
  });

  child.stderr.on('data', data => {
    const error = data.toString('utf8');
    // console.error('test failure due to stderr output');
    console.error(error);
    // reject(error);
  });

  child.on('exit', code => {
    tap.equal(code, 0);
    resolve();
  });
})
.then(() => {
  if (process.platform === 'win32') {
    const source = 'hello-world.zip';
    const destination = tempDir;
    // return decompress(source, destination);
    return pify(extract)(source, { dir: destination });
  }
  else if (process.platform === 'darwin') {
    const mountPoint = path.join(tempDir, 'volume');
    return new Promise((resolve, reject) => {
      const dmgFile = 'hello-world.dmg';
      const child = spawn('hdiutil', ['attach', dmgFile, '-mountpoint', mountPoint, '-nobrowse']);
      child.on('exit', resolve);
      child.on('error', reject);
    })
    .then((code) => {
      tap.equal(code, 0, 'app disk image (.dmg) attached');
      const source = path.join(mountPoint, 'hello-world.app');
      const destination = appDir;
      return fs.copy(source, destination);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        const child = spawn('hdiutil', ['detach', mountPoint]);
        child.on('exit', resolve);
        child.on('error', reject);
      });
    })
    .then((code) => {
      tap.equal(code, 0, 'app disk image (.dmg) detached');
    });
  }
  else if (process.platform === 'linux') {
    const source = 'hello-world.tgz';
    const destination = tempDir;
    return decompress(source, destination);
  }
})
.then(() => {
  let executable, args = [], shell = false;

  switch (process.platform) {
    case 'win32':
      // On Windows, the launcher script launches the runtime and then quits
      // without waiting for the runtime process to exit, so we need to launch
      // the runtime directly.
      //
      // TODO: figure out how to invoke the launcher rather than the runtime
      // (which will probably require converting the launcher into something
      // other than a batch script).
      //
      executable = path.join(appDir, 'firefox.exe');
      args = ['--app', path.win32.resolve(path.join(appDir, 'qbrt/application.ini')), '--new-instance'];
      shell = true;
      break;
    case 'darwin':
      executable = path.join(appDir, 'Contents', 'MacOS', 'hello-world');
      break;
    case 'linux':
      executable = path.join(appDir, 'hello-world');
      break;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: shell });

    let totalOutput = '';
    child.stdout.on('data', data => {
      const output = data.toString('utf8');
      totalOutput += output;
      console.log(output.trim());
    });

    child.stderr.on('data', data => {
      // Report error messages that Linux on Travis loves to excrete, such as:
      // GLib-GObject-CRITICAL **: g_object_unref: assertion 'object->ref_count > 0' failed
      console.error(data.toString('utf8').trim());
    });

    child.on('exit', (code, signal) => {
      tap.equal(code, 0, 'app exited with success code');
      tap.equal(totalOutput.trim(), 'console.log: Hello, World!');
    });

    child.on('close', (code, signal) => {
      resolve();
    });
  });
})
.catch(error => {
  console.error(error);
  exitCode = 1;
})
.finally(() => {
  process.chdir(origWorkDir);
})
.then(() => {
  return fs.remove(tempDir);
})
.then(() => {
  process.exit(exitCode);
});
