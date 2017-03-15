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

const assert = require('assert');
const decompress = require('decompress');
const fileURL = require('file-url');
const fs = pify(require('fs-extra'));
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const spawn = require('child_process').spawn;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
const appDir = path.join(tempDir, process.platform === 'darwin' ? 'shell.app' : 'shell');
const mainURL = fileURL(path.resolve('test', 'hello-world', 'main.html'));

let exitCode = 0;

new Promise((resolve, reject) => {
  const child = spawn('node', [ path.join('bin', 'cli.js'), 'package', mainURL ]);

  child.stdout.on('data', data => {
    const output = data.toString('utf8');
    console.log(output.trim());
    // TODO: determine what package command should output and assert it does.
  });

  child.stderr.on('data', data => {
    const error = data.toString('utf8');
    console.error(error);
    reject(error);
  });

  child.on('exit', code => {
    assert.equal(code, 0);
    resolve();
  });
})
.then(() => {
  if (process.platform === 'win32') {
    const source = path.join('dist', 'shell.zip');
    const destination = tempDir;
    return decompress(source, destination);
  }
  else if (process.platform === 'darwin') {
    const mountPoint = path.join(tempDir, 'volume');
    return new Promise((resolve, reject) => {
      const dmgFile = path.join('dist', 'shell.dmg');
      const child = spawn('hdiutil', ['attach', dmgFile, '-mountpoint', mountPoint, '-nobrowse']);
      child.on('exit', resolve);
      child.on('error', reject);
    })
    .then((code) => {
      assert.strictEqual(code, 0, 'app disk image (.dmg) attached');
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
      assert.strictEqual(code, 0, 'app disk image (.dmg) detached');
    });
  }
  else if (process.platform === 'linux') {
    const source = path.join('dist', 'shell.tgz');
    const destination = tempDir;
    return decompress(source, destination);
  }
})
.then(() => {
  let executable, args = [], shell = false;

  switch (process.platform) {
    case 'win32':
      // TODO: invoke the launcher rather than the runtime.
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

    child.stdout.on('data', data => {
      const output = data.toString('utf8').trim();
      console.log(output);
      try {
        assert(/^console\.log: opened (.*)test\/hello-world\/main\.html in new window$/.test(output));
      }
      finally {
        child.kill('SIGINT');
      }
    });

    child.stderr.on('data', data => {
      // Report error messages that Linux on Travis loves to excrete, such as:
      // GLib-GObject-CRITICAL **: g_object_unref: assertion 'object->ref_count > 0' failed
      console.error(data.toString('utf8').trim());
    });

    child.on('exit', (code, signal) => {
      assert.strictEqual(signal, 'SIGINT', 'app exited with SIGINT');
      resolve();
    });
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
