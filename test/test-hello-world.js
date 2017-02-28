#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const spawn = require('child_process').spawn;

// Paths are relative to the top-level directory in which `npm test` is run.
const childProcess = spawn('node', [ path.join('bin', 'cli.js'), 'run', 'test/hello-world.js' ]);

childProcess.stdout.on('data', data => {
  assert.equal(data.toString('utf8'), 'console.log: Hello, World!\n');
});

childProcess.on('close', code => {
  assert.equal(code, 0);
  process.exit(code);
});
