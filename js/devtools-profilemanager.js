// devtools-profilemanager.js

function is_url(text) {
  return /^(http|https|ftp):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(:[a-zA-Z0-9]*)?\/?([a-zA-Z0-9\-\._\?\,\'\/\\\+&%\$#=~])*[^\.\,\)\(\s]$/i.test(text);
}

window.ProfileManager = function() {
  this.addClickHandlers();
};

ProfileManager.prototype = {
  ajax: null,
  rac: null,
  parent: null,
  _recursion_counter: 0,
  _recursion_max: 5000,
  resultnodecount: 0,

  showProfileFailed: function(error, page, errorObj) {
    if (page) {
      this.clear(page);
      $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]').addClass('error empty').find('img').hide();
    }
    $('.navbar-fixed-top .nav a[href="#results"]').addClass('error').find('img').hide();
    $('#notifications').show().find('#notifications_msg').html(error);
    $('.page.active').not('#profile_lr').hide();
    console.log(('ERROR: ' + error).substring(0, 200));
    if (errorObj) console.log(errorObj);
  },

  clear: function(page) {
    $('#notifications').hide();
    $(".page.active").show();
    if (page) {
      $('#profile_' + page + ' .tab ul').children().remove();
      $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]').addClass('empty');
    }
    $('.navbar-fixed-top .nav a[href="#results"]').addClass('empty');
    $('#results .accordion-group').remove();
    $('#results footer span').html('');
  },

  addClickHandlers: function() {
    // Remove Bootstrap's collapse handler after it registers (document.ready fires after script parsing).
    $(function() { $('body').off('.collapse.data-api'); });

    $('body').on('click', '.accordion-toggle', function(e) {
      e.preventDefault();
      if ($(this).attr('data-toggle') === 'collapse') {
        const target = $(this).attr('data-target') || $(this).attr('href');
        if (target) $(target).toggleClass('in');
        return;
      }
      $(this).closest('.accordion-group').find('.accordion-body').toggleClass('in');
    });

    $('body').on('click', '.contents li.parent > div', function(e) {
      if ($(e.target).attr('class') === 'control') return;
      const $ul = $(this).closest('li.parent').children('ul');
      const wasShown = $ul.hasClass('show');
      $ul.toggleClass('show');
      $(this).children('span.handle').text(wasShown ? '+' : '-');
    });

    $('body').on('click', 'span.value', function() {
      $(this).toggleClass('open');
    });
  },

  update: function(data) {
    if (data && data.ajax) this.ajax = data.ajax;
    if (data && data.rac) this.rac = data.rac;
    if (data && data.parent) this.parent = data.parent;

    if (data && data.ajax) {
      this.clear('ajax');
      this.getprofile('ajax');
    }
    if (data && data.rac) {
      this.clear('rac');
      this.getprofile('rac');
    }
    if (data && data.parent) {
      if (!data.ajax) this.clear('ajax');
      this.clear('parent');
      this.getprofile('parent');
    }
  },

  getprofile: function(page) {
    const url = this[page].url;
    const profilestring = 'sli_profile=l00py&sli_profile_format=xml';
    let profileUrl;

    if (/#/.test(url)) {
      // URL has a hash fragment — insert params before the hash
      profileUrl = url.replace(/^([^#]*)(.*)/, '$1?' + profilestring + '$2');
    } else if (url.indexOf('?') !== -1) {
      profileUrl = url + '&' + profilestring;
    } else if (/^https?:\/\/[^\/]+\/[^\/.]+\/[^\/.]+$/.test(url)) {
      // SiteChamp-style URL (no extension in last segment)
      profileUrl = url + '?' + profilestring;
    } else if (/^([^.]+\.[^\/]+)\/?(search\/)*$/i.test(url)) {
      profileUrl = url + '/search?' + profilestring;
    } else {
      profileUrl = url + '?' + profilestring;
    }

    console.log('SLI: fetching profile:', profileUrl);

    $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]')
      .removeClass('empty error').find('img').show();
    $('.navbar-fixed-top .nav a[href="#results"]').removeClass('empty error').find('img').show();

    const self = this;
    chrome.runtime.sendMessage({ type: 'xhr', url: profileUrl }, function(response) {
      if (chrome.runtime.lastError) {
        self.showProfileFailed('Extension error: ' + chrome.runtime.lastError.message, page);
        return;
      }
      if (response && response.success) {
        self.make_profile({ data: response.data }, profileUrl, page);
      } else {
        // Primary URL failed — try resultspage.com fallback
        self._tryResultspageFallback(url, profilestring, page, profileUrl);
      }
    });
  },

  _tryResultspageFallback: function(originalUrl, profilestring, page, failedUrl) {
    const self = this;

    function buildFallback(lbc) {
      if (!lbc) return null;
      let search = '';
      try { search = new URL(originalUrl).search; } catch(e) {}
      const sep = search ? '&' : '?';
      return 'https://' + lbc + '.resultspage.com/search' + search + sep + profilestring;
    }

    function tryFetch(lbc) {
      const fallbackUrl = buildFallback(lbc);
      if (!fallbackUrl) {
        self.showProfileFailed(
          'Could not fetch: <a target="_blank" href="' + failedUrl + '">' + failedUrl + '</a>',
          page
        );
        return;
      }
      console.log('SLI: trying resultspage.com fallback:', fallbackUrl);
      chrome.runtime.sendMessage({ type: 'xhr', url: fallbackUrl }, function(resp) {
        if (resp && resp.success) {
          self.make_profile({ data: resp.data }, fallbackUrl, page);
        } else {
          self.showProfileFailed(
            'Could not fetch: <a target="_blank" href="' + failedUrl + '">' + failedUrl + '</a>'
            + ' &mdash; also tried <a target="_blank" href="' + fallbackUrl + '">' + fallbackUrl + '</a>',
            page
          );
        }
      });
    }

    // Try lbc from the original URL first, then from the inspected window
    let lbc = null;
    try { lbc = new URL(originalUrl).searchParams.get('lbc'); } catch(e) {}

    if (lbc) {
      tryFetch(lbc);
    } else {
      chrome.devtools.inspectedWindow.eval(
        '(function(){ return new URLSearchParams(location.search).get("lbc"); })()',
        function(res, isEx) { tryFetch(!isEx && res ? res : null); }
      );
    }
  },

  make_profile: function(response, url, page) {
    if (response.error) {
      this.showProfileFailed(response.error, page, response);
      return;
    }

    let xmldoc;
    try {
      xmldoc = $.parseXML(response.data);
    } catch (err) {
      this.showProfileFailed(
        'Invalid XML: <a target="_blank" href="' + url + '">' + url + '</a>',
        page, err
      );
      return;
    }

    if (!xmldoc) {
      this.showProfileFailed('Could not parse XML response', page);
      return;
    }

    this[page].xmldoc = xmldoc;

    const target = '#profile_' + page;
    this.updateresultinfo(page, 'moby');
    this.parseprofile(xmldoc, target);
    this.updatesummary(page, target, this[page].url);
    if (typeof this.updateseo === 'function') this.updateseo(page, target);
    this.unescapehtml(target);

    $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]').find('img').hide();
    $('.navbar-fixed-top .nav a[href="#results"]').find('img').hide();
  },

  parseprofile: function(xmldoc, target) {
    this._recursion_counter = 0;
    this.parseData(xmldoc, target);
    this.parseResults(xmldoc, target);
    this.parseStatus(xmldoc, target);
    this.parseTimings(xmldoc, target);
    this.parseCFWAF(xmldoc, target);
  },

  // --- Timing tab ---

  parseTimings: function(xmldoc, target) {
    const self = this;
    let maxTotal = 0;
    $(xmldoc).find('profile timing, profile timing *').each(function() {
      const t = parseFloat($(this).attr('total')) || 0;
      if (t > maxTotal) maxTotal = t;
    });
    let html = '';
    $(xmldoc).find('profile timing').each(function(i) {
      html += self.parseTimingNode(this, i, 1, 'Timing', maxTotal);
    });
    $(target + ' .timing .contents ul').append(html);
  },

  parseTimingNode: function(node, index, level, parentId, maxTotal) {
    if (this._recursion_counter > this._recursion_max) return '';
    this._recursion_counter++;

    const id = parentId + '-L' + level + 'I' + index;
    const hasChildren = $(node).children().length > 0;
    const name = $(node).attr('name') || node.tagName;
    const total = $(node).attr('total') || '';
    const count = $(node).attr('count') || '';
    const self = this;

    const totalMs = parseFloat(total) || 0;
    const barPct = (maxTotal > 0 && totalMs > 0) ? Math.max(1, Math.round((totalMs / maxTotal) * 100)) : 0;
    const barHtml = '<span class="timing-bar">'
      + (barPct > 0 ? '<span class="timing-bar-fill" style="width:' + barPct + '%"></span>' : '')
      + '</span>';

    let html = this.makeLiHeader(id, parentId, hasChildren)
      + '<span>' + total + '</span><span>' + count + '</span><span class="name">' + name + '</span>'
      + barHtml
      + this.makeLiFooter(hasChildren);

    if (hasChildren) {
      html += "<ul parent_id='" + id + "'>";
      $(node).children().each(function(i) {
        html += self.parseTimingNode(this, i, level + 1, id, maxTotal);
      });
      html += '</ul>';
    }

    return html + '</li>';
  },

  // --- Status tab ---

  parseStatus: function(xmldoc, target) {
    const self = this;
    const $sources = $(xmldoc).find('status Finder SearchSource');
    if ($sources.length > 0) {
      let okCount = 0, warnCount = 0;
      $sources.each(function() {
        const st = ($(this).find('sourceStatus').text() || '').trim().toUpperCase();
        if (st === 'OK') okCount++;
        else if (st) warnCount++;
      });
      const parts = [$sources.length + ' source' + ($sources.length !== 1 ? 's' : '')];
      if (okCount)   parts.push('<span class="sum-ok">'   + okCount   + ' OK</span>');
      if (warnCount) parts.push('<span class="sum-warn">' + warnCount + ' warning' + (warnCount !== 1 ? 's' : '') + '</span>');
      $(target + ' .status .contents.title').html('<div class="tab-summary">' + parts.join(' · ') + '</div>');
    }
    let html = '';
    $(xmldoc).find('status Finder').each(function(i) {
      html += self.parseStatusNode(this, i, 1, 'Status');
    });
    $(target + ' .status .contents ul').append(html);
  },

  parseStatusNode: function(node, index, level, parentId) {
    if (this._recursion_counter > this._recursion_max) return '';
    this._recursion_counter++;

    const id = parentId + '-L' + level + 'I' + index;
    const hasChildren = $(node).children().length > 0;
    let name = $(node).attr('name') || node.tagName;
    let value = hasChildren ? '' : $(node).text();
    let htmlClass = '';
    const self = this;

    if (name === 'SearchSource') {
      const machineName = $(node).siblings('machineName').text();
      const sourceName = $(node).find('sourceName').text();
      const ipPattern = /(https?:\/\/)(\d+\.\d+\.\d+\.\d+)([^0-9.].*?$)/i;
      const links = [];
      $(node).find('sourceLastQuery').children().each(function() {
        let text = $(this).text();
        if (text) {
          if (ipPattern.test(text)) text = text.replace(ipPattern, '$1' + machineName + '$3');
          const qname = this.tagName.replace(/(.+)Query$/i, '$1');
          links.push("<a class='sourcelink' href='" + text + "' target='_blank'>" + qname + "</a>");
        }
      });
      value = sourceName + ' ' + links.join(' ');
      htmlClass = 'html';
    }

    let html = this.makeLiHeader(id, parentId, hasChildren)
      + "<span class='name'>" + name + "</span>"
      + "<span class='value " + htmlClass + "'>" + escape(value) + "</span>"
      + this.makeLiFooter(hasChildren);

    if (hasChildren) {
      html += "<ul parent_id='" + id + "'>";
      $(node).children().each(function(i) {
        html += self.parseStatusNode(this, i, level + 1, id);
      });
      html += '</ul>';
    }

    return html + '</li>';
  },

  // --- Input / Output tabs ---

  parseData: function(xmldoc, target) {
    const self = this;

    const KEY_PARAMS = ['q', 'ts', 'tsv', 'lbc', 'p', 'num', 'start', 'collection'];
    const keyItems = [];
    KEY_PARAMS.forEach(function(name) {
      const $el = $(xmldoc).find('data input element[name="' + name + '"]');
      if ($el.length) {
        keyItems.push('<div class="kp-item"><b class="kp-name">' + name + '</b><code class="kp-val">' + ($el.attr('value') || '') + '</code></div>');
      }
    });
    if (keyItems.length) {
      $(target + ' .input .contents.title').html('<div class="key-params">' + keyItems.join('') + '</div>');
    }

    let html = '';
    $(xmldoc).find('data input elements').each(function(i) {
      html += self.parseDataNode(this, i, 1, 'input');
    });
    $(target + ' .input .contents:not(.title) ul').append(html);

    html = '';
    $(xmldoc).find('data output resultset > elements').each(function(i) {
      html += self.parseDataNode(this, i, 1, 'output');
    });
    $(target + ' .output .contents ul').append(html);
  },

  parseDataNode: function(node, index, level, parentId) {
    if (this._recursion_counter > this._recursion_max) return '';
    this._recursion_counter++;

    const id = parentId + '-L' + level + 'I' + index;
    const hasChildren = $(node).children().length > 0;
    let name = $(node).attr('name') || node.tagName;
    let value = $(node).attr('value') || '';
    const self = this;

    if (name === 'result') {
      value = $(node).find('element[name="TITLE"]').attr('value') || '';
    }

    let html = this.makeLiHeader(id, parentId, hasChildren)
      + "<span class='name'>" + name + "</span>"
      + "<span class='value'>" + escape(value) + "</span>"
      + this.makeLiFooter(hasChildren);

    if (hasChildren) {
      html += "<ul parent_id='" + id + "'>";
      $(node).children().each(function(i) {
        html += self.parseDataNode(this, i, level + 1, id);
      });
      html += '</ul>';
    }

    return html + '</li>';
  },

  // --- CF + WAF tab ---

  parseCFWAF: function(xmldoc, target) {
    const $xml = $(xmldoc);
    const headers = [];
    $xml.find('data input element').each(function() {
      const name = $(this).attr('name') || '';
      if (!/^HEADER_/i.test(name)) return;
      headers.push({
        name:  name.replace(/^HEADER_/i, ''),
        value: $(this).attr('value') || ''
      });
    });

    const cgiUrl = $xml.find('data input element[name="CGI URL"]').attr('value') || '';
    let originHost = '';
    try { originHost = new URL(cgiUrl).hostname; } catch(e) {}

    // Scan raw XML text for all SLI-hosted domains actually referenced
    // (resultspage / resultsdemo / resultsstage appear in SearchSource query URLs)
    const sliHosts = [];
    const seen = {};
    const sliPattern = /([a-z0-9][a-z0-9-]*\.(?:resultspage|resultsdemo|resultsstage)\.com)/gi;
    const xmlText = new XMLSerializer().serializeToString(xmldoc);
    let m;
    while ((m = sliPattern.exec(xmlText)) !== null) {
      const h = m[1].toLowerCase();
      if (!seen[h]) { seen[h] = true; sliHosts.push(h); }
    }

    const $content = $(target + ' .cfwaf .cfwaf-content');

    // DNS section at the top — rows updated incrementally
    const dnsTargets = sliHosts.map(function(h) { return { label: h, host: h }; });
    if (originHost && !seen[originHost]) {
      dnsTargets.push({ label: originHost, host: originHost });
    }

    function dnsRowId(host) { return 'cfwaf-dns-' + host.replace(/[^a-z0-9]/gi, '-'); }

    let html = '';
    if (dnsTargets.length) {
      html += '<h4 class="cfwaf-section-title" style="margin-top:0">DNS Resolution</h4>'
        + '<table class="cfwaf-table cfwaf-dns-table"><tbody>'
        + dnsTargets.map(function(t) {
            return '<tr id="' + dnsRowId(t.host) + '">'
              + '<td class="cfwaf-name cfwaf-dns-host">' + t.label + '</td>'
              + '<td class="cfwaf-value"><em class="cfwaf-empty">Resolving…</em></td>'
              + '</tr>';
          }).join('')
        + '</tbody></table>';
    }

    // Header tables below DNS
    const isCF  = h => /cloudfront|^cf-/i.test(h.name);
    const isWAF = h => /x-amzn-waf|x-amz-waf/i.test(h.name);
    const cf    = headers.filter(h => isCF(h) || isWAF(h));
    const other = headers.filter(h => !isCF(h) && !isWAF(h));

    function renderTable(rows) {
      return '<table class="cfwaf-table"><tbody>'
        + rows.sort((a, b) => a.name.localeCompare(b.name)).map(function(h) {
            return '<tr><td class="cfwaf-name">' + h.name + '</td>'
              + '<td class="cfwaf-value">' + h.value + '</td></tr>';
          }).join('')
        + '</tbody></table>';
    }

    if (!headers.length) {
      html += '<p class="cfwaf-empty">No request headers found in profile.</p>';
    } else {
      if (cf.length)    html += '<h4 class="cfwaf-section-title">CloudFront &amp; WAF</h4>' + renderTable(cf);
      if (other.length) html += '<h4 class="cfwaf-section-title">Other Headers</h4>' + renderTable(other);
    }

    $content.html(html);

    // Async DNS lookups via Google DNS-over-HTTPS
    function renderDnsResult($td, r) {
      if (r.cname) {
        var badge = /cloudfront\.net\.?$/i.test(r.cname)
          ? ' <span class="cfwaf-badge cfwaf-badge-ok">CloudFront</span>' : '';
        $td.html('<span class="cfwaf-dns-value">' + r.cname + '</span>' + badge);
      } else if (r.a) {
        $td.html('<span class="cfwaf-dns-value">' + r.a + '</span>');
      } else if (r.nxdomain) {
        $td.html('<span class="cfwaf-dns-nxdomain">NXDOMAIN</span>'
          + ' <span class="cfwaf-badge cfwaf-badge-warn">Not found</span>');
      } else {
        $td.html('<span class="cfwaf-dns-nxdomain">' + (r.error || 'error') + '</span>');
      }
    }

    function dohFetch(host, type, cb) {
      chrome.runtime.sendMessage(
        { type: 'xhr', url: 'https://dns.google/resolve?name=' + encodeURIComponent(host) + '&type=' + type },
        function(resp) {
          if (!resp || !resp.success) { cb(null); return; }
          try { cb(JSON.parse(resp.data)); } catch(e) { cb(null); }
        }
      );
    }

    dnsTargets.forEach(function(t) {
      var $td = $content.find('#' + dnsRowId(t.host) + ' td.cfwaf-value');
      dohFetch(t.host, 'CNAME', function(data) {
        if (!data) { renderDnsResult($td, { error: 'lookup failed' }); return; }
        if (data.Status === 3) { renderDnsResult($td, { nxdomain: true }); return; }
        var cnames = (data.Answer || []).filter(function(a) { return a.type === 5; });
        if (cnames.length) {
          renderDnsResult($td, { cname: cnames[cnames.length - 1].data.replace(/\.$/, '') });
          return;
        }
        // No CNAME — fall back to A record
        dohFetch(t.host, 'A', function(data2) {
          if (!data2) { renderDnsResult($td, { error: 'lookup failed' }); return; }
          if (data2.Status === 3) { renderDnsResult($td, { nxdomain: true }); return; }
          var aRecs = (data2.Answer || []).filter(function(a) { return a.type === 1; });
          renderDnsResult($td, aRecs.length
            ? { a: aRecs.map(function(r) { return r.data; }).join(', ') }
            : { error: 'no records' });
        });
      });
    });
  },

  // --- Results tab ---

  parseResults: function(xmldoc, target) {
    const self = this;
    const $results = $(xmldoc).find('data output resultset results');
    if ($results.length > 0) {
      $(target + ' .results .contents.title').html(
        '<div class="tab-summary">' + $results.length + ' result' + ($results.length !== 1 ? 's' : '') + '</div>'
      );
    }
    let html = '';
    $results.each(function(i) {
      html += self.parseDataNode(this, i, 1, 'results');
    });
    $(target + ' .results .contents ul').append(html);
  },

  // --- Tree view helpers ---

  makeLiHeader: function(id, parentId, hasChildren) {
    return "<li id='" + id + "' parent_id='" + parentId + "'"
      + (hasChildren ? " class='parent collapsed'><div>" : '>')
      + (hasChildren ? "<span class='handle'>+</span>" : "<span class='handle'></span>");
  },

  makeLiFooter: function(hasChildren) {
    return hasChildren ? '</div>' : '';
  },

  unescapehtml: function(target) {
    $(target + ' span.value').each(function() {
      $(this).text(unescape($(this).text()));
    });
    $(target + ' span.value.html').each(function() {
      $(this).html($(this).text());
    });
  },

  update_profile: function(page, url) {
    if (typeof this.updatesummary === 'function') {
      this.updatesummary(page, '#profile_' + page, url);
    }
  }
};
