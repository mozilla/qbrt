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

const assert = require('assert');
const decompress = require('decompress');
const fs = require('fs-extra');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const spawn = require('child_process').spawn;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
const appDir = path.join(tempDir, process.platform === 'darwin' ? 'AppName.app' : 'appname');

new Promise((resolve, reject) => {
  const child = spawn('node', [ path.join('bin', 'cli.js'), 'package', 'test/hello-world.js' ]);

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
    const source = path.join('dist', 'appname.zip');
    const destination = tempDir;
    fs.removeSync(path.join(destination, 'appname'));
    return decompress(source, destination);
  }
  if (process.platform === 'linux') {
    const source = path.join('dist', 'appname.tgz');
    const destination = tempDir;
    fs.removeSync(path.join(destination, 'appname'));
    return decompress(source, destination);
  }
  else if (process.platform === 'darwin') {
    const mountPoint = path.join(tempDir, 'volume');
    return new Promise((resolve, reject) => {
      const dmgFile = path.join('dist', 'AppName.dmg');
      const child = spawn(
        'hdiutil',
        [ 'attach', dmgFile, '-mountpoint', mountPoint, '-nobrowse', '-quiet' ],
        {
          stdio: 'inherit',
        }
      );
      child.on('exit', resolve);
      child.on('error', reject);
    })
    .then((exitCode) => {
      assert.strictEqual(exitCode, 0, 'app DMG package attached');

      const source = path.join(mountPoint, 'AppName.app');
      const destination = appDir;
      fs.removeSync(destination);
      return fs.copySync(source, destination);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        const child = spawn(
          'hdiutil',
          [ 'detach', mountPoint, '-quiet' ],
          {
            stdio: 'inherit',
          }
        );
        child.on('exit', resolve);
        child.on('error', reject);
      });
    })
    .then((exitCode) => {
      assert.strictEqual(exitCode, 0, 'app DMG package detached');
    });
  }
})
.then(() => {
  let executable, args = [];

  switch (process.platform) {
    case 'win32':
      // TODO: invoke the launcher rather than the runtime.
      executable = path.join(appDir, 'firefox.exe');
      args = ['--app', path.win32.resolve(path.join(appDir, 'qbrt/application.ini')), '--new-instance'];
      break;
    case 'darwin':
      executable = path.join(appDir, 'Contents', 'MacOS', 'qbrt');
      break;
    case 'linux':
      executable = path.join(appDir, 'launcher.sh');
      break;
  }

  const child = spawn(executable, args, { shell: process.platform === 'win32' ? true : false });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', data => {
      const output = data.toString('utf8').trim();
      console.log(output);
      assert.strictEqual(output, 'console.log: Hello, World!');
    });

    child.stderr.on('data', data => {
      const error = data.toString('utf8').trim();
      console.error(error);
      reject(error);
    });

    child.on('close', code => {
      assert.strictEqual(code, 0, 'app exited with success code');
      resolve();
    });
  });
})
.then(() => {
  fs.removeSync(tempDir);
})
.catch(error => {
  fs.removeSync(tempDir);
  throw error;
});