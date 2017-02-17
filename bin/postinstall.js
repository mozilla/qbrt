#!/usr/bin/env node

const ChildProcess = require('child_process');
const decompress = require('decompress');
const extract = require('extract-zip');
const fs = require('fs-extra');
const https = require('https');
const os = require('os');
const path = require('path');
const pify = require('pify');

const DOWNLOAD_OS = (() => { switch (process.platform) {
  case 'win32':
    switch (process.arch) {
      case 'ia32':
        return 'win';
      case 'x64':
        return 'win64';
      default:
        throw new Error(`unsupported Windows architecture ${process.arch}`);
    }
  case 'linux':
    switch (process.arch) {
      case 'ia32':
        return 'linux';
      case 'x64':
        return 'linux64';
      default:
        throw new Error(`unsupported Linux architecture ${process.arch}`);
    }
  case 'darwin':
    return 'osx';
}})();

const DOWNLOAD_URL = `https://download.mozilla.org/?product=firefox-nightly-latest-ssl&lang=en-US&os=${DOWNLOAD_OS}`;

const FILE_EXTENSIONS = {
  'application/x-apple-diskimage': 'dmg',
  'application/zip': "zip",
  'application/x-tar': 'tar.bz2',
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mzrt-'));
const mountPoint = path.join(tempDir, 'volume');

// XXX Store Firefox in dist/ directory or the like.
// XXX Rename Firefox to Runtime (Runtime.app on Mac).

let filePath;
let fileStream;

new Promise((resolve, reject) => {
  // We could use the follow-redirects module to follow redirects automagically,
  // except that we need to modify the final URL on Windows to get the ZIP file
  // instead of the installer, since it's hard to expand the installer
  // (without a JS implementation of 7zip, which is hard to find for Node).
  // So instead we use this simple recursive function to follow redirects.
  function download(url) {
    https.get(url, function(response) {
      if (response.headers.location) {
        let location = response.headers.location;
        if (process.platform === 'win32') {
          location = location.replace(/\.installer\.exe$/, '.zip');
        }
        download(location);
      }
      else {
        resolve(response);
      }
    }).on('error', reject);
  }
  download(DOWNLOAD_URL);
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

  if (process.platform === 'win32') {
    const source = filePath;
    const destination = path.join(__dirname, '..');
    // XXX Handle the destination already existing.
    // XXX Show progress (or at least notify that decompressing is underway).
    return decompress(source, destination).then((files) => {
      console.log('expanded zip archive');
    });
  }
  else if (process.platform === 'darwin') {
    return (new Promise((resolve, reject) => {
      const childProcess = ChildProcess.spawn(
        'hdiutil',
        [ 'attach', filePath, '-mountpoint', mountPoint, '-nobrowse' ],
        {
          stdio: 'inherit',
        }
      );
      childProcess.on('exit', resolve);
      childProcess.on('error', reject);
    }))
    .then((exitCode) => {
      console.log(`'hdiutil attach' exited with code ${exitCode}`);

      if (exitCode) {
        throw new Error(`'hdiutil attach' exited with code ${exitCode}`);
      }
      const source = path.join(mountPoint, 'FirefoxNightly.app');
      const destination = path.join(__dirname, '..', 'Firefox.app');
      // XXX Handle the destination already existing.
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
    });
  }
  else if (process.platform === 'linux') {
    const source = filePath;
    const destination = path.join(__dirname, '..');
    // XXX Handle the destination already existing.
    // XXX Show progress (or at least notify that decompressing is underway).
    return decompress(source, destination).then((files) => {
      console.log('expanded tar.bz2 archive');
    });
  }
})
.then(() => {
  // Unzip the browser/omni.ja archive so we can access its devtools.
  // decompress fails silently on omni.ja, so we use extract-zip here instead.

  let browserArchivePath = path.join(__dirname, '..');
  if (process.platform === "darwin") {
    browserArchivePath = path.join(browserArchivePath, 'Firefox.app', 'Contents', 'Resources');
  }
  else {
    browserArchivePath = path.join(browserArchivePath, 'firefox');
  }
  browserArchivePath = path.join(browserArchivePath, 'browser');

  const source = path.join(browserArchivePath, 'omni.ja');
  const destination = browserArchivePath;
  return pify(extract)(source, { dir: destination });
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
  // XXX Remove partial copy of Firefox.
  process.exit();
});
