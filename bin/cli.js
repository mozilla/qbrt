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

const commandLineCommands = require('command-line-commands');
const commandLineUsage = require('command-line-usage');
const packageJson = require('../package.json');

const validCommands = [ null, 'package', 'run', 'version', 'help', 'update', 'install-xulapp' ];
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
    require('../lib/package')(argv);
    break;
  case 'run':
    require('../lib/run')(argv);
    break;
  case 'help':
    displayHelp();
    break;
  case 'update':
    require('../lib/update')();
    break;
  case 'install-xulapp':
    require('../lib/install-xulapp')();
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
