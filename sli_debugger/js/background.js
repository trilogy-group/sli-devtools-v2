/*
 * background.js

- Registers each new instance of the dev tools against the tabid of the tab they represent.
- Sets up events for ALL requests and responses.
- Outgoing listener : A sli http header is added to all outgoing requests so
that local brain knows to include the result info header with the debugging metadata.
- Incoming listener : Tries to determine if the request is a SLI request, if so, gets the 
SLI header and sends it to the Profile Manager to process. Also caches this request in 
case the debugger for that particular tab has not been opened yet.
- Proxy for cross browser ajax requests (can only be)

*/
/*global chrome,XMLHttpRequest,console,$*/


var debuggers = {};
var debug_data = {};

//Allow us to get stuff in the manifest.json
chrome.manifest = (function () {
    'use strict';
    
    var manifestObject = false,
        xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            manifestObject = JSON.parse(xhr.responseText);
        }
    };

    xhr.open("GET", chrome.extension.getURL('/manifest.json'), false);

    try {
        xhr.send();
    } catch (e) {
        console.log('Couldn\'t load manifest.json');
    }

    return manifestObject;
})();


/* Only the background page can make cross domain ajax requests. This function provides a proxy for the 
dev tools pages to make requests for the XML Profile and do Result Info queries. */
var active_xhr = false;

function makeXhrRequest(url, callback) {
    'use strict';
    
    active_xhr = true;
    console.log('Make XHR request for: ' + url);
    //get search profile, run profile parser on successful get.
    $.ajax({
        type: "GET",
        url: url,
        dataType: "text",
        timeout: 10000,
        success: function (data) {
            console.log('... received response, sending response.');
            callback(data, undefined);
            active_xhr = false;
        },
        error: function (response) {
            console.log('... could not get requested url, sending error.');
            console.log(response.status);
            callback(undefined, 'Could not GET: ' + url + " <br>Status: " + response.status);
            active_xhr = false;
        }
    });

}

/* When a new debugger is opened, we open a port from the dev tools panel, to this background page. 
We also cache the port and tab so that later we can route the debugging info to the correct tab. */
chrome.extension.onConnect.addListener(function (port) {
    debuggers[port.name] = port;
    console.log("Established port with Devtools for tab: " + port.name);
    port.onMessage.addListener(function (msg) {
        if (msg.method == 'xhrrequest' && msg.url) {
            // console.log('Received XHR request from ' + port.name);
            //console.log(msg);
            makeXhrRequest(msg.url, function (data, error) {
                port.postMessage({
                    method: "update_" + msg.origin,
                    data: data,
                    error: error,
                    page: msg.page,
                    url: msg.url,
                    index: msg.index
                });
            });
        }
    });

    if (debug_data[port.name]) {
        port.postMessage({
            method: debug_data[port.name].method,
            data: debug_data[port.name]
        });
    }

});


/* Add custom SLI debug header to outgoing search request's. This will tell localbrain to add the
result info header (contianing result metadata) to the response. */
chrome.webRequest.onBeforeSendHeaders.addListener(function (details) {
    details.requestHeaders.push({
        name: 'x-sli-debug',
        value: 'resultinfo'
    });
    //console.log('Adding SLI headers to:' + details.url)
    return {
        requestHeaders: details.requestHeaders
    };
}, {
    urls: ["<all_urls>"],
    types: ["main_frame", "sub_frame", "xmlhttprequest"]
}, ["blocking", "requestHeaders"]);


/* Check incoming responses to try and determine whether they are SLI responses. 

If it is a SLI response, we send debugging metadata (header, url, page type - regular page, 
AJAX page or a RAC page) to the corresponding dev tools instance for that tab (debuggers). 

We also cache the reponse (debug_data), so that if the devtools for that tab are opened, the gadget can 
automatically be updated with the correct debuggin information without having to refresh 
the page. */
chrome.webRequest.onHeadersReceived.addListener(function (details) {

    // Do a preliminary check of the response to see whether it's from SLI
    // NOTE: this is just a rough guide to reduce blocking.
    var keyword, templateset, local, demo, resultspage, sli_flag, uid;
    //check for SLI headers/
    sli_flag = false;
    for (var key in details.responseHeaders) {
        if (details.responseHeaders[key].name === "X-SLI-ResultInfo") {
            sli_flag = true;
            console.log("ID: Saw SLI Header");
            break;
        } 
    }

    // This object will be sent immediately to an extension IF it is present, it will only contain EITHER ajax OR parent
    // This object will store both the Parent and latest Ajax request to send to a gadget if the gadget is not yet initialised. 
    // Sent via the 'register_debugger' listener above.
    var data = {};
    var method = "";
    if (sli_flag && details.url.indexOf('sli_profile_format=xml') == -1) {
        if (!debug_data[details.tabId]) debug_data[details.tabId] = {}; // 
        debug_data[details.tabId].url = details.url;

        request = {
            'headers': details.responseHeaders,
            'url': details.url
        };

        if (details.url.search(/^[^#]*?\?(.*?)ts=ajax/i) != -1) {
            console.info('AJAX request set as: ' + details.url);
            data["ajax"] = request;
            debug_data[details.tabId]["ajax"] = request;
        } else if (details.url.search(/^[^#]*?\?(.*?)ts=rac/i) != -1) {
            data["rac"] = request;
            console.info('RAC request set as: ' + details.url);
            debug_data[details.tabId]["rac"] = request;
        } else {
            console.info('Parent request set as: ' + details.url);
            data["parent"] = request;
            debug_data[details.tabId]["parent"] = request;
        }

        debug_data[details.tabId].method = "update";
        method = "update";
    } else {
        if (details.type === "main_frame") {
            method = "error";
            data = {
                error: "Page <a href='" + details.url + "'>" + details.url + "</a> was not interpreted as an SLI search request. If this is an SLI page, please send URL Adam Freeman",
                details: details,
                method: "error",
                url: details.url
            };

            debug_data[details.tabId] = data;
        }
    }

    // If a debugger for this tab has already been registered, send the debugging 
    // data to the corresponding dev tools instance.
    if (method && debuggers[details.tabId]) {
        console.log('Sending response to debugger for: ' + details.url)
        debuggers[details.tabId].postMessage({
            method: method,
            data: data
        });
    }

}, {
    urls: ["<all_urls>"],
    types: ["main_frame", "sub_frame", "xmlhttprequest"]
}, ["responseHeaders"]);