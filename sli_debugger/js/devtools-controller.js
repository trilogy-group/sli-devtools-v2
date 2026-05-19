/* devtools-controller.js

- Sets up the profile manager object.
- Registers the listener/port to the background page
- Sets up click events for the UI (tabs and treeviews)

The profile manager:
- processes the xml profile and resultinfo data
- builds the xml profile requests, which are then passed to the background page as we cannot do cross domain ajax 
(maybe not ajax at all) from the dev tools instance.
- builds the html to display the information 
*/


var port = chrome.extension.connect({ name: chrome.experimental.devtools.inspectedWindow.tabId + ""});
var profilemanager = new ProfileManager(port);
port.onMessage.addListener(function(msg) {

	switch( msg.method ) {
		case "error": 
			profilemanager.showProfileFailed(msg.data.error, undefined, msg.data);
			break;

		case "update": 
			console.log("Search request made: " + msg.url );
	  		console.log(msg);
			profilemanager.update(msg.data);
			break;

		case "update_profile":
	  		console.log("Update " + msg.page + " profile from: " + msg.url );
			profilemanager.make_profile( { data: msg.data, error: msg.error }, msg.url, msg.page );
			break;

		case "update_resultinfo":
			console.log("Update resultinfo " + msg.index + " from: " + msg.url );
			profilemanager.make_resultinfo( { data: msg.data, error: msg.error }, msg.url, msg.page, msg.index);
			break;

		case "new_version":
			console.log("Updating version notification.");
			update_version(msg.data.version, msg.data.download_url);
			break;
	}

});

/* This script simply binds UI events as we cannot do inline javascript in the extension. */ 
function expand_all() {
console.log($('div#' + get_route().tab + ' ul:not(.show)'));
	$('div#' + get_route().tab + ' ul:not(.show)').each( function () {
	  $(this).addClass('show');
	  $(this).closest("li").find('span.handle:contains("+")').text("-");
	})
	return false;
}

function collapse_all() {
	$('div#' + get_route().tab + ' ul ul.show').each( function () {
	  $(this).removeClass('show');
	  $(this).closest("li").find('span.handle:contains("-")').text("+");
	})
}

/* Search functionality for finding items within the profile DOM. As of 10/12/2012 most of this 
doesnt work. The forms for this are not even showing in the page. Main issue is that it was never
ported over from when the profile was integrated with the SLI Gadget. */

//extend jquery to make a case insensitive :contains selector for search
//http://stackoverflow.com/questions/2196641/how-do-i-make-jquery-contains-case-insensitive
jQuery.expr[':'].Contains = function(a, i, m) { 
	return jQuery(a).text().toUpperCase().indexOf(m[3].toUpperCase()) >= 0; 
};

function searchXML(e) {
	collapse_all("#main_list");
	clearSearch();
	$('div.contents').not('.title').removeClass('show');
	$('#main_list > li').removeClass('show');    
	var searchterm = e.value;
	var matches = $("span:Contains(" + searchterm + ")");
	matches.addClass('searchterm');

	matches.parents('ul').not('.show').addClass('show');       
	matches.parents('#main_list > li').find('.heading').addClass('searchterm');
	matches.parents('#main_list > li').last().addClass('show');
	matches.parents('div.contents').last().addClass('show');
}

function clearSearch()
{
	
}

function get_route() {
	var matches = (/[#]([^-]+)-*(.*)/i).exec(window.location.hash);
	return {
	  page : matches[1],
	  tab : matches[2]
	}
}


// Routing for tabs withing debugger panel 
// NOTE - this function does not look at hashchange of tab being debugged.
$(window).bind('hashchange', function() {
	var route = get_route();
	
	if( $(".page.active").attr('id') != route.page ) 
	{
	  $(".page.active").fadeOut('fast', function() {
	    $("div#" + route.page + ".page:not(.active)").fadeIn('fast').addClass("active");
	  }).removeClass('active');
	}

	if(route.tab)
	{
	  $("div#" + route.page + " div.tab.active").removeClass('active');
	  $("div#" + route.page + " div." + route.tab + ".tab:not(.active)").addClass("active");
	}
});

$('ul.nav li').live('click', function() {
  $(this).addClass('active').siblings().removeClass('active');
})


function update_version(version, download_url) {
	var div = $('#version');
	div.find('span.version').text(version);
	div.find('a.download_url').attr("href", download_url);
	div.show();
}


