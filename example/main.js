const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let features = [
  "chrome",
  "close",
  "dialog=no",
  "extrachrome",
  "resizable",
  "scrollbars",
  "width=1024",
  "height=740",
];

let workDir = Cc["@mozilla.org/file/directory_service;1"].
              getService(Ci.nsIProperties).
              get("CurWorkD", Ci.nsILocalFile);
workDir.append("index.html");
let fileURI = OS.Path.toFileURI(workDir.path);
console.log(`opening ${fileURI} in window`);

let window = Services.ww.openWindow(null, fileURI, "_blank", features.join(","), null);
