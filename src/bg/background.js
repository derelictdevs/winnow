// Define Globals
var settings;

var processingEnabled;
var processing;
var manualProcessing;

var autoMode;

var seedURLs;
var useBookmarks;

var tabId;
var currentTab;

// Used to track if a browsing timeout occurred for the Tab Updated event
var browsingTimeout;
var historyTimeout;
var historyAnalyzedLastPass;

// Last URL used during a Browsing Timeout. Used to get out of a Browse Timeout loop.
var browseTimeoutNewURL;

var historyURLs = [];

var BROWSING_PARAMETERS = [];

var SeedService;
var SeedServiceInitialized;

// Setup event handlers
chrome.browserAction.onClicked.addListener(
	function(tab) {
		toggleProcessing();
	}	
);

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
  	switch(request.action) {
  		case "status":
  			console.log("Request: ["+request.data+"]");
  			sendResponse({status: request.data});
  	
  			if (request.data == true) {
  				if (processingEnabled != true) {
  					enableProcessing();
  				}
  			} else if (request.data == false) {
  				disableProcessing();
  			}
  			break;
  			
  		default:
  			break;
  	}
});

chrome.idle.onStateChanged.addListener(
	function(newstate) {
		if (autoMode && !manualProcessing) {
			switch(newstate) {
				case "active":
					stopProcessing();
					break;
					
				case "idle":
				case "locked":
					startProcessing();
					break;
			}
		}
});

chrome.tabs.onRemoved.addListener(
	function(removedTabId, removeInfo) {
		if (removedTabId == tabId) {
			tabId = undefined;
			
			stopProcessing();	
		}
	}	
);

chrome.tabs.onUpdated.addListener(
	function(updatedTabId, changeInfo, tab) {
		if (updatedTabId != tabId || changeInfo.status != 'complete') return;
		console.log("Tab Updated: ["+updatedTabId+"] ["+changeInfo.status+"]");
		
		tabUpdated(tab);
	}	
);

window.addEventListener('storage', onStorageEvent, false);

init();

function init() {
	settings = new Store("settings", DEFAULTS);
	
	processingEnabled = settings.get("processingEnabled");
	processing = false;
	manualProcessing = false;
	
	autoMode = settings.get("autoMode");
	
	useBookmarks = settings.get("useBookmarks");
	
	tabId = undefined;
	currentTab = undefined;
	
	historyAnalayzedLastPass = false;
	
	setIdleTime();
	
	SeedServiceInitialized = false;
	SeedService = new Seed();
	
	setSeedSettings();
	
	gatherSeedURLs();
	
	SeedServiceInitialized = true;			      
}

function onStorageEvent(e) {
	//console.log(e);
	
	switch(e.key) {
		case "store.settings.autoMode":
			autoMode = (e.newValue == "true");
			break;
			
		case "store.settings.idleTime":
			setIdleTime();
			break;
			
		case "store.settings.useGoogle":
		case "store.settings.useBing":
		case "store.settings.useYahoo":
			setSeedSettings();
			break;
			
		case "store.settings.website1":
		case "store.settings.website2":
		case "store.settings.website3":
		case "store.settings.website4":
		case "store.settings.website5":
		case "store.settings.website6":
		case "store.settings.website7":
		case "store.settings.website8":
		case "store.settings.website9":
		case "store.settings.website10":
		case "store.settings.useBookmarks":
			gatherSeedURLs();
			break;
	}
}
  
function toggleProcessing() {
	if (processing) {
		manualProcessing = false;
		stopProcessing();		
	} else {
		manualProcessing = true;
		startProcessing();
	}	
}
  
function enableProcessing() {
	processingEnabled = true;	
	settings.set("processingEnabled", true);
}

function disableProcessing() {
	processingEnabled = false;	
	settings.set("processingEnabled", false);
}

function startProcessing() {
	if (!processing) {
		processing = true;
		chrome.browserAction.setBadgeText({text: "On"});
		
		console.log("Creating Tab...");
		// Create a new tab and store the Id for later use
		chrome.tabs.create({"active": true, "index": 0, "pinned": true}, function (tab) {
			console.log("Tab Created: ["+tab.id+"]");
			tabId = tab.id;
			
			beginBrowsing();
		});
	}
}

function stopProcessing() {
	if (processing) {
		processing = false;
		currentTab = undefined;
		chrome.browserAction.setBadgeText({text: ""});
		
		// Clear Timeouts
		if (browsingTimeout) clearTimeout(browsingTimeout);
		if (historyTimeout) clearTimeout(historyTimeout);
		if (browseTimeoutNewURL) clearTimeout(browseTimeoutNewURL);
		
		stopScript();
	}
}


function stopScript() {
	console.log("Stopping Script...");
	chrome.tabs.executeScript(tabId, { code: 'clearTimeout(newPageTimeout);'}, function(){
		chrome.tabs.sendMessage(tabId, "StopScript", function(response) {
			console.log("Inject Script Stopped: ["+response+"]");
			killTab();
		});
	});	
}

function killTab() {
	// Remove the tab if requested
	if (settings.get("removeTabWhenFinished") && tabId != undefined) {
		try {
			chrome.tabs.remove(tabId, function (){
				tabId = undefined;	
			});
		} catch(e) {
			console.log("Unable to remove Tab ID: ["+tabId+"]");
		}
	} else {
		tabId = undefined;
	}
}

function beginBrowsing() {
	// Initialize Browsing Parameters; TODO: Finish initializing parameters
	// Number of pages to browse on a particular site
	BROWSING_PARAMETERS['siteDepth'] = randInt(Math.floor(settings.get("maxSiteDepth")*settings.get("siteDepthVariance")), settings.get("maxSiteDepth"));
	
	// Number of pages to visit based upon a seed site
	BROWSING_PARAMETERS['depth'] =  randInt(BROWSING_PARAMETERS['siteDepth'], settings.get("maxDepth"));
	//console.log("Begin Browsing: ["+settings.get("minSiteDepth")+"],["+settings.get("maxSiteDepth")+"]=["+BROWSING_PARAMETERS['siteDepth']+"] ["+BROWSING_PARAMETERS['depth']+"]");
	// Clear History
	historyURLs = [];
	
	SeedService.getSeed(
		function(url) {
			if (url == null) {
				console.log("No seed returned! Restarting the Browse.");
				beginBrowsing();	
			} else {
				browse(url);
			}
		}
	);
}

function browse(url) {
	startBrowseTimeout();
	console.log("Browsing To: ["+url+"]");
	chrome.tabs.update(tabId, {url: url, muted: true});	
}

function startBrowseTimeout() {
	clearTimeout(browsingTimeout);	
	browsingTimeout = setTimeout(browseError, randInt(Math.floor(settings.get("browsingTimeoutMax")*settings.get("browsingTimeoutVariance")),settings.get("browsingTimeoutMax"))*1000);	
}

function browseError() {
	var browseTimeoutNewURLtmp = historyURLs.pop(); // This one is the bad URL
	browseTimeoutNewURLtmp = historyURLs.pop();
	
	if (browseTimeoutNewURLtmp == browseTimeoutNewURL) {
		console.log("!!Browse Timeout: Timed out from same URL last time. Backing up one more. ["+browseTimeoutNewURLtmp+"] == ["+browseTimeoutNewURL+"]")
		browseTimeoutNewURLtmp = historyURLs.pop();	
	}
	
	browseTimeoutNewURL = browseTimeoutNewURLtmp;
	
	if (browseTimeoutNewURL != undefined) {
		console.log("!!Browse Timeout: Backing up to: ["+browseTimeoutNewURL+"].");
		browse(browseTimeoutNewURL);
	} else {
		beginBrowsing();
	}
}

function tabUpdated(tab) {
	if (processing) {
		startBrowseTimeout();
		
		currentTab = tab;
		
		// If the browsing history has exceeded the pre-determined depth, begin again with a new seed
		if (historyURLs.length > BROWSING_PARAMETERS['depth']) {
			console.log("!!!Browsing Depth of ["+BROWSING_PARAMETERS['depth']+"] exceeded. Reseeding.");
			beginBrowsing();
		}
		
		// TODO: If detected language of page isn't desired, back up
	  	chrome.tabs.detectLanguage(tabId, 
	  		function(language) {
	  			if (settings.get("languageDetectionEnabled")) {
	    			console.log("Tab Language: ["+language+"]");
	    			
	    			//var languageToDetect = settings.get("preferredLanguage");
	    			//var langExp = new RegExp("^"+languageToDetect, "i");
	    			//if (!langExp.test(language.toLower())) {
	    			//	console.log("A different language detected, backing up.")
	    			//	browseError();
	    			//}
	    		}
	  		});
		
		// Analyze the browsing history to determine if a change in behavior is necessary
		var alternateURL = "";
		
		if (!historyAnalyzedLastPass) {
			alternateURL = analyzeHistory(tab.url);
		} else {
			historyAnalyzedLastPass = false;
		}
		
		if (alternateURL != "") {
			historyTimeout = setTimeout(
				function() {
					historyAnalyzedLastPass = true;
			    	browse(alternateURL);
			    }
			, 20000); // 20 Seconds		 
		} else {
			// Inject some JavaScript to determine the next page to visit
			inject();	
		}
	} else {
		stopProcessing();
	}
}

function analyzeHistory(currentURL) {
	var status = "";
	
	// See if the browsing history indicates the script is stuck on the same website for too long
	if (historyURLs.length > BROWSING_PARAMETERS['siteDepth']) {
		var tld = getDomain(currentURL);
		var count = 0;
		console.log("Analyzing History [Staleness]: Domain ["+tld+"], Depth ["+BROWSING_PARAMETERS['siteDepth']+"].");
		for(var i = historyURLs.length-1; i>=0; i--) {
			var domain = getDomain(historyURLs[i]);
			//console.log(">>Found Domain: ["+domain+"]");	
			if (domain == tld) {
				count++;
				//console.log(">>>Matches previous domain. ["+count+"]");
			} else {
				break;
			}
			
			if (count > BROWSING_PARAMETERS['siteDepth']) {
				console.log(">>>>More than ["+BROWSING_PARAMETERS['siteDepth']+"] matches for domain ["+tld+"].");
				for(var j = i; j>=0; j--) {
					status = historyURLs[j];

					if (getDomain(historyURLs[j]) != tld) break;	
				}
				
				break;
			}
		}
	}
	
	// Other patterns to look for:
	// - Navigated to the same page two or three times in a row (discounting bookmark)
	// - Visited the same page in the history at least 4-5 times; trigger a re-seed
	
	console.log("analyzeHistory() = ["+status+"].");
	return status;
}

// Returns just the domain from a URL string
function getDomain(url) {
	var domain = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
	return domain[0];	
}

function inject() {
    console.log("Injecting into tab ["+tabId+"].");
    try {
        chrome.tabs.executeScript(tabId, { code: "var scriptOptions = { " +
            "timeBetweenClicksVariance: " + settings.get("timeBetweenClicksVariance") +
            ", maxTimeBetweenClicks: " + settings.get("maxTimeBetweenClicks") + 
            ", pctChanceScrollUp: "+settings.get( "pctChanceScrollUp" ) +
            ", minScrollUpPx: "+ settings.get( "minScrollUpPx" ) +
            ", maxScrollUpPx: "+ settings.get( "maxScrollUpPx" ) +
            ", maxPctPageDownScroll: "+ settings.get( "maxPctPageDownScroll" ) +
            ", minScrollDownPx: "+ settings.get( "minScrollDownPx" ) +
            ", maxScrollDownPx: "+ settings.get( "maxScrollDownPx" ) +
            ", minStdScrollDelay: "+ settings.get( "minStdScrollDelay" ) +
            ", maxStdScrollDelay: "+ settings.get( "maxStdScrollDelay" ) +
            ", minExtScrollDelay: "+ settings.get( "minExtScrollDelay" ) +
            ", maxExtScrollDelay: "+ settings.get( "maxExtScrollDelay" ) +
            ", pctChanceExtScrollDelay: "+ settings.get( "pctChanceExtScrollDelay" ) +
            ", pctPageScrollMinBeforeLeaving: "+ settings.get( "pctPageScrollMinBeforeLeaving" ) +
            ", pctChanceLeavePageBeforeBottom: " + settings.get( "pctChanceLeavePageBeforeBottom" ) +
            " };" },
			function() {
				//console.log(">>Injecting Chaff.");
				chrome.tabs.executeScript(tabId, { file: "src/inject/inject.js" }, 
					function() {
						saveHistory();
					}	
				);
			}
		);
	} catch(e) {
		// Let the Browse Timeout occur to handle this case
		console.log("!!Error occurred when trying to inject into tab.");
	}
}

// Remeber the links we've been to
function saveHistory() {
	if (currentTab != undefined) {
		historyURLs.push(currentTab.url);
		console.log("URL ["+currentTab.url+"] saved in History, depth ["+historyURLs.length+"].");
	}	
}

function gatherSeedURLs() {
	seedURLs = [];
	
	for(i=1; i<=10; i++) {
		seedURLs.push(settings.get("website"+i));
	}
	
	if (useBookmarks) {
		chrome.bookmarks.getTree(processBookmarks);
	} else {
		SeedService.setSeedURLs(seedURLs);
	}
}

function processBookmarks(bookmarks) {
	// recursively gather all bookmarks
    saveBookmarkURLs(bookmarks);
		
	SeedService.setSeedURLs(seedURLs);
}

function saveBookmarkURLs(bookmarks) {
    for (var i =0; i < bookmarks.length; i++) {
        var bookmark = bookmarks[i];
        if (bookmark.url) {
            seedURLs.push(bookmark.url);
        }

        if (bookmark.children) {
            saveBookmarkURLs(bookmark.children);
        }
    }
}

function setSeedSettings() {
	SeedService.setSettings(settings.toObject());
}

function setIdleTime() {
	// Get idle time in minutes
	var idleTime = settings.get('idleTime');
	idleTime *= 60;
	chrome.idle.setDetectionInterval(idleTime);	
}

function randInt (min, max) {
	min = parseInt(min, 10);
	max = parseInt(max, 10);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
