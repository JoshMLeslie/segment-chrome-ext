var apiDomainDefault = 'api.segment.io,cdn.dreamdata.cloud';
var connection = chrome.runtime.connect();

const copyToCb = async (textToCopy) => {
	var hasPermission = false;
	if (navigator.permissions) {
		hasPermission = await navigator.permissions.query({
			name: 'clipboard-write',
		});
	}
	if (
		navigator.clipboard &&
		window.isSecureContext &&
		hasPermission &&
		hasPermission.state === 'granted'
	) {
		return navigator.clipboard.writeText(textToCopy);
	}
	// text area method
	const textArea = document.createElement('textarea');
	textArea.value = textToCopy;
	textArea.style.position = 'fixed';
	textArea.style.left = '-999999px';
	textArea.style.top = '-999999px';

	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	return new Promise((res, rej) => {
		document.execCommand('copy') ? res() : rej();
		textArea.remove();
	});
};

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
	if (message.type == 'new_event') {
		queryForUpdate();
	}
});

const eventHeader = (event, i) => {
	return (
		`<div class="eventInfo eventInfo_${i}">` +
		'<div class="eventInfoLeft">' +
		`<span class="eventName">${event.eventName} - ${event.trackedTime}</span>` +
		`<span class="eventHostName">${event.hostName}</span>` +
		'</div>' +
		'<div class="eventInfoRight">' +
		`<button id="eventHeaderCopy_${i}">copy</button>` +
		'</div>' +
		'</div>'
	);
};

const createEvent = (event, i) => {
	var jsonObject = JSON.parse(event.raw);
	return (
		`<div class="eventTracked eventType_${event.type}">` +
		eventHeader(event, i) +
		`<div class="eventContent" id="eventContent_${i}">` +
		printVariable(jsonObject, 0) +
		'</div></div>'
	);
};

const updateEvents = (events) => {
	if (!events.length) {
		return 'No events tracked in this tab yet!';
	}
	var eventsHtmlString = '';
	for (var i = 0; i < events.length; i++) {
		eventsHtmlString += createEvent(events[i], i);
	}
	return eventsHtmlString;
};

connection.onMessage.addListener((msg) => {
	if (msg.type == 'update') {
		document.getElementById('trackMessages').innerHTML = updateEvents(
			msg.events
		);

		// todo: refactor
		if (msg.events.length > 0) {
			for (var i = 0; i < msg.events.length; i++) {
				const el = document.getElementById(`eventHeaderCopy_${i}`);
				el.addEventListener('click', (e) => {
					e.preventDefault();
					const parent = el.parentElement.parentElement.parentElement;
					copyToCb(msg.events[i - 1].raw)
						.then(() => {
							parent.style.border = '4px solid green';
						})
						.catch(() => {
							parent.style.border = '4px solid red';
						})
						.finally(() => {
							setTimeout(() => (parent.style.border = ''), 1000);
						});
				});
			}
		}

		// register click handlers for expansion of content
		var eventElements = document.getElementsByClassName('eventInfoLeft');
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

const reloadView = () => {
	window.location.reload();
};

document.addEventListener('DOMContentLoaded', () => {
	var clearButton = document.getElementById('clearButton');
	if (clearButton) {
		clearButton.addEventListener('click', clearTabLog);
	}

	var reloadButton = document.getElementById('reloadButton');
	if (reloadButton) {
		reloadButton.addEventListener('click', reloadView);
	}

	var filterInput = document.getElementById('filterInput');
	if (filterInput) {
		filterInput.onkeyup = filterEvents;
		filterInput.focus();
	}

	var configButton = document.getElementById('configButton');
	if (configButton) {
		configButton.addEventListener('click', toggleConfiguration);
	}

	handleApiDomainUpdates();
});
