## doctest.js

For a more complete description please [read the main
page](http://ianb.github.com/doctestjs/).

`doctest.js` is a test runner for Javascript, inspired by Python's
[doctest](http://docs.python.org/library/doctest.html).

The tests are embedded in an HTML page, and look like what Javascript
might look like if you are using an interactive prompt.  An example of
a test (note `$` is uesd as a prompt, `>` as a continuation prompt):

```javascript
$ // You can do really simple tests...
$ print(3 * 4);
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
$ print(savedResult);
{value1: "something", value2: true}
```

Also included is a simple mock object.  An example of using it:

```javascript
$ $.ajax({
>   url: "/test",
>   dataType: "json",
>   success: Spy('success', {wait: true})
> });
success({value1: "something", value2: true})
```

You can also write the Javascript with comments to show the expected output:

```javascript
function factorial(n) {
  return n == 1 ? 1 : n * factorial(n-1);
}
print(factorial(3))
/* => 6 */
```

For more and better (and live) examples see [the doctest.js website](http://ianb.github.com/doctestjs/).
