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

const chalk = require('chalk');
const cli = require('cli');
const commandLineArgs = require('command-line-args');
const commandLineCommands = require('command-line-commands');
const commandLineUsage = require('command-line-usage');
const fs = require('fs-extra');
const klaw = require('klaw');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const pify = require('pify');
const semver = require('semver');
const spawn = require('child_process').spawn;
const util = require('../lib/util');

const distDir = path.join(__dirname, '..', 'dist', process.platform);
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');

const validCommands = [ null, 'package', 'run', 'version', 'help', 'update' ];
let parsedCommands = {};

try {
  parsedCommands = commandLineCommands(validCommands);
}
catch (error) {
  if (error.name === 'INVALID_COMMAND') {
    displayHelp();
    process.exit(1);
  }
  else {
    throw error;
  }
}

const command = parsedCommands.command;
const argv = parsedCommands.argv;

switch (command) {
  case 'package':
    packageApp();
    break;
  case 'run':
    require('../lib/run').runApp(argv);
    break;
  case 'help':
    displayHelp();
    break;
  case 'update':
    updateRuntime();
    break;
  default:
    if (argv.includes('-v') ||
        argv.includes('--v') ||
        argv.includes('--version')) {
      displayVersion();
      break;
    }
    displayHelp();
    break;
}

function packageApp() {
  const optionDefinitions = [
    { name: 'path', alias: 'p', type: String, defaultOption: true, defaultValue: argv[0] || process.cwd() },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });
  const shellDir = path.join(__dirname, '..', 'shell');
  const appSourceDir = fs.existsSync(options.path) ? path.resolve(options.path) : shellDir;
  let appName;
  let appPackageJson;
  let appTargetDir;
  let appVersion;
  let packageFile;
  let tempDir;
  let stageDir;

  util.readProjectMetadata(appSourceDir, function transformer(appPackageResult) {
    // `productName` is a key commonly used in `package.json` files of Electron apps.
    appPackageResult.pkg.name = appPackageResult.pkg.productName || appPackageResult.pkg.name ||
      path.basename(appSourceDir);
    return appPackageResult;
  })
  .then(appPackageResult => {
    return appPackageResult;
  }, error => {
    console.error(error);
    process.exit(1);
  })
  .then(appPackageResult => {
    appPackageJson = appPackageResult.pkg;
    appName = appPackageJson.name;
    appVersion = appPackageJson.version;
    packageFile = `${appName}.` + (appVersion ? `v${appVersion}.` : '') +
      { win32: 'zip', darwin: 'dmg', linux: 'tgz' }[process.platform];
    cli.spinner(`  Packaging ${options.path} -> ${packageFile} …`);
    return appPackageJson;
  })
  .then(appPackageJson => {
    return pify(fs.mkdtemp)(path.join(os.tmpdir(), `${appPackageJson.name}-`));
  })
  .then(tempDirArg => {
    tempDir = tempDirArg;
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
        appPackageJson.mainURL = options.path;
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
  .then(() => {
    cli.spinner(chalk.green.bold('✓ ') + `Packaging ${options.path} -> ${packageFile} … done!`, true);
  })
  .catch((error) => {
    cli.spinner(chalk.red.bold('✗ ') + `Packaging ${options.path} -> ${packageFile} … failed!`, true);
    console.error(error);
  })
  .finally(() => {
    return fs.remove(stageDir);
  });
}

function displayVersion() {
  console.log(packageJson.version);
}

function displayHelp() {
  const sections = [
    {
      header: 'qbrt',
      content: 'qbrt is a command-line interface to a Gecko desktop app runtime. ' +
               'It\'s designed to simplify the process of building and testing desktop apps using Gecko.',
    },
    {
      header: 'Synopsis',
      content: '$ qbrt <command> <path or URL>',
    },
    {
      header: 'Command List',
      content: [
        { name: 'run', summary: 'Run an app.' },
        { name: 'package', summary: 'Package an app for distribution.' },
        { name: 'update', summary: 'Update the runtime to its latest version.' },
      ],
    },
    {
      header: 'Examples',
      content: [
        {
          desc: '1. Run an app at a URL.',
          example: '$ qbrt run https://eggtimer.org/',
        },
        {
          desc: '2. Run an app at a path.',
          example: '$ qbrt run path/to/my/app/',
        },
        {
          desc: '3. Package an app for distribution.',
          example: '$ qbrt package path/to/my/app/',
        },
      ],
    },
    {
      content: `Project home: [underline]{${packageJson.homepage}}`,
    },
  ];

  const usage = commandLineUsage(sections);
  console.log(usage);
}

function updateRuntime() {
  const installRuntime = require('./install-runtime');
  let exitCode = 0;
  cli.spinner('  Updating runtime …');
  installRuntime()
  .then(() => {
    cli.spinner(chalk.green.bold('✓ ') + 'Updating runtime … done!', true);
  })
  .catch(error => {
    exitCode = 1;
    cli.spinner(chalk.red.bold('✗ ') + 'Updating runtime … failed!', true);
    console.error(error);
  })
  .finally(() => {
    process.exit(exitCode);
  });
}

