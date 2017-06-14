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
const fs = require('fs-extra');
const os = require('os');
const normalizePackageData = require('normalize-package-data');
const packageJson = require('../package.json');
const path = require('path');
const readPkgUp = require('read-pkg-up');
const spawn = require('child_process').spawn;

const distDir = path.join(__dirname, '..', 'dist', process.platform);
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');

exports.runApp = function runApp(argv) {
  const optionDefinitions = [
    { name: 'debug', type: Boolean },
    { name: 'jsdebugger', type: Boolean },
    { name: 'path', type: String, defaultOption: true, defaultValue: process.cwd() },
    { name: 'wait-for-jsdebugger', type: Boolean },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv, partial: true });

  const executableDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'MacOS') : installDir;
  let executable = path.join(executableDir, `firefox${process.platform === 'win32' ? '.exe' : ''}`);
  const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
  const applicationIni = path.join(resourcesDir, 'qbrt', 'application.ini');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-profile-`));

  const shellDir = path.join(__dirname, '..', 'shell');
  const appDir = fs.existsSync(options.path) ? path.resolve(options.path) : shellDir;

  readProjectMetadata(appDir, function transformer(appPackageResult) {
    // First try `main` (Electron), then try `bin` (pkg), and finally fall back to `index.js`.
    appPackageResult.pkg.main = appPackageResult.pkg.main || appPackageResult.pkg.bin || 'index.js';
    return appPackageResult;
  })
  .then(appPackageResult => {
    return appPackageResult;
  }, error => {
    console.error(error);
    process.exit(1);
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
      process.exit(code);
    });

    process.on('SIGINT', () => {
      // If we get a SIGINT, then kill our child process.  Tests send us
      // this signal, as might the user from a terminal window invocation.
      child.kill('SIGINT');
    });
  });
};

function readProjectMetadata(projectDir, transformer) {
  function transform(result) {
    if (typeof transformer === 'function') {
      result = transformer(result);
    }
    return result;
  }

  function removeUnused(metadata) {
    // Remove unneeded keys that were added by `normalize-package-data`.
    delete metadata._id;
    if (metadata.readme === 'ERROR: No README data found!') {
      delete metadata.readme;
    }
    return metadata;
  }

  return readPkgUp({cwd: projectDir}).then(result => {
    // If the app doesn't have a package.json file, then result.pkg will be
    // undefined, but we assume it's defined in other parts of the codebase,
    // so ensure that it's defined, even if it's just an empty object.
    result.pkg = result.pkg || {};

    // If the app doesn't have a package.json file, then result.path will be
    // undefined, but we assume it's defined in other parts of the codebase,
    // so ensure that it's defined, even if the file doesn't actually exist.
    result.path = result.path || path.join(projectDir, 'package.json');

    let metadata = result.pkg;

    result = transform(result);

    // `normalizePackageData` will throw if there are any errors
    // (e.g., invalid values for `name` or `version`) in the
    // `package.json` file.
    // To expose warnings, pass a callback as a second argument.
    try {
      normalizePackageData(metadata);
    }
    catch (error) {
      throw error;
    }

    result.pkg = removeUnused(metadata);

    return result;
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
}
