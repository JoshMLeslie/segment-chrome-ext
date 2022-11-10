var segmentTrackedEvents = [];
var segmentApiDomainDefault = 'api.segment.io,cdn.dreamdata.cloud'
chrome.storage.local.set({segmentTrackedEvents })
chrome.storage.local.set({segmentApiDomainDefault })
chrome.storage.local.set({segmentApiDomain: segmentApiDomainDefault})

chrome.storage.local.get(['segmentApiDomain'], (result) => {
	apiDomain = result.segmentApiDomain || segmentApiDomainDefault;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
	if (namespace === 'local' && changes && changes.segmentApiDomain) {
		apiDomain = changes.segmentApiDomain.newValue || segmentApiDomainDefault;
	}
});

const zeroPad = (i) => {
	if (i < 10) {
		i = '0' + i;
	}
	return i;
}

const formatDateToTime = (date) => {
	return date.toLocaleTimeString();
}

const withOpenTab = (callback) => {
	chrome.tabs.query(
		{
			active: true,
			currentWindow: true,
		},
		(tabs) => {
			var tab = tabs[0];

			if (tab) {
				callback(tab);
			}
		}
	);
}

const addEvent = (event) => {
	segmentTrackedEvents.unshift(event);
	// todo: add (default)config for max events to prevent overload + slowdown
	chrome.runtime.sendMessage({type: 'new_event'});
}

const updateTrackedEventsForTab = (tabId, connection) => {
	var sendEvents = [];

	for (var i = 0; i < segmentTrackedEvents.length; i++) {
		if (segmentTrackedEvents[i].tabId == tabId) {
			sendEvents.push(segmentTrackedEvents[i]);
		}
	}

	connection.postMessage({
		type: 'update',
		events: sendEvents,
	});
}

const clearTrackedEventsForTab = (tabId, connection) => {
	var newTrackedEvents = [];
	for (var i = 0; i < segmentTrackedEvents.length; i++) {
		if (segmentTrackedEvents[i].tabId != tabId) {
			newTrackedEvents.push(segmentTrackedEvents[i]);
		}
	}
	segmentTrackedEvents = newTrackedEvents;
}

chrome.runtime.onConnect.addListener((connection) => {
	console.log('Beep');
	var parser = (msg) => {
		var tabId = msg.tabId;
		if (msg.type == 'update') {
			updateTrackedEventsForTab(tabId, connection);
		} else if (msg.type == 'clear') {
			clearTrackedEventsForTab(tabId, connection);
			updateTrackedEventsForTab(tabId, connection);
		}
	};
	connection.onMessage.addListener(parser);
});

const isSegmentApiCall = (url) => {
	var apiDomainParts = apiDomain.split(',');
	return (
		apiDomainParts.findIndex((d) => url.startsWith(`https://${d.trim()}`)) != -1
	);
}

const onOwnServerResponse = (url, callback) => {
	withOpenTab((tab) => {
		var tabURL;
		var targetURL;

		try {
			tabURL = new URL(tab.url);
		} catch {
			console.warn("couldn't generate URL for tab", tab);
			return;
		}
		try {
			targetURL = new URL(url);
		} catch {
			console.warn("couldn't generate URL for target", url);
			return;
		}

		if (tabURL.host === targetURL.host) {
			callback();
		}
	});
}

const eventTypeToName = (eventType) => {
	switch (eventType) {
		case 'identify':
			return 'Identify';
		case 'pageLoad':
			return 'Page Loaded';
		case 'batch':
			return 'Batch';
	}
}

/**
 * @param {{
 * documentId: string; // alphanumeric
 * documentLifecycle: string;
 * frameId: number;
 * frameType: string;
 * initiator: string; // url
 * method: string; // CRUD
 * parentFrameId: number;
 * requestId: string; // number
 * tabId: number;
 * timeStamp: number;
 * type: string;
 * url: string;
 * }} details 
 */
const handleBeforeRequest = (details) => {
	if (isSegmentApiCall(details.url)) {
		var postedString = String.fromCharCode.apply(
			null,
			new Uint8Array(details.requestBody.raw[0].bytes)
		);

		var rawEvent = JSON.parse(postedString);

		var event = {
			raw: postedString,
			trackedTime: formatDateToTime(new Date()),
		};

		withOpenTab((tab) => {
			event.hostName = tab.url;
			event.tabId = tab.id;

			if (details.url.endsWith('/v1/t') || details.url.endsWith('/v2/t')) {
				event.type = 'track';
			} else if (
				details.url.endsWith('/v1/i') ||
				details.url.endsWith('/v2/i')
			) {
				event.type = 'identify';
			} else if (
				details.url.endsWith('/v1/p') ||
				details.url.endsWith('/v2/p')
			) {
				event.type = 'pageLoad';
			} else if (
				details.url.endsWith('/v1/batch') ||
				details.url.endsWith('/v2/batch') ||
				details.url.endsWith('/v1/b') ||
				details.url.endsWith('/v2/b')
			) {
				event.type = 'batch';
			}

			if (event.type) {
				event.eventName = eventTypeToName(event.type) || rawEvent.event;
				addEvent(event);
			}
		});
	}
}

chrome.webRequest.onBeforeRequest.addListener(
	(details) => {
		if (details.tabId > -1) {
			handleBeforeRequest(details);
		}
	},
	{
		urls: ['<all_urls>'],
	},
	["requestBody"]
);

/**
 * @param {{
 * documentId : string;
 * documentLifecycle : string;
 * frameId : number;
 * frameType : string;
 * initiator : string; // url
 * method : string;
 * parentDocumentId : string;
 * parentFrameId : number;
 * requestId : string;
 * responseHeaders : {name: string; value: string;}[]
 * statusCode : number;
 * statusLine : string;
 * tabId : number;
 * timeStamp : number;
 * type : string;
 * url : string;
 * }} details
 */

const handleHeadersReceived =  (details) => {
	onOwnServerResponse(details.url, () => {
		const eventsHeader = details.responseHeaders.find(
			({name}) => !!name && name.toLowerCase() === 'x-tracked-events'
		);

		if (!eventsHeader) {
			return;
		}

		withOpenTab((tab) => {
			const serverTrackedEvents = JSON.parse(eventsHeader.value);
			serverTrackedEvents.forEach((serverEvent) => {
				const event = {
					type: serverEvent.type,
					eventName: serverEvent.event || eventTypeToName(serverEvent.type),
					raw: JSON.stringify(serverEvent),
					trackedTime: formatDateToTime(new Date(serverEvent.timestamp)),
					hostName: details.url,
					tabId: tab.id,
				};

				addEvent(event);
			});
		});
	});
}
chrome.webRequest.onHeadersReceived.addListener(
	(details) => {
		handleHeadersReceived(details);
	},
	{
		urls: ['<all_urls>'],
	},
	['responseHeaders']
);
