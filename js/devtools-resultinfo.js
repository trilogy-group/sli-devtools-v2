// devtools-resultinfo.js (Manifest V3-compatible)

ProfileManager.prototype.updateresultinfo = function(page, indexer) {
  const data = this[page];
  const url = data.url;
  console.log("Update resultinfo:", page);

  // Extract result metadata from X-SLI-ResultInfo header
  const header = (data.headers || []).find(h => h.name === "X-SLI-ResultInfo");
  if (header) {
    try {
      data.resultinfo = JSON.parse(header.value).RESULTINFO;
    } catch (e) {
      console.warn("Invalid RESULTINFO header JSON", e);
    }
  }

  // Update UI
  $("#results footer span").html(page);

  if (data.resultinfo && indexer === "moby") {
    this.resultnodecount = 0;
    data.resultinfo.forEach((info, index) => {
      this.getresultinfo(info, page, index, indexer);
    });
    $('a[href="#results"]').closest("li").show();
  } else {
    $('a[href="#results"]').closest("li").hide();
  }
};

ProfileManager.prototype.getresultinfo = function(resultdata, page, index, indexer) {
  if (!resultdata || !resultdata.url || !resultdata.indexname) return;

  const ri_url = "https://moby.sli-systems.com/resultinfo?" +
    "url=" + encodeURIComponent(resultdata.url) +
    "&indexname=" + encodeURIComponent(resultdata.indexname) +
    "&callback=?";

  console.log("Fetching result info for:", resultdata.url);

  chrome.runtime.sendMessage({ type: "xhr", url: ri_url }, (response) => {
    if (response && response.success) {
      this.makeresultinfo({ data: response.data }, ri_url, page, index);
    } else {
      console.error("ResultInfo fetch failed", response?.error);
      this.makeresultinfo({ error: response?.error }, ri_url, page, index);
    }
  });
};

ProfileManager.prototype.makeresultinfo = function(result, url, page, index) {
  if (result.error) {
    console.warn("Error fetching result info for", url, result.error);
    return;
  }

  let xmldoc;
  try {
    const parser = new DOMParser();
    xmldoc = parser.parseFromString(result.data, "application/xml");
  } catch (e) {
    console.warn("Invalid XML from result info", e);
    return;
  }

  if (xmldoc.getElementsByTagName("parsererror").length > 0) {
    console.warn("Malformed result info XML", url);
    return;
  }

  if (!this[page].resultinfo_docs) this[page].resultinfo_docs = [];
  this[page].resultinfo_docs[index] = xmldoc;

  // You could update UI with this XML here if needed
};
