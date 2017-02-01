let floatQueue = [];
let floatData = {};
let floatTimer;
let expressionTimer;
let steamListingInfo = {};
let listingInfoPromises = [];
let validExpressionVars = ['float', 'seed', 'minfloat', 'maxfloat'];

// retrieve g_rgListingInfo from page script
window.addEventListener('message', (e) => {
    if (e.data.type == 'listingInfo') {
        steamListingInfo = e.data.listingInfo;

        // resolve listingInfoPromises
        for (let promise of listingInfoPromises) promise(steamListingInfo);

        listingInfoPromises = [];
    }
});

/*
    >>> Modification of compileExpression in Filtrex.js

    Overwrites compileExpression in Filtrex to allow specification of only certain variable names

    If the user uses a variable name that is not in the passed in validVars array, throws an error
*/
compileExpression = function(expression, extraFunctions, validVars) {
    let functions = {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        log: Math.log,
        max: Math.max,
        min: Math.min,
        random: Math.random,
        round: Math.round,
        sqrt: Math.sqrt,
    };
    if (extraFunctions) {
        for (let name in extraFunctions) {
            if (extraFunctions.hasOwnProperty(name)) {
                functions[name] = extraFunctions[name];
            }
        }
    }
    if (!compileExpression.parser) {
        // Building the original parser is the heaviest part. Do it
        // once and cache the result in our own function.
        compileExpression.parser = filtrexParser();
    }
    let tree = compileExpression.parser.parse(expression);

    let js = [];
    js.push('return ');
    function toJs(node) {
        if (Array.isArray(node)) {
            node.forEach(toJs);
        } else {
            js.push(node);
        }
    }
    tree.forEach(toJs);
    js.push(';');

    js = js.join('');

    // check if each var is proper in the js
    if (validVars) {
        let reg = /data\[\"(.+?)\"\]/g;
        let match = reg.exec(js);

        while (match !== null) {
            let dataVar = match[1];

            if (validVars.indexOf(dataVar) === -1) {
                throw new Error(`'${dataVar}' is an improper variable name`);
            }

            match = reg.exec(js);
        }
    }

    function unknown(funcName) {
        throw 'Unknown function: ' + funcName + '()';
    }
    var func = new Function('functions', 'data', 'unknown', js);
    return function(data) {
        return func(functions, data, unknown);
    };
}

const retrieveListingInfoFromPage = function(listingId) {
    if (listingId != null && (listingId in steamListingInfo)) {
        return Promise.resolve(steamListingInfo);
    }

    window.postMessage({
        type: 'requestListingInfo'
    }, '*');

    return new Promise((resolve, reject) => {
        listingInfoPromises.push(resolve);
    });
};

const getFloatData = function(listingId, inspectLink) {
    if (listingId in floatData) {
        return Promise.resolve({ iteminfo: floatData[listingId] });
    }

    return fetch(`https://api.csgofloat.com:1738/?url=${inspectLink}`)
    .then((response) => {
        if (response.ok) return response.json();
        return response.json().then((err) => { throw err; });
    });
};

const showFloat = function(listingId) {
    let itemInfo = floatData[listingId];

    let floatDiv = document.querySelector(`#item_${listingId}_floatdiv`);

    if (floatDiv) {
        // Remove the "get float" button
        let floatButton = floatDiv.querySelector('.floatbutton');
        if (floatButton) floatDiv.removeChild(floatButton);

        // Remove message div
        let msgdiv = floatDiv.querySelector('.floatmessage');
        if (msgdiv) floatDiv.removeChild(msgdiv);

        // Add the float value
        let itemFloatDiv = floatDiv.querySelector('.itemfloat');
        if (itemFloatDiv) itemFloatDiv.innerText = `Float: ${itemInfo.floatvalue}`;

        // Add the paint seed
        let seedDiv = floatDiv.querySelector('.itemseed');
        if (seedDiv) seedDiv.innerText = `Paint Seed: ${itemInfo.paintseed}`;
    }
};

const processFloatQueue = function() {
    if (floatQueue.length === 0) { return setTimeout(processFloatQueue, 100); }

    let lastItem = floatQueue.shift();

    let floatDiv = document.querySelector(`#item_${lastItem.listingId}_floatdiv`);

    if (!floatDiv) {
        // they have switched pages since initiating the request, so continue
        processFloatQueue();
        return;
    }

    let buttonText = floatDiv.querySelector('span');

    if (buttonText) buttonText.innerText = 'Fetching';

    getFloatData(lastItem.listingId, lastItem.inspectLink)
    .then((data) => {
        floatData[lastItem.listingId] = data.iteminfo;

        showFloat(lastItem.listingId);

        processFloatQueue();
    })
    .catch((err) => {
        // Reset the button text for this itemid
        if (buttonText) buttonText.innerText = 'Get Float';

        // Change the message div for this item to the error
        if (floatDiv) {
            floatDiv.querySelector('.floatmessage').innerText = err.error || 'Unknown Error';
        }

        processFloatQueue();
    });
};

// Puts all of the available items on the page into the queue for float retrieval
const getAllFloats = function() {
    retrieveListingInfoFromPage()
    .then((steamListingData) => {
        // Get all current items on the page (in proper order)
        let listingRows = document.querySelectorAll('.market_listing_row.market_recent_listing_row');

        for (let row of listingRows) {
            let id = row.id.replace('listing_', '');

            let listingData = steamListingData[id];

            let inspectLink = listingData.asset.market_actions[0].link
            .replace('%listingid%', id)
            .replace('%assetid%', listingData.asset.id);

            floatQueue.push({ listingId: id, inspectLink: inspectLink });
        }
    });
};

const filterKeyPress = function () {
    if (expressionTimer) clearTimeout(expressionTimer);

    expressionTimer = setTimeout(() => {
        let input = document.querySelector('#float_expression_filter');
        let compileError = document.querySelector('#compileError');
        let status = document.querySelector('#compileStatus');

        let expression = input.value;

        // try to compile the expression
        try {
            compileExpression(expression, {}, validExpressionVars);
            status.setAttribute('error', 'false');
            status.innerText = '✓';
            compileError.innerText = '';
        }
        catch (e) {
            status.setAttribute('error', 'true');
            status.innerText = '✗';
            compileError.innerText = e.message;
        }
    }, 250);
}

const addFilterDiv = function (parent) {
    let filterdiv = document.createElement('div');
    filterdiv.id = 'floatFilter';
    parent.appendChild(filterdiv);

    // Add separator
    let hr = document.createElement('hr');
    filterdiv.appendChild(hr);

    // Add new filter input box
    let input = document.createElement('input');
    input.id = 'float_expression_filter'
    input.classList.add('filter_search_box');
    input.placeholder = 'Add Float Highlight Filter';
    input.style.width = '350px';
    input.addEventListener('keyup', filterKeyPress);
    filterdiv.appendChild(input);

    // Add compile status indicator
    let status = document.createElement('div');
    status.id = 'compileStatus';
    filterdiv.appendChild(status);

    let compileError = document.createElement('div');
    compileError.id = 'compileError';
    filterdiv.appendChild(compileError);
}

// Adds float utilities
const addFloatUtilities = function() {
    let parentDiv = document.createElement('div');
    parentDiv.id = 'floatUtilities';

    // Add get all floats button
    let allFloatButton = document.createElement('a');
    allFloatButton.id = 'allfloatbutton';
    allFloatButton.classList.add('btn_green_white_innerfade');
    allFloatButton.classList.add('btn_small');
    allFloatButton.addEventListener('click', getAllFloats);
    parentDiv.appendChild(allFloatButton);

    let allFloatSpan = document.createElement('span');
    allFloatSpan.innerText = 'Get All Floats';
    allFloatButton.appendChild(allFloatSpan);

    // Add github link
    let githubLink = document.createElement('a');
    githubLink.classList.add('float-github');
    githubLink.href = 'https://github.com/Step7750/CSGOFloat';
    githubLink.innerText = 'Powered by CSGOFloat';
    parentDiv.appendChild(githubLink);

    // Add filter div
    addFilterDiv(parentDiv);

    document.querySelector('#searchResultsTable').insertBefore(parentDiv, document.querySelector('#searchResultsRows'));
};

const getFloatButtonClicked = function(e) {
    let row = e.currentTarget.parentElement.parentElement.parentElement;
    let id = row.id.replace('listing_', '');

    retrieveListingInfoFromPage(id)
    .then((steamListingData) => {
        let listingData = steamListingData[id];

        if (!listingData) return;

        let inspectLink = listingData.asset.market_actions[0].link
        .replace('%listingid%', id)
        .replace('%assetid%', listingData.asset.id);

        floatQueue.push({ listingId: id, inspectLink: inspectLink });
    });
};

// If an item on the current page doesn't have the float div/buttons, this function adds it
const addButtons = function() {
    // Iterate through each item on the page
    let listingRows = document.querySelectorAll('.market_listing_row.market_recent_listing_row');

    for (let row of listingRows) {
        let id = row.id.replace('listing_', '');

        if (row.querySelector(`#item_${id}_floatdiv`)) { continue; }

        let listingNameElement = row.querySelector(`#listing_${id}_name`);

        let buttonDiv = document.createElement('div');
        buttonDiv.classList.add('float-btn');
        buttonDiv.id = `item_${id}_floatdiv`;
        listingNameElement.parentElement.appendChild(buttonDiv);

        let getFloatButton = document.createElement('a');
        getFloatButton.classList.add('btn_green_white_innerfade');
        getFloatButton.classList.add('btn_small');
        getFloatButton.classList.add('floatbutton');
        getFloatButton.addEventListener('click', getFloatButtonClicked);
        buttonDiv.appendChild(getFloatButton);

        let buttonText = document.createElement('span');
        buttonText.innerText = 'Get Float';
        getFloatButton.appendChild(buttonText);

        // Create divs the following class names and append them to the button div
        let divClassNames = ['floatmessage', 'itemfloat', 'itemseed'];

        for (let className of divClassNames) {
            let div = document.createElement('div');
            div.classList.add(className);
            buttonDiv.appendChild(div);
        }

        // check if we already have the float for this item
        if (id in floatData) {
            showFloat(id);
        }
    }

    // Add float utilities if it doesn't exist and we have valid items
    if (!document.querySelector('#floatUtilities') && listingRows.length > 0) {
        addFloatUtilities();
    }
};

// register the message listener in the page scope
let script = document.createElement('script');
script.innerText = `
    window.addEventListener('message', (e) => {
        if (e.data.type == 'requestListingInfo') {
            window.postMessage({
                type: 'listingInfo',
                listingInfo: g_rgListingInfo
            }, '*');
        }
    });
`;
document.head.appendChild(script);

floatTimer = setInterval(() => { addButtons(); }, 500);

// start the queue processing loop
processFloatQueue();

const logStyle = 'background: #222; color: #fff;';
console.log('%c CSGOFloat Market Checker (v1.2.0) by Step7750 ', logStyle);
console.log('%c Changelog can be found here: https://github.com/Step7750/CSGOFloat-Extension ', logStyle);
