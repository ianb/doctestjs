/* Moch XHR library for YAHOO.util.Connect.asyncRequest */

if (typeof doctest == 'undefined') {
    throw("You must include doctest.js before doctest-yui.js");
}

/* Set in tests to change the response: */
doctest.mockYUIResponse = '';
doctest.mockYUIFailure = false;

doctest.mockYUIAsyncRequest = function (method, uri, callback, body/*optional*/) {
    writeln(method + ' '+uri);
    if (body) {
        writeln('body: '+body);
    }
    doctest.extendDefault(callback, {
                              success: function () {},
                              failure: function () {},
                              argument: []});
    if (doctest.mockYUIFailure) {
        var res = {
            tid: null, // FIXME: set
            status: 0,
            statusText: 'Failure',
            argument: callback.argument}
        if (typeof doctest.mockYUIFailure == 'object') {
            doctest.extend(res, doctest.mockYUIFailure);
        }
        callback.failure(res);
    } else {
        res = {
            tid: null, // FIXME: set
            status: 200,
            statusText: 'OK',
            getResponseHeader: function (label) {
                return null;
            }, // FIXME: implement
            getAllResponseHeaders: function () {
                return '';
            }, // FIXME: implement
            responseText: '',
            responseXML: null,
            argument: callback.argument}
        if (typeof doctest.mockYUIResponse == 'string') {
            res.responseText = doctest.mockYUIResponse;
        } else if (typeof doctest.mockYUIResponse == 'object') {
            if (doctest.mockYUIResponse.nodeType) {
                res.responseXML = doctest.mockYUIResponse;
            } else {
                doctest.extend(res, doctest.mockYUIResponse);
            }
        }
        callback.success(res);
    }
};

doctest.uninstallMockYUI = function () {
    YAHOO.util.Connect.asyncRequest = doctest.realYUIAsyncRequest;
};

doctest.installMockYUI = function () {
    YAHOO.util.Connect.asyncRequest = doctest.mockYUIAsyncRequest;
}

try {
    doctest.realYUIAsyncRequest = YAHOO.util.Connect.asyncRequest;
    doctest.installMockYUI();
} catch (e) {
    throw("Could not install mock YAHOO.util.Connect.asyncRequest: "+e);
}
