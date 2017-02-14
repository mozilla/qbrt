const WINDOW_URL = "chrome://app/content/index.html";

const WINDOW_FEATURES = [
  "chrome",
  "close",
  "dialog=no",
  "extrachrome",
  "resizable",
  "scrollbars",
  "width=1024",
  "height=740",
].join(",");

Services.ww.openWindow(null, WINDOW_URL, "_blank", WINDOW_FEATURES, null);
