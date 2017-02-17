#!/usr/bin/env node

const ChildProcess = require('child_process');
const fs = require('fs-extra');
const https = require('follow-redirects').https;
const os = require('os');
const path = require('path');
const pify = require('pify');

const DOWNLOAD_OS = { darwin: 'osx' }[process.platform];
const DOWNLOAD_URL = `https://download.mozilla.org/?product=firefox-nightly-latest-ssl&lang=en-US&os=${DOWNLOAD_OS}`;

const FILE_EXTENSIONS = {
  'application/x-apple-diskimage': 'dmg',
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mzrt-'));
const mountPoint = path.join(tempDir, 'volume');

let filePath;
let fileStream;

new Promise((resolve, reject) => {
  https.get(DOWNLOAD_URL, resolve);
})
.then((response) => {
  const extension = FILE_EXTENSIONS[response.headers['content-type']];
  filePath = path.join(tempDir, `firefox.${extension}`);
  fileStream = fs.createWriteStream(filePath);
  response.pipe(fileStream);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', resolve);
    response.on('error', reject);
  });
})
.then(() => {
  console.log(`file downloaded to ${filePath}`);

  return new Promise((resolve, reject) => {
    const childProcess = ChildProcess.spawn(
      'hdiutil',
      [ 'attach', filePath, '-mountpoint', mountPoint ],
      {
        stdio: 'inherit',
      }
    );
    childProcess.on('exit', resolve);
    childProcess.on('error', reject);
  });
})
.then((exitCode) => {
  console.log(`'hdiutil attach' exited with code ${exitCode}`);

  if (exitCode) {
    throw new Error(`'hdiutil attach' exited with code ${exitCode}`);
  }
  const source = path.join(mountPoint, 'FirefoxNightly.app');
  const destination = path.join(__dirname, '..', 'Firefox.app');
  return fs.copySync(source, destination);
})
.then(() => {
  console.log('app package copied');

  return new Promise((resolve, reject) => {
    const childProcess = ChildProcess.spawn(
      'hdiutil',
      [ 'detach', mountPoint ],
      {
        stdio: 'inherit',
      }
    );
    childProcess.on('exit', resolve);
    childProcess.on('error', reject);
  });
})
.then((exitCode) => {
  console.log(`'hdiutil detach' exited with code ${exitCode}`);
})
.catch((reason) => {
  console.error('Postinstall error: ', reason);
  if (fileStream) {
    fileStream.end();
  }
})
.then(() => {
  // Clean up.  This function executes whether or not there was an error
  // during the postinstall process, so put stuff here that should happen
  // in both cases.
  fs.removeSync(filePath);
  fs.rmdirSync(tempDir);
  process.exit();
});
