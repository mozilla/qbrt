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

const ChildProcess = require('child_process');
const chalk = require('chalk');
const cli = require('cli');
const decompress = require('decompress');
const extract = require('extract-zip');
const fs = require('fs-extra');
const https = require('https');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const pify = require('pify');

const DOWNLOAD_OS = (() => {
  switch (process.platform) {
  case 'win32':
    switch (process.arch) {
    case 'ia32':
      return 'win';
    case 'x64':
      return 'win64';
    default:
      throw new Error(`unsupported Windows architecture ${process.arch}`);
    }
  case 'linux':
    switch (process.arch) {
    case 'ia32':
      return 'linux';
    case 'x64':
      return 'linux64';
    default:
      throw new Error(`unsupported Linux architecture ${process.arch}`);
    }
  case 'darwin':
    return 'osx';
  }
})();

const DOWNLOAD_URL = `https://download.mozilla.org/?product=firefox-nightly-latest-ssl&lang=en-US&os=${DOWNLOAD_OS}`;
const DIST_DIR = path.join(__dirname, '..', 'dist');

const resourcesDir = path.join(DIST_DIR,
  process.platform === 'darwin' ?
  path.join('Runtime.app', 'Contents', 'Resources') :
  path.join('runtime'));

const FILE_EXTENSIONS = {
  'application/x-apple-diskimage': 'dmg',
  'application/zip': 'zip',
  'application/x-tar': 'tar.bz2',
};

cli.spinner('  Installing runtime…');

fs.ensureDirSync(DIST_DIR);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
const mountPoint = path.join(tempDir, 'volume');

let filePath;
let fileStream;

new Promise((resolve, reject) => {
  function download(url) {
    https.get(url, function(response) {
      if (response.headers.location) {
        let location = response.headers.location;
        // Rewrite Windows installer links to point to the ZIP equivalent,
        // since it's hard to expand the installer programmatically (requires
        // a Node implementation of 7zip).
        if (process.platform === 'win32') {
          location = location.replace(/\.installer\.exe$/, '.zip');
        }
        download(location);
      }
      else {
        resolve(response);
      }
    }).on('error', reject);
  }
  download(DOWNLOAD_URL);
})
.then((response) => {
  const extension = FILE_EXTENSIONS[response.headers['content-type']];
  filePath = path.join(tempDir, `runtime.${extension}`);
  fileStream = fs.createWriteStream(filePath);
  response.pipe(fileStream);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', resolve);
    response.on('error', reject);
  });
})
.then(() => {
  if (process.platform === 'win32') {
    const source = filePath;
    const destination = DIST_DIR;
    fs.removeSync(path.join(destination, 'runtime'));
    return decompress(source, destination)
    .then(() => {
      fs.renameSync(path.join(destination, 'firefox'), path.join(destination, 'runtime'));
    });
  }
  else if (process.platform === 'darwin') {
    return (new Promise((resolve, reject) => {
      const childProcess = ChildProcess.spawn(
        'hdiutil',
        [ 'attach', filePath, '-mountpoint', mountPoint, '-nobrowse', '-quiet' ],
        {
          stdio: 'inherit',
        }
      );
      childProcess.on('exit', resolve);
      childProcess.on('error', reject);
    }))
    .then((exitCode) => {
      if (exitCode) {
        throw new Error(`'hdiutil attach' exited with code ${exitCode}`);
      }

      const source = path.join(mountPoint, 'FirefoxNightly.app');
      // Unlike Windows and Linux, where the destination is the parent dir,
      // on Mac the destination is the installation dir itself, because we've
      // already expanded the archive (DMG) and are copying the dir inside it.
      //
      // XXX Give the destination a different name so searching for "Firefox"
      // in Spotlight doesn't return this copy.
      //
      const destination = path.join(DIST_DIR, 'Runtime.app');
      fs.removeSync(destination);
      return fs.copySync(source, destination);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        const childProcess = ChildProcess.spawn(
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
      if (exitCode) {
        throw new Error(`'hdiutil detach' exited with code ${exitCode}`);
      }
    });
  }
  else if (process.platform === 'linux') {
    const source = filePath;
    const destination = DIST_DIR;
    fs.removeSync(path.join(destination, 'runtime'));
    return decompress(source, destination)
    .then(() => {
      fs.renameSync(path.join(destination, 'firefox'), path.join(destination, 'runtime'));
    });
  }
})
.then(() => {
  // Expand the browser/omni.ja archive so we can access its devtools.
  // We expand it to a different directory so it doesn't overwrite the chrome
  // manifest in the browser/ directory and cause the runtime to try to load
  // components twice when processing both the manifest inside the archive
  // and the expanded one.

  const source = path.join(resourcesDir, 'browser', 'omni.ja');
  const destination = path.join(resourcesDir, 'browser');

  // "decompress" fails silently on omni.ja, so we use extract-zip here instead.
  // TODO: figure out the issue with "decompress" (f.e. that the .ja file
  // extension is unrecognized or that the chrome.manifest file in the archive
  // conflicts with the one already on disk).
  return pify(extract)(source, { dir: destination })
  .then(() => {
    // Delete browser/omni.ja now that we've expanded its files to reduce
    // the footprint of both this installation and any package created from it.
    // TODO: also delete browser files that aren't necessary for devtools.
    fs.removeSync(source);
  });
})
.then(() => {
  // TODO: copy devtools.js/debugger.js from browser/defaults/preferences/
  // to defaults/pref and then remove our copies in defaults/preferences/.

  // Copy our custom devtools.manifest to the resources dir, so we can access
  // the runtime's devtools.
  fs.copySync(path.join(__dirname, '..', 'devtools.manifest'), path.join(resourcesDir, 'devtools.manifest'));
})
.then(() => {
  cli.spinner(chalk.green.bold('✓ ') + 'Installing runtime… done!\n', true);
})
.catch((reason) => {
  cli.spinner(chalk.red.bold('✗ ') + 'Installing runtime… failed!\n', true);
  console.error('Runtime install error: ', reason);
  if (fileStream) {
    fileStream.end();
  }
})
.then(() => {
  // Clean up.  This function executes whether or not there was an error
  // during the postinstall process, so put stuff here that should happen
  // in both cases.
  fs.removeSync(filePath);
  fs.rmdirSync(tempDir);
  // XXX Remove partial copy of Firefox.
  process.exit();
});
