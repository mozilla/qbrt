#!/usr/bin/env node

const commandLineCommands = require('command-line-commands');

const validCommands = [ null ];
const { command, argv } = commandLineCommands(validCommands);

console.log('command: %s', command);
console.log('argv:    %s', JSON.stringify(argv));
