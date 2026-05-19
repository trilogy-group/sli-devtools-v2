/* Result Info Tab 

This section manages the result info tab. For each result showing on a page we fire 
off a query to request all information about that particular result. 

Metadata for building the request is returned by localbrain as an http header called
'X-SLI-ResultInfo'. Metadata includes the URL and indexname.

*/

ProfileManager.prototype.updateresultinfo = function (page) {
    var data = this[page];
    var url = this[page].url;
    console.log('Update resultinfo:' + page);
    
    //The indexname and URL for the results on the page is returned in the X-SLI-ResultInfo http header.
    //Extract result metadata from http header.
    for( var i=0; i < data.headers.length; i++)
    {
      if( data.headers[i].name === 'X-SLI-ResultInfo') {
        data.resultinfo = jQuery.parseJSON(data.headers[i].value).RESULTINFO;
      }   
    }

    //update result info page header.
    $('#results footer span').html(page);

    //query moby for result info
    if( data.resultinfo ) { 
      this.resultnodecount = 0;
      data.resultinfo.forEach( function (data, index) { this.getresultinfo(data, page, index); }, this);
    }
  },


// Builds query and sends request to background page as cross domain requests can not be made from dev tools pages. 
ProfileManager.prototype.getresultinfo = function (resultdata, page, index) {
    var self = this;
    var mobyquery = 'cgi-bin/mobycgi?index=' + resultdata.INDEXNAME + '&p=QIM&w=*&f=*(count=all)&restricturl=e:' + escape(resultdata.URL);
    var url = this[page].url.replace(/^([^.]+\.[^\/]+)(\/search\/go)*[\/?#]*.*?$/i, '$1$2/' + mobyquery).replace('search/go', 'search');

    this.port.postMessage({ 
        origin: 'resultinfo', 
        method: "xhrrequest", 
        url: url, 
        page: page,
        index: index + ""
    });

    //add an accordian to the page for the result to go in.
    $("#results div.tab-container .accordion").append("<div class='accordion-group' id='resultinfo-" + index + "'></div>");
  },


// Callback, this function is called by the background page (via the profile manager) when
// the result info response is recieved.
// Try's to parse the response.
ProfileManager.prototype.make_resultinfo = function (response, url, page, index ) {
    var meta = { response: response, resultinfourl: url };
    if( response.error ) {
      this.showProfileFailed(response.error, meta);
    }
    else {
      try {
        var xmldoc = jQuery.parseXML(response.data);
      }
      catch (err) {
        this.showProfileFailed("Invalid <a target='_blank' href='" + url + "'>ResultInfo XML</a>, please send URL to Adam Freeman", undefined, meta);
        return;
      }

      this.processresultinfo(xmldoc, page, index, url);
    }        
  },
 
// Updates the profile manager page.
ProfileManager.prototype.processresultinfo = function (xmldoc, page, index, mobyquery) {
    $('#results header h3').text("Results");

    var rank = parseInt(index);

    if( this[page].resultinfo[index] )
    {
      this[page].resultinfo[index].xmldoc = xmldoc;
    }
    
    this.resultnodecount ++;

    // loads and html template (from debugger.html)
    var template = $("#resultinfo-template").text();

    //setup accordian
    //var output = $("<div class='accordion-group'></div>").append(template);
    var output = $('<div></div>').append(template);
    $(output).find('.accordion-toggle').attr('href','#collapse_result' + this.resultnodecount);
    $(output).find('.accordion-body').attr('id','collapse_result' + this.resultnodecount);
    $(output).find('.rank span').html((rank + 1) + '');
    $(output).find('.title span').html( $(xmldoc).find('result title').text());
    $(output).find('.accordion-toggle').after('<a class="link" href="' + mobyquery + '" target="_blank">show query</a>');

    //get result metadata
    $(xmldoc).find("result *").each(function() {
      var name = this.tagName;
      var contents = $(this).text();
      var text = "", html = "";
      
      //if image, render
      if(name.search(/image|img/i) != -1 && is_url(contents.trim()) )
      {
        html = "<img class='resultimage' src='" + contents + "'>";
      }
      
      //if url make clickable
      if ( is_url(contents.trim()) )  {
        html += "<a href='" + contents + "' target='_blank'>" + contents + "</a>";
      }

      var element = $('<li><span class="meta-name">' + name + '</span><span class="meta-value"></span></li>');
      if( html != "" ) {
        $(element).find(".meta-value").html(html);
      } 
      else {
        $(element).find(".meta-value").text(contents);
      }
      
      $(output).find('.resultdata').append(element);
    });

    //Get information about the results facets
    var facettopics = $(xmldoc).find('facet-topics').text().split('^');
    var facetnames = $(xmldoc).find('facet-topic-names').text().split('^');
    var facetpriorities = $(xmldoc).find('facet-topic-priority').text().split('^');
    var facetcounts = $(xmldoc).find('facet-total-counts').text().split('^');
    var facetsorts = $(xmldoc).find('facet-topic-sort-type').text().split('^');
    var facetlabels = $(xmldoc).find('facet-topic-labels').text().split("^");

    //Add facet html
    for(var i =0; i < facettopics.length; i++)
    {
      if( !(facettopics[i] === "") ) {
        var html = '<li class="facet"><div>' + 
          '<span><strong>' + facetpriorities[i] + '</strong></span>' + 
          '<span><strong>' + facettopics[i] + '</strong></span>' + 
          '<span><strong>' + facetnames[i] + '</strong></span>' + 
          '<span><strong>' + facetcounts[i] + '</strong></span>' + 
          '<span><strong>' + facetsorts[i] + '</strong></span>' + 
          '<span title="' + facetlabels[i].replace('"','\\"') + '"><strong>' + facetlabels[i] + '</strong></span>' + 
          '</div><ul class="facetvalues">';

        //console.log(facettopics[i]);
        var facetvalues = $(xmldoc).find(facettopics[i] + '-values').text().split("^");
        var facetvaluenames = $(xmldoc).find(facettopics[i] + '-names').text().split("^");
        var facetvaluecounts = $(xmldoc).find(facettopics[i] + '-counts').text().split("^");
        var facetvaluesortvls = $(xmldoc).find(facettopics[i] + '-sortvl').text().split("^");
       
        for(var j =0; j < facetvalues.length; j++)
        {
          if( !(facetvalues[j] === "") ) 
          {
            html +=  '<li>' +
                      '<span>' + facetvaluesortvls[j] + '</span>' + 
                      '<span>' + facetvalues[j] + '</span>' +
                      '<span>' + facetvaluenames[j] + '</span>' +
                      '<span>' + facetvaluecounts[j] + '</span>' +
                      '</li>';
          }
        }

        html += '</ul></li>';
        $(output).find('.facetdata').append(html);
      }
    }

    $('#resultinfo-' + index).html(output);

}