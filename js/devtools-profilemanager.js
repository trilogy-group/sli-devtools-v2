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
        self.showProfileFailed(
          'Could not fetch: <a target="_blank" href="' + profileUrl + '">' + profileUrl + '</a>',
          page, response
        );
      }
    });
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
    let html = '';
    $(xmldoc).find('profile timing').each(function(i) {
      html += self.parseTimingNode(this, i, 1, 'Timing');
    });
    $(target + ' .timing .contents ul').append(html);
  },

  parseTimingNode: function(node, index, level, parentId) {
    if (this._recursion_counter > this._recursion_max) return '';
    this._recursion_counter++;

    const id = parentId + '-L' + level + 'I' + index;
    const hasChildren = $(node).children().length > 0;
    const name = $(node).attr('name') || node.tagName;
    const total = $(node).attr('total') || '';
    const count = $(node).attr('count') || '';
    const self = this;

    let html = this.makeLiHeader(id, parentId, hasChildren)
      + '<span>' + total + '</span><span>' + count + '</span><span class="name">' + name + '</span>'
      + this.makeLiFooter(hasChildren);

    if (hasChildren) {
      html += "<ul parent_id='" + id + "'>";
      $(node).children().each(function(i) {
        html += self.parseTimingNode(this, i, level + 1, id);
      });
      html += '</ul>';
    }

    return html + '</li>';
  },

  // --- Status tab ---

  parseStatus: function(xmldoc, target) {
    const self = this;
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
    let html = '';

    $(xmldoc).find('data input elements').each(function(i) {
      html += self.parseDataNode(this, i, 1, 'input');
    });
    $(target + ' .input .contents ul').append(html);

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
    const headers = [];
    $(xmldoc).find('data input element').each(function() {
      const name = $(this).attr('name') || '';
      if (!/^HEADER_/i.test(name)) return;
      headers.push({
        name:  name.replace(/^HEADER_/i, ''),
        value: $(this).attr('value') || ''
      });
    });

    const $content = $(target + ' .cfwaf .cfwaf-content');

    if (!headers.length) {
      $content.html('<p class="cfwaf-empty">No request headers found in profile.</p>');
      return;
    }

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

    let html = '';
    if (cf.length) {
      html += '<h4 class="cfwaf-section-title">CloudFront &amp; WAF</h4>' + renderTable(cf);
    }
    if (other.length) {
      html += '<h4 class="cfwaf-section-title">Other Headers</h4>' + renderTable(other);
    }

    $content.html(html);
  },

  // --- Results tab ---

  parseResults: function(xmldoc, target) {
    const self = this;
    let html = '';
    $(xmldoc).find('data output resultset results').each(function(i) {
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
