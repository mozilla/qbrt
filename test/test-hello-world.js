#!/usr/bin/env node

"use strict";

const assert = require('assert');
const path = require('path');
const spawn = require('child_process').spawn;

// Paths are relative to the top-level directory in which `npm test` is run.
const childProcess = spawn('node', [ path.join('bin', 'cli.js'), 'run', 'test/hello-world.js' ]);

childProcess.stdout.on('data', data => {
  const output = data.toString('utf8');
  console.log(output);
  assert.equal(output, 'console.log: Hello, World!\n');
});

childProcess.stderr.on('data', data => {
  console.error(data.toString('utf8'));
});

childProcess.on('close', code => {
  assert.equal(code, 0);
  process.exit(code);
});
