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

const app = require('./app');
const chalk = require('chalk');
const cli = require('cli');
const commandLineArgs = require('command-line-args');
const fs = require('fs-extra');
const path = require('path');
const util = require('../lib/util');

module.exports = (argv) => {
  const optionDefinitions = [
    { name: 'path', alias: 'p', type: String, defaultOption: true, defaultValue: argv[0] || process.cwd() },
  ];
  const options = commandLineArgs(optionDefinitions, { argv: argv });
  const shellDir = path.join(__dirname, '..', 'shell');
  const appSourceDir = fs.existsSync(options.path) ? path.resolve(options.path) : shellDir;
  const mainPath = options.path;
  let appName;
  let appPackageJson;
  let appVersion;
  let packageFile;

  util.readProjectMetadata(appSourceDir, function transformer(appPackageResult) {
    // `productName` is a key commonly used in `package.json` files of Electron apps.
    appPackageResult.pkg.name = appPackageResult.pkg.productName || appPackageResult.pkg.name ||
      path.basename(appSourceDir);
    return appPackageResult;
  })
  .then(appPackageResult => {
    return appPackageResult;
  }, error => {
    // TODO: let this fall through to the catch handler at the bottom of the outer promise chain.
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
  })
  .then(() => {
    app.package(appPackageJson, appName, appVersion, packageFile, mainPath);
  })
  .then(() => {
    cli.spinner(chalk.green.bold('✓ ') + `Packaging ${options.path} -> ${packageFile} … done!`, true);
  })
  .catch((error) => {
    cli.spinner(chalk.red.bold('✗ ') + `Packaging ${options.path} -> ${packageFile} … failed!`, true);
    console.error(error);
    // TODO: process.exit(1);
  });
};
