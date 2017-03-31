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
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const pify = require('pify');
const spawn = require('child_process').spawn;

const distDir = path.join(__dirname, '..', 'dist');
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');

const validCommands = [ null, 'package', 'run', 'help' ];
const { command, argv } = commandLineCommands(validCommands);

switch(command) {
  case 'package':
    packageApp();
    break;
  case 'run':
    runApp();
    break;
  case 'help':
    displayHelp();
    break;
  default:
    displayHelp();
    break;
}

function runApp() {
  const optionDefinitions = [
    { name: 'jsdebugger', type: Boolean },
    { name: 'path', type: String, defaultOption: true },
    { name: 'wait-for-jsdebugger', type: Boolean },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });

  const executableDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'MacOS') : installDir;
  const executable = path.join(executableDir, `firefox${process.platform === 'win32' ? '.exe' : ''}`);
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
  //
  // Per nsBrowserApp, the 'app' flag always needs to be the first in the list.

  let executableArgs = [
    '-app', applicationIni,
    '-profile', profileDir,
    // TODO: figure out why we need 'new-instance' for it to work.
    '-new-instance',
    '-aqq', mainEntryPoint,
  ];

  if (appDir === shellDir) {
    executableArgs.push(options.path);
  }

  options.jsdebugger && executableArgs.push('-jsdebugger');
  options['wait-for-jsdebugger'] && executableArgs.push('-wait-for-jsdebugger');

  const child = spawn(executable, executableArgs);

  // In theory, we should be able to specify the stdio: 'inherit' option
  // when spawning the child to forward its output to our stdout/err streams.
  // But that doesn't work on Windows in a MozillaBuild console.
  child.stdout.on('data', data => process.stdout.write(data));
  child.stderr.on('data', data => process.stderr.write(data));

  child.on('close', code => {
    fs.removeSync(profileDir);
    process.exit(code);
  });

  process.on('SIGINT', () => {
    // If we get a SIGINT, then kill our child process.  Tests send us
    // this signal, as might the user from a terminal window invocation.
    child.kill('SIGINT');
  });
}

function packageApp() {
  const optionDefinitions = [
    { name: 'path', type: String, defaultOption: true },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });
  const shellDir = path.join(__dirname, '..', 'shell');
  const appSourceDir = fs.existsSync(options.path) ? path.resolve(options.path) : shellDir;
  const appPackageJson = require(path.join(appSourceDir, 'package.json'));

  // TODO: ensure appPackageJson.name can be used as directory/file name.
  const appName = appPackageJson.name;
  const stageDirName = process.platform === 'darwin' ? `${appName}.app` : appName;
  const packageFile = `${appName}.` + { win32: 'zip', darwin: 'dmg', linux: 'tgz' }[process.platform];

  let stageDir, appTargetDir;

  cli.spinner(`  Packaging ${options.path} -> ${packageFile} …`);

  pify(fs.mkdtemp)(path.join(os.tmpdir(), `${packageJson.name}-`))
  .then(tempDir => {
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
        const appTargetPackageJSON = require(appTargetPackageJSONFile);
        appTargetPackageJSON.mainURL = options.path;
        return pify(fs.writeFile)(appTargetPackageJSONFile, JSON.stringify(appTargetPackageJSON));
      }
    });
  })
  .then(() => {
    if (process.platform === 'darwin') {
      return new Promise((resolve, reject) => {
        const child = spawn('hdiutil', ['create', '-srcfolder', stageDir, packageFile]);
        child.on('exit', resolve);
        // TODO: handle errors returned by hdiutil.
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
    console.error(`  Error: ${error}`);
  })
  .finally(() => {
    return fs.remove(stageDir);
  });
}

function displayHelp() {
  const optionDefinitions = [
    { name: 'jsdebugger', type: Boolean, group: 'run', description: 'Open the runtime toolbox, which is primarily useful for debugging the runtime itself.' },
    { name: 'wait-for-jsdebugger', type: Boolean, group: 'run', description: 'Pause the runtime at startup until the runtime toolbox connects.' },
  ];


  const sections = [
    {
      header: 'qbrt',
      content: 'qbrt is a command-line interface to a Gecko desktop app runtime. It\'s designed to simplify the process of building and testing desktop apps using Gecko.',
    },
    {
      header: 'Synopsis',
      content: '$ qbrt <command> <path or URL>',
    },
    {
      header: 'Command List',
      content: [
        { name: 'help', summary: 'Display help information about qbrt.' },
        { name: 'run', summary: 'Runs a project (local or remote).' },
        { name: 'package', summary: 'Packages a project for distribution.' },
      ],
    },
    {
      header: 'Run options',
      optionList: optionDefinitions,
      group: [ 'run'],
    },
    {
      header: 'Examples',
      content: [
        {
          desc: '1. Running a remote project. ',
          example: '$ qbrt run https://eggtimer.org/',
        },
        {
          desc: '2. Running a local project. ',
          example: '$ qbrt run path/to/my/app/',
        },
        {
          desc: '3. Packaging an app for distribution. ',
          example: '$ qbrt package path/to/my/app/',
        },
      ],
    },
    {
      content: 'Project home: [underline]{https://github.com/mozilla/qbrt}',
    },
  ];

  const usage = commandLineUsage(sections);
  console.log(usage);
}
