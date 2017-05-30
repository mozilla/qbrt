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

const extract = require('extract-zip');
const decompress = require('decompress');
const fileURL = require('file-url');
const fs = pify(require('fs-extra'));
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const spawn = require('child_process').spawn;
const tap = require('tap');

const origWorkDir = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
const appDir = path.join(tempDir, process.platform === 'darwin' ? 'shell.app' : 'shell');
const commandLineScript = path.join(origWorkDir, 'bin', 'cli.js');
const mainURL = fileURL(path.resolve('test', 'hello-world', 'main.html'));

let exitCode = 0;

// Change into the temp dir so the package gets written to there.
process.chdir(tempDir);

new Promise((resolve, reject) => {
  const child = spawn('node', [commandLineScript, 'package', mainURL]);

  child.stdout.on('data', data => {
    const output = data.toString('utf8');
    console.log(output.trim());
    // TODO: determine what package command should output and assert it does.
  });

  child.stderr.on('data', data => {
    const error = data.toString('utf8');
    console.error('test failure due to stderr output');
    console.error(error);
    reject(error);
  });

  child.on('exit', code => {
    tap.equal(code, 0);
    resolve();
  });
})
.then(() => {
  if (process.platform === 'win32') {
    const source = 'shell.zip';
    const destination = tempDir;
    return pify(extract)(source, { dir: destination });
  }
  else if (process.platform === 'darwin') {
    const mountPoint = path.join(tempDir, 'volume');
    return new Promise((resolve, reject) => {
      const dmgFile = 'shell.dmg';
      const child = spawn('hdiutil', ['attach', dmgFile, '-mountpoint', mountPoint, '-nobrowse']);
      child.on('exit', resolve);
      child.on('error', reject);
    })
    .then((code) => {
      tap.equal(code, 0, 'app disk image (.dmg) attached');
      const source = path.join(mountPoint, 'shell.app');
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
    const source = 'shell.tgz';
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
      executable = path.join(appDir, 'Contents', 'MacOS', 'shell');
      break;
    case 'linux':
      executable = path.join(appDir, 'shell');
      break;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: shell });
    const outputRegex = /opened (.*)test\/hello-world\/main\.html in new window/;

    let totalOutput = '';
    let quitting = false;

    child.stdout.on('data', data => {
      const output = data.toString('utf8');
      totalOutput += output;
      console.log(output.trim());

      if (outputRegex.test(totalOutput) && !quitting) {
        // Now that the app has output the data we were looking for,
        // kill the app.  We assert that the output contains the data
        // after the app finishes dying, since eventually the app
        // will quit itself instead of relying on us to kill it.

        if (process.platform === 'win32') {
          // An app running in the webshell can't quit, so we need to kill
          // the child process ourselves.  And that requires a different command
          // on Windows, where we launch the runtime via a shell, and killing
          // the child process with child.kill() would only kill the shell.
          //
          // The /t option to taskkill performs a "tree kill" of the specified
          // process and its children.
          //
          spawn('taskkill', ['/pid', child.pid, '/t']);
        }
        else {
          child.kill('SIGINT');
        }

        quitting = true;
      }
    });

    child.stderr.on('data', data => {
      // Report error messages that Linux on Travis loves to excrete, such as:
      // GLib-GObject-CRITICAL **: g_object_unref: assertion 'object->ref_count > 0' failed
      console.error(data.toString('utf8').trim());
    });

    child.on('exit', (code, signal) => {
      tap.true(outputRegex.test(totalOutput), 'output confirms page opened');

      if (process.platform === 'win32') {
        tap.equal(code, 0, 'app exited with success code');
      }
      else {
        tap.equal(signal, 'SIGINT', 'app exited with SIGINT');
      }
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
