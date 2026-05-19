// devtools-summary-tab.js

ProfileManager.prototype.profiledata = {};

ProfileManager.prototype.summary_clear = function(target) {
  const $target = $(target);
  $target.find('.details ul li').remove();
  $target.find('.tests ul li').remove();
  $target.find('.accordion-group.source').remove();
};

ProfileManager.prototype.updatesummary = function(page, target, url) {
  target = target + ' div.tab.summary';
  const xmldoc = this[page] && this[page].xmldoc;
  if (!xmldoc) {
    console.warn('SLI: no XML doc for page:', page);
    return;
  }

  const $xml = $(xmldoc);
  this.profiledata.details = {
    clientid:     $xml.find('status searcherID').text(),
    clientname:   $xml.find('data input element[name="lbc"]').attr('value'),
    cgi_url:      $xml.find('data input element[name="CGI URL"]').attr('value'),
    searchername: $xml.find('status searcherName').text(),
    machinename:  $xml.find('status machineName').text()
  };

  this.summary_clear(target, page);
  this.summary_showrequest(url, target, page);
  this.summary_showdetails(target, page);
  this.summary_listsources(xmldoc, target, page, url);
  this.summary_checkdynamictemplates(xmldoc, target, page);
};

ProfileManager.prototype.summary_showrequest = function(url, target, page) {
  const details = this.profiledata.details || {};
  const rows = [
    ['Searcher ID',   details.clientid     || '—'],
    ['Client Name',   details.clientname   || '—'],
    ['Searcher Name', details.searchername || '—'],
    ['Machine',       details.machinename  || '—'],
    ['CGI URL',       details.cgi_url      || '—']
  ].map(([k, v]) => "<li><span class='name'>" + k + "</span><span class='value'>" + v + "</span></li>").join('');

  const $group = $('<div class="accordion-group source">'
    + '<div class="accordion-heading">'
    + '<a class="accordion-toggle name">SEARCH REQUEST</a>'
    + '<a class="link" target="_blank" href="' + url + '">' + url + '</a>'
    + '</div>'
    + '<div class="accordion-body collapse in">'
    + '<div class="accordion-inner"><ul>' + rows + '</ul></div>'
    + '</div></div>');

  $(target + ' .accordion').prepend($group);
};

ProfileManager.prototype.summary_showdetails = function(target, page) {
  // Details section is populated by summary_showrequest above
};

ProfileManager.prototype.summary_listsources = function(xmldoc, target, page, url) {
  const $sources = $(xmldoc).find('status Finder SearchSource');
  const ipPattern = /(https?:\/\/)(\d+\.\d+\.\d+\.\d+)([^0-9.].*?$)/i;

  let innerHtml = '';

  if ($sources.length > 0) {
    $sources.each(function() {
      const name = $(this).find('sourceName').text() || 'Unknown';

      // Skip mobile sources
      if (/mobile/i.test(name)) return;

      const machineName = $(this).siblings('machineName').text();
      const linkItems = [];

      $(this).find('sourceLastQuery').children().each(function() {
        let queryUrl = $(this).text().trim();
        if (!queryUrl) return;
        if (ipPattern.test(queryUrl)) {
          queryUrl = queryUrl.replace(ipPattern, '$1' + machineName + '$3');
        }
        const label = this.tagName.replace(/(.+)Query$/i, '$1');
        linkItems.push('<li><a href="' + queryUrl + '" target="_blank">' + queryUrl + '</a> <em>(' + label + ')</em></li>');
      });

      // Skip sources with no query URLs
      if (!linkItems.length) return;

      innerHtml +=
        '<div class="accordion-group">'
        + '<div class="accordion-heading"><a class="accordion-toggle name">' + name + '</a></div>'
        + '<div class="accordion-body collapse"><div class="accordion-inner"><ul>' + linkItems.join('') + '</ul></div></div>'
        + '</div>';
    });
  }

  if (!innerHtml) innerHtml = '<em>No sources found.</em>';

  const $group = $('<div class="accordion-group source">'
    + '<div class="accordion-heading"><a class="accordion-toggle name">SOURCES</a></div>'
    + '<div class="accordion-body collapse in"><div class="accordion-inner">' + innerHtml + '</div></div>'
    + '</div>');

  $(target + ' .accordion').append($group);
};

// --- Dynamic Templates - Components ---

ProfileManager.prototype.summary_checkdynamictemplates = function(xmldoc, target, page) {
  const details  = this.profiledata.details || {};
  const machine  = details.machinename || '';
  const cgiUrl   = details.cgi_url     || '';
  const lbc      = details.clientname  || '';

  console.log('SLI DT: machine=' + machine + ' | cgiUrl=' + cgiUrl + ' | lbc=' + lbc);

  // Append a placeholder immediately so the section stays in order
  const $group = $('<div class="accordion-group source">'
    + '<div class="accordion-heading"><a class="accordion-toggle name">DYNAMIC TEMPLATES - COMPONENTS</a></div>'
    + '<div class="accordion-body collapse in"><div class="accordion-inner dt-components-content"><em>Loading…</em></div></div>'
    + '</div>');
  $(target + ' .accordion').append($group);
  const $content = $group.find('.dt-components-content');

  // Determine environment and build tb.json URL
  const tbInfo = this._getTbJsonUrl(machine, cgiUrl, lbc);
  console.log('SLI DT: tbInfo=', tbInfo);
  if (!tbInfo) {
    $group.remove();
    return;
  }

  // Get ts (template set) and collection from profile XML
  const $xml  = $(xmldoc);
  const ts    = $xml.find('data input element[name="ts"]').attr('value') || null;
  const coll  = $xml.find('data input element[name="p"]').attr('value')
             || $xml.find('data input element[name="collection"]').attr('value')
             || null;

  console.log('SLI DT: fetching', tbInfo.url, '| env:', tbInfo.env, '| ts:', ts, '| coll:', coll);
  $content.html('<em>Fetching tb.json (<a href="' + tbInfo.url + '" target="_blank">' + tbInfo.env + '</a>)…</em>');

  chrome.runtime.sendMessage({ type: 'xhr', url: tbInfo.url }, function(response) {
    console.log('SLI DT: sendMessage response:', response);
    if (!response || !response.success) {
      console.log('SLI DT: fetch failed:', response);
      $group.remove();
      return;
    }

    let tb;
    try { tb = JSON.parse(response.data); }
    catch (e) {
      console.log('SLI DT: JSON parse error:', e, '| raw:', response.data && response.data.slice(0, 200));
      $group.remove();
      return;
    }

    const sources = tb.sources || [];
    console.log('SLI DT: tb.json parsed. templateSets type:', Array.isArray(tb.templateSets) ? 'array' : typeof tb.templateSets, '| sources:', sources.length, '| defaultTemplateSet:', tb.defaultTemplateSet);

    // templateSets may be an array or an object keyed by set name/id
    let templateSet = null;
    const rawSets = tb.templateSets;
    if (rawSets) {
      if (Array.isArray(rawSets)) {
        console.log('SLI DT: templateSets (array) ids/names:', rawSets.map(s => s.id + '/' + s.name));
        templateSet = (ts && rawSets.find(s => s.id === ts || s.name === ts)) || rawSets[0] || null;
      } else {
        console.log('SLI DT: templateSets (object) keys:', Object.keys(rawSets));
        templateSet = (ts && rawSets[ts]) || rawSets[tb.defaultTemplateSet] || Object.values(rawSets)[0] || null;
      }
    }
    console.log('SLI DT: matched templateSet:', templateSet);

    if (!templateSet) {
      console.log('SLI DT: no template set found, hiding section');
      $group.remove();
      return;
    }

    const dtId = templateSet.dynamicTemplate && templateSet.dynamicTemplate.id;
    console.log('SLI DT: dynamicTemplate.id:', dtId);
    if (!dtId) {
      console.log('SLI DT: no dynamicTemplate.id, hiding section');
      $group.remove();
      return;
    }

    // Find source whose id matches dynamicTemplate.id
    console.log('SLI DT: available source ids:', sources.map(s => s.id));
    const src = sources.find(s => s.id === dtId);
    console.log('SLI DT: matched source:', src);
    if (!src) {
      console.log('SLI DT: no matching source, hiding section');
      $group.remove();
      return;
    }

    // location may be a plain string or an object keyed by collection (lbc)
    let location = src.location;
    console.log('SLI DT: raw location:', location, '| lbc:', lbc, '| coll:', coll);
    if (location && typeof location === 'object') {
      location = (lbc && location[lbc]) || (coll && location[coll]) || Object.values(location)[0] || null;
      console.log('SLI DT: resolved location from object:', location);
    }

    if (!location) {
      console.log('SLI DT: no location found, hiding section');
      $group.remove();
      return;
    }

    $content.html(
      '<ul><li>'
      + '<a href="' + location + '" target="_blank">' + location + '</a>'
      + ' <em>(component: ' + dtId + ')</em>'
      + '</li></ul>'
    );
  });
};

ProfileManager.prototype._getTbJsonUrl = function(machine, cgiUrl, lbc) {
  // Local: CLIENTNAME.USERNAME.cfe.nz host
  const cfeMatch = /https?:\/\/([^.]+)\.([^.]+)\.cfe\.nz/i.exec(cgiUrl);
  if (cfeMatch) {
    return {
      env: 'local',
      url: 'https://tb1.sli-systems.com/client-files/files/'
        + cfeMatch[1] + '/local/user/' + cfeMatch[2] + '/trunk/conf/tb.json'
    };
  }

  // Local: tb-lb-1 machine (cfe.nz may be in machine name instead)
  const tbLbMatch = /([^.]+)\.([^.]+)\.cfe\.nz/i.exec(machine);
  if (machine.includes('tb-lb-1.iad.prod.sli.io') || tbLbMatch) {
    const client = tbLbMatch ? tbLbMatch[1] : lbc;
    const user   = tbLbMatch ? tbLbMatch[2] : null;
    if (!client || !user) return null;
    return {
      env: 'local',
      url: 'https://tb1.sli-systems.com/client-files/files/'
        + client + '/local/user/' + user + '/trunk/conf/tb.json'
    };
  }

  // Derive client name from the CGI URL.
  // On SLI-hosted demo domains (resultsdemo.com) the subdomain is {clientname}-{lbc},
  // so strip the -lbc suffix. e.g. qantasagents-asia.resultsdemo.com + lbc=asia → qantasagents.
  // On client-owned domains the lbc value itself is the client name (e.g. lbc=scorptec).
  let clientName = lbc || null;
  try {
    const hostname = new URL(cgiUrl).hostname;
    if (/resultsdemo\.com$/i.test(hostname)) {
      const subdomain = hostname.split('.')[0];
      if (lbc && subdomain.toLowerCase().endsWith('-' + lbc.toLowerCase())) {
        clientName = subdomain.slice(0, -(lbc.length + 1));
      } else {
        clientName = subdomain;
      }
    }
  } catch (e) {}

  if (!clientName) return null;

  // Demo: machine name contains "demo"
  if (/\.demo\./i.test(machine) || /demo/i.test(machine)) {
    return {
      env: 'demo',
      url: 'https://tb1.sli-systems.com/client-files/files/' + clientName + '/environment/demo/conf/tb.json'
    };
  }

  // Prod (default)
  return {
    env: 'prod',
    url: 'https://tb1.sli-systems.com/client-files/files/' + clientName + '/environment/prod/conf/tb.json'
  };
};
