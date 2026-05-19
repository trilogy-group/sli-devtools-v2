/*

devtools-load.js

This script loads the dev tools panel. This page is called from devtools.html which is called in the manifest.

*/

var debug_panel = chrome.devtools.panels.create("SLI Dev Tools",
  "img/debuggersmall.png",
  "debugger.html",
  function(panel) {
    console.log('Finished loading Debugger panel.');
  }
);
