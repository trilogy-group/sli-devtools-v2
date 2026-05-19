// background.js (Manifest V3 service worker)

// Add x-sli-debug header to all requests so SLI backends include X-SLI-ResultInfo in responses.
// This is the MV3 equivalent of the old webRequest.onBeforeSendHeaders approach.
function setupDeclarativeNetRequest() {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{
          header: "x-sli-debug",
          operation: "set",
          value: "resultinfo"
        }]
      },
      condition: {
        resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"]
      }
    }]
  }).catch(err => console.warn("SLI: declarativeNetRequest setup failed:", err));
}

chrome.runtime.onInstalled.addListener(setupDeclarativeNetRequest);
chrome.runtime.onStartup.addListener(setupDeclarativeNetRequest);

// XHR proxy — devtools pages cannot make cross-origin requests directly.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "xhr" && message.url) {
    fetch(message.url)
      .then(response => response.text())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.toString() }));
    return true; // keep message channel open for async response
  }
  return false;
});

chrome.tabs.onRemoved.addListener(tabId => {
  console.log("SLI: tab removed:", tabId);
});
