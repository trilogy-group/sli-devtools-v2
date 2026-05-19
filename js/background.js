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

// --- Per-tab SLI request cache (persisted via chrome.storage.session) ---
// chrome.storage.session survives service worker suspension within a browser session.

function cacheKey(tabId) {
  return 'sli_tab_' + tabId;
}

function getCachedRequests(tabId, callback) {
  const key = cacheKey(tabId);
  chrome.storage.session.get(key, function(result) {
    if (chrome.runtime.lastError) {
      console.warn('SLI bg: storage.session.get error:', chrome.runtime.lastError.message);
      callback({});
      return;
    }
    console.log('SLI bg: storage.session.get key=' + key, result[key] || {});
    callback(result[key] || {});
  });
}

function setCachedRequest(tabId, page, entry) {
  getCachedRequests(tabId, function(current) {
    current[page] = entry;
    const update = {};
    update[cacheKey(tabId)] = current;
    chrome.storage.session.set(update, function() {
      if (chrome.runtime.lastError) {
        console.warn('SLI bg: storage.session.set error:', chrome.runtime.lastError.message);
      } else {
        console.log('SLI bg: stored', page, 'for tab', tabId);
      }
    });
  });
}

function clearCachedRequests(tabId) {
  chrome.storage.session.remove(cacheKey(tabId), function() {
    console.log('SLI bg: cleared cache for tab', tabId);
  });
}

chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (!isSliRequest(details.url, details.responseHeaders)) return;
    const page = getPageType(details.url);
    setCachedRequest(details.tabId, page, { url: details.url, headers: details.responseHeaders || [] });
    console.log('SLI bg: cached', page, 'for tab', details.tabId, details.url);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Clear cache before a new top-level navigation so the new page's
// SLI requests populate fresh (onBeforeNavigate fires before any requests go out).
chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
  if (details.frameId === 0) clearCachedRequests(details.tabId);
});

// Clean up when a tab is closed.
chrome.tabs.onRemoved.addListener(tabId => {
  clearCachedRequests(tabId);
});

// --- Message handlers ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getSliRequests') {
    getCachedRequests(message.tabId, function(cached) {
      sendResponse(cached);
    });
    return true; // async response
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
