/* 
devtools-profilemanager.js

- extracts information from the xml profile xml
- runs checks for Dynamic Templates and speller (real basic at the moment, simply checks 
for specific fields with the xml profile). Could be improved.
- builds accordian html using off DOM jquery and templates (in debugger.html)

*/
/*global $,ProfileManager*/


ProfileManager.prototype.profiledata = {};

ProfileManager.prototype.summary_clear = function (target) {
    'use strict';
    $(target + ' .details ul li').remove();
    $(target + ' .tests ul li').remove();
    $(target + ' .accordion-group.source').remove();
};


ProfileManager.prototype.updatesummary = function (page, target, url) {
    'use strict';
    target = target + ' div.tab.summary ';

    var xmldoc, key;
    xmldoc = this[page].xmldoc;

    //get details
    this.profiledata.details = {
        clientid: $(xmldoc).find('status searcherID').text(),
        clientname: $(xmldoc).find('data input element:[name="lbc"]').attr('value'),
        cgi_url: $(xmldoc).find('data input element:[name="CGI URL"]').attr('value'),
        searchername: $(xmldoc).find('status searcherName').text(),
        machinename: $(xmldoc).find('status machineName').text()
    };

    //update summary
    this.summary_clear(target, page);
    this.summary_showrequest(url, target, page);
    this.summary_listsources(xmldoc, target, page, url);

    // checks here
    this.summary_checkdynamictemplates(xmldoc, target, page);
    this.summary_checkmobiletemplates(xmldoc, target, page);
    this.summary_checkspeller(xmldoc, target, page);

    // update details
    for (key in this.profiledata.details) {
        $(target + '.details ul').append('<li class="test"><span class="name">' + key + '</span><span class="value">' + this.profiledata.details[key] + '</span></li>');
    }
};

ProfileManager.prototype.summary_showrequest = function (url, target, page) {
    'use strict';
    var params, param, name, value, i, html, $xmldoc, client_id, links, params_out = "";

    params = url.substring(url.search('[?#]') + 1).split('&');
    for (i = 0; i < params.length; i++) {
        param = params[i].split('=');
        name = decodeURIComponent(param[0]);
        value = (param.length > 1) ? decodeURIComponent(param[1]) : undefined;

        html = "<li>";
        html += (name) ? "<span class='name'>" + name + "</span>" : "";
        html += (value) ? "<span class='value'>" + value + "</span>" : "";
        html += "</li>";

        params_out += html;
    }

    $(target + '.searchrequest a.link').text(url).attr('href', url);
    $(target + '.searchrequest ul').html(params_out);

    // Cache xml doc

    $xmldoc = $(this[page].xmldoc);
    client_id = $xmldoc.find("profile").attr("client_id");
    links = '<h3>Useful Links</h3>' + '<ul>' +
        '<li><a target="_blank" href="' + url + '&sli_profile=l00py&sli_profile_format=xml">Profile</a></li>' +
        '<li><a target="_blank" href="http://sb1-1:28080/SliBuilder-wireit/api/DownloadTunings?clientid=' + client_id + '">SB Tunings</a></li>' +
        '<li><a target="_blank" href="http://sb1-1:28080/SliBuilder-wireit/api/DownloadSynonyms?clientid=' + client_id + '">SB Synonyms</a></li>' +
        '</ul>';
    $("#links").html(links);
};

ProfileManager.prototype.summary_checkdynamictemplates = function (xmldoc, target) {
    'use strict';
    var status, error, result, input, check;

    input = $(xmldoc).find('profile data output resultset elements element:[name="DYNAMIC_TEMPLATE_SOURCE d_status"]').attr('value');
    check = '$+{(NUM RESULTS)OK}';

    if (input) {
        if (input.indexOf(check) !== -1) {
            status = "passed";
            result = "OK";
        } else {
            status = "failed";
            result = "Failed";
            error = input;
        }
    } else {
        status = "missing";
        result = "source not found";
    }

    $(target + ' .tests ul').append('<li class="test">' +
        '<span class="name">Dynamic Template Status</span>' +
        '<span class="value ' + status + '">' + result + '</span>' +
        ((error) ? '<span class="error">' + error + '</span>' : "") +
        '</li>');
};

ProfileManager.prototype.summary_checkmobiletemplates = function (xmldoc, target) {
    'use strict';
    var status, error, result, input, check;

    input = $(xmldoc).find('profile data output resultset elements element:[name="MOBILE_TEMPLATE_SOURCE d_status"]').attr('value');
    check = '$+{(NUM RESULTS)OK}';

    if (input) {
        if (input.indexOf(check) !== -1) {
            status = "passed";
            result = "OK";
        } else {
            status = "failed";
            result = "Failed";
            error = input;
        }
    } else {
        status = "missing";
        result = "source not found";
    }

    $(target + ' .tests ul').append('<li class="test">' +
        '<span class="name">Mobile Dynamic Templates</span>' +
        '<span class="value ' + status + '">' + result + '</span>' +
        ((error) ? '<span class="error">' + error + '</span>' : "") +
        '</li>');
};

ProfileManager.prototype.summary_checkspeller = function (xmldoc, target) {
    'use strict';
    var status, error, result, input;

    input = $(xmldoc).find('profile data output resultset elements element:[name="SPELL PHRASE"]').attr('value');

    if (input) {
        status = "passed";
        result = "OK - '" + input + "'";
    } else {
        status = "missing";
        result = "source not found";
    }

    $(target + ' .tests ul').append(
        '<li class="test">' +
        '<span class="name">Speller Status</span>' +
        '<span class="value ' + status + '">' + result + '</span>' +
        ((error) ? '<span class="error">' + error + '</span>' : "") +
        '</li>');
};

ProfileManager.prototype.summary_listsources = function (xmldoc, target, page, url) {
    var self = this;
    var output;

    this.profiledata.sources = [];
    this.profiledata.sources_output = {};

    $(xmldoc).find('profile data output resultset elements element').each(function () {
        var name = $(this).attr('name'),
            value = $(this).attr('value'),
            matches;
        matches = name.match(/([^:]+?)(?=:|$)/ig);

        if (matches && matches.length == 4 && matches[0] == "SOURCE_INFO") {
            if (!self.profiledata.sources_output[matches[1] + " - " + matches[2]]) self.profiledata.sources_output[matches[1]] = {
                    name: matches[0],
                    type: matches[2]
            };
            self.profiledata.sources_output[matches[1]][matches[3]] = value;
        }
    });

    //for( var i = 0; i< this.profiledata.sources_output; length; i++ )
    var i = 0;
    for (var key in this.profiledata.sources_output) {
        var skipped;
        i++;
        if (this.profiledata.sources_output.hasOwnProperty(key)) {
            var source = this.profiledata.sources_output[key],
                query = source.URL,
                query_url;
            skipped = source.SKIPPED;
            //build result set
            var template = $("#source-template").text();
            output = $("<div class='accordion-group source'></div>").append(template);

            //setup accordion
            var toggleid = 'collapse_summary-' + page + '-' + i;
            $(output).find('.accordion-heading .accordion-toggle').attr('href', '#' + toggleid).attr('data-parent', '#accordion-' + page);
            $(output).find('.accordion-body').attr('id', toggleid);
            $(output).find('.accordion-heading .name').html(key);
            if (!skipped) {
              query_url = query.replace('127.0.0.1', this.profiledata.details.machinename);
                $(output).find('.accordion-heading .link').text(query).attr('href', query_url);
            } else {
                $(output).find('.accordion-heading .link').text("SKIPPED: " + skipped).css('color', 'grey');
            }

            //break query into parameters
            var params = decodeURIComponent(query).split('&');
            for (var j = 1; j < params.length; j++) {
                var matches = params[j].match(/(.*?)=(.*)/i);
                var html = "<li>";
                html += (matches && matches[1]) ? "<span class='name'>" + matches[1] + "</span>" : "";
                html += (matches && matches[2]) ? "<span class='value'>" + matches[2] + "</span>" : "";
                html += "</li>";
              
                $(output).find('.accordion-inner .params').append(html);
            }
          
            $(target + ' .accordion').append(output);//.append('<a href="http://allheart.resultsdemo.com/search?w=*" target="_blank">Relevance info</a><br/><br/>');
          if (!skipped) {
            if(query_url.indexOf('dorycgi') !== -1) {
              var dory_query_url = query_url.replace('/cgi-bin/dorycgi', '/assets/showquery.html');
                  dory_query_url = dory_query_url.replace(':8001', ':8002');
              $(target + ' .accordion').append(' <a href="' + dory_query_url + '" target="_blank">Relevance info</a><br/><br/>');
            }
          }
        }
    }

};