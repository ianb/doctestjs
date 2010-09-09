doctest.js
==========

``doctest.js`` is a test runner for Javascript, inspired by Python's
`doctest <http://docs.python.org/library/doctest.html>`_.

The tests are embedded in an HTML page, and look like what Javascript
might look like if you had an interactive prompt (which these days you
can have using a browser-based console).  An example of a test (note
``$`` is uesd as a prompt, ``>`` as a continuation prompt)::

    $ // You can do really simple tests...
    $ 3 * 4;
    12
    $ // Or more complicated tests...
    $ var complete = false;
    $ var savedResult = null;
    $ $.ajax({ // don't get confused by the two uses of $ here
    >   url: "/test",
    >   dataType: "json",
    >   success: function (result) {
    >     complete = true;
    >     savedResult = result;
    >   }
    > });
    $ wait(function () {return complete;});
    $ savedResult;
    {value1: "something", value2: true}

Also included is a simple mock object.  An example of using it::

    $ success = Spy('success', {writes: true});
    $ $.ajax({
    >   url: "/test",
    >   dataType: "json",
    >   success: success.func
    > });
    $ success.wait();
    success({value1: "something", value2: true})
