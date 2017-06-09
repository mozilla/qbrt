/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { Runtime } = Cu.import('resource://qbrt/modules/Runtime.jsm', {});

window.addEventListener('load', event => {
  const browser = document.getElementById('content');
  const url = window.arguments[0];

  browser.loadURI(url, null, null);
  // dump instead of console.log to write to stdout for tests.
  dump(`[shell.js] opened ${url} in new window\n`);
  Runtime.openDevTools(browser);

  browser.addEventListener('keydown', event => {
    // Reload the web page when the F5 key is pressed.
    if (event.keyCode && event.keyCode === 116 && !event.shiftKey &&
        !event.altKey && !event.ctrlKey && !event.metaKey) {
      browser.reload();
    }
  }, false, true);

}, false);
