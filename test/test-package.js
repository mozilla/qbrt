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
const fs = require('fs-extra');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const spawn = require('child_process').spawn;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
const appDir = path.join(tempDir, 'AppName.app');

// Paths are relative to the top-level directory in which `npm test` is run.
const childProcess = spawn('node', [ path.join('bin', 'cli.js'), 'package', 'test/hello-world.js' ]);

new Promise((resolve, reject) => {
  childProcess.stdout.on('data', data => {
    const output = data.toString('utf8');
    console.log(output.trim());
    // assert.equal(output.trim(), 'console.log: Hello, World!');
  });

  childProcess.stderr.on('data', data => {
    const error = data.toString('utf8');
    console.error(error);
    reject(error);
  });

  childProcess.on('close', code => {
    assert.equal(code, 0);
    resolve();
  });

})
.then(() => {
  if (process.platform === 'darwin') {
    const mountPoint = path.join(tempDir, 'volume');
    return new Promise((resolve, reject) => {
      const dmgFile = path.join('dist', 'AppName.dmg');
      const childProcess = spawn(
        'hdiutil',
        [ 'attach', dmgFile, '-mountpoint', mountPoint, '-nobrowse', '-quiet' ],
        {
          stdio: 'inherit',
        }
      );
      childProcess.on('exit', resolve);
      childProcess.on('error', reject);
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
        const childProcess = spawn(
          'hdiutil',
          [ 'detach', mountPoint, '-quiet' ],
          {
            stdio: 'inherit',
          }
        );
        childProcess.on('exit', resolve);
        childProcess.on('error', reject);
      });
    })
    .then((exitCode) => {
      assert.strictEqual(exitCode, 0, 'app DMG package detached');
    });
  }
})
.then(() => {
  const child = spawn(path.join(appDir, 'Contents', 'MacOS', 'qbrt'));
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
