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
or a custom Gecko runtime). Its simplest use is then to invoke the *run*
command with a URL:

```bash
qbrt run https://eggtimer.org/
```

Which will start a process and load the URL into a native window:

[screenshot]

URLs loaded in this way don't have privileged access to the system.
They're treated as web content, not application chrome.

To load a desktop app with system privileges, point qbrt at a local directory
containing a package.json file and main script:

```bash
qbrt run path/to/my/app/
```

For an example, clone qbrt's repo and try its example/ app, which will start
a process and load the app into a privileged context, giving it access
to Gecko's APIs for opening windows and loading web content along with system
integration APIs for file manipulation, networking, process management, etc.:

```bash
git clone https://github.com/mozilla/qbrt.git
qbrt run qbrt/example/
```

(Another good example is
the [shell app](https://github.com/mozilla/qbrt/tree/master/shell)
that qbrt uses to load URLs.)

To package an app for distribution, invoke the *package* command,
which creates a platform-specific package containing both your app's resources
and the Gecko runtime:

```bash
qbrt package path/to/my/app/
```

# Caveats

While qbrt itself is written in Node.js, it doesn't provide Node.js APIs
to apps. Unprivileged URLs have access to Web APIs, and privileged apps
also have access to Gecko's APIs.

qbrt doesn't yet support runtime version management (i.e. being able to specify
which version of Gecko to use, and to switch between them). At the time
you install it, it downloads the latest nightly build of Firefox.
(You can update that nightly build by reinstalling qbrt.)

The packaging support is primitive. qbrt creates a shell script (batch script
on Windows) to launch your app, and it packages your app using
a platform-specific format (ZIP on Windows, DMG on Mac, and tar/gzip on Linux).
But it doesn't set icons nor most other package meta-data, and it doesn't create
auto-installers nor support signing the package.

In general, qbrt is immature and unstable!
