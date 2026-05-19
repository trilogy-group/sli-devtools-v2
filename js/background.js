// background.js (Manifest V3 service worker)

// Add x-sli-debug header to all requests so SLI backends include X-SLI-ResultInfo in responses.
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

// --- SLI request detection helpers (mirrored from devtools-controller.js) ---

function isSliRequest(url, responseHeaders) {
  if (url.includes('sli_profile_format=xml') || url.includes('sli_profile=')) return false;
  const hasSliHeader = (responseHeaders || []).some(
    h => h.name.toLowerCase() === 'x-sli-resultinfo'
  );
  if (hasSliHeader) return true;
  try {
    const params = new URL(url).searchParams;
    const ts = params.get('ts');
    return params.has('sli_p') || ts === 'ajax' || ts === 'rac';
  } catch (e) {
    return false;
  }
}

function getPageType(url) {
  if (/[?&]ts=ajax/i.test(url)) return 'ajax';
  if (/[?&]ts=rac/i.test(url)) return 'rac';
  return 'parent';
}

// --- Per-tab SLI request cache ---
// Stores the most recent SLI request seen per page type, keyed by tabId.
const sliCache = {};

chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (!isSliRequest(details.url, details.responseHeaders)) return;
    const page = getPageType(details.url);
    if (!sliCache[details.tabId]) sliCache[details.tabId] = {};
    sliCache[details.tabId][page] = { url: details.url, headers: details.responseHeaders || [] };
    console.log('SLI bg: cached', page, 'for tab', details.tabId, details.url);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Clear cache when the tab navigates to a new page.
chrome.webNavigation.onCommitted.addListener(function(details) {
  if (details.frameId === 0 && sliCache[details.tabId]) {
    delete sliCache[details.tabId];
  }
});

// Clean up when a tab is closed.
chrome.tabs.onRemoved.addListener(tabId => {
  delete sliCache[tabId];
});

// --- Message handlers ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getSliRequests') {
    sendResponse(sliCache[message.tabId] || {});
    return false;
  }

  if (message.type === 'xhr' && message.url) {
    fetch(message.url)
      .then(response => response.text())
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.toString() }));
    return true;
  }

  return false;
});
