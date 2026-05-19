/* devtools-profilemanager.js 

- main handler for xml profile data
- builds xml profile requests, sends to background page to do Ajax request
- builds profile pages (everything but summary and result info tabs)
- click handlers for tree view
- some utility functions

*/



// checks whether the text contains a url
function is_url( text ) {
    return (text.search(/^(http|https|ftp)\:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(:[a-zA-Z0-9]*)?\/?([a-zA-Z0-9\-\._\?\,\'\/\\\+&amp;%\$#\=~])*[^\.\,\)\(\s]$/i) != -1); 
}


window.ProfileManager = function ( port ) {
  this.port = port;
  this.addClickHandlers();
} 

ProfileManager.prototype = {
  ajax : null,  // holds current ajax request meta + response + other data
  rac: null,
  parent : null,

  // limits for building the tree view from the xml profile
  _recursion_counter : 0, 
  _recursion_max : 5000,
  resultnodecount : 0,
  
  // updates dev tools html with error message
  showProfileFailed : function (error, page, error_object) {
    if( page ) {
      this.clear(page);
      $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]').addClass('error').addClass('empty').find('img').hide();
    }

    $('.navbar-fixed-top .nav a[href="#results"]').addClass('error').find('img').hide();
    $('#notifications').show().find('#notifications_msg').html(error);
        $('.page.active').hide();
    console.log(('ERROR: ' + error).substring(0,200));
    if(error_object) console.log(error_object);
  },

  // clears html for a particular page
  clear : function (page) {
    // clear errors
    $('#notifications').hide();
      $(".page.active").show();

    //clear parent/ajax tab
    if( page ) {
      $('#profile_' + page + ' .tab ul').children().remove();
      $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]').addClass('empty');
    }
    
    //clear resultinfo tab
    $('.navbar-fixed-top .nav a[href="#results"]').addClass('empty');
    $('#results .accordion-group').remove();
    $('#results footer span').html("");
  },

  // Takes debugging meta data from the background page and processes it in the context of the correct page.
  update : function (data) {
    if( data && data.ajax ) this.ajax = data.ajax;
    if( data && data.rac ) this.rac = data.rac;
    if( data && data.parent ) this.parent = data.parent;

    if( data && data.ajax ) {
      this.clear('ajax');
      this.getprofile('ajax');
    }

    if( data && data.rac ) {
      this.clear('rac');
      this.getprofile('rac');
    }

    if( data && data.parent ) {
      if( !data.ajax) this.clear('ajax');
      this.clear('parent');
      this.getprofile('parent');
    }
  },


  // Builds the xml profile url for the current page
  getprofile : function (page) {
      var url = this[page].url;

      searchprofile_url = "";
      var profilestring = 'sli_profile=l00py&sli_profile_format=xml';

      //ajax search
      if(url.search(/^([^#]*?)[#]/i) != -1) {
        searchprofile_url = url.replace(/^([^#]*?)([#].*)/i, "$1?" + profilestring + "$2");
      }
      //regular search
      else if( url.indexOf('?') != -1) {
        searchprofile_url = url + "&" + profilestring;
      }
      //Sitechamp page - assume the sitechamp word can't have a dot in it.
      else if( url.search(/^http:\/\/[^\/]+\/[^\/.]+\/[^\/.]+$/) != -1) {
        searchprofile_url = url + "&" + profilestring;
      }  
      //default search
      else if( url.search(/^([^.]+\.[^\/]+)\/?(search\/)*$/i) != -1 ) {
        searchprofile_url = url + "/search?p=D&" + profilestring; 
      }
      //sitechamp && learning nav
      else {
        searchprofile_url = url + "?" + profilestring; 
      }

      var self = this;

      console.log("Request search profile: " + searchprofile_url);
      
      $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]').removeClass('empty').removeClass('error').find('img').show();
      $('.navbar-fixed-top .nav a[href="#results"]').removeClass('empty').removeClass('error').find('img').show();
      
      this.port.postMessage({origin: 'profile', method: "xhrrequest", url: searchprofile_url, page: page, index: undefined }); 
        //callback : function (response) { self.updateprofile(response, page, searchprofile_url); } });
  },

  /* Callback used to parse the response from Local Brain  (via background page/controller) */
  make_profile : function (response, url, page) { 
        console.log('... received ' + page + ' response for: ' + this[page].url);
        //console.log(url);
        var meta = { response: response, page: page, profileurl :url };
        var target = '#profile_' + page;
        
        if( response.error ) {
          this.showProfileFailed(response.error, page, meta);
        }
        else {
          try {
            this[page].xmldoc = $.parseXML(response.data);
          }
          catch (err) {
            this.showProfileFailed("Invalid <a target='_blank' href='" + meta.profileurl + "'>Profile XML</a>, please send URL to Adam Freeman", page, meta);  
            return;
          }

          this.updateresultinfo(page, this[page].url);
          this.parseprofile(this[page].xmldoc, target);
          this.updatesummary(page, target, this[page].url);
          this.unescapehtml(target);  
            
          $('.navbar-fixed-top .nav a[href="#profile_' + page + '"]').find('img').hide();
          $('.navbar-fixed-top .nav a[href="#results"]').find('img').hide();
        }
  },

  // Processes the XML Profile after it has been read into an object
  parseprofile : function(xmldoc, target) { 
    this.recursion_counter = 0;
    this.parseData(xmldoc, target);
    this.parseResults(xmldoc, target);
    this.parseStatus(xmldoc, target);
    this.parseTimings(xmldoc, target);
  },
  
  // Processes the timing section of the xml profile and outputs html to panel
  parseTimings: function (xmldoc, target) {
    console.log('Parse timings');
    var htmlOutput = "";
    var self = this;
    jQuery(xmldoc).find("profile timing ").each(function(index) {
      htmlOutput = self.parseTimingNode(this, index, 1, "Timing");
    });

    jQuery(target + " .timing .contents ul").append(htmlOutput);
  },
  
  // Builds timing html tree view (called recursively)
  parseTimingNode: function (node, index, level, parent_id) {
    var name, total, count;
    var self = this;
    var id = parent_id + "-" + "L" + level + "I" + index;
    var hasChildren = jQuery(node).children().size() > 0;
    var htmlOutput = "";
    
    if(this.recursion_counter > this.recursion_max) return htmlOutput;
    else this.recursion_counter++;
    
    // get node info
    name = jQuery(node).attr("name");
    if( name == undefined ) name = node.tagName;
    total = jQuery(node).attr("total");
    if( total == undefined ) total = "";
    count = jQuery(node).attr("count");
    if( count == undefined ) count = "";

    // create output html string
    htmlOutput += this.makeLiHeader(id, parent_id, hasChildren)
    + "<span>" + total + "</span><span>" + count + "</span><span class='name'>" + name + "</span>"
    + this.makeLiFooter(hasChildren);
    
    // recursively loop through child nodes
    if( hasChildren )
    {
      htmlOutput += "<ul parent_id='" + id + "'>";
      jQuery(node).children().each(function(index) {
        htmlOutput += self.parseTimingNode(this, index, level + 1, id);
      });
      htmlOutput += "</ul>";
    }
            
    htmlOutput += "</li>";
    return htmlOutput;
  },
  
  // Processes the status section of the xml profile and outputs html to panel
  parseStatus: function (xmldoc, target) {
    console.log("Parse Status");
    var self = this;
    var htmlOutput = "";
    jQuery(xmldoc).find("status Finder").each(function(index) {
      htmlOutput = self.parseStatusNode(this, index, 1, "Data-Input");
    });
    
    jQuery(target + " .status .contents ul").append(htmlOutput);
  },
  
  // Builds status html tree view (called recursively)
  parseStatusNode : function (node, index, level, parent_id)  {
    var id = parent_id + "-" + "L" + level + "I" + index,
    hasChildren = $(node).children().size() > 0,
    htmlOutput = "", htmlClass = "",
    name = $(node).attr("name"),
    value =  (hasChildren ? "" : $(node).text()),
    self = this;

    if(this.recursion_counter > this.recursion_max) return htmlOutput;
    else this.recursion_counter++;
    
    if( name == undefined ) name = node.tagName;
      
    //customise nodeS
    if( name == "SearchSource" ) {
      var profileMachineName = $(node).siblings('machineName').text();
      var sourcename= $(node).find('sourceName').text();
      value = sourcename + " ";
      var queryNodes = $(node).find('sourceLastQuery').children();
      
      var map = $(queryNodes).map(function() {
        var output = "";
        var pattern = /(http[s]?:\/\/)(\d+[.]\d+[.]\d+[.]\d+)([^0-9.].*?$)/i;
        var text = $(this).text();
        if( text != "" && text != undefined)
        {
          if( pattern.test(text) ) {
            //strip IP address
            text = text.replace(pattern, '$1' + profileMachineName + '$3');
          }
          var tagname = this.tagName;
          var queryname = tagname.replace(/(.+)Query/i, '$1');          

          output += "<a class='sourcelink' href='" + text + "' target='_blank' >" + queryname + "</a>";
        }
        
        return output;
      });
      
      value = sourcename + " ";
      for( i=0; i<map.length; i++ )
      {
        if( map[i] != undefined ) value += map[i] + " ";
      }

      htmlClass = 'html';
    }
         
    //build output nodes
    htmlOutput += this.makeLiHeader(id, parent_id, hasChildren);
    htmlOutput += "<span class='name'>" + name + "</span><span class='value " + htmlClass + "'>" + escape(value) + "</span>"
    htmlOutput += this.makeLiFooter(hasChildren);
    
    if( hasChildren )
    {
      htmlOutput += "<ul parent_id='" + id + "'>";
      jQuery(node).children().each(function(index) {
        htmlOutput += self.parseStatusNode(this, index, level + 1, id);
      });
      htmlOutput += "</ul>";
    }
            
    htmlOutput += "</li>";
    return htmlOutput;
  },

  // Processes the data section of the xml profile and outputs html to panel
  parseData : function(xmldoc, target) {
    var htmlOutput = "", self = this;

    jQuery(xmldoc).find("data input elements").each(function(index) {
      htmlOutput = self.parseDataNode(this, index, 1, "input");
    });
    
    jQuery(target + " .input .contents ul").append(htmlOutput);
    
    jQuery(xmldoc).find("data output resultset > elements").each(function(index) {
      htmlOutput = self.parseDataNode(this, index, 1, "output");
    });
    
    jQuery(target + " .output .contents ul").append(htmlOutput);
  },
  
  // Builds data html tree view (called recursively)
  parseDataNode : function(node, index, level, parent_id)  {
    var id = (parent_id + "-" + "L" + level + "I" + index),
    hasChildren = (jQuery(node).children().size() > 0),
    url,htmlOutput = "", 
    self = this;

    if(this.recursion_counter > this.recursion_max) return htmlOutput;
    else this.recursion_counter++;
    
    //get node info
    var name = jQuery(node).attr("name");
    if( name == undefined ) name = node.tagName;
    var value = jQuery(node).attr("value");
    if( value == undefined ) value = "";
    
    //customise node data
    if( name == "result" ) { 
      value = jQuery(node).find('element[name="TITLE"]').attr('value'); 
      //url = jQuery(node).find('elements element[name="URL"]').attr('value'); 
    }
    
    htmlOutput += this.makeLiHeader(id, parent_id, hasChildren);
    htmlOutput += "<span class='name'>" + name + "</span>";
    htmlOutput += (url) ? "<span class='value html'>" + value + escape("<a class='sourcelink' target='_blank' href=''>info</a>") + "</span>" : "<span class='value'>" + escape(value) + "</span>";
    htmlOutput += "</span>" + this.makeLiFooter(hasChildren);
    
    if( hasChildren )
    {
      htmlOutput += "<ul parent_id='" + id + "'>";
      jQuery(node).children().each(function(index) {
        htmlOutput += self.parseDataNode(this, index, level + 1, id);
      });
      htmlOutput += "</ul>";
    }
            
    htmlOutput += "</li>";
    return htmlOutput;
  },

  // Processes the results section of the xml profile and outputs html to panel 
  parseResults : function(xmldoc, target) {
    console.log("Parse Results");
    var htmlOutput = "";
    var self = this;
    jQuery(xmldoc).find("data output resultset results").each(function(index) {
      htmlOutput = self.parseDataNode(this, index, 1, "results");
    });
    
    jQuery(target + " .results .contents ul").append(htmlOutput);
  },

  /*Add Event Handlers *****************************************************************************/
  addClickHandlers : function() {
    $(".contents li.parent > div").live( 'click' , function (e) {
        if( $(e.target).attr('class') != 'control')
        {
          var state = $(this).closest('li.parent').children('ul').hasClass('show');
          $(this).closest('li.parent').children('ul').toggleClass("show");
            
          //if the show has been removed show +
          if(state) {
            $(this).children("span.handle").text("+");
          }
          //if show has been added show -
          else {
            $(this).children("span.handle").text("-");
          }
        }
      });

    $('#profile-expand-all').live('click', expand_all);
    $('#profile-collapse-all').live('click', collapse_all);
    $('span.value').live('click', function () { this.classList.add('open'); });    
    $('span.value.open').live('click', function () { this.classList.remove('open') });
  },

  unescapehtml : function (data) {
    jQuery("span.value").each(function() { 
      var innertext = $(this).text();
      $(this).text(unescape(innertext));
    });
  
    jQuery("span.value.html").each(function() {
      $(this).html($(this).text());
    });
  },
  
  updatetitle : function (title, target) {
    $(target + ' h3.profile-title').html(title);
  },

  makeLiHeader : function(id, parent_id, hasChildren) {
    return "<li id='" + id + "'" + "parent_id='" + parent_id + "'"
      + ( hasChildren ? " class='parent collapsed'><div>" : ">")
      + ( hasChildren ? ("<span class='handle'>+</span>") : "<span class='handle'></span>");
  },

  makeLiFooter : function(hasChildren) {
    return ( hasChildren ? "</div>" : "" );
  },
}
