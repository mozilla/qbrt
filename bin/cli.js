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

const commandLineArgs = require('command-line-args');
const commandLineCommands = require('command-line-commands');
const fs = require('fs-extra');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const pify = require('pify');
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

  const shellDir = path.join(__dirname, '..', 'shell');
  const appDir = fs.existsSync(options.path) ? path.resolve(options.path) : shellDir;
  const appPackageJson = require(path.join(appDir, 'package.json'));
  const mainEntryPoint = path.join(appDir, appPackageJson.main);

  // Args like 'app', 'new-instance', and 'profile' are handled by nsAppRunner,
  // which supports uni-dash (-foo), duo-dash (--foo), and slash (/foo) variants
  // (the latter only on Windows).
  //
  // But args like 'aqq' and 'jsdebugger' are handled by nsCommandLine methods,
  // which don't support duo-dash arguments on Windows. So, for maximal
  // compatibility (and minimal complexity, modulo this over-long explanation),
  // we always pass uni-dash args to the runtime.

  let executableArgs = [
    '-app', applicationIni,
    '-profile', profileDir,
    '-new-instance',
    '-aqq', mainEntryPoint,
  ];

  if (appDir === shellDir) {
    executableArgs.push(options.path);
  }

  options.jsdebugger && executableArgs.push('-jsdebugger');
  options['wait-for-jsdebugger'] && executableArgs.push('-wait-for-jsdebugger');

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
  const runtimeDir = path.join(DIST_DIR, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
  const appPackageJson = require(path.join(process.cwd(), options.path, 'package.json'));
  // TODO: ensure appPackageJson.name can be used as directory/file name.
  const appName = appPackageJson.name;
  const stageDirName = process.platform === 'darwin' ? `${appName}.app` : appName;

  let stageDir, appTargetDir;

  pify(fs.mkdtemp)(path.join(os.tmpdir(), `${packageJson.name}-`))
  .then(tempDir => {
    stageDir = path.join(tempDir, stageDirName);
    appTargetDir = process.platform === 'darwin' ?
      path.join(stageDir, 'Contents', 'Resources', 'webapp') :
      path.join(stageDir, 'webapp');
    console.log(`target dir: ${stageDir}`);
  })
  .then(() => {
    // Copy the runtime to the staging dir.
    return pify(fs.copy)(runtimeDir, stageDir);
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

    const shellDir = path.join(__dirname, '..', 'shell');
    const appSourceDir = fs.existsSync(options.path) ? path.resolve(options.path) : shellDir;
    console.log(`appSourceDir: ${appSourceDir}`);

    return pify(fs.copy)(appSourceDir, appTargetDir)
    .then(() => {
      if (appSourceDir === shellDir) {
        const appTargetPackageJson = require(path.join(appTargetDir, 'package.json'));
        appTargetPackageJson.mainURL = options.path;
        return pify(fs.writeFile)(appTargetPackageJson, JSON.stringify(appTargetPackageJson));
      }
    });
  })
  .then(() => {
    if (process.platform === 'darwin') {
      const dmgFile = path.join(DIST_DIR, `${appName}.dmg`);
      console.log(dmgFile);
      // TODO: notify user friendlily that DMG file is being created:
      // "Copying app to ${dmgFile}…"
      return pify(fs.remove)(dmgFile)
      .then(() => {
        return new Promise((resolve, reject) => {
          const child = spawn('hdiutil', ['create', '-srcfolder', stageDir, dmgFile]);
          child.on('exit', resolve);
          // TODO: handle errors returned by hdiutil.
        });
      });
    }
    else if (process.platform === 'linux') {
      const archiver = require('archiver');
      return new Promise((resolve, reject) => {
        const tarFile = fs.createWriteStream(path.join(DIST_DIR, `${appName}.tgz`));
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
        const zipFile = fs.createWriteStream(path.join(DIST_DIR, `${appName}.zip`));
        const archive = archiver('zip');
        zipFile.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(zipFile);
        archive.directory(stageDir, path.basename(stageDir));
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
    // TODO: delete temp directory.
  });
}
