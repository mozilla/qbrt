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
const klaw = require('klaw');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const pify = require('pify');
const semver = require('semver');
const spawn = require('child_process').spawn;
const util = require('./util');

const distDir = path.join(__dirname, '..', 'dist', process.platform);
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');

exports.package = (appPackageJson, appName, appVersion, packageFile, mainPath) => {
  const shellDir = path.join(__dirname, '..', 'shell');
  const appSourceDir = fs.existsSync(mainPath) ? path.resolve(mainPath) : shellDir;

  let appTargetDir;
  let stageDir;

  return Promise.resolve()
  .then(() => {
    return pify(fs.mkdtemp)(path.join(os.tmpdir(), `${appPackageJson.name}-`));
  })
  .then(tempDir => {
    const stageDirName = process.platform === 'darwin' ? `${appName}.app` : appName;
    stageDir = path.join(tempDir, stageDirName);
    appTargetDir = process.platform === 'darwin' ?
      path.join(stageDir, 'Contents', 'Resources', 'webapp') :
      path.join(stageDir, 'webapp');
  })
  .then(() => {
    // Copy the runtime to the staging dir.
    return pify(fs.copy)(installDir, stageDir);
  })
  .then(() => {
    // Rename launcher script to the app's name.
    const exeDir = process.platform === 'darwin' ? path.join(stageDir, 'Contents', 'MacOS') : stageDir;
    const source = path.join(exeDir, process.platform === 'win32' ? 'launcher.bat' : 'launcher.sh');
    const target = path.join(exeDir, process.platform === 'win32' ? `${appName}.bat` : appName);
    return pify(fs.move)(source, target);
  })
  .then(() => {
    // Update the Info.plist file with the new name of the launcher script.
    if (process.platform === 'darwin') {
      const plist = require('simple-plist');
      const plistFile = path.join(stageDir, 'Contents', 'Info.plist');
      return pify(plist.readFile)(plistFile)
      .then(appPlist => {
        appPlist.CFBundleExecutable = appName;
        return pify(plist.writeFile)(plistFile, appPlist);
      });
    }
  })
  .then(() => {
    // Copy the app to the stage directory.
    return pify(fs.copy)(appSourceDir, appTargetDir)
    .then(() => {
      if (appSourceDir === shellDir) {
        const appTargetPackageJSONFile = path.join(appTargetDir, 'package.json');
        appPackageJson.mainURL = mainPath;
        return pify(fs.writeFile)(appTargetPackageJSONFile, JSON.stringify(appPackageJson));
      }
    });
  })
  .then(() => {
    if (process.platform === 'darwin') {
      const hdiutilArgs = ['create', '-srcfolder', stageDir];
      return new Promise((resolve, reject) => {
        // macOS 10.9 (Mavericks) has a bug in hdiutil that causes image
        // creation to fail with obscure error -5341.  The problem doesn't seem
        // to exist in earlier and later macOS versions, and the workaround
        // causes the image to be larger than necessary (due to padding
        // that avoids a resize), so we only do it on macOS 10.9.
        if (semver.major(os.release()) === 13) {
          let totalSizeInBytes = 0;
          klaw(stageDir)
          .on('data', item => {
            totalSizeInBytes += item.stats.size;
          })
          .on('end', () => {
            // Tests succeed with padding as low as 15MiB on my macOS 10.9 VM.
            const size = (Math.ceil(totalSizeInBytes/1024/1024) + 15) + 'm';
            hdiutilArgs.push('-size', size);
            resolve();
          });
        }
        else {
          resolve();
        }
      })
      .then(() => {
        return new Promise((resolve, reject) => {
          hdiutilArgs.push(packageFile);
          const child = spawn('hdiutil', hdiutilArgs, { stdio: 'inherit' });
          child.on('exit', resolve);
          // TODO: handle errors returned by hdiutil.
        });
      });
    }
    else if (process.platform === 'linux') {
      const archiver = require('archiver');
      return new Promise((resolve, reject) => {
        const tarFile = fs.createWriteStream(packageFile);
        const archive = archiver('tar', { gzip: true });
        tarFile.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(tarFile);
        archive.directory(stageDir, path.basename(stageDir));
        archive.finalize();
      });
    }
    else if (process.platform === 'win32') {
      const archiver = require('archiver');
      return new Promise((resolve, reject) => {
        const zipFile = fs.createWriteStream(packageFile);
        const archive = archiver('zip');
        zipFile.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(zipFile);
        archive.directory(stageDir, path.basename(stageDir));
        archive.finalize();
      });
    }
  })
  .finally(() => {
    return fs.remove(stageDir);
  });
};

exports.run = (options) => {
  const executableDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'MacOS') : installDir;
  let executable = path.join(executableDir, `firefox${process.platform === 'win32' ? '.exe' : ''}`);
  const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
  const applicationIni = path.join(resourcesDir, 'qbrt', 'application.ini');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-profile-`));

  const shellDir = path.join(__dirname, '..', 'shell');
  const appDir = fs.existsSync(options.path) ? path.resolve(options.path) : shellDir;

  return util.readProjectMetadata(appDir, function transformer(appPackageResult) {
    // First try `main` (Electron), then try `bin` (pkg), and finally fall back to `index.js`.
    appPackageResult.pkg.main = appPackageResult.pkg.main || appPackageResult.pkg.bin || 'index.js';
    return appPackageResult;
  })
  .then(appPackageResult => {
    const mainEntryPoint = path.join(appPackageResult.path, '..', appPackageResult.pkg.main);

    // Args like 'app', 'new-instance', and 'profile' are handled by nsAppRunner,
    // which supports uni-dash (-foo), duo-dash (--foo), and slash (/foo) variants
    // (the latter only on Windows).
    //
    // But args like 'aqq' and 'jsdebugger' are handled by nsCommandLine methods,
    // which don't support duo-dash arguments on Windows. So, for maximal
    // compatibility (and minimal complexity, modulo this over-long explanation),
    // we always pass uni-dash args to the runtime.
    //
    // Per nsBrowserApp, the 'app' flag always needs to be the first in the list.

    let executableArgs = [
      '-app', applicationIni,
      '-profile', profileDir,
      // TODO: figure out why we need 'new-instance' for it to work.
      '-new-instance',
      '-aqq', mainEntryPoint,
      ...(options._unknown || []),
    ];

    if (appDir === shellDir) {
      executableArgs.push(options.path);
    }

    if (options.jsdebugger) {
      executableArgs.push('-jsdebugger');
    }
    if (options['wait-for-jsdebugger']) {
      executableArgs.push('-wait-for-jsdebugger');
    }

    const spawnOptions = {};

    if (options.debug) {
      switch (process.platform) {
        case 'win32':
          console.error('The --debug option is not yet supported on Windows.');
          process.exit(1);
          break;
        case 'darwin':
          executableArgs.unshift(executable, '--');
          executable = 'lldb';
          break;
        case 'linux':
          executableArgs.unshift('--args', executable);
          executable = 'gdb';
          break;
      }
      spawnOptions.stdio = 'inherit';
    }

    return new Promise((resolve, reject) => {
      const child = spawn(executable, executableArgs, spawnOptions);
      // In theory, we should be able to specify the stdio: 'inherit' option
      // when spawning the child to forward its output to our stdout/err streams.
      // But that doesn't work on Windows in a MozillaBuild console.
      if (!options.debug) {
        child.stdout.on('data', data => process.stdout.write(data));
        child.stderr.on('data', data => process.stderr.write(data));
      }

      child.on('close', code => {
        fs.removeSync(profileDir);
        resolve(code);
      });

      process.on('SIGINT', () => {
        // If we get a SIGINT, then kill our child process.  Tests send us
        // this signal, as might the user from a terminal window invocation.
        child.kill('SIGINT');
      });
    });
  });
};
