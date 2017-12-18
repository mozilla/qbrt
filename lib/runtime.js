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

const decompress = require('decompress');
// const extract = require('extract-zip');
const fs = require('fs-extra');
const https = require('https');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const pify = require('pify');
const plist = require('simple-plist');
const spawn = require('child_process').spawn;

const downloadOS = (() => {
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

const downloadURL = `https://download.mozilla.org/?product=firefox-nightly-latest-ssl&lang=en-US&os=${downloadOS}`;
const distDir = path.join(__dirname, '..', 'dist', process.platform);
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
const executableDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'MacOS') : installDir;
// const browserJAR = path.join(resourcesDir, 'browser', 'omni.ja');

const fileExtensions = {
  'application/x-apple-diskimage': 'dmg',
  'application/zip': 'zip',
  'application/x-tar': 'tar.bz2',
};

exports.update = () => {
  let tempDir, mountPoint, filePath, fileStream;

  return Promise.resolve()
  .then(() => {
    return pify(fs.ensureDir)(distDir);
  })
  .then(() => {
    return pify(fs.mkdtemp)(path.join(os.tmpdir(), `${packageJson.name}-`));
  })
  .then(tempDirArg => {
    tempDir = tempDirArg;
    mountPoint = path.join(tempDir, 'volume');
  })
  .then(() => {
    return new Promise((resolve, reject) => {
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
      download(downloadURL);
    });
  })
  .then((response) => {
    const extension = fileExtensions[response.headers['content-type']];
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
      const destination = distDir;
      return pify(fs.remove)(path.join(destination, 'runtime'))
      .then(() => {
        return decompress(source, destination);
      })
      .then(() => {
        return pify(fs.rename)(path.join(destination, 'firefox'), path.join(destination, 'runtime'));
      });
    }
    else if (process.platform === 'darwin') {
      return (new Promise((resolve, reject) => {
        const child = spawn(
          'hdiutil',
          [ 'attach', filePath, '-mountpoint', mountPoint, '-nobrowse', '-quiet' ],
          {
            stdio: 'inherit',
          }
        );
        child.on('exit', resolve);
        child.on('error', reject);
      }))
      .then((exitCode) => {
        if (exitCode) {
          throw new Error(`'hdiutil attach' exited with code ${exitCode}`);
        }
      })
      .then(() => {
        const source = path.join(mountPoint, 'FirefoxNightly.app');
        // Unlike Windows and Linux, where the destination is the parent dir,
        // on Mac the destination is the installation dir itself, because we've
        // already expanded the archive (DMG) and are copying the dir inside it.
        //
        // We give the destination a different name so searching for "Firefox"
        // in Spotlight doesn't return this copy.
        //
        const destination = path.join(distDir, 'Runtime.app');

        return pify(fs.remove)(destination)
        .then(() => {
          return pify(fs.copy)(source, destination);
        });
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
        if (exitCode) {
          throw new Error(`'hdiutil detach' exited with code ${exitCode}`);
        }
      });
    }
    else if (process.platform === 'linux') {
      const source = filePath;
      const destination = distDir;
      return pify(fs.remove)(path.join(destination, 'runtime'))
      .then(() => {
        return decompress(source, destination);
      })
      .then(() => {
        return pify(fs.rename)(path.join(destination, 'firefox'), path.join(destination, 'runtime'));
      });
    }
  })
  .then(() => {
    return exports.installXULApp();
  })
  // DISABLED because https://bugzilla.mozilla.org/show_bug.cgi?id=1352595
  // breaks decompression with extract-zip too.
  // .then(() => {
  //   // Expand the browser xulapp's JAR archive so we can access its devtools.
  //   // We have to expand it into a subdirectory of qbrt's xulapp directory,
  //   // because chrome manifests can't reference super-directories.

  //   // TODO: limit expansion to browser files that are necessary for devtools.

  //   const targetDir = path.join(resourcesDir, 'qbrt', 'browser');

  //   // "decompress" fails silently on omni.ja, so we use extract-zip here instead.
  //   // TODO: figure out the issue with "decompress" (f.e. that the .ja file
  //   // extension is unrecognized or that the chrome.manifest file in the archive
  //   // conflicts with the one already on disk).
  //   return pify(extract)(browserJAR, { dir: targetDir });
  // })
  // .then(() => {
  //   // Copy devtools pref files from browser to qbrt.

  //   const sourceDir = path.join(resourcesDir, 'qbrt', 'browser', 'defaults', 'preferences');
  //   const targetDir = path.join(resourcesDir, 'qbrt', 'defaults', 'preferences');

  //   const prefFiles = [
  //     'debugger.js',
  //     'devtools.js',
  //   ];

  //   return Promise.all(prefFiles.map(file => pify(fs.copy)(path.join(sourceDir, file), path.join(targetDir, file))));
  // })
  .then(() => {
    // Copy and configure the stub executable.

    switch (process.platform) {
      case 'win32': {
        // Copy the stub executable to the executable dir.
        return pify(fs.copy)(path.join(__dirname, '..', 'launcher.bat'), path.join(executableDir, 'launcher.bat'));
      }
      case 'darwin': {
        return pify(fs.copy)(path.join(__dirname, '..', 'launcher.sh'), path.join(executableDir, 'launcher.sh'))
        .then(() => {
          // Configure the bundle to run the stub executable.
          const plistFile = path.join(installDir, 'Contents', 'Info.plist');
          return pify(plist.readFile)(plistFile)
          .then(appPlist => {
            appPlist.CFBundleExecutable = 'launcher.sh';
            return pify(plist.writeFile)(plistFile, appPlist);
          });
        });
      }
      case 'linux': {
        // Copy the stub executable to the executable dir.
        return pify(fs.copy)(path.join(__dirname, '..', 'launcher.sh'), path.join(executableDir, 'launcher.sh'));
      }
    }
  })
  .catch(error => {
    if (fileStream) {
      fileStream.end();
    }
    throw error;
  })
  .finally(() => {
    return pify(fs.remove)(tempDir);
  });
};

exports.installXULApp = () => {
  // Copy the qbrt xulapp to the target directory.

  // TODO: move qbrt xulapp files into a separate source directory
  // that we can copy in one fell swoop.

  const sourceDir = path.join(__dirname, '..');
  const targetDir = path.join(resourcesDir, 'qbrt');

  const files = [
    'application.ini',
    'chrome',
    'chrome.manifest',
    'components',
    'defaults',
    'devtools.manifest',
    'modules',
  ];

  return pify(fs.ensureDir)(targetDir)
  .then(() => {
    return Promise.all(files.map(file => pify(fs.copy)(path.join(sourceDir, file), path.join(targetDir, file))));
  });
};
