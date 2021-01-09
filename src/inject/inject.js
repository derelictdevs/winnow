chrome.extension.onMessage.addListener(function(req, sender, respond) {
	console.log("inject.js: Message Received! ["+req+"]");
   if (req === 'ScriptRunning') {
       respond('true');
   } else if (req === 'StopScript') {
   	   clearTimeout(newPageTimeout);
   	   console.log("inject.js: StopScript received.");
   	   respond('true');
   }
});

// Used to scale the random time generated for switching pages
var clickFactor = 1;

var googleSearch = false;
if (/^https?:\/\/www\.google\.com\/search/.test(window.location)) {
	//console.log(">>Google Search Page Detected<<");
	googleSearch = true;
	clickFactor = 0.4;
}

// Disable autocomplete on page so accounts aren't automatically logged into
var inputnodes = document.getElementsByTagName('input');    
for(var i=0;i<inputnodes.length;i++){       
	inputnodes[i].setAttribute('autocomplete','blah');
	inputnodes[i].setAttribute('name',' ');
}

var formnodes = document.getElementsByTagName("form");    
for(var i=0;i<formnodes.length;i++){                    
	formnodes[i].setAttribute('autocomplete','blah');
} 

var linksOnPage = document.getElementsByTagName('a');

// Filter the list of links
var links = [];
for(var i=0; i<linksOnPage.length; ++i) {
	// Remove any link that does not begin with http or https or is a Bookmark
	if (/^http/.test(linksOnPage[i]) && !/#\S*$/.test(linksOnPage[i])) {
		if (googleSearch && /^https?:\/\/[^\/]*google[^\/]*\//.test(linksOnPage[i])) {
			//console.log("Google Search and Google URL Detected, skipping: ["+linksOnPage[i]+"]");
		} else {
			links.push(linksOnPage[i]);
			//console.log("Link: ["+linksOnPage[i]+"]");
		}
	} else {
		//console.log("Bad Link: ["+linksOnPage[i]+"]");
	}
}

console.log("Links Found: ["+links.length+"] of ["+linksOnPage.length+"]");

if (links.length > 0) {
	var selectedLink = randInt(0, links.length-1);

        setTimeout( winnow_scroll, 1000 );
} else {
	console.log("!!No links found.");	
}

// Attempt to disable "Are you sure you want to leave" popups
window.onbeforeunload = null;
window.onunload = null;

function randInt (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// This will fire to force us away from the page.
setTimeout( function() { window.location = links[selectedLink]; },
    scriptOptions.maxTimeBetweenClicks*clickFactor * 1000 );

var _w_data = {
    // Current Y screen position.
    yLoc: 0,

    // Function to determine if the current update should scroll up.
    // Current value is 15%
    shouldScrollUpFn: function() 
    { 
        return ( 
            ( scriptOptions.pctChanceScrollUp > 0 ) &&
            ( randInt( 0, 100 ) < scriptOptions.pctChanceScrollUp ) ); 
    },

    // Function to return the amount to scroll up.
    scrollUpAmtFn: function() 
    { 
        var iMin = scriptOptions.minScrollUpPx;
        var iMax = scriptOptions.maxScrollUpPx;

        return randInt( Math.min( iMin, iMax ), Math.max( iMin, iMax ) );
    },

    // Function to return the amount to scroll down.
    scrollDownAmtFn: function() 
    {
        var iMin = scriptOptions.minScrollDownPx;
        var iMax =  Math.max( 
                scriptOptions.maxScrollDownPx,
                Math.floor( document.body.scrollHeight / scriptOptions.maxPctPageDownScroll ) );

        return randInt( Math.min( iMin, iMax ), Math.max( iMin, iMax ) );
    },

    //  Determines if the page should be left before scrolling to the bottom.
    shouldLeavePageBBFn: function() 
    { 
        var iPctChance = scriptOptions.pctChanceLeavePageBeforeBottom;

        return ( 0 == iPctChance ) ? false : ( ( this.yLoc / document.body.scrollHeight ) > 
                   ( scriptOptions.pctPageScrollMinBeforeLeaving / 100 ) ) &&
                   ( randInt( 0, 100 ) < iPctChance ); 
    },

    // Determins the delay, in ms, to scroll.
    scrollDelayFn: function() 
    {
        var iPctChance = scriptOptions.pctChanceExtScrollDelay;
        var iMin = scriptOptions.minStdScrollDelay;
        var iMax = scriptOptions.maxStdScrollDelay;

        if ( iPctChance > 0 && randInt( 0, 100 ) < iPctChance )
        {
            iMin = scriptOptions.minExtScrollDelay;
            iMax = scriptOptions.maxExtScrollDelay;
        }

        return randInt( Math.min( iMin, iMax ), Math.max( iMin, iMax ) );
    }
};


function winnow_scroll()
{
    if ( _w_data.shouldScrollUpFn() )
        _w_data.yLoc = Math.max( 0, _w_data.yLoc - _w_data.scrollUpAmtFn() );
    else
        _w_data.yLoc = Math.min( _w_data.yLoc + _w_data.scrollDownAmtFn(), document.body.scrollHeight );
    window.scroll( 
    {
        left: 0,
        top: _w_data.yLoc,
        behavior: 'smooth'
    });
    // Should we leave the page now?
    if ( _w_data.shouldLeavePageBBFn() )
    {
        console.log( "Randomly moving on to: " + links[selectedLink] );
        window.location = links[selectedLink];
    }
    // If we're not at the bottom of the page...
    else if ( _w_data.yLoc < document.body.scrollHeight )
    {
        setTimeout( winnow_scroll, _w_data.scrollDelayFn() );
    }
    else // We're at the bottom of the page.
    {
        console.log( "Reached bottom of the page, moving on to: " + links[selectedLink] );
        window.location = links[selectedLink];
    }
}
