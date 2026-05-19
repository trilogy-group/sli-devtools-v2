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

  // Fallback: URL pattern — sli_p= identifies a SLI search source; ts/tsv must start with ajax or rac
  try {
    const params = new URL(url).searchParams;
    const ts  = params.get('ts')  || '';
    const tsv = params.get('tsv') || '';
    return params.has('sli_p')
      || /^ajax/i.test(ts) || /^ajax/i.test(tsv)
      || /^rac/i.test(ts)  || /^rac/i.test(tsv);
  } catch (e) {
    return false;
  }
}

function getPageType(url) {
  if (/[?&]ts=ajax|[?&]tsv=ajax/i.test(url)) return 'ajax';
  if (/[?&]ts=rac|[?&]tsv=rac/i.test(url))   return 'rac';
  return 'parent';
}

function isLrRequest(url) {
  return /\.sli-r\.com\//i.test(url);
}

function handleSliRequest(url, responseHeaders) {
  const page = getPageType(url);
  profilemanager[page] = { url, headers: responseHeaders || [] };
  const data = {};
  data[page] = profilemanager[page];
  profilemanager.update(data);
}

// --- LR Request Handling ---

function handleLrRequest(url) {
  const debugUrl = url + (url.includes('?') ? '&' : '?') + 'debug=inockf';
  $('.navbar-fixed-top .nav a[href="#profile_lr"]').removeClass('empty error').find('img').show();
  chrome.runtime.sendMessage({ type: 'xhr', url: debugUrl }, function(response) {
    $('.navbar-fixed-top .nav a[href="#profile_lr"]').find('img').hide();
    if (response && response.success) {
      try {
        lrManager.processLRRequest(response.data);
      } catch (e) {
        console.warn('SLI: LR parse error:', e, url);
      }
    } else {
      console.warn('SLI: LR fetch failed:', url, response);
    }
  });
}

// --- Network Monitoring ---

// Detect SLI and LR requests in real time as they complete
chrome.devtools.network.onRequestFinished.addListener(function(request) {
  const url = request.request.url;
  const responseHeaders = request.response.headers || [];

  if (isLrRequest(url)) {
    console.log("SLI: LR request detected:", url);
    handleLrRequest(url);
    return;
  }

  if (isSliRequest(url, responseHeaders)) {
    console.log("SLI: request detected:", url);
    handleSliRequest(url, responseHeaders);
  }
});

// Load any SLI/LR requests the background worker cached before DevTools was opened.
chrome.runtime.sendMessage(
  { type: 'getSliRequests', tabId: chrome.devtools.inspectedWindow.tabId },
  function(cached) {
    if (!cached || Object.keys(cached).length === 0) {
      console.log("SLI: no cached requests. Navigate to an SLI search page.");
      return;
    }

    console.log("SLI: loaded from background cache:", Object.keys(cached));

    // Load LR requests
    if (cached.lr && cached.lr.length > 0) {
      lrManager.resetLR();
      cached.lr.forEach(function(url) { handleLrRequest(url); });
    }

    // Load profile requests (parent/ajax/rac)
    const profileData = {};
    ['parent', 'ajax', 'rac'].forEach(function(page) {
      if (cached[page]) {
        profilemanager[page] = cached[page];
        profileData[page] = cached[page];
      }
    });
    if (Object.keys(profileData).length > 0) {
      profilemanager.update(profileData);
    }
  }
);
