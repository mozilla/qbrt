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

const commandLineArgs = require('command-line-args');
const commandLineCommands = require('command-line-commands');
const fs = pify(require('fs-extra'));
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const ChildProcess = require('child_process');
const spawn = require('child_process').spawn;

const DIST_DIR = path.join(__dirname, '..', 'dist');

const validCommands = [ null, 'package', 'run' ];
const { command, argv } = commandLineCommands(validCommands);

switch(command) {
  case 'package':
    packageApp();
    break;
  case 'run':
    run();
    break;
}

function run() {
  const optionDefinitions = [
    { name: 'jsdebugger', type: Boolean },
    { name: 'path', type: String, defaultOption: true },
    { name: 'wait-for-jsdebugger', type: Boolean },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });

  // TODO: refactor EXECUTABLE_DIR and EXECUTABLE using latest best practices.

  const EXECUTABLE_DIR = process.platform === 'darwin' ?
                         path.join(DIST_DIR, 'Runtime.app', 'Contents', 'MacOS') :
                         path.join(DIST_DIR, 'runtime');

  const EXECUTABLE = process.platform === 'win32' ?
                     path.join(EXECUTABLE_DIR, 'firefox.exe') :
                     path.join(EXECUTABLE_DIR, 'firefox');

  const installDir = path.join(DIST_DIR, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
  const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
  const applicationIni = path.join(resourcesDir, 'qbrt', 'application.ini');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-profile-`));

  let executableArgs = [
    '--app', applicationIni,
    '--profile', profileDir,
    '--new-instance',
    options.path,
  ];

  // The Mac and Linux runtimes accept either -jsdebugger or --jsdebugger,
  // but Windows needs the former, so we use it for all platforms.
  options.jsdebugger && executableArgs.push('-jsdebugger');
  options['wait-for-jsdebugger'] && executableArgs.push('--wait-for-jsdebugger');

  const childProcess = ChildProcess.spawn(EXECUTABLE, executableArgs, {
    stdio: 'inherit',
  });
  childProcess.on('close', code => {
    fs.removeSync(profileDir);
    process.exit(code);
  });
}

function packageApp() {
  const optionDefinitions = [
    { name: 'path', type: String, defaultOption: true },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });

  const runtimeDir = process.platform === 'darwin' ?
                     path.join(DIST_DIR, 'Runtime.app') :
                     path.join(DIST_DIR, 'runtime');

  // TODO: replace all occurrences of 'appname' with actual name of app.
  const targetDirName = process.platform === 'darwin' ? 'AppName.app' : 'appname';

  let tempDir, targetDir, appSourcePath, webAppTargetDir;

  fs.mkdtemp(path.join(os.tmpdir(), `${packageJson.name}-`))
  .then(result => {
    tempDir = result;
    targetDir = path.join(tempDir, targetDirName);
    webAppTargetDir = process.platform === 'darwin' ?
                      path.join(targetDir, 'Contents', 'Resources', 'webapp') :
                      path.join(targetDir, 'webapp');
    console.log(`target dir: ${targetDir}`);
  })
  .then(() => {
    return fs.copy(runtimeDir, targetDir);
  })
  .then(() => {
    appSourcePath = path.resolve(options.path);
    console.log(`appSourcePath: ${appSourcePath}`);
    const webAppSourceDir = path.dirname(appSourcePath);

    return fs.copy(webAppSourceDir, webAppTargetDir)
    .then(path.basename(appSourcePath))
    .catch(error => {
      // TODO: ensure that the error is that webAppSourceDir doesn't exist.
      const webAppSourceDir = path.join(__dirname, '..', 'shell');
      return fs.copy(webAppSourceDir, webAppTargetDir).then(options.path);
    });
  })
  .then(main => {
    const appPackageJson = path.join(webAppTargetDir, 'package.json');
    return fs.writeFile(appPackageJson, JSON.stringify({ main: main }));
  })
  .then(() => {
    if (process.platform === 'darwin') {
      const dmgFile = path.join(DIST_DIR, 'AppName.dmg');
      console.log(dmgFile);
      // TODO: notify user friendlily that DMG file is being created:
      // "Copying app to ${dmgFile}…"
      return fs.remove(dmgFile)
      .then(() => {
        return new Promise((resolve, reject) => {
          const child = spawn('hdiutil', ['create', '-srcfolder', targetDir, dmgFile]);
          child.on('exit', resolve);
          // TODO: handle errors returned by hdiutil.
        });
      });
    }
    else if (process.platform === 'linux') {
      const archiver = require('archiver');
      return new Promise((resolve, reject) => {
        const tarFile = fs.createWriteStream(path.join(DIST_DIR, 'appname.tgz'));
        const archive = archiver('tar', { gzip: true });
        tarFile.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(tarFile);
        archive.directory(targetDir, path.basename(targetDir));
        archive.finalize();
      });
    }
    else if (process.platform === 'win32') {
      const archiver = require('archiver');
      return new Promise((resolve, reject) => {
        const zipFile = fs.createWriteStream(path.join(DIST_DIR, 'appname.zip'));
        const archive = archiver('zip');
        zipFile.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(zipFile);
        archive.directory(targetDir, path.basename(targetDir));
        archive.finalize();
      });
    }
  })
  .then(() => {
    console.log('Archived app.');
  })
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
  });

  // TODO: delete temp directory.
}
