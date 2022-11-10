var apiDomainDefault = 'api.segment.io,cdn.dreamdata.cloud';

var connection = chrome.runtime.connect();
var rawEvents = {};

const showEvent = (number) => {
	document.getElementById('eventContent_' + number).style.display = 'block';
};

const printVariable = (jsonObject, level) => {
	var returnString = '';
	for (var key in jsonObject) {
		if (jsonObject.hasOwnProperty(key)) {
			returnString += `<div style="padding-left: ${
				level * 10
			}px;"><span class="key">${key}</span>`;

			if (typeof jsonObject[key] == 'object') {
				returnString += ' {' + printVariable(jsonObject[key], level + 1) + '}';
			} else {
				var type = 'number';
				if (isNaN(jsonObject[key])) {
					type = 'string';
				}
				returnString += `: <span class="${type}">${jsonObject[key]}</span>`;
			}
			returnString += '</div>';
		}
	}
	return returnString;
};
const queryForUpdate = () => {
	chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
		var currentTab = tabs[0];

		connection.postMessage({
			type: 'update',
			tabId: currentTab.id,
		});
	});
};

const clearTabLog = () => {
	chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
		var currentTab = tabs[0];

		connection.postMessage({
			type: 'clear',
			tabId: currentTab.id,
		});
	});
};

queryForUpdate();

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
	console.log('new event in panel', message, _sender, _sendResponse);
	if (message.type == 'new_event') {
		queryForUpdate();
	}
});

const eventHeader = (event, i) => {
	return (
		`<div class="eventInfo" number="${i}">` +
		'<div class="eventInfoLeft">' +
		`<span class="eventName">${event.eventName} - ${event.trackedTime}</span>` +
		`<span class="eventHostName">${event.hostName}</span>` +
		'</div>' +
		'<div className="eventInfoRight">' +
		`<button id="eventHeaderCopy_${i}">copy</button>` +
		'</div>' +
		'</div>'
	);
};

connection.onMessage.addListener((msg) => {
	if (msg.type == 'update') {
		var prettyEventsString = '';

		if (msg.events.length > 0) {
			for (var i = 0; i < msg.events.length; i++) {
				var event = msg.events[i];

				var jsonObject = JSON.parse(event.raw);

				var eventString =
					`<div class="eventTracked eventType_${event.type}">` +
					eventHeader(event, i) +
					`<div class="eventContent" id="eventContent_${i}">` +
					printVariable(jsonObject, 0) +
					'</div></div>';

				prettyEventsString += eventString;
			}
		} else {
			prettyEventsString += 'No events tracked in this tab yet!';
		}
		document.getElementById('trackMessages').innerHTML = prettyEventsString;

		// todo: refactor
		if (msg.events.length > 0) {
			for (var i = 0; i < msg.events.length; i++) {
				document
					.getElementById(`eventHeaderCopy_${i}`)
					.addEventListener('click', (e) => {
						e.preventDefault();
						window.navigator.copyToClipboard(JSON.parse(msg.events[i - 1].raw));
						window.alert("contents copied")
					});
			}
		}

		// register click handlers for expansion of content
		var eventElements = document.getElementsByClassName('eventInfo');
		Array.from(eventElements).forEach((el, i) => {
			var handleClick = () => {
				var el = document.getElementById('eventContent_' + i);
				if (el.style.display === 'block') {
					el.style.display = 'none';
				} else {
					el.style.display = 'block';
				}
			};
			el.onclick = handleClick;
		});
	}
});

const filterEvents = (keyPressedEvent) => {
	var filter = new RegExp(keyPressedEvent.target.value, 'gi');
	var eventElements = document
		.getElementById('trackMessages')
		.getElementsByClassName('eventTracked');
	for (eventElement of eventElements) {
		var eventName =
			eventElement.getElementsByClassName('eventName')[0].textContent;
		if (eventName.match(filter)) {
			eventElement.classList.remove('hidden');
		} else {
			eventElement.classList.add('hidden');
		}
	}
};

const toggleConfiguration = () => {
	var configurationDiv = document.getElementById('configurationDiv');
	configurationDiv.hidden = !configurationDiv.hidden;

	var contentDiv = document.getElementById('contentDiv');
	contentDiv.hidden = !contentDiv.hidden;
};

const updateApiDomain = (apiDomain) => {
	chrome.storage.local.set(
		{segment_api_domain: apiDomain || apiDomainDefault},
		() => {}
	);
};

const handleApiDomainUpdates = () => {
	var apiDomainInput = document.getElementById('apiDomain');

	chrome.storage.local.get(['segment_api_domain'], (result) => {
		apiDomainInput.value = result.segment_api_domain || apiDomainDefault;
		apiDomainInput.onchange = () => updateApiDomain(apiDomainInput.value);
	});
};

document.addEventListener('DOMContentLoaded', () => {
	var clearButton = document.getElementById('clearButton');
	clearButton.onclick = clearTabLog;

	var filterInput = document.getElementById('filterInput');
	filterInput.onkeyup = filterEvents;
	filterInput.focus();

	var configButton = document.getElementById('configButton');
	configButton.onclick = toggleConfiguration;

	handleApiDomainUpdates();
});
