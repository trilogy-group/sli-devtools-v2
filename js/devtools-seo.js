// devtools-seo.js

ProfileManager.prototype.updateseo = function(page, target) {
  const data = this[page];
  if (!data || !data.xmldoc) return;

  const $xml    = $(data.xmldoc);
  const cgiUrl  = $xml.find('data input element[name="CGI URL"]').attr('value') || '';
  const pParam  = $xml.find('data input element[name="p"]').attr('value') || '';
  const lbc     = $xml.find('data input element[name="lbc"]').attr('value') || '';

  let origin;
  try { origin = new URL(cgiUrl).origin; } catch(e) {
    $(target + ' .seo .seo-content').html('<p class="seo-error">Could not determine domain from profile.</p>');
    return;
  }

  const isSearch = /^q$/i.test(pParam);
  const pageType = isSearch                ? 'Search (p=Q)'
    : /^ln/i.test(pParam)  ? 'LN — Learning Navigation'
    : /^sc/i.test(pParam)  ? 'SC — SiteChampion'
    : /^lpc/i.test(pParam) ? 'LPC — Landing Page Creator'
    : pParam ? 'Other (p=' + pParam + ')' : 'Unknown';

  const $el = $(target + ' .seo .seo-content');
  $el.html('<em class="seo-loading">Checking…</em>');

  var R = {};
  var remaining = 2;

  function check() {
    if (--remaining > 0) return;
    $el.html(seoRender(R, origin, isSearch, pageType, pParam, lbc));
  }

  // 1. Page meta tags from inspected window
  chrome.devtools.inspectedWindow.eval(
    '(function(){' +
      'function safe(fn){try{return fn();}catch(e){return null;}}' +
      'function attr(sel,a){return safe(function(){var e=document.querySelector(sel);return e?e.getAttribute(a):null;});}' +
      'var h1count=0,h1text=null;' +
      'safe(function(){var h1s=document.querySelectorAll("h1");h1count=h1s.length;if(h1count===1)h1text=h1s[0].textContent.replace(/\\s+/g," ").trim().slice(0,80);});' +
      'var ld=[];' +
      'safe(function(){' +
        'var els=document.querySelectorAll("script[type=\'application/ld+json\']");' +
        'for(var i=0;i<els.length;i++){' +
          'safe(function(){' +
            'var o=JSON.parse(els[i].textContent);' +
            'var nodes=o["@graph"]?o["@graph"]:[o];' +
            'for(var j=0;j<nodes.length;j++){' +
              'var t=nodes[j]["@type"];' +
              'if(t)Array.prototype.forEach.call([].concat(t),function(s){if(s)ld.push(String(s));});' +
            '}' +
          '});' +
        '}' +
      '});' +
      'var lang=safe(function(){return document.documentElement.getAttribute("lang");});' +
      'var viewport=attr("meta[name=\'viewport\']","content");' +
      'var favicon=!!safe(function(){return document.querySelector("link[rel~=\'icon\']");});' +
      'var imgTotal=0,imgNoAlt=0;' +
      'safe(function(){var imgs=document.querySelectorAll("img");imgTotal=imgs.length;for(var k=0;k<imgs.length;k++){if(!imgs[k].hasAttribute("alt"))imgNoAlt++;}});' +
      'var robots=attr("meta[name=\'robots\'],meta[name=\'ROBOTS\']","content");' +
      'var title=safe(function(){return document.title||null;});' +
      'var desc=attr("meta[name=\'description\']","content");' +
      'var canonical=attr("link[rel=\'canonical\']","href");' +
      'var ogTitle=attr("meta[property=\'og:title\']","content");' +
      'var ogDesc=attr("meta[property=\'og:description\']","content");' +
      'var ogImage=attr("meta[property=\'og:image\']","content");' +
      'var twCard=attr("meta[name=\'twitter:card\']","content");' +
      'var twTitle=attr("meta[name=\'twitter:title\']","content");' +
      'var twDesc=attr("meta[name=\'twitter:description\']","content");' +
      'return {robots:robots,path:location.pathname,title:title,desc:desc,canonical:canonical,' +
             'h1count:h1count,h1text:h1text,lang:lang,viewport:viewport,favicon:favicon,' +
             'imgTotal:imgTotal,imgNoAlt:imgNoAlt,' +
             'ogTitle:ogTitle,ogDesc:ogDesc,ogImage:ogImage,' +
             'twCard:twCard,twTitle:twTitle,twDesc:twDesc,ld:ld};' +
    '})()',
    function(res, isEx) {
      R.meta = (!isEx && res) ? res : { robots: null, path: '' };
      if (isEx) console.warn('SLI SEO: inspectedWindow.eval failed');
      check();
    }
  );

  // 2. robots.txt → parse → fetch whichever SLI sitemap it references (or fallback to origin)
  chrome.runtime.sendMessage({ type: 'xhr', url: origin + '/robots.txt' }, function(resp) {
    R.robots       = (resp && resp.success) ? resp.data : null;
    R.robotsStatus = (resp && resp.status) || null;

    // Prefer the sitemap URL declared in robots.txt; fall back to the origin path
    var sitemapUrl = origin + '/sli_sitemapindex.xml.gz';
    if (R.robots) {
      var parsedRobots = seoParseRobots(R.robots);
      var sliDeclared = parsedRobots.sitemaps.filter(function(sm) {
        return /sli_sitemapindex/i.test(sm) || /\.resultspage\.com\//i.test(sm);
      });
      if (sliDeclared.length > 0) sitemapUrl = sliDeclared[0];
    }

    R.sitemapFetchedUrl = sitemapUrl;
    chrome.runtime.sendMessage({ type: 'xhr', url: sitemapUrl, decompress: true }, function(resp2) {
      R.sitemapOk     = !!(resp2 && resp2.success);
      R.sitemapStatus = (resp2 && resp2.status) || null;
      R.sitemapXml    = (resp2 && resp2.success) ? resp2.data : null;
      check();
    });
  });
};

var _zdCtx = {};

function seoRender(R, origin, isSearch, pageType, pParam, lbc) {
  var m           = R.meta || {};
  var metaContent = m.robots || null;
  var hasNoindex  = !!(metaContent && /noindex/i.test(metaContent));
  var pagePath    = m.path || '';
  var parsed      = R.robots ? seoParseRobots(R.robots) : null;

  _zdCtx = { origin: origin, pagePath: pagePath, pageType: pageType, lbc: lbc || '' };

  var html = '<div class="seo-columns"><div class="seo-col">';

  // ── Page ─────────────────────────────────────────────────
  html += '<div class="seo-section">';
  html += '<h4 class="seo-section-title">Page</h4>';
  html += seoRow('Page type',    pageType);
  html += seoRow('Current path', pagePath || '<em>unknown</em>');

  if (isSearch) {
    html += seoCheck(
      'Search page noindexed',
      hasNoindex,
      hasNoindex ? null : 'Add <code class="seo-code">&lt;meta name="robots" content="noindex"&gt;</code> to search results pages'
    );
  } else {
    // Crawlable page checks
    if (metaContent) {
      html += seoCheck(
        'Not noindexed',
        !hasNoindex,
        hasNoindex ? '<code class="seo-code">noindex</code> found in meta robots — Google will not index this page' : null
      );
    }

    var title    = m.title    || null;
    var titleLen = title ? title.length : 0;
    html += seoCheck(
      'Title tag',
      !!title,
      title
        ? (titleLen < 30 ? 'Too short (' + titleLen + ' chars) — aim for 30–60' :
           titleLen > 60 ? 'Too long (' + titleLen + ' chars) — aim for 30–60' : null)
        : 'Missing &lt;title&gt; tag'
    );
    if (title) html += seoRow('Title', seoEsc(title) + ' <em class="seo-charcount">(' + titleLen + ')</em>');

    var desc    = m.desc    || null;
    var descLen = desc ? desc.length : 0;
    html += seoCheck(
      'Meta description',
      !!desc,
      desc
        ? (descLen < 70  ? 'Short (' + descLen + ' chars) — aim for 70–160' :
           descLen > 160 ? 'Long (' + descLen + ' chars) — aim for 70–160' : null)
        : 'Missing <code class="seo-code">&lt;meta name="description"&gt;</code>'
    );
    if (desc) html += seoRow('Description', seoEsc(desc) + ' <em class="seo-charcount">(' + descLen + ')</em>');

    var canonical = m.canonical || null;
    var canonOk = !!(canonical && canonical.split('?')[0] === (origin + pagePath));
    html += seoCheck(
      'Canonical',
      !!canonical,
      canonical
        ? (!canonOk ? 'Points to <code class="seo-code">' + seoEsc(canonical) + '</code> — expected <code class="seo-code">' + origin + pagePath + '</code>' : null)
        : 'Missing <code class="seo-code">&lt;link rel="canonical"&gt;</code>'
    );
    if (canonical) html += seoRow('Canonical', '<a href="' + seoEsc(canonical) + '" target="_blank" class="seo-link">' + seoEsc(canonical) + '</a>');

    html += seoCheck(
      'Language declared',
      !!m.lang,
      m.lang ? null : 'Add a <code class="seo-code">lang</code> attribute to the <code class="seo-code">&lt;html&gt;</code> element'
    );
    if (m.lang) html += seoRow('Language', '<code class="seo-code">' + seoEsc(m.lang) + '</code>');

    html += seoCheck(
      'Viewport meta',
      !!m.viewport,
      m.viewport ? null : 'Missing <code class="seo-code">&lt;meta name="viewport"&gt;</code> — required for mobile SEO'
    );

    html += seoCheck(
      'Favicon',
      !!m.favicon,
      m.favicon ? null : 'No <code class="seo-code">&lt;link rel="icon"&gt;</code> found'
    );

    var h1count = typeof m.h1count === 'number' ? m.h1count : null;
    var h1ok    = h1count === 1;
    html += seoCheck(
      'Single H1',
      h1ok,
      h1ok
        ? (m.h1text ? '<em>' + seoEsc(m.h1text) + '</em>' : null)
        : (h1count === 0 ? 'No H1 found on page' : h1count + ' H1 tags found — should be exactly 1')
    );

    if (typeof m.imgTotal === 'number' && m.imgTotal > 0) {
      var imgOk = m.imgNoAlt === 0;
      html += seoCheck(
        'Image alt text',
        imgOk,
        imgOk
          ? m.imgTotal + ' image' + (m.imgTotal !== 1 ? 's' : '') + ', all have alt attributes'
          : m.imgNoAlt + ' of ' + m.imgTotal + ' image' + (m.imgTotal !== 1 ? 's' : '') + ' missing <code class="seo-code">alt</code> attribute'
      );
    }

    // Open Graph
    var ogOk = !!(m.ogTitle && m.ogDesc && m.ogImage);
    html += seoCheck(
      'Open Graph tags',
      ogOk,
      ogOk ? null : [
        !m.ogTitle ? 'Missing <code class="seo-code">og:title</code>' : null,
        !m.ogDesc  ? 'Missing <code class="seo-code">og:description</code>' : null,
        !m.ogImage ? 'Missing <code class="seo-code">og:image</code>' : null
      ].filter(Boolean).join(', ')
    );

    // Twitter Card
    var twOk = !!(m.twCard && m.twTitle && m.twDesc);
    html += seoCheck(
      'Twitter Card',
      twOk,
      twOk ? null : [
        !m.twCard  ? 'Missing <code class="seo-code">twitter:card</code>' : null,
        !m.twTitle ? 'Missing <code class="seo-code">twitter:title</code>' : null,
        !m.twDesc  ? 'Missing <code class="seo-code">twitter:description</code>' : null
      ].filter(Boolean).join(', ')
    );

    // Structured data (JSON-LD)
    var ld    = Array.isArray(m.ld) ? m.ld : [];
    var ldOk  = ld.length > 0;
    var hasInvalid = ld.some(function(t) { return t === '(invalid JSON)'; });
    html += seoCheck(
      'Structured data (JSON-LD)',
      ldOk && !hasInvalid,
      ldOk
        ? (hasInvalid ? 'One or more <code class="seo-code">&lt;script type="application/ld+json"&gt;</code> blocks contain invalid JSON' : null)
        : 'No <code class="seo-code">&lt;script type="application/ld+json"&gt;</code> found'
    );
    if (ldOk) {
      html += seoRow('Schema types', ld.map(function(t) {
        return '<code class="seo-code">' + seoEsc(t) + '</code>';
      }).join(' '));
    }
  }
  html += '</div>';

  html += '</div><div class="seo-col">';

  // ── robots.txt ───────────────────────────────────────────
  html += '<div class="seo-section">';
  html += '<h4 class="seo-section-title">robots.txt — <a href="' + origin + '/robots.txt" target="_blank" class="seo-link">' + origin + '/robots.txt</a></h4>';

  if (!parsed) {
    var robotsErrMsg = 'Could not fetch robots.txt'
      + (R.robotsStatus ? ' <span class="seo-badge seo-badge-warn">HTTP ' + R.robotsStatus + '</span>' : '');
    html += '<p class="seo-error">' + robotsErrMsg + '</p>';
  } else {
    // Search path coverage — only relevant on search pages
    if (isSearch) {
      ['/search', '/search/go'].forEach(function(sp) {
        var ok = parsed.disallows.some(function(d) { return seoPathMatch(sp, d); });
        html += seoCheck('Disallow: ' + sp, ok, ok ? null : 'Not disallowed — search results may be crawled');
      });
    }

    // Current page crawlability — LN/SC/LPC pages should be crawlable (not disallowed)
    if (pagePath && pagePath !== '/' && !isSearch) {
      var covered = parsed.disallows.some(function(d) { return seoPathMatch(pagePath, d); });
      html += seoCheck(
        'Current path crawlable <code class="seo-code">' + pagePath + '</code>',
        !covered,
        covered ? 'Path is blocked by a Disallow rule — Google cannot crawl this page' : null
      );
    }

    // SLI sitemap referenced in robots.txt — matches sli_sitemapindex paths or resultspage.com host
    var sliSm = parsed.sitemaps.filter(function(sm) {
      return /sli_sitemapindex/i.test(sm) || /\.resultspage\.com\//i.test(sm);
    });
    var sliSmDetail = sliSm.length > 0
      ? sliSm.map(function(sm) {
          var httpWarning = /^http:/i.test(sm)
            ? ' <span class="seo-badge seo-badge-warn">http — redirects but prefer https</span>' : '';
          return '<a href="' + seoEsc(sm) + '" target="_blank" class="seo-link">' + seoEsc(sm) + '</a>' + httpWarning;
        }).join('<br>')
      : 'No SLI <code class="seo-code">Sitemap:</code> directive found — add either <code class="seo-code">sli_sitemapindex.xml.gz</code> or <code class="seo-code">resultspage.com</code> sitemap URL';
    html += seoCheck('SLI sitemap in robots.txt', sliSm.length > 0, sliSmDetail);

    // All sitemaps declared
    if (parsed.sitemaps.length > 0) {
      html += '<div class="seo-extra"><span class="seo-label">Sitemaps declared</span>';
      html += '<ul class="seo-list">';
      parsed.sitemaps.forEach(function(sm) {
        html += '<li><a href="' + sm + '" target="_blank" class="seo-link">' + sm + '</a></li>';
      });
      html += '</ul></div>';
    }

    // Relevant Disallow rules: SLI search paths + rules whose prefix covers the current page path
    var relevantDisallows = parsed.disallows.filter(function(d) {
      var prefix = seoRulePrefix(d).toLowerCase();
      var isSliPath = prefix === '/search' || prefix === '/search/go' || /^\/sli/.test(prefix);
      var matchesPage = pagePath && prefix.length > 1 && pagePath.toLowerCase().indexOf(prefix) === 0;
      return isSliPath || matchesPage;
    });
    if (relevantDisallows.length > 0) {
      html += '<div class="seo-extra"><span class="seo-label">Relevant Disallow rules</span>';
      html += '<ul class="seo-list">';
      relevantDisallows.forEach(function(d) {
        var match = pagePath && seoPathMatch(pagePath, d);
        html += '<li' + (match ? ' class="seo-match"' : '') + '>' + d
          + (match ? ' <span class="seo-badge">current page</span>' : '') + '</li>';
      });
      html += '</ul></div>';
    }
  }
  html += '</div>';

  // ── SLI Sitemap ──────────────────────────────────────────
  html += '<div class="seo-section">';
  html += '<h4 class="seo-section-title">SLI Sitemap</h4>';
  var fetchedUrl = R.sitemapFetchedUrl || (origin + '/sli_sitemapindex.xml.gz');
  var sitemapStatusStr = (!R.sitemapOk && R.sitemapStatus) ? ' (HTTP ' + R.sitemapStatus + ')' : '';
  html += seoCheck(
    '<a href="' + seoEsc(fetchedUrl) + '" target="_blank" class="seo-link">' + seoEsc(fetchedUrl) + '</a> accessible',
    R.sitemapOk,
    R.sitemapOk ? null : 'Not found or inaccessible' + sitemapStatusStr,
    fetchedUrl + ' inaccessible',
    fetchedUrl + ' is not accessible' + sitemapStatusStr + '.\n\nThis is likely caused by a proxy or WAF rule blocking the sitemap URL. Please review your proxy/CDN configuration to ensure this URL is accessible externally, or send it through to us for investigation.'
  );

  if (R.sitemapOk && R.sitemapXml && !isSearch) {
    // Extract all <loc> entries from the sitemap index
    var locs = [];
    var locRe = /<loc[^>]*>\s*(.*?)\s*<\/loc>/gi;
    var m2;
    while ((m2 = locRe.exec(R.sitemapXml)) !== null) locs.push(m2[1]);

    // Find sitemaps that cover the current page by matching the sitemap's
    // directory path against the start of the current page path.
    // e.g. /tractor/sitemapSC1.xml.gz → dir /tractor/ covers /tractor/red
    var covered = locs.filter(function(loc) {
      try {
        var locPath = new URL(loc).pathname;
        var locDir  = locPath.slice(0, locPath.lastIndexOf('/') + 1);
        return locDir.length > 1 && pagePath.toLowerCase().indexOf(locDir.toLowerCase()) === 0;
      } catch(e) { return false; }
    });

    html += seoCheck(
      'Current page covered by sitemap',
      covered.length > 0,
      covered.length > 0
        ? covered.map(function(loc) {
            return '<a href="' + seoEsc(loc) + '" target="_blank" class="seo-link">' + seoEsc(loc.split('/').pop()) + '</a>';
          }).join('<br>')
        : 'No sub-sitemap found whose path covers <code class="seo-code">' + seoEsc(pagePath) + '</code>'
    );

    if (locs.length > 0) {
      html += '<div class="seo-extra"><span class="seo-label">Sub-sitemaps</span><ul class="seo-list">';
      locs.forEach(function(loc) {
        var isCovered = covered.indexOf(loc) !== -1;
        html += '<li' + (isCovered ? ' class="seo-match"' : '') + '>'
          + '<a href="' + seoEsc(loc) + '" target="_blank" class="seo-link">' + seoEsc(loc.split('/').pop()) + '</a>'
          + (isCovered ? ' <span class="seo-badge">this page</span>' : '')
          + '</li>';
      });
      html += '</ul></div>';
    }
  }

  html += '</div>';

  html += '</div></div>'; // close right col + columns wrapper

  return html;
}

function seoCheck(label, ok, detail, zdLabel, zdDesc) {
  var cls  = ok ? 'seo-pass' : 'seo-fail';
  var icon = ok ? '✓' : '✗';
  var zdBtn = '';
  if (!ok) {
    var plainLabel  = seoStripTags(label);
    var plainDetail = seoStripTags(detail || '');
    var subject = '[SEO] ' + (zdLabel || plainLabel);
    var body = (zdDesc || (plainLabel + (plainDetail ? '\n' + plainDetail : '')))
      + '\n\n---\nDetected by SLI Dev Tools';
    zdBtn = '<button class="seo-zd-btn"'
      + ' data-subject="' + seoEsc(subject) + '"'
      + ' data-desc="' + seoEsc(body) + '"'
      + ' title="Create ZD ticket">ZD</button>';
  }
  return '<div class="seo-check ' + cls + '">'
    + '<span class="seo-icon">' + icon + '</span>'
    + '<div class="seo-check-body">'
    + '<span class="seo-check-label">' + label + '</span>'
    + (detail ? '<div class="seo-check-detail">' + detail + '</div>' : '')
    + '</div>'
    + zdBtn
    + '</div>';
}

function seoRow(label, value) {
  return '<div class="seo-row"><span class="seo-label">' + label + '</span><span class="seo-value">' + value + '</span></div>';
}

function seoParseRobots(text) {
  var disallows = [], sitemaps = [], inScope = false;
  text.split(/\r?\n/).forEach(function(raw) {
    var line  = raw.trim();
    if (!line || line[0] === '#') return;
    var lower = line.toLowerCase();
    if (lower.indexOf('user-agent:') === 0)  { inScope = line.slice(11).trim() === '*'; }
    else if (lower.indexOf('sitemap:') === 0) { sitemaps.push(line.slice(8).trim()); }
    else if (lower.indexOf('disallow:') === 0 && inScope) {
      var p = line.slice(9).trim(); if (p) disallows.push(p);
    }
  });
  return { disallows: disallows, sitemaps: sitemaps };
}

function seoEsc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function seoStripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .trim();
}

$(function() {
  // Build modal once
  var $zdModal = $(
    '<div id="seo-zd-modal" class="seo-zd-modal" style="display:none">' +
      '<div class="seo-zd-modal-inner">' +
        '<div class="seo-zd-modal-header">' +
          '<strong>New ZD Ticket</strong>' +
          '<button class="seo-zd-close" title="Close">×</button>' +
        '</div>' +
        '<div class="seo-zd-field">' +
          '<div class="seo-zd-field-header">' +
            '<span class="seo-zd-label">Subject</span>' +
            '<button class="seo-zd-copy-btn" data-target="subject">Copy</button>' +
          '</div>' +
          '<div class="seo-zd-subject"></div>' +
        '</div>' +
        '<div class="seo-zd-field">' +
          '<div class="seo-zd-field-header">' +
            '<span class="seo-zd-label">Description</span>' +
            '<button class="seo-zd-copy-btn" data-target="desc">Copy</button>' +
          '</div>' +
          '<div class="seo-zd-desc"></div>' +
        '</div>' +
        '<div class="seo-zd-actions">' +
          '<a class="seo-zd-open" href="https://vrya.zendesk.com/agent/tickets/new/1" target="_blank">Open ZD ↗</a>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
  $('body').append($zdModal);

  $(document).on('click', '.seo-zd-btn', function() {
    $zdModal.find('.seo-zd-subject').text($(this).data('subject'));
    $zdModal.find('.seo-zd-desc').text($(this).data('desc'));
    $zdModal.find('.seo-zd-copy-btn').text('Copy');
    $zdModal.show();
  });

  $(document).on('click', '.seo-zd-close', function() {
    $zdModal.hide();
  });

  $(document).on('click', '.seo-zd-copy-btn', function() {
    var target = $(this).data('target');
    var val = target === 'subject'
      ? $zdModal.find('.seo-zd-subject').text()
      : $zdModal.find('.seo-zd-desc').text();
    var $btn = $(this);
    navigator.clipboard.writeText(val).then(function() {
      $btn.text('Copied!');
      setTimeout(function() { $btn.text('Copy'); }, 2000);
    }).catch(function() {
      $btn.text('Error');
      setTimeout(function() { $btn.text('Copy'); }, 2000);
    });
  });
});

function seoRulePrefix(rule) {
  var star = rule.indexOf('*');
  return star === -1 ? rule : rule.slice(0, star);
}

function seoPathMatch(path, rule) {
  return path.toLowerCase().indexOf(rule.replace(/\*$/, '').toLowerCase()) === 0;
}
