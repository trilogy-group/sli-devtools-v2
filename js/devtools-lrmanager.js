/* LR Code */
window.LRManager = function(port) {
    manager = this;
    this.port = port;
    output = jQuery("#lr_content");
    accordianGroupTemplate = jQuery("#lr-accordian-group-template").text();
    lrTable = jQuery("#lr-table-template").text();
    strategyInfo = {};
};

LRManager.prototype = {
    // Clear the LR tab of strategy info
    resetLR: function(){
        output.html("");
    },

    // Process strategy info received from Brutil API
    addStrategyInfo: function(data){
        console.log(data);
        if (typeof data !== "undefined") {
            data.forEach(function(strategy, index){
                strategyInfo[strategy.strategyId] = strategy.name; // Store strategy name for future calls
                jQuery('a[href="#Main-' + strategy.strategyId + '-Content"]').html(strategy.name); // Update any existing strategies with the Brutil name
            });
        }
    },

    // Parse JSONP
    processLRRequest: function(content){
        // Remove JSONP padding and parse
        var parsedContent = JSON.parse(content.replace(/^.+?\(/, "").replace(/\)$/, ""));

        // Handle Batched requests and requests that return no recommendations
        if (parsedContent.results.length === 0 || typeof parsedContent.results[0].results === "undefined") {
            manager.processContent(parsedContent);
        } else {
            parsedContent.results.forEach(function(set){
                manager.processContent(set);
            });
        }
    },

    processContent: function(parsedContent){
        var stratId = parsedContent.strategyId;
        var content = jQuery("<div class='accordion'></div>").attr("id", "Content-" + stratId);

        // Add basic API info
        content.append(manager.createAccordianGroup("Basic-" + stratId, "Content-" + stratId, "Basic Info", manager.processBasics(parsedContent), true));
        // Add info about the strategy rules
        content.append(manager.createAccordianGroup("Rules-" + stratId, "Content-" + stratId, "Strategy Info", manager.processRules(parsedContent), false));
        // Add product info
        if (parsedContent.results.length > 0) {
            content.append(manager.createAccordianGroup("Results-" + stratId, "Content-" + stratId, "Result Info", manager.processResults(parsedContent), false));
        }
        // Add formatted JSON
        content.append(manager.createAccordianGroup("Raw-" + stratId, "Content-" + stratId, "JSON", jQuery('<pre id="json_dump"></pre>').html(JSON.stringify(parsedContent, undefined, 4)), false));

        // Build Strategy Accordian
        jQuery(output).append(manager.createAccordian("Main-" + stratId, typeof strategyInfo[stratId] !== "undefined" ? strategyInfo[stratId] : "Strategy: " + stratId, content, true));
    },

    // Build out basic info table
    processBasics: function(content){
        var table = jQuery(lrTable);

        table.find('tbody').append(manager.createTableRow(["Request Status", content.status], (content.status.toUpperCase() === "OK" ? "success" : "warning")));
        // Display any error messages
        if (content.message) {
            table.find('tbody').append(manager.createTableRow(["Message", content.message], "warning"));
        }

        var tbody = table.find('tbody');

        // Did all the rules return an OK status
        if (typeof content.debug !== "undefined" && typeof content.debug.sequence !== "undefined") {
            var allRulesSuccesfull = content.debug.sequence.every(function(rule){
                return rule.status.toUpperCase() === "OK";
            });
            tbody.append(manager.createTableRow(["Strategy Rules Status", allRulesSuccesfull ? "OK" : "WARNING"], allRulesSuccesfull ? "success" : "warning"));
        }

        tbody.append(manager.createTableRow(["SID", content.strategyId]));

        if (typeof content.debug !== "undefined") {
            // If a sku is passed in, it should be in the index
            var skuClass = content.debug.isSkuInQuery === content.debug.isSkuInIndex ? "success" : "warning";
            tbody.append(manager.createTableRow(["Sku", (content.debug.rawQueryParameters.sku || "No Sku")]))
            .append(manager.createTableRow(["Sku in Query", content.debug.isSkuInQuery], skuClass))
            .append(manager.createTableRow(["Sku in Index", content.debug.isSkuInIndex], skuClass))
            .append(manager.createTableRow(["Recs Returned", content.debug.resultCount]))
            .append(manager.createTableRow(["Host", content.debug.hostname]));
        }

        return table;
    },

    // Build out rules table
    processRules: function(content){
        if (typeof content.debug !== "undefined" && typeof content.debug.sequence !== "undefined") {
            var ruleHeadings = [ "Status", "Result Count" ];
            var ruleFields = [ "status", "resultCount" ];
            var table = jQuery(lrTable);
            var stratId = content.strategyId;
            var stratInfoParentId = "stratParent_" + stratId;

            table.attr("id", stratInfoParentId);

            // Build table heading
            ["#","Algorithm","Mergeable"].concat(ruleHeadings).forEach(function(field){
                table.find("thead").append("<th>" + field + "</th>");
            });

            // Build table rows
            content.debug.sequence.forEach(function(strategy, index){
                var rowClass = "rule" + (strategy.status.toUpperCase() === "OK" ? " success" : " warning");
                var stratRow = manager.createTableRow([index + 1, strategy.strategyAction.algorithm, strategy.strategyAction.mergeable], rowClass);
                var stratInfoId = "stratInfo_" + stratId + "_" + index;

                ruleFields.forEach(function(field){
                    stratRow.append("<td>" + strategy[field] + "</td>");
                });

                stratRow.attr("data-toggle", "collapse");
                stratRow.attr("data-target", "#" + stratInfoId);
                stratRow.attr("data-parent", "#" + stratInfoParentId);
                stratRow.addClass("accordion-toggle");

                var stratInfoRow = manager.createTableRow([""], "lr_hidden_row");
                stratInfoRow.find('td').attr('colspan', stratRow.find("td").length).html("<div id='" + stratInfoId + "' class='collapse'><pre>" + JSON.stringify(strategy, undefined, 4) + "</pre></div>");

                table.append(stratRow).append(stratInfoRow);
            });
            return table;
        } else {
          return "";
        }
    },

    // Build out result tables
    processResults: function(content){
        if (typeof content.results !== "undefined") {
            resultsContent = jQuery("<div></div>");
            content.results.forEach(function(result, resultIndex){
                var table = jQuery(lrTable);
                table.find('thead').append("<th>Recommendation " + (resultIndex + 1) + "</th><th></th>");
                // Create a row for each recommendation attribute
                Object.keys(result).forEach(function(attribute){
                    if (result.hasOwnProperty(attribute)) {
                        table.find('tbody').append(manager.createTableRow([attribute, result[attribute]]));
                    }
                });
                resultsContent.append(table);
            });
            return resultsContent;
        } else {
            return "";
        }
    },

    // Create a full accordian and insert content into it
    createAccordian: function(id, heading, content, open){
        var accordian = jQuery("<div class='accordion'></div>").attr("id", id);
        accordian.html(manager.createAccordianGroup(id, id, heading, content, open));
        return accordian;
    },

    // Create an accordian group
    createAccordianGroup: function(id, parentId, heading, content, open){
        var accordianGroup = jQuery(accordianGroupTemplate);

        // Add attributes + heading
        accordianGroup.find(".accordion-heading .accordion-toggle").attr("data-parent", "#" + parentId).attr("href", "#" + id + "-Content").html(heading);

        // Have accordian displayed open
        if (open) {
            accordianGroup.find(".accordion-body").addClass('in');
        }

        // Insert content
        accordianGroup.find(".accordion-body").attr("id", id + "-Content").html(content);

        return accordianGroup;
    },

    // Create a table row
    createTableRow: function(values, rowClass){
        var row = jQuery("<tr></tr>");

        if (rowClass) {
            row.addClass(rowClass);
        }

        if (values) {
            values.forEach(function(value){
                row.append("<td>" + value + "</td>");
            });
        }

        return row;
    }
};
