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
const plist = require('simple-plist');

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
const installDir = path.join(DIST_DIR, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
const executableDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'MacOS') : installDir;
const browserJAR = path.join(resourcesDir, 'browser', 'omni.ja');

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
  // Copy the qbrt xulapp to the target directory.

  // TODO: move qbrt xulapp files into a separate source directory
  // that we can copy in one fell swoop.

  const sourceDir = path.join(__dirname, '..');
  const targetDir = path.join(resourcesDir, 'qbrt');

  fs.mkdirSync(targetDir);

  const appFiles = [
    'application.ini',
    'chrome',
    'chrome.manifest',
    'components',
    'defaults',
    'devtools.manifest',
    'modules',
    'shell',
  ];

  for (const file of appFiles) {
    fs.copySync(path.join(sourceDir, file), path.join(targetDir, file));
  }
})
.then(() => {
  // Expand the browser xulapp's JAR archive so we can access its devtools.

  const targetDir = path.join(resourcesDir, 'browser');

  // "decompress" fails silently on omni.ja, so we use extract-zip here instead.
  // TODO: figure out the issue with "decompress" (f.e. that the .ja file
  // extension is unrecognized or that the chrome.manifest file in the archive
  // conflicts with the one already on disk).
  return pify(extract)(browserJAR, { dir: targetDir });
})
.then(() => {
  // Delete the browser xulapp's JAR archive now that we've expanded its files
  // to reduce the footprint of both this installation and any package created
  // from it.

  // TODO: also delete browser files that aren't necessary for devtools.

  fs.removeSync(browserJAR);
})
.then(() => {
  // Copy devtools pref files from browser to qbert.

  const sourceDir = path.join(resourcesDir, 'browser', 'defaults', 'preferences');
  const targetDir = path.join(resourcesDir, 'qbrt', 'defaults', 'preferences');

  const prefFiles = [
    'debugger.js',
    'devtools.js',
  ];

  for (const file of prefFiles) {
    fs.copySync(path.join(sourceDir, file), path.join(targetDir, file));
  }
})
.then(() => {
  // Move the browser xulapp into a subdirectory of the qbrt xulapp,
  // so the latter can access the former's devtools.

  const sourceDir = path.join(resourcesDir, 'browser');
  const targetDir = path.join(resourcesDir, 'qbrt', 'browser');

  // fs-extra.moveSync() is coming soon, according to this pull request
  // <https://github.com/jprichardson/node-fs-extra/pull/381>;
  // but in the meantime we need to perform the operation asynchronously.
  //
  return new Promise((resolve, reject) => {
    fs.move(sourceDir, targetDir, err => err ? reject(err) : resolve());
  });
})
.then(() => {
  // Copy and configure the stub executable.

  switch(process.platform) {
    case 'darwin': {
      // Copy the stub executable to the executable dir.
      fs.copySync(path.join(__dirname, '..', 'mac-stub'), path.join(executableDir, 'qbrt'));

      // Configure the bundle to run the stub executable.
      const plistFile = path.join(installDir, 'Contents', 'Info.plist');
      const appPlist = plist.readFileSync(plistFile);
      appPlist.CFBundleExecutable = 'qbrt';
      plist.writeFileSync(plistFile, appPlist);

      break;
    }
  }
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
