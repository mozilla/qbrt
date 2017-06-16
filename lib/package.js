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
  const mainPath = options.path;
  const appSourceDir = fs.existsSync(mainPath) ? path.resolve(mainPath) : shellDir;

  let appName;
  let appPackageJson;
  let appVersion;

  // We give packageFile a default name that makes sense in command output
  // in case we fail to parse the package metadata, so the error message
  // that references packageFile (upon failure to parse metadata) makes sense.
  let packageFile = '[package file]';

  util.readProjectMetadata(appSourceDir, function transformer(appPackageResult) {
    // `productName` is a key commonly used in `package.json` files of Electron apps.
    appPackageResult.pkg.name = appPackageResult.pkg.productName || appPackageResult.pkg.name ||
      path.basename(appSourceDir);
    return appPackageResult;
  })
  .then(appPackageResult => {
    appPackageJson = appPackageResult.pkg;
    appName = appPackageJson.name;
    appVersion = appPackageJson.version;
    packageFile = `${appName}.` + (appVersion ? `v${appVersion}.` : '') +
      { win32: 'zip', darwin: 'dmg', linux: 'tgz' }[process.platform];

    cli.spinner(`  Packaging ${mainPath} -> ${packageFile} …`);
  })
  .then(() => {
    app.package(appPackageJson, appName, appVersion, packageFile, mainPath);
  })
  .then(() => {
    cli.spinner(chalk.green.bold('✓ ') + `Packaging ${mainPath} -> ${packageFile} … done!`, true);
  })
  .catch(error => {
    cli.spinner(chalk.red.bold('✗ ') + `Packaging ${mainPath} -> ${packageFile} … failed!`, true);
    console.error(error);
    process.exit(1);
  });
};
