/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { XPCOMUtils } = Cu.import('resource://gre/modules/XPCOMUtils.jsm', {});

function DisabledAddonManager () {}

DisabledAddonManager.prototype = {
  classID: Components.ID('{ed6e7c79-fcd3-4285-881e-f0cbb0d8ada0}'),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsITimerCallback]),
  _xpcom_factory: XPCOMUtils.generateSingletonFactory(DisabledAddonManager),

  observe (subject, topic, data) {},
  notify (timer) {},
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([DisabledAddonManager]);
