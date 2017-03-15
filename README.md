![Activity Level](https://img.shields.io/badge/status-active-green.svg)
![Stability](https://img.shields.io/badge/stability-unstable-red.svg)
![Travis Status](https://travis-ci.org/mozilla/qbrt.svg?branch=master)
![TaskCluster Status](https://github.taskcluster.net/v1/badge/mozilla/qbrt/master)

qbrt: CLI to a Gecko desktop app runtime
===

qbrt is a command-line interface to a Gecko desktop app runtime.
It's designed to simplify the process of building and testing desktop apps
using Gecko.

# Usage

Install it via npm:

```bash
npm install -g qbrt
```

Installing it also installs a Gecko runtime (currently a nightly build
of Firefox, but in the future it could be a stable build of Firefox
or a custom Gecko runtime). Its simplest use is then to point it at a URL:

```bash
qbrt run https://eggtimer.org/
```

[screenshot]

URLs loaded in this way don’t have privileged access to your system.
They’re treated as web content, not application chrome. You could use
this feature to build a site-specific browser.

To create a desktop app with system privileges, on the other hand,
point qbrt at a local directory:

```bash
qbrt run path/to/my/app/
```

For example, clone qbrt's repo and try the example/ app:

```
git clone https://github.com/mozilla/qbrt.git
qbrt run qbrt/example/
```

qbrt will then start a process and load your app in a privileged context,
which gives it access to Gecko’s APIs for opening windows and loading web
content along with system integration APIs for file manipulation, networking,
process management, etc.

[screenshot]

To package your app for distribution, invoke the ‘package’ command,
which creates a platform-specific package containing both your app’s resources
and the Gecko runtime:

```bash
qbrt package path/to/my/app/
```

# Caveats

While qbrt is written in Node.js, it doesn’t provide Node.js APIs to apps.

qbrt doesn’t yet support runtime version management (i.e. being able to specify which version of Gecko to use, and to switch between them). When you install it, it downloads the latest nightly build of Firefox.

The packaging support is primitive. qbrt creates a shell script (batch script on Windows) to launch your app, and it packages your app using a platform-specific format (ZIP on Windows, DMG on Mac, and Tar/GZip on Linux). But it doesn’t set icons nor most other package meta-data, and it doesn’t create auto-installers nor support signing the package.

In general, qbrt is immature and unstable!
