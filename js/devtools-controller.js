// devtools-controller.js

// --- Theme toggle ---
(function() {
  const btn = document.getElementById('theme-toggle');
  function applyTheme(light) {
    document.documentElement.classList.toggle('theme-light', light);
    btn.textContent = light ? '🌙' : '☀';
  }
  applyTheme(localStorage.getItem('sli-theme') === 'light');
  btn.addEventListener('click', function() {
    const goLight = !document.documentElement.classList.contains('theme-light');
    localStorage.setItem('sli-theme', goLight ? 'light' : 'dark');
    applyTheme(goLight);
  });
})();

const profilemanager = new ProfileManager();
const lrManager = new LRManager();

// --- Tab Routing ---

function getRoute() {
  const matches = (/[#]([^-]+)-*(.*)/i).exec(window.location.hash);
  if (!matches) return { page: 'profile_parent', tab: '' };
  return { page: matches[1], tab: matches[2] };
}

$(window).on('hashchange', function() {
  const route = getRoute();
  const $current = $(".page.active");

  if ($current.attr('id') !== route.page) {
    $current.hide().removeClass('active');
    $("div#" + route.page + ".page").show().addClass('active');
  }

  if (route.tab) {
    const $page = $("div#" + route.page);
    $page.find("div.tab.active").removeClass('active');
    $page.find("div." + route.tab + ".tab").addClass('active');
  }
});

$('.navbar-fixed-top .nav li').on('click', function() {
  $(this).addClass('active').siblings().removeClass('active');
});

$('.page header .nav-pills li').on('click', function() {
  $(this).addClass('active').siblings().removeClass('active');
});

// --- SLI Request Detection ---

function isSliRequest(url, responseHeaders) {
  // Never intercept profile fetches themselves
  if (url.includes('sli_profile_format=xml') || url.includes('sli_profile=')) return false;

  // Primary: X-SLI-ResultInfo response header (present when x-sli-debug was sent)
  const hasSliHeader = (responseHeaders || []).some(
    h => h.name.toLowerCase() === 'x-sli-resultinfo'
  );
  if (hasSliHeader) return true;

  // Fallback: URL pattern — sli_p= identifies a SLI search source; ts= must be ajax or rac (not a numeric timestamp)
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

function handleSliRequest(url, responseHeaders) {
  const page = getPageType(url);
  profilemanager[page] = { url, headers: responseHeaders || [] };
  const data = {};
  data[page] = profilemanager[page];
  profilemanager.update(data);
}

// --- Network Monitoring ---

// Detect SLI requests in real time as they complete
chrome.devtools.network.onRequestFinished.addListener(function(request) {
  const url = request.request.url;
  const responseHeaders = request.response.headers || [];

  if (isSliRequest(url, responseHeaders)) {
    console.log("SLI: request detected:", url);
    handleSliRequest(url, responseHeaders);
  }
});

// Load any SLI requests the background worker cached before DevTools was opened.
chrome.runtime.sendMessage(
  { type: 'getSliRequests', tabId: chrome.devtools.inspectedWindow.tabId },
  function(cached) {
    if (cached && Object.keys(cached).length > 0) {
      console.log("SLI: loaded from background cache:", Object.keys(cached));
      for (const [page, entry] of Object.entries(cached)) {
        profilemanager[page] = entry;
      }
      profilemanager.update(cached);
    } else {
      console.log("SLI: no cached requests. Navigate to an SLI search page.");
    }
  }
);
