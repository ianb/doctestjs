(function (exports) {

// Some Node.js globals:
/*global global, require, exports */
// Some browser globals:
/*global console */
// Some doctest.js globals:
/*global writeln, wait, doctest:true, doctestReporterHook, esprima:true, JSHINT:true */

var globalObject;
if (typeof window == 'undefined') {
  if (typeof global == 'undefined') {
    globalObject = (function () {return this;})();
  } else {
    globalObject = global;
  }
} else {
  globalObject = window;
}

var doc;
if (typeof document != 'undefined') {
  doc = document;
} else {
  doc = null;
}

exports.setDocument = function (newDocument) {
  doc = newDocument;
};

var Example = exports.Example = function (runner, expr, expected, attrs) {
  this.runner = runner;
  this.expr = expr;
  if (typeof expected != "string") {
    throw "Bad value for expected: " + expected;
  }
  this.expected = expected;
  if (attrs) {
    for (var i in attrs) {
      if (attrs.hasOwnProperty(i)) {
        this[i] = attrs[i];
      }
    }
  }
};

Example.prototype = {
  run: function () {
    this.output = [];
    this.consoleOutput = [];
    var globs = this.runner.evalInit();
    try {
      this.result = this.runner.evaller(this.expr, globs, this.filename);
    } catch (e) {
      if (e && e['doctest.abort']) {
        return;
      }
      this.write('Error: ' + e + '\n');
      // FIXME: doesn't format nicely:
      if (e && e.stack) {
        console.log('Exception Stack:');
        console.log(e.stack);
      }
    }
  },
  check: function () {
    var output = this.output.join('');
    // FIXME: consider using this.result
    this.runner.matcher.match(this, output, this.expected);
  },
  write: function (text) {
    this.output.push(text);
  },
  writeConsole: function (message) {
    this.consoleOutput.push(message);
  },
  timeout: function (passed) {
    this.runner.reporter.logFailure(this, "Error: wait timed out after " + passed + " milliseconds");
  },
  textSummary: function () {
    return strip(strip(this.expr).substr(0, 20)) + '...';
  }
};

var Matcher = exports.Matcher = function (runner) {
  this.runner = runner;
};

Matcher.prototype = {
  match: function (example, got, expected) {
    var cleanGot = this.clean(got);
    var cleanExpected = this.clean(expected);
    var regexp = this.makeRegex(cleanExpected);
    if (cleanGot.search(regexp) != -1) {
      this.runner.reporter.logSuccess(example, got);
      return;
    }
    var comparisonTable = this.makeComparisonTable(cleanGot, cleanExpected);
    this.runner.reporter.logFailure(example, got, comparisonTable);
  },

  makeComparisonTable: function (cleanGot, cleanExpected) {
    var gotLines = this.splitLines(cleanGot);
    var expectedLines = this.splitLines(cleanExpected);
    if (gotLines.length <= 1 || expectedLines.length <= 1) {
      return null;
    }
    var comparisonTable = [];
    comparisonTable.push({header: 'Details of mismatch:'});
    var shownTrailing = false;
    var matching = 0;
    for (var i=0; i<gotLines.length; i++) {
      if (i >= expectedLines.length) {
        if (! shownTrailing) {
          comparisonTable.push({header: 'Trailing lines in got:'});
          shownTrailing = true;
        }
        comparisonTable.push({got: gotLines[i], error: true});
      } else {
        var regexp = this.makeRegex(expectedLines[i]);
        var error = gotLines[i].search(regexp) == -1;
        comparisonTable.push({got: gotLines[i], expected: expectedLines[i], error: error});
        if (! error) {
          matching++;
        }
      }
    }
    if (matching <= 1) {
      return null;
    }
    if (expectedLines.length > gotLines.length) {
      comparisonTable.push({header: 'Trailing expected line(s):'});
      for (i=gotLines.length; i<expectedLines.length; i++) {
        comparisonTable.push({expected: expectedLines[i], error: true});
      }
    }
    return comparisonTable;
  },

  makeRegex: function (pattern) {
    var re = RegExpEscape(pattern);
    re = '^' + re + '$';
    re = re.replace(/\\\.\\\.\\\./g, "[\\S\\s\\r\\n]*");
    re = re.replace(/\\\?/g, "[a-zA-Z0-9_.\\?]+");
    re = re.replace(/[ \t]+/g, " +");
    re = re.replace(/["']/g, "['\"]");
    return new RegExp(re);
  },

  clean: function (s) {
    var lines = this.splitLines(s);
    var result = [];
    for (var i=0; i<lines.length; i++) {
      var line = strip(lines[i]);
      if (line) {
        result.push(line);
      }
    }
    return result.join('\n');
  },

  splitLines: function (s) {
    return s.split(/(?:\r\n|\r|\n)/);
  }
};

var HTMLReporter = exports.HTMLReporter = function (runner, containerEl) {
  this.runner = runner;
  if (! containerEl) {
    if (doc.getElementById('doctest-output')) {
      containerEl = 'doctest-output';
    } else {
      containerEl = makeElement('div');
      doc.body.insertBefore(containerEl, doc.body.childNodes[0]);
    }
  }
  if (typeof containerEl == 'string') {
    containerEl = doc.getElementById(containerEl);
  }
  addClass(containerEl, 'doctest-report');
  this.containerEl = containerEl;
  this.containerEl.innerHTML = (
    '<table class="doctest-report-table">' +
    '<tr><th>Passed:</th>' +
    '<td id="doctest-success-count">0</td></tr>' +
    '<tr><th>Failures:</th>' +
    '<td id="doctest-failure-count">0</td>' +
    '<td><button id="doctest-reload">reload/retest</button></td></tr>' +
    '<tr id="doctest-abort-row" style="display: none"><th>Aborted:</th>' +
    '<td id="doctest-aborted"></td></tr>' +
    '<tr><th></th>' +
    '<td colspan=2 id="doctest-failure-links"></td></tr>' +
    '</table>'
    );
  this.successEl = doc.getElementById('doctest-success-count');
  this.failureEl = doc.getElementById('doctest-failure-count');
  this.failureLinksEl = doc.getElementById('doctest-failure-links');
  var button = doc.getElementById('doctest-reload');
  // Sometimes this is sticky:
  button.disabled = false;
  button.addEventListener('click', function (ev) {
    button.innerHTML = 'reloading...';
    button.disabled = true;
    location.reload();
  }, false);
};

HTMLReporter.prototype = {

  logSuccess: function (example, got) {
    var num = parseInt(this.successEl.innerHTML.split('/')[0], 10);
    num++;
    this.successEl.innerHTML = num+' / '+this.runner.examples.length;
    addClass(this.successEl, 'doctest-nonzero');
    if (example.htmlSpan) {
      addClass(example.htmlSpan, 'doctest-success');
      if (example.expected.indexOf('...') != -1 ||
          example.expected.indexOf('?') != -1) {
        this.addExampleNote(example, 'Output:', 'doctest-actual-output', got || '(none)');
      }
    }
    this.showConsoleOutput(example, false);
    this.runner._hook('reportSuccess', example, got);
  },

  logFailure: function (example, got, comparisonTable) {
    this.addFailure();
    if (example.htmlSpan) {
      addClass(example.htmlSpan, 'doctest-failure');
      var showGot = got || '(nothing output)';
      var expectedSpan = makeElement('span', {className: 'doctest-description'}, ['Expected:\n']);
      example.htmlSpan.insertBefore(expectedSpan, example.htmlSpan.querySelector('.doctest-output'));
      if (! example.expected) {
        example.htmlSpan.querySelector('.doctest-output').innerHTML = '(nothing expected)\n';
      }
      this.addExampleNote(example, 'Got:', 'doctest-actual-output', showGot);
    }
    if (comparisonTable) {
      this.addComparisonTable(example, comparisonTable);
    }
    if (example.blockEl) {
      addClass(example.blockEl, 'doctest-some-failure');
    }
    if (example.htmlID) {
      var anchor = makeElement('a', {href: '#' + example.htmlID, className: 'doctest-failure-link'}, [example.textSummary()]);
      this.failureLinksEl.appendChild(anchor);
      if (example.htmlID == positionOnFailure) {
        location.hash = '#' + example.htmlID;
      }
    }
    this.showConsoleOutput(example, true);
    this.runner._hook('reportFailure', example, got);
  },

  logAbort: function (example, abortMessage) {
    this.addFailure();
    this.addAborted(abortMessage);
    if (example.htmlSpan) {
      addClass(example.htmlSpan, 'doctest-failure');
    }
    if (example.blockEl) {
      addClass(example.blockEl, 'doctest-some-failure');
    }
    this.addExampleNote(example, 'Aborted:', 'doctest-actual-output', abortMessage);
    this.runner._hook('reportAbort', example, abortMessage);
  },

  addFailure: function () {
    var num = parseInt(this.failureEl.innerHTML, 10);
    num++;
    this.failureEl.innerHTML = num+'';
    addClass(this.failureEl, 'doctest-nonzero');
  },

  addAborted: function (message) {
    doc.getElementById('doctest-abort-row').style.display = '';
    var td = doc.getElementById('doctest-aborted');
    td.appendChild(doc.createTextNode(message));
  },

  showConsoleOutput: function (example, error) {
    if (! example.consoleOutput.length) {
      return;
    }
    if (! example.htmlSpan) {
      return;
    }
    var text = example.consoleOutput.join('\n');
    this.addExampleNote(example, 'Console:', 'doctest-console', text);
  },

  addExampleNote: function (example, description, className, text) {
    if (! example.htmlSpan) {
      return;
    }
    example.htmlSpan.appendChild(makeElement('span', {className: 'doctest-description'}, [description + '\n']));
    example.htmlSpan.appendChild(makeElement('span', {className: className}, [text + '\n']));
  },

  addComparisonTable: function (example, comparisonTable) {
    if (! example.htmlSpan) {
      // FIXME; should display text table
      return;
    }
    var table = makeElement('table', {className: 'doctest-comparison-table'});
    for (var i=0; i<comparisonTable.length; i++) {
      var line = comparisonTable[i];
      if (line.header) {
        table.appendChild(makeElement('tr', {className: 'doctest-comparison-header'}, [
          makeElement('th', {colspan: 2}, [line.header])
        ]));
      } else {
        table.appendChild(makeElement('tr', {className: line.error ? 'doctest-comparison-error' : null}, [
          makeElement('td', {className: 'doctest-comparison-got'}, [line.got || '']),
          makeElement('td', {className: 'doctest-comparison-expected'}, [line.expected || ''])
        ]));
      }
    }
    example.htmlSpan.appendChild(table);
  }
};

var ConsoleReporter = exports.ConsoleReporter = function (runner) {
  this.runner = runner;
  this.successes = this.failures = 0;
};

ConsoleReporter.prototype = {
  logSuccess: function (example, got) {
    this.successes++;
    console.log('Passed:', example.textSummary());
  },
  logFailure: function (example, got) {
    this.failures++;
    console.log('Failed:', example.expr);
    console.log('Expected:');
    console.log(example.expected);
    console.log('Got:');
    console.log(got);
  }
};


var repr = exports.repr = function (o, indentString, maxLen) {
  /* Taken from MochiKit, with an addition to print objects */
  var reprMaker = new repr.ReprClass(indentString, maxLen);
  return reprMaker.repr(o);
};

repr.ReprClass = function (indentString, maxLen) {
  this.indentString = indentString || '';
  if (maxLen === undefined) {
    maxLen = this.defaultMaxLen;
  }
  this.maxLen = maxLen;
  this.tracker = [];
};

repr.ReprClass.prototype = {
  defaultMaxLen: 80,

  repr: function reprFunc(o, indentString) {
    if (indentString === undefined) {
      indentString = this.indentString;
    }
    if (this.seenObject(o)) {
      return '..recursive..';
    }
    if (o === undefined) {
      return 'undefined';
    } else if (o === null) {
      return "null";
    }
    try {
      if (typeof o.__repr__ == 'function') {
        return o.__repr__(indentString, this.maxLen);
      } else if (typeof o.repr == 'function' && o.repr != reprFunc &&
                 o.repr != repr) {
        return o.repr(indentString, this.maxLen);
      }
      for (var i=0; i<this.registry.length; i++) {
        var item = this.registry[i];
        if (item[0].call(this, o)) {
          var func = item[1];
          if (typeof func == "string") {
            func = this[func];
          }
          return func.call(this, o, indentString);
        }
      }
    } catch (e) {
      // FIXME: unclear what purpose this serves:
      console.warn('Error stringifying object:', e);
      if (typeof(o.NAME) == 'string' && (
            o.toString == Function.prototype.toString ||
            o.toString == Object.prototype.toString)) {
        return o.NAME;
      }
    }
    var ostring;
    try {
      ostring = (o + "");
      if (ostring == '[object Object]' || ostring == '[object]') {
        ostring = this.objRepr(o, indentString);
      }
    } catch (e) {
      return "[" + (typeof o) + "]";
    }
    if (typeof o == "function") {
      ostring = ostring.replace(/^\s+/, "").replace(/\s+/g, " ");
      var idx = ostring.indexOf("{");
      if (idx != -1) {
        ostring = ostring.substr(o, idx) + "{...}";
      }
    }
    return ostring;
  },

  seenObject: function (obj) {
    if (typeof obj != 'object' || obj === null) {
      return false;
    }
    for (var i=0; i<this.tracker.length; i++) {
      if (this.tracker[i] === obj) {
        return true;
      }
    }
    this.tracker.push(obj);
    return false;
  },

  seenPosition: function () {
    return this.tracker.length-1;
  },

  popSeen: function (point) {
    this.tracker.splice(point, this.tracker.length - point);
  },

  objRepr: function (obj, indentString) {
    var seenPosition = this.seenPosition();
    var ostring = '{';
    var keys = sortedKeys(obj);
    for (var i=0; i<keys.length; i++) {
      if (ostring != '{') {
        ostring += ', ';
      }
      ostring += this.keyRepr(keys[i]) + ': ' + this.repr(obj[keys[i]]);
    }
    ostring += '}';
    if (ostring.length > (this.maxLen - indentString.length)) {
      this.popSeen(seenPosition);
      ostring = this.multilineObjRepr(obj, indentString);
    }
    this.popSeen(seenPosition);
    return ostring;
  },

  multilineObjRepr: function (obj, indentString) {
    var keys = sortedKeys(obj);
    var ostring = '{\n';
    for (var i=0; i<keys.length; i++) {
      ostring += indentString + '  ' + this.keyRepr(keys[i]) + ': ';
      ostring += this.repr(obj[keys[i]], indentString+'  ');
      if (i != keys.length - 1) {
        ostring += ',';
      }
      ostring += '\n';
    }
    ostring += indentString + '}';
    return ostring;
  },

  keyRepr: function (key) {
    if (key.search(/^[a-zA-Z_][a-zA-Z0-9_]*$/) === 0) {
      return key;
    } else {
      return this.repr(key);
    }
  },

  arrayRepr: function (obj, indentString) {
    var seenPosition = this.seenPosition();
    var s = "[";
    for (var i=0; i<obj.length; i++) {
      s += this.repr(obj[i], indentString, this.maxLen);
      if (i != obj.length-1) {
        s += ", ";
      }
    }
    s += "]";
    if (s.length > (this.maxLen + indentString.length)) {
      this.popSeen(seenPosition);
      s = this.multilineArrayRepr(obj, indentString);
    }
    this.popSeen(seenPosition);
    return s;
  },

  multilineArrayRepr: function (obj, indentString) {
    var s = "[\n";
    for (var i=0; i<obj.length; i++) {
      s += indentString + '  ' + this.repr(obj[i], indentString+'  ');
      if (i != obj.length - 1) {
        s += ',';
      }
      s += '\n';
    }
    s += indentString + ']';
    return s;
  },

  xmlRepr: function (el, indentString) {
    var i;
    if (el.nodeType == el.DOCUMENT_NODE) {
      return "<document " + el.location.href + ">";
    }
    if (el.nodeType == el.DOCUMENT_TYPE_NODE) {
      return "<!DOCTYPE " + el.name + ">";
    }
    var s = '<' + el.tagName.toLowerCase();
    var attrs = [];
    if (el.attributes && el.attributes.length) {
      for (i=0; i<el.attributes.length; i++) {
        attrs.push(el.attributes[i].nodeName);
      }
      attrs.sort();
      for (i=0; i<attrs.length; i++) {
        s += ' ' + attrs[i] + '="';
        var value = el.getAttribute(attrs[i]);
        value = value.replace(/&/g, '&amp;');
        value = value.replace(/"/g, '&quot;');
        s += value;
        s += '"';
      }
    }
    if (! el.childNodes.length) {
      s += ' />';
      return s;
    } else {
      s += '>';
    }
    var hasNewline = false;
    for (i=0; i<el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType == child.TEXT_NODE) {
        s += strip(child.textContent);
      } else {
        if (! hasNewline) {
          s += '\n' + indentString;
          hasNewline = true;
        }
        s += '  ' + this.xmlRepr(child, indentString + '  ');
        s += '\n' + indentString;
      }
    }
    s += '</' + el.tagName.toLowerCase() + '>';
    return s;
  },

  xhrRepr: function (req, indentString) {
    var s = '[XMLHttpRequest ';
    var states = {
      0: 'UNSENT',
      1: 'OPENED',
      2: 'HEADERS_RECEIVED',
      3: 'LOADING',
      4: 'DONE'
    };
    s += states[req.readyState];
    if (req.readyState == 4) {
      s += ' ' + req.status + ' ' + req.statusText;
    }
    return s + ']';
  },

  registry: [
    [function (o) {
       return typeof o == 'string';
     },
     function (o) {
       o = '"' + o.replace(/([\"\\])/g, '\\$1') + '"';
       o = o.replace(/[\f]/g, "\\f")
       .replace(/[\b]/g, "\\b")
       .replace(/[\n]/g, "\\n")
       .replace(/[\t]/g, "\\t")
       .replace(/[\r]/g, "\\r");
       return o;
     }
    ],
    [function (o) {
       return typeof o == 'number';
     },
     function (o) {
         return o + "";
     }
    ],
    [function (o) {
       return typeof o == 'object' && o.nodeType;
     },
     "xmlRepr"
    ],
    [function (o) {
       var typ = typeof o;
       if ((typ != 'object' && ! (typ == 'function' && typeof o.item == 'function')) ||
           o === null ||
           typeof o.length != 'number' ||
           o.nodeType === 3) {
           return false;
       }
       return true;
     },
     "arrayRepr"
    ],
    [function (o) {
       return typeof XMLHttpRequest !== 'undefined' && o instanceof XMLHttpRequest;

     },
     'xhrRepr'
    ]
  ]

};

repr.register = function (condition, reprFunc) {
  repr.ReprClass.prototype.registry.push([condition, reprFunc]);
};

var Runner = exports.Runner = function (options) {
  this.examples = [];
  options = options || {};
  for (var i in options) {
    if (options.hasOwnProperty(i)) {
      if (this[i] === undefined) {
        throw 'Unexpected option: ' + i;
      }
      this[i] = options[i];
    }
  }
};

Runner.prototype = {

  init: function () {
    if (this.matcher === null) {
      this.matcher = this.makeMatcher();
    }
    if (this.reporter === null) {
      this.reporter = this.makeReporter();
    }
    if (this.repr === null) {
      this.repr = this.makeRepr();
    }
    this._hook('init', this);
  },

  run: function () {
    this.init();
    if (! this.examples.length) {
      throw 'No examples have been added';
    }
    this._exampleIndex = 0;
    this._runExample();
  },

  evalInit: function () {
    if (typeof this.globs != "undefined") {
      return this.globs;
    }
    this.logGrouped = false;
    this._abortCalled = false;
    var globs = {
      write: this.write.bind(this),
      writeln: this.writeln.bind(this),
      printResolved: this.printResolved.bind(this),
      wait: this.wait.bind(this),
      Abort: this.Abort.bind(this),
      repr: repr,
      Spy: Spy,
      jshint: jshint
    };
    globs.print = globs.writeln;
    var consoleOverwrites = {
      log: this.logFactory(null, console.log),
      warn: this.logFactory(null, console.warn),
      error: this.logFactory(null, console.error),
      info: this.logFactory(null, console.info)
    };
    if (typeof window == 'undefined') {
      // Can't just overwrite the console object
      globs.console = consoleOverwrites;
      for (var i in console) {
        if (console.hasOwnProperty(i) && (! globs.console.hasOwnProperty(i))) {
          if (console[i].bind) {
            globs.console[i] = console[i].bind(console);
          } else {
            globs.console[i] = console[i];
          }
        }
      }
      var context = require('vm').Script.createContext();
      extend(context, globs);
      return context;
    } else {
      extend(console, consoleOverwrites);
      window.onerror = this.windowOnerror;
      extend(window, globs);
      return null;
    }
  },

  write: function (text) {
    this._currentExample.write(text);
  },

  writeln: function () {
    for (var i=0; i<arguments.length; i++) {
      if (i) {
        this.write(' ');
      }
      if (typeof arguments[i] == "string") {
        this.write(arguments[i]);
      } else {
        this.write(this.repr(arguments[i]));
      }
    }
    this.write('\n');
  },

  printResolved: function () {
    // We used finished to signal that nothing should be printed, even when
    // waiting is 0, as there are more arguments still to collect:
    var finished = false;
    var waiting = 0;
    var fullValues = [];
    var args = Array.prototype.slice.call(arguments);

    // This function is called as each promise is resolved, to see if it
    // was the last promise:
    var check = (function (dec) {
      waiting -= dec;
      if (waiting || ! finished) {
        return;
      }
      var flattened = [];
      fullValues.forEach(function (items) {
        items.forEach(function (item) {
          flattened.push(item);
        });
      });
      this.writeln.apply(this, flattened);
    }).bind(this);

    args.forEach(function (value, index) {
      if (value.then) {
        // It's a promise
        waiting++;
        value.then(
          (function () {
            var values = Array.prototype.slice.call(arguments);
            if ((! values.length) || (values.length === 1 && values[0] === undefined)) {
              values = ["(resolved)"];
            }
            fullValues[index] = values;
            check(1);
          }).bind(this),
          (function () {
            var errs = Array.prototype.slice.call(arguments);
            if ((! errs.length) || (errs.length === 1 && errs[0] === undefined)) {
              errs = ["(error)"];
            }
            errs = ["Error:"].concat(errs);
            fullValues[index] = errs;
            check(1);
          }).bind(this));
      } else {
        fullValues[index] = [value];
      }
    }, this);
    finished = true;
    if (waiting) {
      this.wait(function () {
        return ! waiting;
      });
    }
    check(0);
  },

  wait: function (conditionOrTime, hardTimeout) {
    // FIXME: should support a timeout even with a condition
    if (conditionOrTime === undefined ||
        conditionOrTime === null) {
      // same as wait-some-small-amount-of-time
      conditionOrTime = 0;
    }
    this._waitCondition = conditionOrTime;
    if (typeof conditionOrTime == "number") {
      if (((! hardTimeout) && this._defaultWaitTimeout < conditionOrTime) ||
          hardTimeout < conditionOrTime) {
        hardTimeout = conditionOrTime + 10;
      }
    }
    this._waitTimeout = hardTimeout;
    this._exampleWait = true;
  },

  // FIXME: maybe this should be set more carefully just during the tests?
  windowOnerror: function (message, filename, lineno) {
    var m = message;
    if (filename || lineno) {
      m += ' (';
      if (filename) {
        m += filename;
        if (lineno) {
          m += ':' + lineno;
        }
      } else {
        m += 'line ' + lineno;
      }
      m += ')';
    }
    writeln('Error: ' + m);
  },

  logFactory: function (prefix, origFunc) {
    var self = this;
    var logFunc = origFunc || console.log.origFunc || console.log;

    var func = function () {
      if (console.group && (! self.logGrouped)) {
        self.logGrouped = true;
        console.group('Output from example:');
      }
      logFunc.apply(console, arguments);
      var s = prefix || '';
      for (var i=0; i<arguments.length; i++) {
        var text = arguments[i];
        if (i) {
          s += ' ';
        }
        if (typeof text == "string") {
          s += text;
        } else {
          s += repr(text);
        }
      }
      self._currentExample.writeConsole(s);
    };
    func.origFunc = origFunc;
    return func;
  },

  Abort: function (message) {
    this._abortCalled = message || 'aborted';
    return {
      "doctest.abort": true,
      toString: function () {return 'Abort(' + message + ')';}
    };
  },

  evalUninit: function () {
    if (this.logGrouped) {
      if (console.groupEnd) {
        console.groupEnd();
      } else if (console.endGroup) {
        console.endGroup();
      }
    }
    this.logGrouped = false;
    if (typeof window != 'undefined') {
      window.write = undefined;
      window.writeln = undefined;
      window.printResolved = undefined;
      window.print = undefined;
      window.wait = undefined;
      window.onerror = undefined;
      window.jshint = undefined;
      window.console.log = window.console.log.origFunc;
      window.console.warn = window.console.warn.origFunc;
      window.console.error = window.console.error.origFunc;
      window.console.info = window.console.info.origFunc;
    }
  },

  evaller: function (expr, context, filename) {
    var e = eval;
    var result;
    if (context) {
      if (typeof window == "undefined") {
        var vm = require('vm');

        if (! (context instanceof vm.Script.createContext().constructor)) {
            throw "context must be created with vm.Script.createContext()";
        }

        // Prepare context to evaluate `expr` in. Mostly follows CoffeeScript
        // [eval function](http://git.io/coffee-script-eval).
        context.global = context.root = context.GLOBAL = context;
        context.__filename = typeof filename != "undefined" ? filename : __filename;
        context.__dirname = require('path').dirname(context.__filename);
        context.module = module;
        context.require = require;

        // Set `module.filename` to script file name and evaluate the script.
        // Now, if the script executes `require('./something')`, it will look
        // up `'./something'` relative to script path.
        //
        // We restore `module.filename` afterwards, because `module` object
        // is reused. The other approach is to create a new `module` instance.
        // CoffeeScript [eval][1] [works this way][2]. Unfortunately it
        // [uses private Node API][3] to do it.
        //
        // [1]: http://git.io/coffee-script-eval
        // [2]: https://github.com/jashkenas/coffee-script/pull/1487
        // [3]: http://git.io/coffee-script-eval-comment
        var prevfilename = module.filename;
        module.filename = context.__filename;
        try {
          vm.runInContext(expr, context, context.__filename);
        } finally {
            module.filename = prevfilename;
        }

      } else {
        with (context) {
          result = eval(expr);
        }
      }
    } else {
      result = e(expr);
    }
    return result;
  },

  _runExample: function () {
    if (this._abortCalled) {
      return;
    }
    while (true) {
      if (this._exampleIndex >= this.examples.length) {
        this._finish();
        break;
      }
      this._currentExample = this.examples[this._exampleIndex];
      this._exampleIndex++;
      this._currentExample.run();
      if (this._exampleWait) {
        this._runWait();
        break;
      }
      this.evalUninit();
      this._currentExample.check();
      if (this._abortCalled) {
        // FIXME: this should show that while finished, and maybe successful,
        // the tests were aborted
        this.reporter.logAbort(this._currentExample, this._abortCalled);
        this._finish();
        break;
      }
      this._currentExample = null;
    }
  },

  _runWait: function () {
    var start = Date.now();
    var waitTimeout = this._waitTimeout || this._defaultWaitTimeout;
    this._waitTimeout = null;
    var self = this;
    function poll() {
      var now = Date.now();
      var cond = self._waitCondition;
      if (typeof cond == "number") {
        if (now - start >= cond) {
          self._exampleWait = false;
        }
      } else if (cond) {
        if (cond()) {
          self._exampleWait = false;
        }
      }
      if (self._exampleWait) {
        if (now - start > waitTimeout) {
          self._currentExample.timeout(now - start);
        } else {
          setTimeout(poll, self._waitPollTime);
          return;
        }
      }
      self.evalUninit();
      self._currentExample.check();
      self._currentExample = null;
      self._runExample();
    }
    // FIXME: instead of the poll time, cond could be used if it is a number
    setTimeout(poll, this._waitPollTime);
  },

  _hook: function (method) {
    if (typeof doctestReporterHook == "undefined") {
      return null;
    } else if (method && arguments.length > 1 && doctestReporterHook[method]) {
      var args = argsToArray(arguments).slice(1);
      return doctestReporterHook[method].apply(doctestReporterHook, args);
    } else if (method) {
      return doctestReporterHook[method];
    } else {
      return doctestReporterHook;
    }
  },

  _finish: function () {
    if (attemptedHash && location.hash == attemptedHash) {
      // This fixes up the anchor position after tests have run.
      // FIXME: would be nice to detect if the user has scrolled between
      // page load and the current moment
      location.hash = '';
      location.hash = attemptedHash;
    }
    this._hook('finish', this);
  },

  _waitPollTime: 100,
  _waitTimeout: null,
  _waitCondition: null,
  _defaultWaitTimeout: 5000,

  /* Dependency Injection, yay! */
  examples: null,
  Example: Example,
  exampleOptions: null,
  makeExample: function (text, expected, filename) {
    var options = {filename: filename};
    extend(options, this.exampleOptions);
    return new this.Example(this, text, expected, options);
  },
  matcher: null,
  Matcher: Matcher,
  matcherOptions: null,
  makeMatcher: function () {
    return new this.Matcher(this, this.matcherOptions);
  },
  reporter: null,
  Reporter: HTMLReporter,
  reporterOptions: null,
  makeReporter: function () {
    return new this.Reporter(this, this.reporterOptions);
  },
  repr: repr
};

var HTMLParser = exports.HTMLParser = function (runner, containerEl, selector) {
  this.runner = runner;
  containerEl = containerEl || doc.body;
  if (typeof containerEl == 'string') {
    containerEl = doc.getElementById(containerEl);
  }
  if (! containerEl) {
    throw 'Bad/null/missing containerEl';
  }
  this.containerEl = containerEl;
  this.selector = selector || 'pre.doctest, pre.commenttest, pre.test';
};

HTMLParser.prototype = {
  parse: function () {
    var els = this.findEls();
    for (var i=0; i<els.length; i++) {
      try {
        this.parseEl(els[i]);
      } catch (e) {
        addClass(els[i], 'doctest-some-failure');
        this.runner.reporter.addFailure();
        var failed = makeElement('span', {className: 'doctest-example doctest-failure'}, ['Exception parsing element: ', e+'\n']);
        els[i].insertBefore(failed, els[i].childNodes[0]);
        throw e;
      }
    }
  },

  findEls: function () {
    return this.containerEl.querySelectorAll(this.selector);
  },

  parseEl: function (el) {
    var examples;
    if (hasClass(el, 'doctest')) {
      examples = this.parseDoctestEl(el);
    } else if (hasClass(el, 'commenttest') || hasClass(el, 'test')) {
      examples = this.parseCommentEl(el);
    } else {
      throw 'Unknown element class/type';
    }
    var newChildren = [];
    for (var i=0; i<examples.length; i++) {
      var example = examples[i][0];
      var output = examples[i][1];
      var rawExample = examples[i][2];
      var rawOutput = examples[i][3];
      var ex = this.runner.makeExample(example, output);
      this.runner.examples.push(ex);
      ex.blockEl = el;
      ex.htmlID = genID('example');
      var span = makeElement('span', {id: ex.htmlID, className: 'doctest-example'}, [
        makeElement('div', {className: 'doctest-expr'}, [rawExample]),
        makeElement('div', {className: 'doctest-output'}, [rawOutput])
        ]);
      ex.htmlSpan = span;
      newChildren.push(span);
    }
    el.innerHTML = '';
    for (var i=0; i<newChildren.length; i++) {
      el.appendChild(newChildren[i]);
    }
  },

  parseDoctestEl: function (el) {
    var result = [];
    var text = getElementText(el);
    var lines = text.split(/(?:\r\n|\r|\n)/);
    var exampleLines = [];
    var rawExample = [];
    var outputLines = [];
    var rawOutput = [];
    for (var i=0; i<lines.length; i++) {
      var line = lines[i];
      if (line.search(/^\s*[$]/) != -1 || i==lines.length-1) {
        if (exampleLines.length) {
          result.push([
            exampleLines.join('\n'), outputLines.join('\n'),
            rawExample.join('\n'), rawOutput.join('\n')]);
        }
        exampleLines = [];
        outputLines = [];
        rawExample = [];
        rawOutput = [];
        rawExample.push(line);
        line = line.replace(/^ *[$] ?/, '');
        exampleLines.push(line);
      } else if (/^>/.test(line)) {
        if (! exampleLines.length) {
          throw ('Bad example: ' + this.runner.repr(line) + '\n' +
            '> line not preceded by $');
        }
        rawExample.push(line);
        line = line.replace(/^ *> ?/, '');
        exampleLines.push(line);
      } else {
        rawOutput.push(line);
        outputLines.push(line);
      }
    }
    return result;
  },

  parseCommentEl: function (el) {
    if (typeof esprima == "undefined") {
      if (typeof require != "undefined") {
        esprima = require("./esprima/esprima.js");
      } else {
        throw 'You must install or include esprima.js';
      }
    }
    var contents = getElementText(el);
    var ast = esprima.parse(contents, {
      range: true,
      comment: true
    });
    var pos = 0;
    var result = [];
    for (var i=0; i<ast.comments.length; i++) {
      var comment = ast.comments[i];
      if (comment.value.search(/^\s*==?>/) == -1) {
        // Not a comment we care about
        continue;
      }
      var start = comment.range[0];
      var end = comment.range[1];
      var example = contents.substr(pos, start-pos);
      var output = comment.value.replace(/^\s*=> ?/, '');
      var orig = comment.type == 'Block' ? '/*' + comment.value + '*/' : '//' + comment.value;
      if (example === '') {
          result[result.length-1][1] += '\n'+output;
          result[result.length-1][3] += '\n'+orig;
      }
      else {
        result.push([example, output, example, orig]);
      }
      pos = end;
    }
    var last = contents.substr(pos, contents.length-pos);
    if (strip(last)) {
      result.push([last, '', last, '']);
    }
    return result;
  },

  loadRemotes: function (callback, selector) {
    var els;
    if (! selector) {
      els = this.findEls();
    } else {
      els = document.querySelectorAll(selector);
    }
    var pending = 0;
    argsToArray(els).forEach(function (el) {
      var href = el.getAttribute('data-href-pattern');
      if (href) {
        try {
          href = this.fillPattern(href);
        } catch (e) {
          var text = '// Error resolving data-href-pattern"' + href + '":\n';
          text += '// ' + e;
          el.innerHTML = '';
          el.appendChild(document.createTextNode(text));
          return;
        }
      }
      if (! href) {
        href = el.getAttribute('href');
      }
      if (! href) {
        href = el.getAttribute('src');
      }
      if (! href) {
        return;
      }
      pending++;
      var req = new XMLHttpRequest();
      if (href.indexOf('?') == -1) {
        // Try to stop some caching:
        href += '?nocache=' + Date.now();
      }
      req.open('GET', href);
      req.setRequestHeader('Cache-Control', 'no-cache, max-age=0');
      req.onreadystatechange = (function () {
        if (req.readyState != 4) {
          return;
        }
        if (req.status != 200 && !(req.status === 0 && document.location.protocol == "file:")) {
          el.appendChild(doc.createTextNode('\n// Error fetching ' + href + ' status: ' + req.status));
        } else {
          this.fillElement(el, req.responseText);
        }
        pending--;
        if (! pending) {
          callback();
        }
      }).bind(this);
      req.send();
    }, this);
    if (! pending) {
      callback();
    }
  },

  fillPattern: function (pattern) {
    var regex = /\{([^\}]+)\}/;
    var result = '';
    while (true) {
      var match = regex.exec(pattern);
      if (! match) {
        result += pattern;
        break;
      }
      result += pattern.substr(0, match.index);
      pattern = pattern.substr(match.index + match[0].length);
      var name = match[1];
      var restriction = "^[\\w_\\-\\.]+$";
      var defaultValue = '';
      if (name.lastIndexOf('|') != -1) {
        defaultValue = name.substr(name.lastIndexOf('|')+1);
        name = name.substr(0, name.lastIndexOf('|'));
      }
      if (name.indexOf(':') != -1) {
        restriction = name.substr(name.indexOf(':')+1);
        name = name.substr(0, name.indexOf(':'));
      }
      var value = params[name];
      if (! value) {
        value = defaultValue;
      }
      if (restriction && value.search(new RegExp(restriction)) == -1) {
        throw 'Bad substitution for {' + name + ':' + restriction + '}: "' + value + '"';
      }
      result += value;
    }
    return result;
  },

  fillElement: function (el, text) {
    el.innerHTML = '';
    if (hasClass(el, 'commenttest') || hasClass(el, 'test')) {
      var texts = this.splitText(text);
      console.log("filling in tests", texts, el);
      if (texts && texts.length == 1 && ! texts[0].header) {
        el.appendChild(document.createTextNode(texts[0].body));
      } else if (texts && texts.length) {
        for (var i=0; i<texts.length; i++) {
          if (texts[i].header) {
            var h3 = document.createElement('h3');
            h3.className = 'doctest-section-header';
            h3.appendChild(document.createTextNode(texts[i].header));
            el.parentNode.insertBefore(h3, null);
          }
          var pre = document.createElement('pre');
          pre.className = el.className;
          pre.appendChild(document.createTextNode(texts[i].body));
          el.parentNode.insertBefore(pre, null);
        }
        el.parentNode.removeChild(el);
      }
    }
  },

  splitText: function (text) {
    var ast;
    try {
      ast = esprima.parse(text, {
        range: true,
        comment: true
      });
    } catch (e) {
      // The error will get reported later on, so we'll just ignore it here
      return [{header: null, body: text}];
    }
    // FIXME: check if it didn't parse
    var result = [];
    var pos = 0;
    for (var i=0; i<ast.comments.length; i++) {
      var comment = ast.comments[i];
      if (comment.value.search(/^\s*=+\s*SECTION/) == -1) {
        // Not a section comment
        continue;
      }
      var start = comment.range[0];
      var end = comment.range[1];
      var body = text.substr(pos, start-pos);
      var header = strip(comment.value.replace(/^\s*=+\s*SECTION\s*/, ''));
      if (! result.length) {
        if (strip(body)) {
          result.push({header: null, body: body});
        }
      } else {
        result[result.length-1].body = body;
      }
      result.push({header: header, body: null});
      pos = end;
    }
    if (! result.length) {
      // No sections
      return [{header: '', body: text}];
    }
    var last = text.substr(pos, text.length-pos);
    result[result.length-1].body = last;
    return result;
  }

};

var TextParser = exports.TextParser = function (runner, text, filename) {
  if (typeof esprima == "undefined") {
    if (typeof require != "undefined") {
      esprima = require("./esprima/esprima.js");
    } else {
      throw 'You must install or include esprima.js';
    }
  }
  this.runner = runner;
  this.text = text;
  this.filename = filename;
};

TextParser.fromFile = function (runner, filename) {
  if (typeof filename != "string") {
    throw "You did not give a filename for the second argument: " + filename;
  }
  if (typeof require == "undefined") {
    throw "This method only works in Node, with the presence of require()";
  }
  var fs = require('fs');
  var text = fs.readFileSync(filename, 'UTF-8');
  return new TextParser(runner, text, filename);
};

TextParser.prototype = {
  parse: function () {
    var ast = esprima.parse(this.text, {
      range: true,
      comment: true
    });
    // FIXME: check if text didn't parse
    var pos = 0;
    for (var i=0; i<ast.comments.length; i++) {
      var comment = ast.comments[i];
      if (comment.value.search(/^\s*==?>/) == -1) {
        // Not a comment we care about
        continue;
      }
      var start = comment.range[0];
      var end = comment.range[1];
      var example = this.text.substr(pos, start-pos);
      var output = comment.value.replace(/^\s*=>\s*/, '');
      var ex = this.runner.makeExample(example, output, this.filename);
      this.runner.examples.push(ex);
      pos = end;
    }
    var last = this.text.substr(pos, this.text.length-pos);
    if (strip(last)) {
      this.runner.examples.push(this.runner.makeExample(last, '', this.filename));
    }
  }
};

var strip = exports.strip = function (str) {
  str = str + "";
  return str.replace(/\s+$/, "").replace(/^\s+/, "");
};

var rstrip = exports.rstrip = function (str) {
  str = str + "";
  return str.replace(/\s+$/, "");
};

var argsToArray = exports.argToArray = function (args) {
  var array = [];
  for (var i=0; i<args.length; i++) {
    array.push(args[i]);
  }
  return array;
};

var extend = exports.extend = function (obj, extendWith) {
  for (var i in extendWith) {
    if (extendWith.hasOwnProperty(i)) {
      obj[i] = extendWith[i];
    }
  }
  return obj;
};

var extendDefault = exports.extendDefault = function (obj, extendWith) {
  for (var i in extendWith) {
    if (extendWith.hasOwnProperty(i) && obj[i] === undefined) {
      obj[i] = extendWith[i];
    }
  }
  return obj;
};

var genID = exports.genID = function (prefix) {
  prefix = prefix || 'generic-doctest';
  var id = arguments.callee._idGen++;
  return prefix + '-' + id;
};
genID._idGen = 1;

function deIndent(text) {
    var minimum_spaces = 10000;
    var foo = text.split('\n');
    var i = 0;
    var j = 0;
    var result = '';
    for (i=0; i < foo.length; i++) {
        for (j=0; j < foo[i].length && j < minimum_spaces; j++) {
            if (foo[i][j] != ' ') {
                if (j < minimum_spaces) {
                    minimum_spaces = j;
                }
                break;
            }
        }
    }
    if (minimum_spaces == 0) {
        return text.replace(/^\s+|\s+$/g, '');
    }
    for (i=0; i < foo.length; i++) {
        if (strip(foo[i].substr(0, minimum_spaces)) !== '') {
            throw 'Deindent failed';
        }
        result += foo[i].substr(minimum_spaces) + '\n';
    }
    return strip(result);
}

var getElementText = exports.getElementText = function (el) {
  if (! el) {
    throw('You must pass in an element');
  }
  var text = '';
  for (var i=0; i<el.childNodes.length; i++) {
    var sub = el.childNodes[i];
    if (sub.nodeType == 3) {
      // TEXT_NODE
      text += sub.nodeValue;
    } else if (sub.childNodes) {
      text += getElementText(sub);
    }
  }

  return deIndent(text);
};

var makeElement = exports.makeElement = function (tagName, attrs, children) {
  var el = doc.createElement(tagName);
  if (attrs) {
    for (var i in attrs) {
      if (attrs.hasOwnProperty(i)) {
        if (i == 'className') {
          el.className = attrs[i];
        } else {
          el.setAttribute(i, attrs[i]);
        }
      }
    }
  }
  if (children) {
    for (var i=0; i<children.length; i++) {
      if (typeof children[i] == 'string') {
        el.appendChild(doc.createTextNode(children[i]));
      } else {
        el.appendChild(children[i]);
      }
    }
  }
  return el;
};

var addClass = exports.addClass = function (el, className) {
  if (! el.className) {
    el.className = className;
  } else if (! hasClass(el, className)) {
    el.className += ' ' + className;
  }
};

var hasClass = exports.hasClass = function (el, className) {
  return (' ' + el.className + ' ').indexOf(' ' + className + ' ') != -1;
};

var RegExpEscape = exports.RegExpEscape = function (text) {
  if (! arguments.callee.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|', '$',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    arguments.callee.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')', 'g'
    );
  }
  return text.replace(arguments.callee.sRE, '\\$1');
};

var objDiff = exports.objDiff = function (orig, current) {
  var result = {
    added: {},
    removed: {},
    changed: {},
    same: {}
  };
  for (var i in orig) {
    if (! (i in current)) {
      result.removed[i] = orig[i];
    } else if (orig[i] !== current[i]) {
      result.changed[i] = [orig[i], current[i]];
    } else {
      result.same[i] = orig[i];
    }
  }
  for (i in current) {
    if (! (i in orig)) {
      result.added[i] = current[i];
    }
  }
  return result;
};

var writeDiff = exports.writeDiff = function (orig, current, indentString) {
  if (typeof orig != 'object' || typeof current != 'object') {
    print(indentString + repr(orig, indentString) + ' -> ' + repr(current, indentString));
    return;
  }
  indentString = indentString || '';
  var diff = objDiff(orig, current);
  var i, keys;
  var any = false;
  keys = sortedKeys(diff.added);
  for (i=0; i<keys.length; i++) {
    any = true;
    print(indentString + '+' + keys[i] + ': '
          + repr(diff.added[keys[i]], indentString));
  }
  keys = sortedKeys(diff.removed);
  for (i=0; i<keys.length; i++) {
    any = true;
    print(indentString + '-' + keys[i] + ': '
          + repr(diff.removed[keys[i]], indentString));
  }
  keys = sortedKeys(diff.changed);
  for (i=0; i<keys.length; i++) {
    any = true;
    print(indentString + keys[i] + ': '
          + repr(diff.changed[keys[i]][0], indentString)
          + ' -> '
          + repr(diff.changed[keys[i]][1], indentString));
  }
  if (! any) {
    print(indentString + '(no changes)');
  }
};

var sortedKeys = exports.sortedKeys = function (obj) {
  var keys = [];
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      keys.push(i);
    }
  }
  keys.sort();
  return keys;
};

var Spy = exports.Spy = function (name, options, extraOptions) {
  var self;
  name = name || 'spy';
  if (Spy.spies[name]) {
     self = Spy.spies[name];
     if ((! options) && ! extraOptions) {
       return self;
     }
  } else {
    self = function () {
      return self.func.apply(this, arguments);
    };
  }
  options = options || {};
  if (typeof options == 'function') {
    options = {applies: options};
  }
  if (extraOptions) {
    extendDefault(options, extraOptions);
  }
  extendDefault(options, Spy.defaultOptions);
  self._name = name;
  self.options = options;
  self.called = false;
  self.calledWait = false;
  self.args = null;
  self.self = null;
  self.argList = [];
  self.selfList = [];
  self.writes = options.writes || false;
  self.returns = options.returns || undefined;
  self.applies = options.applies || null;
  self.throwError = options.throwError || null;
  self.ignoreThis = options.ignoreThis || false;
  self.wrapArgs = options.wrapArgs || false;
  self.func = function () {
    self.called = true;
    self.calledWait = true;
    self.args = argsToArray(arguments);
    self.self = this;
    self.argList.push(self.args);
    self.selfList.push(this);
    // It might be possible to get the caller?
    if (self.writes) {
      if (typeof writeln == "undefined") {
        console.warn("Spy writing outside of test:", self.formatCall());
      } else {
        writeln(self.formatCall());
      }
    }
    if (self.throwError) {
      var throwError = self.throwError;
      if (typeof throwError == "function") {
        throwError = self.throwError.apply(this, arguments);
      }
      throw throwError;
    }
    if (self.applies) {
      try {
        return self.applies.apply(this, arguments);
      } catch (e) {
        console.error('Error in ' + self.repr() + '.applies:', e);
        throw e;
      }
    }
    return self.returns;
  };
  self.func.toString = function () {
    return "Spy('" + self._name + "').func";
  };

  // Method definitions:
  self.formatCall = function () {
    var s = '';
    if ((! self.ignoreThis) && self.self !== globalObject && self.self !== self) {
      s += repr(self.self) + '.';
    }
    s += self._name;
    if (self.args === null) {
      return s + ':never called';
    }
    s += '(';
    // This eliminates trailing undefined arguments:
    var length = self.args.length;
    while (length && self.args[length-1] === undefined) {
      length--;
    }
    for (var i=0; i<length; i++) {
      if (i) {
        s += ', ';
      }
      var maxLen;
      if (self.wrapArgs) {
        maxLen = 10;
      } else {
        maxLen = undefined;
      }
      s += repr(self.args[i], '', maxLen);
    }
    s += ')';
    return s;
  };

  self.method = function (name, options, extraOptions) {
    var desc = self._name + '.' + name;
    var newSpy = Spy(desc, options, extraOptions);
    self[name] = self.func[name] = newSpy.func;
    return newSpy;
  };

  self.methods = function (props) {
    for (var i in props) {
      if (props.hasOwnProperty(i)) {
        var prop = props[i];
        if (prop === true || prop === false || prop === null) {
          prop = {};
        }
        self.method(i, props[i]);
      }
    }
    return self;
  };

  self.wait = function (timeout) {
    var func = function () {
      var value = self.calledWait;
      if (value) {
        self.calledWait = false;
      }
      return value;
    };
    func.repr = function () {
      return 'called:'+repr(self);
    };
    wait(func, timeout);
  };

  self.repr = function () {
    return "Spy('" + self._name + "')";
  };

  if (options.methods) {
    self.methods(options.methods);
  }
  Spy.spies[name] = self;
  if (options.wait) {
    if (typeof options.wait == 'number') {
      self.wait(options.wait);
    } else {
      self.wait();
    }
  }
  return self;
};

Spy.spies = {};
Spy.defaultOptions = {writes: true};

Spy.on = function (obj, attrOrOptions, options) {
  if (typeof obj == "string") {
    var name = obj;
    if (obj.indexOf('.') == -1) {
      throw 'You must provide an object name with a .attribute (not: "' + obj + '")';
    }
    var attr = obj.substr(obj.lastIndexOf('.')+1);
    var objName = obj.substr(0, obj.lastIndexOf('.'));
    var e = eval;
    try {
      var obj = eval(objName);
    } catch (e) {
      throw 'Could not get object "' + obj + '": ' + e + ' (maybe you are not referring to a global variable?)';
    }
    if (obj === undefined || obj === null) {
      throw 'Object "' + objName + '" is ' + obj;
    }
    options = attrOrOptions;
  } else {
    var name = attrOrOptions;
    if (name.indexOf('.') == -1) {
      throw 'You must provide an object name with a .attribute (not: "' + obj + '")';
    }
    attr = attrOrOptions.substr(attrOrOptions.lastIndexOf('.')+1);
  }
  var spy = Spy(name, options);
  spy.overriding = obj[attr];
  spy.onAttribute = attr;
  spy.onObject = obj;
  obj[attr] = spy;
  return spy;
};

var params = exports.params = {};

function jshint(src, options) {
  if (typeof JSHINT == 'undefined') {
    throw 'jshint.js is not included';
  }
  if (! src) {
    throw 'You must call jshint(src) with a src (got ' + src + ')';
  }
  var url = src;
  if (typeof document != 'undefined') {
    var scripts = document.getElementsByTagName('script');
    for (var i=0; i<scripts.length; i++) {
      var scriptSrc = scripts[i].src;
      if (scriptSrc.indexOf(src) != -1) {
        url = scriptSrc;
        break;
      }
    }
  }
  var req = new XMLHttpRequest();
  req.open('GET', url);
  var done = false;
  req.onreadystatechange = function () {
    if (req.readyState != 4) {
      return;
    }
    if (req.status != 200) {
      if (req.status === 0) {
        print('Error: request to', url, 'failed with no status (cross-origin problem?');
      } else {
        print('Error: request to', url, 'failed with status:', req.status);
      }
    } else {
      var text = req.responseText;
      text = _removeJshintSections(text);
      var result = JSHINT(text, options);
      if (result) {
        print('Script passed:', url);
      } else {
        print('Script failed:', repr(url));
        for (var i=0; i<JSHINT.errors.length; i++) {
          var error = JSHINT.errors[i];
          if (error === null) {
            print('Fatal error; jshint could not continue');
          } else {
            print('  ' + (error.line) + ':' + (error.character) + ' ' + error.reason);
            print('    ' + error.evidence);
          }
        }
      }
      /*  Doesn't seem helpful:
      var report = JSHINT.report();
      report = report.replace(/<br>(<(div|p)[^>]*>)?/g, '\n');
      report = report.replace(/<(div|p)[^>]*>/g, '\n');
      report = report.replace(/<[^>]*>/g, ' ');
      report = report.replace(/  +/g, ' ');
      console.log('Report:', report);
      */
    }
    done = true;
  };
  req.send();
  wait(function () {return done;});
}

function _removeJshintSections(text) {
  /* Removes anything surrounded with a comment like:
     // jshint-ignore
     ...
     // jshint-endignore

     It replaces these with whitespace so character and line counts still work.
  */
  var result = '';
  var start = /(\/\/|\/\*)\s*jshint-ignore/i;
  var end = /jshint-endignore\s*(\*\/)?/i;
  while (true) {
    var match = text.search(start);
    if (match == -1) {
      result += text;
      break;
    }
    result += text.substr(0, match);
    text = text.substr(match);
    match = end.exec(text);
    if (! match) {
      // throw everything left away.  Warn?
      break;
    }
    var endPos = match.index + match[0].length;
    var skipped = text.substr(0, endPos);
    text = text.substr(endPos);
    // Maintain line numbers:
    skipped = skipped.replace(/[^\n]/g, ' ');
    result += skipped;
  }
  return result;
}


exports.jshint = jshint;

function NosyXMLHttpRequest(name, req) {
  if (this === globalObject) {
    throw 'You forgot *new* NosyXMLHttpRequest(' + repr(name) + ')';
  }
  if (! name) {
    throw 'The name argument is required';
  }
  if (typeof name != "string") {
    throw 'Wrong type of argument for name: ' + name;
  }
  if (! req) {
    req = new NosyXMLHttpRequest.realXMLHttpRequest();
  }
  this._name = name;
  this._req = req;
  this._method = null;
  this._data = null;
  this._url = null;
  this._headers = {};
  this.abort = printWrap(this._req, 'abort', this._name);
  this.getAllResponseHeaders = this._req.getAllResponseHeaders.bind(this._req);
  this.getResponseHeader = this._req.getResponseHeader.bind(this._req);
  this.open = printWrap(this._req, 'open', this._name, (function (method, url) {
    this._method = method;
    this._url = url;
  }).bind(this));
  this.overrideMimeType = printWrap(this._req, 'overrideMimeType', this._name);
  this.send = printWrap(this._req, 'send', this._name, (function (data) {
    if (this.timeout !== undefined) {
      this._req.timeout = this.timeout;
    }
    if (this.withCredentials !== undefined) {
      this._req.withCredentials = this.withCredentials;
    }
    this._data = data;
  }).bind(this));
  this.setRequestHeader = printWrap(this._req, 'setRequestHeader', this._name, (function (name, value) {
    this._headers[name] = value;
  }).bind(this));
  this.onreadystatechange = null;
  this._req.onreadystatechange = (function () {
    this.readyState = this._req.readyState;
    if (this.readyState >= this.HEADERS_RECEIVED) {
      var props = ['response', 'responseText', 'responseType',
                   'responseXML', 'status', 'statusText', 'upload'];

      for (var i=0; i<props.length; i++) {
        this[props[i]] = this._req[props[i]];
      }
    }
    if (this.onreadystatechange) {
      this.onreadystatechange();
    }
  }).bind(this);
  this.UNSENT = 0;
  this.OPENED = 1;
  this.HEADERS_RECEIVED = 2;
  this.LOADING = 3;
  this.DONE = 4;
  this.readyState = this.UNSENT;
  this.toString = function () {
    var s = 'NosyXMLHttpRequest ';
    s += {0: 'UNSENT', 1: 'OPENED', 2: 'HEADERS_RECEIVED', 3: 'LOADING', 4: 'DONE'}[this.readyState];
    if (this._method) {
      s += '\n' + this._method + ' ' + this._url;
    }
    for (var i in this._headers) {
      if (this._headers.hasOwnProperty(i)) {
        s += '\n' + i + ': ' + this._headers[i];
      }
    }
    if (this._data) {
      s += '\n\n' + this._data;
    }
    s += '\n';
    return s;
  };
}

NosyXMLHttpRequest.realXMLHttpRequest = typeof XMLHttpRequest == "undefined" ? undefined : XMLHttpRequest;

NosyXMLHttpRequest.factory = function (name) {
  return function () {
    return new NosyXMLHttpRequest(name);
  };
};

exports.NosyXMLHttpRequest = NosyXMLHttpRequest;

function printWrap(realObject, methodName, objectName, before) {
  return function () {
    var r = objectName + '.' + methodName + '(';
    var length = arguments.length;
    while (length && arguments[length-1] === undefined) {
      length--;
    }
    for (var i=0; i<length; i++) {
      if (i) {
        r += ', ';
      }
      r += repr(arguments[i]);
    }
    r += ')';
    print(r);
    if (before) {
      before.apply(realObject, arguments);
    }
    return realObject[methodName].apply(realObject, arguments);
  };
}

var positionOnFailure = null;

var attemptedHash = null;

if (typeof location != 'undefined') {

  (function (params) {
    var url = location.href + '';
    if (url.indexOf('#') != -1) {
      url = url.substr(0, url.indexOf('#'));
    }
    if (url.indexOf('?') == -1) {
      return;
    }
    var qs = url.substr(url.indexOf('?')+1);
    var parts = qs.split('&');
    for (var i=0; i<parts.length; i++) {
      var name, value;
      if (parts[i].indexOf('=') == -1) {
        name = decodeURIComponent(parts[i]);
        value = null;
      } else {
        name = decodeURIComponent(parts[i].substr(0, parts[i].indexOf('=')));
        value = decodeURIComponent(parts[i].substr(parts[i].indexOf('=')+1));
      }
      if (params.hasOwnProperty(name)) {
        if (params[name] === null || typeof params[name] == 'string') {
          params[name] = [params[name], value];
        } else {
          params[name].push(value);
        }
      } else {
        params[name] = value;
      }
    }
  })(params);

  if (location.hash.indexOf('#example') === 0) {
    positionOnFailure = location.hash.substr(1);
    location.hash = '';
  } else if (location.hash) {
    // Anchors get all mixed up because we move content around on the page
    attemptedHash = location.hash;
  }
}

if (typeof window != 'undefined') {
  window.addEventListener('load', function () {
    if (hasClass(doc.body, 'autodoctest')) {
      var runner = new Runner();
      var parser = new HTMLParser(runner);
      parser.loadRemotes(function () {
        runner.init();
        parser.parse();
        runner.run();
      },
      hasClass(doc.body, 'load-all-remotes') ? 'pre' : null);
    }
  }, false);
}

// jshint-ignore
/* Includes a minified esprima: http://esprima.org/ */
// Avoid clobbering:
var realExports = exports;
exports = {};

/* INSERT esprima.js */
(function(e,t){"use strict";typeof define=="function"&&define.amd?define(["exports"],t):typeof exports!="undefined"?t(exports):t(e.esprima={})})(this,function(e){"use strict";function b(e,t){if(!e)throw new 
Error("ASSERT: "+t)}function w(e){return e>=48&&e<=57}function E(e){return"0123456789abcdefABCDEF".indexOf(e)>=0}function S(e){return"01234567".indexOf(e)>=0}function x(e){return e===32||e===9||e===11||
e===12||e===160||e>=5760&&"\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff".indexOf(String.fromCharCode(e))>0}function T(e){return e===10||e===13||
e===8232||e===8233}function N(e){return e===36||e===95||e>=65&&e<=90||e>=97&&e<=122||e===92||e>=128&&u.NonAsciiIdentifierStart.test(String.fromCharCode(e))}function C(e){return e===36||e===95||e>=65&&e<=90||
e>=97&&e<=122||e>=48&&e<=57||e===92||e>=128&&u.NonAsciiIdentifierPart.test(String.fromCharCode(e))}function k(e){switch(e){case"class":case"enum":case"export":case"extends":case"import":case"super":return!0
;default:return!1}}function L(e){switch(e){case"implements":case"interface":case"package":case"private":case"protected":case"public":case"static":case"yield":case"let":return!0;default:return!1}}function A
(e){return e==="eval"||e==="arguments"}function O(e){if(l&&L(e))return!0;switch(e.length){case 2:return e==="if"||e==="in"||e==="do";case 3:return e==="var"||e==="for"||e==="new"||e==="try"||e==="let";
case 4:return e==="this"||e==="else"||e==="case"||e==="void"||e==="with"||e==="enum";case 5:return e==="while"||e==="break"||e==="catch"||e==="throw"||e==="const"||e==="yield"||e==="class"||e==="super"
;case 6:return e==="return"||e==="typeof"||e==="delete"||e==="switch"||e==="export"||e==="import";case 7:return e==="default"||e==="finally"||e==="extends";case 8:return e==="function"||e==="continue"||
e==="debugger";case 10:return e==="instanceof";default:return!1}}function M(){var e,t,n;t=!1,n=!1;while(c<d){e=f.charCodeAt(c);if(n)++c,T(e)&&(n=!1,e===13&&f.charCodeAt(c)===10&&++c,++h,p=c);else if(t)
T(e)?(e===13&&f.charCodeAt(c+1)===10&&++c,++h,++c,p=c,c>=d&&J({},o.UnexpectedToken,"ILLEGAL")):(e=f.charCodeAt(c++),c>=d&&J({},o.UnexpectedToken,"ILLEGAL"),e===42&&(e=f.charCodeAt(c),e===47&&(++c,t=!1)
));else if(e===47){e=f.charCodeAt(c+1);if(e===47)c+=2,n=!0;else{if(e!==42)break;c+=2,t=!0,c>=d&&J({},o.UnexpectedToken,"ILLEGAL")}}else if(x(e))++c;else{if(!T(e))break;++c,e===13&&f.charCodeAt(c)===10&&++
c,++h,p=c}}}function _(e){var t,n,r,i=0;n=e==="u"?4:2;for(t=0;t<n;++t){if(!(c<d&&E(f[c])))return"";r=f[c++],i=i*16+"0123456789abcdef".indexOf(r.toLowerCase())}return String.fromCharCode(i)}function D()
{var e,t;e=f.charCodeAt(c++),t=String.fromCharCode(e),e===92&&(f.charCodeAt(c)!==117&&J({},o.UnexpectedToken,"ILLEGAL"),++c,e=_("u"),(!e||e==="\\"||!N(e.charCodeAt(0)))&&J({},o.UnexpectedToken,"ILLEGAL"
),t=e);while(c<d){e=f.charCodeAt(c);if(!C(e))break;++c,t+=String.fromCharCode(e),e===92&&(t=t.substr(0,t.length-1),f.charCodeAt(c)!==117&&J({},o.UnexpectedToken,"ILLEGAL"),++c,e=_("u"),(!e||e==="\\"||!
C(e.charCodeAt(0)))&&J({},o.UnexpectedToken,"ILLEGAL"),t+=e)}return t}function P(){var e,t;e=c++;while(c<d){t=f.charCodeAt(c);if(t===92)return c=e,D();if(!C(t))break;++c}return f.slice(e,c)}function H(
){var e,n,r;return e=c,n=f.charCodeAt(c)===92?D():P(),n.length===1?r=t.Identifier:O(n)?r=t.Keyword:n==="null"?r=t.NullLiteral:n==="true"||n==="false"?r=t.BooleanLiteral:r=t.Identifier,{type:r,value:n,lineNumber
:h,lineStart:p,range:[e,c]}}function B(){var e=c,n=f.charCodeAt(c),r,i=f[c],s,u,a;switch(n){case 46:case 40:case 41:case 59:case 44:case 123:case 125:case 91:case 93:case 58:case 63:case 126:return++c,
y.tokenize&&(n===40?y.openParenToken=y.tokens.length:n===123&&(y.openCurlyToken=y.tokens.length)),{type:t.Punctuator,value:String.fromCharCode(n),lineNumber:h,lineStart:p,range:[e,c]};default:r=f.charCodeAt
(c+1);if(r===61)switch(n){case 37:case 38:case 42:case 43:case 45:case 47:case 60:case 62:case 94:case 124:return c+=2,{type:t.Punctuator,value:String.fromCharCode(n)+String.fromCharCode(r),lineNumber:
h,lineStart:p,range:[e,c]};case 33:case 61:return c+=2,f.charCodeAt(c)===61&&++c,{type:t.Punctuator,value:f.slice(e,c),lineNumber:h,lineStart:p,range:[e,c]};default:}}s=f[c+1],u=f[c+2],a=f[c+3];if(i===">"&&
s===">"&&u===">"&&a==="=")return c+=4,{type:t.Punctuator,value:">>>=",lineNumber:h,lineStart:p,range:[e,c]};if(i===">"&&s===">"&&u===">")return c+=3,{type:t.Punctuator,value:">>>",lineNumber:h,lineStart
:p,range:[e,c]};if(i==="<"&&s==="<"&&u==="=")return c+=3,{type:t.Punctuator,value:"<<=",lineNumber:h,lineStart:p,range:[e,c]};if(i===">"&&s===">"&&u==="=")return c+=3,{type:t.Punctuator,value:">>=",lineNumber
:h,lineStart:p,range:[e,c]};if(i===s&&"+-<>&|".indexOf(i)>=0)return c+=2,{type:t.Punctuator,value:i+s,lineNumber:h,lineStart:p,range:[e,c]};if("<>=!+-*%&|^/".indexOf(i)>=0)return++c,{type:t.Punctuator,
value:i,lineNumber:h,lineStart:p,range:[e,c]};J({},o.UnexpectedToken,"ILLEGAL")}function j(e){var n="";while(c<d){if(!E(f[c]))break;n+=f[c++]}return n.length===0&&J({},o.UnexpectedToken,"ILLEGAL"),N(f.
charCodeAt(c))&&J({},o.UnexpectedToken,"ILLEGAL"),{type:t.NumericLiteral,value:parseInt("0x"+n,16),lineNumber:h,lineStart:p,range:[e,c]}}function F(e){var n="0"+f[c++];while(c<d){if(!S(f[c]))break;n+=f
[c++]}return(N(f.charCodeAt(c))||w(f.charCodeAt(c)))&&J({},o.UnexpectedToken,"ILLEGAL"),{type:t.NumericLiteral,value:parseInt(n,8),octal:!0,lineNumber:h,lineStart:p,range:[e,c]}}function I(){var e,n,r;
r=f[c],b(w(r.charCodeAt(0))||r===".","Numeric literal must start with a decimal digit or a decimal point"),n=c,e="";if(r!=="."){e=f[c++],r=f[c];if(e==="0"){if(r==="x"||r==="X")return++c,j(n);if(S(r))return F
(n);r&&w(r.charCodeAt(0))&&J({},o.UnexpectedToken,"ILLEGAL")}while(w(f.charCodeAt(c)))e+=f[c++];r=f[c]}if(r==="."){e+=f[c++];while(w(f.charCodeAt(c)))e+=f[c++];r=f[c]}if(r==="e"||r==="E"){e+=f[c++],r=f
[c];if(r==="+"||r==="-")e+=f[c++];if(w(f.charCodeAt(c)))while(w(f.charCodeAt(c)))e+=f[c++];else J({},o.UnexpectedToken,"ILLEGAL")}return N(f.charCodeAt(c))&&J({},o.UnexpectedToken,"ILLEGAL"),{type:t.NumericLiteral
,value:parseFloat(e),lineNumber:h,lineStart:p,range:[n,c]}}function q(){var e="",n,r,i,s,u,a,l=!1;n=f[c],b(n==="'"||n==='"',"String literal must starts with a quote"),r=c,++c;while(c<d){i=f[c++];if(i===
n){n="";break}if(i==="\\"){i=f[c++];if(!i||!T(i.charCodeAt(0)))switch(i){case"n":e+="\n";break;case"r":e+="\r";break;case"t":e+="	";break;case"u":case"x":a=c,u=_(i),u?e+=u:(c=a,e+=i);break;case"b":e+="\b"
;break;case"f":e+="\f";break;case"v":e+="";break;default:S(i)?(s="01234567".indexOf(i),s!==0&&(l=!0),c<d&&S(f[c])&&(l=!0,s=s*8+"01234567".indexOf(f[c++]),"0123".indexOf(i)>=0&&c<d&&S(f[c])&&(s=s*8+"01234567"
.indexOf(f[c++]))),e+=String.fromCharCode(s)):e+=i}else++h,i==="\r"&&f[c]==="\n"&&++c}else{if(T(i.charCodeAt(0)))break;e+=i}}return n!==""&&J({},o.UnexpectedToken,"ILLEGAL"),{type:t.StringLiteral,value
:e,octal:l,lineNumber:h,lineStart:p,range:[r,c]}}function R(){var e,n,r,i,s,u,a=!1,l,v=!1;m=null,M(),r=c,n=f[c],b(n==="/","Regular expression literal must start with a slash"),e=f[c++];while(c<d){n=f[c++
],e+=n;if(a)n==="]"&&(a=!1);else if(n==="\\")n=f[c++],T(n.charCodeAt(0))&&J({},o.UnterminatedRegExp),e+=n;else{if(n==="/"){v=!0;break}n==="["?a=!0:T(n.charCodeAt(0))&&J({},o.UnterminatedRegExp)}}v||J({
},o.UnterminatedRegExp),i=e.substr(1,e.length-2),s="";while(c<d){n=f[c];if(!C(n.charCodeAt(0)))break;++c;if(n==="\\"&&c<d){n=f[c];if(n==="u"){++c,l=c,n=_("u");if(n){s+=n;for(e+="\\u";l<c;++l)e+=f[l]}else c=
l,s+="u",e+="\\u"}else e+="\\"}else s+=n,e+=n}try{u=new RegExp(i,s)}catch(g){J({},o.InvalidRegExp)}return V(),y.tokenize?{type:t.RegularExpression,value:u,lineNumber:h,lineStart:p,range:[r,c]}:{literal
:e,value:u,range:[r,c]}}function U(e){return e.type===t.Identifier||e.type===t.Keyword||e.type===t.BooleanLiteral||e.type===t.NullLiteral}function z(){var e,t;e=y.tokens[y.tokens.length-1];if(!e)return R
();if(e.type==="Punctuator"){if(e.value===")")return t=y.tokens[y.openParenToken-1],!t||t.type!=="Keyword"||t.value!=="if"&&t.value!=="while"&&t.value!=="for"&&t.value!=="with"?B():R();if(e.value==="}"
){if(y.tokens[y.openCurlyToken-3]&&y.tokens[y.openCurlyToken-3].type==="Keyword"){t=y.tokens[y.openCurlyToken-4];if(!t)return B()}else{if(!y.tokens[y.openCurlyToken-4]||y.tokens[y.openCurlyToken-4].type!=="Keyword"
)return B();t=y.tokens[y.openCurlyToken-5];if(!t)return R()}return r.indexOf(t.value)>=0?B():R()}return R()}return e.type==="Keyword"?R():B()}function W(){var e;return M(),c>=d?{type:t.EOF,lineNumber:h
,lineStart:p,range:[c,c]}:(e=f.charCodeAt(c),e===40||e===41||e===58?B():e===39||e===34?q():N(e)?H():e===46?w(f.charCodeAt(c+1))?I():B():w(e)?I():y.tokenize&&e===47?z():B())}function X(){var e;return e=
m,c=e.range[1],h=e.lineNumber,p=e.lineStart,m=W(),c=e.range[1],h=e.lineNumber,p=e.lineStart,e}function V(){var e,t,n;e=c,t=h,n=p,m=W(),c=e,h=t,p=n}function $(){var e,t,n,r;return e=c,t=h,n=p,M(),r=h!==
t,c=e,h=t,p=n,r}function J(e,t){var n,r=Array.prototype.slice.call(arguments,2),i=t.replace(/%(\d)/g,function(e,t){return b(t<r.length,"Message reference must be in range"),r[t]});throw typeof e.lineNumber=="number"?
(n=new Error("Line "+e.lineNumber+": "+i),n.index=e.range[0],n.lineNumber=e.lineNumber,n.column=e.range[0]-p+1):(n=new Error("Line "+h+": "+i),n.index=c,n.lineNumber=h,n.column=c-p+1),n.description=i,n
}function K(){try{J.apply(null,arguments)}catch(e){if(!y.errors)throw e;y.errors.push(e)}}function Q(e){e.type===t.EOF&&J(e,o.UnexpectedEOS),e.type===t.NumericLiteral&&J(e,o.UnexpectedNumber),e.type===
t.StringLiteral&&J(e,o.UnexpectedString),e.type===t.Identifier&&J(e,o.UnexpectedIdentifier);if(e.type===t.Keyword){if(k(e.value))J(e,o.UnexpectedReserved);else if(l&&L(e.value)){K(e,o.StrictReservedWord
);return}J(e,o.UnexpectedToken,e.value)}J(e,o.UnexpectedToken,e.value)}function G(e){var n=X();(n.type!==t.Punctuator||n.value!==e)&&Q(n)}function Y(e){var n=X();(n.type!==t.Keyword||n.value!==e)&&Q(n)
}function Z(e){return m.type===t.Punctuator&&m.value===e}function et(e){return m.type===t.Keyword&&m.value===e}function tt(){var e;return m.type!==t.Punctuator?!1:(e=m.value,e==="="||e==="*="||e==="/="||
e==="%="||e==="+="||e==="-="||e==="<<="||e===">>="||e===">>>="||e==="&="||e==="^="||e==="|=")}function nt(){var e;if(f.charCodeAt(c)===59){X();return}e=h,M();if(h!==e)return;if(Z(";")){X();return}m.type!==
t.EOF&&!Z("}")&&Q(m)}function rt(e){return e.type===i.Identifier||e.type===i.MemberExpression}function it(){var e=[];G("[");while(!Z("]"))Z(",")?(X(),e.push(null)):(e.push(xt()),Z("]")||G(","));return G
("]"),v.createArrayExpression(e)}function st(e,t){var n,r;return n=l,v.markStart(),r=Qt(),t&&l&&A(e[0].name)&&K(t,o.StrictParamName),l=n,v.markEnd(v.createFunctionExpression(null,e,[],r))}function ot()
{var e;return v.markStart(),e=X(),e.type===t.StringLiteral||e.type===t.NumericLiteral?(l&&e.octal&&K(e,o.StrictOctalLiteral),v.markEnd(v.createLiteral(e))):v.markEnd(v.createIdentifier(e.value))}function ut
(){var e,n,r,i,s;e=m,v.markStart();if(e.type===t.Identifier)return r=ot(),e.value==="get"&&!Z(":")?(n=ot(),G("("),G(")"),i=st([]),v.markEnd(v.createProperty("get",n,i))):e.value==="set"&&!Z(":")?(n=ot(
),G("("),e=m,e.type!==t.Identifier&&Q(X()),s=[kt()],G(")"),i=st(s,e),v.markEnd(v.createProperty("set",n,i))):(G(":"),i=xt(),v.markEnd(v.createProperty("init",r,i)));if(e.type!==t.EOF&&e.type!==t.Punctuator
)return n=ot(),G(":"),i=xt(),v.markEnd(v.createProperty("init",n,i));Q(e)}function at(){var e=[],t,n,r,u,a={},f=String;G("{");while(!Z("}"))t=ut(),t.key.type===i.Identifier?n=t.key.name:n=f(t.key.value
),u=t.kind==="init"?s.Data:t.kind==="get"?s.Get:s.Set,r="$"+n,Object.prototype.hasOwnProperty.call(a,r)?(a[r]===s.Data?l&&u===s.Data?K({},o.StrictDuplicateProperty):u!==s.Data&&K({},o.AccessorDataProperty
):u===s.Data?K({},o.AccessorDataProperty):a[r]&u&&K({},o.AccessorGetSet),a[r]|=u):a[r]=u,e.push(t),Z("}")||G(",");return G("}"),v.createObjectExpression(e)}function ft(){var e;return v.markStart(),G("("
),e=Tt(),G(")"),v.markGroupEnd(e)}function lt(){var e,n,r;if(Z("("))return ft();e=m.type,v.markStart();if(e===t.Identifier)r=v.createIdentifier(X().value);else if(e===t.StringLiteral||e===t.NumericLiteral
)l&&m.octal&&K(m,o.StrictOctalLiteral),r=v.createLiteral(X());else if(e===t.Keyword)et("this")?(X(),r=v.createThisExpression()):et("function")&&(r=Zt());else if(e===t.BooleanLiteral)n=X(),n.value=n.value==="true"
,r=v.createLiteral(n);else if(e===t.NullLiteral)n=X(),n.value=null,r=v.createLiteral(n);else if(Z("["))r=it();else if(Z("{"))r=at();else if(Z("/")||Z("/="))r=v.createLiteral(R());if(r)return v.markEnd(
r);Q(X())}function ct(){var e=[];G("(");if(!Z(")"))while(c<d){e.push(xt());if(Z(")"))break;G(",")}return G(")"),e}function ht(){var e;return v.markStart(),e=X(),U(e)||Q(e),v.markEnd(v.createIdentifier(
e.value))}function pt(){return G("."),ht()}function dt(){var e;return G("["),e=Tt(),G("]"),e}function vt(){var e,t;return v.markStart(),Y("new"),e=gt(),t=Z("(")?ct():[],v.markEnd(v.createNewExpression(
e,t))}function mt(){var e,t,n,r;e=ln(),t=et("new")?vt():lt();while(Z(".")||Z("[")||Z("("))Z("(")?(n=ct(),t=v.createCallExpression(t,n)):Z("[")?(r=dt(),t=v.createMemberExpression("[",t,r)):(r=pt(),t=v.createMemberExpression
(".",t,r)),e&&(e.end(),e.apply(t));return t}function gt(){var e,t,n;e=ln(),t=et("new")?vt():lt();while(Z(".")||Z("["))Z("[")?(n=dt(),t=v.createMemberExpression("[",t,n)):(n=pt(),t=v.createMemberExpression
(".",t,n)),e&&(e.end(),e.apply(t));return t}function yt(){var e,n,r;return e=ln(),n=mt(),m.type===t.Punctuator&&(Z("++")||Z("--"))&&!$()&&(l&&n.type===i.Identifier&&A(n.name)&&K({},o.StrictLHSPostfix),
rt(n)||J({},o.InvalidLHSInAssignment),r=X(),n=v.createPostfixExpression(r.value,n)),e?(e.end(),e.applyIf(n)):n}function bt(){var e,n,r;return e=ln(),m.type!==t.Punctuator&&m.type!==t.Keyword?r=yt():Z("++"
)||Z("--")?(n=X(),r=bt(),l&&r.type===i.Identifier&&A(r.name)&&K({},o.StrictLHSPrefix),rt(r)||J({},o.InvalidLHSInAssignment),r=v.createUnaryExpression(n.value,r)):Z("+")||Z("-")||Z("~")||Z("!")?(n=X(),r=
bt(),r=v.createUnaryExpression(n.value,r)):et("delete")||et("void")||et("typeof")?(n=X(),r=bt(),r=v.createUnaryExpression(n.value,r),l&&r.operator==="delete"&&r.argument.type===i.Identifier&&K({},o.StrictDelete
)):r=yt(),e&&(e.end(),r=e.applyIf(r)),r}function wt(e,n){var r=0;if(e.type!==t.Punctuator&&e.type!==t.Keyword)return 0;switch(e.value){case"||":r=1;break;case"&&":r=2;break;case"|":r=3;break;case"^":r=4
;break;case"&":r=5;break;case"==":case"!=":case"===":case"!==":r=6;break;case"<":case">":case"<=":case">=":case"instanceof":r=7;break;case"in":r=n?7:0;break;case"<<":case">>":case">>>":r=8;break;case"+"
:case"-":r=9;break;case"*":case"/":case"%":r=11;break;default:}return r}function Et(){var e,t,n,r,i,s,o,u,a;r=g.allowIn,g.allowIn=!0,e=bt(),t=m,n=wt(t,r);if(n===0)return e;t.prec=n,X(),i=[e,t,bt()];while(
(n=wt(m,r))>0){while(i.length>2&&n<=i[i.length-2].prec)s=i.pop(),o=i.pop().value,u=i.pop(),i.push(v.createBinaryExpression(o,u,s));t=X(),t.prec=n,i.push(t),i.push(bt())}g.allowIn=r,a=i.length-1,e=i[a];
while(a>1)e=v.createBinaryExpression(i[a-1].value,i[a-2],e),a-=2;return e}function St(){var e,t,n,r;return v.markStart(),e=Et(),Z("?")?(X(),t=g.allowIn,g.allowIn=!0,n=xt(),g.allowIn=t,G(":"),r=xt(),e=v
.markEnd(v.createConditionalExpression(e,n,r))):v.markEnd({}),e}function xt(){var e,t,n,r,s;return e=m,t=ln(),s=n=St(),tt()&&(rt(n)||J({},o.InvalidLHSInAssignment),l&&n.type===i.Identifier&&A(n.name)&&
K(e,o.StrictLHSAssignment),e=X(),r=xt(),s=v.createAssignmentExpression(e.value,n,r)),t?(t.end(),t.applyIf(s)):s}function Tt(){var e,t;e=ln(),t=xt();if(Z(",")){t=v.createSequenceExpression([t]);while(c<
d){if(!Z(","))break;X(),t.expressions.push(xt())}}return e?(e.end(),e.applyIf(t)):t}function Nt(){var e=[],t;while(c<d){if(Z("}"))break;t=en();if(typeof t=="undefined")break;e.push(t)}return e}function Ct
(){var e;return v.markStart(),G("{"),e=Nt(),G("}"),v.markEnd(v.createBlockStatement(e))}function kt(){var e;return v.markStart(),e=X(),e.type!==t.Identifier&&Q(e),v.markEnd(v.createIdentifier(e.value))
}function Lt(e){var t=null,n;return v.markStart(),n=kt(),l&&A(n.name)&&K({},o.StrictVarName),e==="const"?(G("="),t=xt()):Z("=")&&(X(),t=xt()),v.markEnd(v.createVariableDeclarator(n,t))}function At(e){var t=
[];do{t.push(Lt(e));if(!Z(","))break;X()}while(c<d);return t}function Ot(){var e;return Y("var"),e=At(),nt(),v.createVariableDeclaration(e,"var")}function Mt(e){var t;return v.markStart(),Y(e),t=At(e),
nt(),v.markEnd(v.createVariableDeclaration(t,e))}function _t(){return G(";"),v.createEmptyStatement()}function Dt(){var e=Tt();return nt(),v.createExpressionStatement(e)}function Pt(){var e,t,n;return Y
("if"),G("("),e=Tt(),G(")"),t=Kt(),et("else")?(X(),n=Kt()):n=null,v.createIfStatement(e,t,n)}function Ht(){var e,t,n;return Y("do"),n=g.inIteration,g.inIteration=!0,e=Kt(),g.inIteration=n,Y("while"),G("("
),t=Tt(),G(")"),Z(";")&&X(),v.createDoWhileStatement(e,t)}function Bt(){var e,t,n;return Y("while"),G("("),e=Tt(),G(")"),n=g.inIteration,g.inIteration=!0,t=Kt(),g.inIteration=n,v.createWhileStatement(e
,t)}function jt(){var e,t;return v.markStart(),e=X(),t=At(),v.markEnd(v.createVariableDeclaration(t,e.value))}function Ft(){var e,t,n,r,i,s,u;return e=t=n=null,Y("for"),G("("),Z(";")?X():(et("var")||et
("let")?(g.allowIn=!1,e=jt(),g.allowIn=!0,e.declarations.length===1&&et("in")&&(X(),r=e,i=Tt(),e=null)):(g.allowIn=!1,e=Tt(),g.allowIn=!0,et("in")&&(rt(e)||J({},o.InvalidLHSInForIn),X(),r=e,i=Tt(),e=null
)),typeof r=="undefined"&&G(";")),typeof r=="undefined"&&(Z(";")||(t=Tt()),G(";"),Z(")")||(n=Tt())),G(")"),u=g.inIteration,g.inIteration=!0,s=Kt(),g.inIteration=u,typeof r=="undefined"?v.createForStatement
(e,t,n,s):v.createForInStatement(r,i,s)}function It(){var e=null,n;return Y("continue"),f.charCodeAt(c)===59?(X(),g.inIteration||J({},o.IllegalContinue),v.createContinueStatement(null)):$()?(g.inIteration||
J({},o.IllegalContinue),v.createContinueStatement(null)):(m.type===t.Identifier&&(e=kt(),n="$"+e.name,Object.prototype.hasOwnProperty.call(g.labelSet,n)||J({},o.UnknownLabel,e.name)),nt(),e===null&&!g.
inIteration&&J({},o.IllegalContinue),v.createContinueStatement(e))}function qt(){var e=null,n;return Y("break"),f.charCodeAt(c)===59?(X(),!g.inIteration&&!g.inSwitch&&J({},o.IllegalBreak),v.createBreakStatement
(null)):$()?(!g.inIteration&&!g.inSwitch&&J({},o.IllegalBreak),v.createBreakStatement(null)):(m.type===t.Identifier&&(e=kt(),n="$"+e.name,Object.prototype.hasOwnProperty.call(g.labelSet,n)||J({},o.UnknownLabel
,e.name)),nt(),e===null&&!g.inIteration&&!g.inSwitch&&J({},o.IllegalBreak),v.createBreakStatement(e))}function Rt(){var e=null;return Y("return"),g.inFunctionBody||K({},o.IllegalReturn),f.charCodeAt(c)===32&&
N(f.charCodeAt(c+1))?(e=Tt(),nt(),v.createReturnStatement(e)):$()?v.createReturnStatement(null):(Z(";")||!Z("}")&&m.type!==t.EOF&&(e=Tt()),nt(),v.createReturnStatement(e))}function Ut(){var e,t;return l&&
K({},o.StrictModeWith),Y("with"),G("("),e=Tt(),G(")"),t=Kt(),v.createWithStatement(e,t)}function zt(){var e,t=[],n;v.markStart(),et("default")?(X(),e=null):(Y("case"),e=Tt()),G(":");while(c<d){if(Z("}"
)||et("default")||et("case"))break;n=Kt(),t.push(n)}return v.markEnd(v.createSwitchCase(e,t))}function Wt(){var e,t,n,r,i;Y("switch"),G("("),e=Tt(),G(")"),G("{");if(Z("}"))return X(),v.createSwitchStatement
(e);t=[],r=g.inSwitch,g.inSwitch=!0,i=!1;while(c<d){if(Z("}"))break;n=zt(),n.test===null&&(i&&J({},o.MultipleDefaultsInSwitch),i=!0),t.push(n)}return g.inSwitch=r,G("}"),v.createSwitchStatement(e,t)}function Xt
(){var e;return Y("throw"),$()&&J({},o.NewlineAfterThrow),e=Tt(),nt(),v.createThrowStatement(e)}function Vt(){var e,t;return v.markStart(),Y("catch"),G("("),Z(")")&&Q(m),e=Tt(),l&&e.type===i.Identifier&&
A(e.name)&&K({},o.StrictCatchVariable),G(")"),t=Ct(),v.markEnd(v.createCatchClause(e,t))}function $t(){var e,t=[],n=null;return Y("try"),e=Ct(),et("catch")&&t.push(Vt()),et("finally")&&(X(),n=Ct()),t.length===0&&!
n&&J({},o.NoCatchOrFinally),v.createTryStatement(e,[],t,n)}function Jt(){return Y("debugger"),nt(),v.createDebuggerStatement()}function Kt(){var e=m.type,n,r,s;e===t.EOF&&Q(m),v.markStart();if(e===t.Punctuator
)switch(m.value){case";":return v.markEnd(_t());case"{":return v.markEnd(Ct());case"(":return v.markEnd(Dt());default:}if(e===t.Keyword)switch(m.value){case"break":return v.markEnd(qt());case"continue"
:return v.markEnd(It());case"debugger":return v.markEnd(Jt());case"do":return v.markEnd(Ht());case"for":return v.markEnd(Ft());case"function":return v.markEnd(Yt());case"if":return v.markEnd(Pt());case"return"
:return v.markEnd(Rt());case"switch":return v.markEnd(Wt());case"throw":return v.markEnd(Xt());case"try":return v.markEnd($t());case"var":return v.markEnd(Ot());case"while":return v.markEnd(Bt());case"with"
:return v.markEnd(Ut());default:}return n=Tt(),n.type===i.Identifier&&Z(":")?(X(),s="$"+n.name,Object.prototype.hasOwnProperty.call(g.labelSet,s)&&J({},o.Redeclaration,"Label",n.name),g.labelSet[s]=!0,
r=Kt(),delete g.labelSet[s],v.markEnd(v.createLabeledStatement(n,r))):(nt(),v.markEnd(v.createExpressionStatement(n)))}function Qt(){var e,n=[],r,s,u,a,h,p,y;v.markStart(),G("{");while(c<d){if(m.type!==
t.StringLiteral)break;r=m,e=en(),n.push(e);if(e.expression.type!==i.Literal)break;s=f.slice(r.range[0]+1,r.range[1]-1),s==="use strict"?(l=!0,u&&K(u,o.StrictOctalLiteral)):!u&&r.octal&&(u=r)}a=g.labelSet
,h=g.inIteration,p=g.inSwitch,y=g.inFunctionBody,g.labelSet={},g.inIteration=!1,g.inSwitch=!1,g.inFunctionBody=!0;while(c<d){if(Z("}"))break;e=en();if(typeof e=="undefined")break;n.push(e)}return G("}"
),g.labelSet=a,g.inIteration=h,g.inSwitch=p,g.inFunctionBody=y,v.markEnd(v.createBlockStatement(n))}function Gt(e){var t,n=[],r,i,s,u,a;G("(");if(!Z(")")){s={};while(c<d){r=m,t=kt(),u="$"+r.value,l?(A(
r.value)&&(i=r,a=o.StrictParamName),Object.prototype.hasOwnProperty.call(s,u)&&(i=r,a=o.StrictParamDupe)):e||(A(r.value)?(e=r,a=o.StrictParamName):L(r.value)?(e=r,a=o.StrictReservedWord):Object.prototype
.hasOwnProperty.call(s,u)&&(e=r,a=o.StrictParamDupe)),n.push(t),s[u]=!0;if(Z(")"))break;G(",")}}return G(")"),{params:n,stricted:i,firstRestricted:e,message:a}}function Yt(){var e,t=[],n,r,i,s,u,a,f;return v
.markStart(),Y("function"),r=m,e=kt(),l?A(r.value)&&K(r,o.StrictFunctionName):A(r.value)?(u=r,a=o.StrictFunctionName):L(r.value)&&(u=r,a=o.StrictReservedWord),s=Gt(u),t=s.params,i=s.stricted,u=s.firstRestricted
,s.message&&(a=s.message),f=l,n=Qt(),l&&u&&J(u,a),l&&i&&K(i,a),l=f,v.markEnd(v.createFunctionDeclaration(e,t,[],n))}function Zt(){var e,t=null,n,r,i,s,u=[],a,f;return v.markStart(),Y("function"),Z("(")||
(e=m,t=kt(),l?A(e.value)&&K(e,o.StrictFunctionName):A(e.value)?(r=e,i=o.StrictFunctionName):L(e.value)&&(r=e,i=o.StrictReservedWord)),s=Gt(r),u=s.params,n=s.stricted,r=s.firstRestricted,s.message&&(i=s
.message),f=l,a=Qt(),l&&r&&J(r,i),l&&n&&K(n,i),l=f,v.markEnd(v.createFunctionExpression(t,u,[],a))}function en(){if(m.type===t.Keyword)switch(m.value){case"const":case"let":return Mt(m.value);case"function"
:return Yt();default:return Kt()}if(m.type!==t.EOF)return Kt()}function tn(){var e,n=[],r,s,u;while(c<d){r=m;if(r.type!==t.StringLiteral)break;e=en(),n.push(e);if(e.expression.type!==i.Literal)break;s=
f.slice(r.range[0]+1,r.range[1]-1),s==="use strict"?(l=!0,u&&K(u,o.StrictOctalLiteral)):!u&&r.octal&&(u=r)}while(c<d){e=en();if(typeof e=="undefined")break;n.push(e)}return n}function nn(){var e;return v
.markStart(),l=!1,V(),e=tn(),v.markEnd(v.createProgram(e))}function rn(e,t,n,r,i){b(typeof n=="number","Comment must have valid position");if(y.comments.length>0&&y.comments[y.comments.length-1].range[1
]>n)return;y.comments.push({type:e,value:t,range:[n,r],loc:i})}function sn(){var e,t,n,r,i,s;e="",i=!1,s=!1;while(c<d){t=f[c];if(s)t=f[c++],T(t.charCodeAt(0))?(n.end={line:h,column:c-p-1},s=!1,rn("Line"
,e,r,c-1,n),t==="\r"&&f[c]==="\n"&&++c,++h,p=c,e=""):c>=d?(s=!1,e+=t,n.end={line:h,column:d-p},rn("Line",e,r,d,n)):e+=t;else if(i)T(t.charCodeAt(0))?(t==="\r"&&f[c+1]==="\n"?(++c,e+="\r\n"):e+=t,++h,++
c,p=c,c>=d&&J({},o.UnexpectedToken,"ILLEGAL")):(t=f[c++],c>=d&&J({},o.UnexpectedToken,"ILLEGAL"),e+=t,t==="*"&&(t=f[c],t==="/"&&(e=e.substr(0,e.length-1),i=!1,++c,n.end={line:h,column:c-p},rn("Block",e
,r,c,n),e="")));else if(t==="/"){t=f[c+1];if(t==="/")n={start:{line:h,column:c-p}},r=c,c+=2,s=!0,c>=d&&(n.end={line:h,column:c-p},s=!1,rn("Line",e,r,c,n));else{if(t!=="*")break;r=c,c+=2,i=!0,n={start:{
line:h,column:c-p-2}},c>=d&&J({},o.UnexpectedToken,"ILLEGAL")}}else if(x(t.charCodeAt(0)))++c;else{if(!T(t.charCodeAt(0)))break;++c,t==="\r"&&f[c]==="\n"&&++c,++h,p=c}}}function on(){var e,t,n,r=[];for(
e=0;e<y.comments.length;++e)t=y.comments[e],n={type:t.type,value:t.value},y.range&&(n.range=t.range),y.loc&&(n.loc=t.loc),r.push(n);y.comments=r}function un(){var e,r,i,s,o;return M(),e=c,r={start:{line
:h,column:c-p}},i=y.advance(),r.end={line:h,column:c-p},i.type!==t.EOF&&(s=[i.range[0],i.range[1]],o=f.slice(i.range[0],i.range[1]),y.tokens.push({type:n[i.type],value:o,range:s,loc:r})),i}function an(
){var e,t,n,r;return M(),e=c,t={start:{line:h,column:c-p}},n=y.scanRegExp(),t.end={line:h,column:c-p},y.tokenize||(y.tokens.length>0&&(r=y.tokens[y.tokens.length-1],r.range[0]===e&&r.type==="Punctuator"&&
(r.value==="/"||r.value==="/=")&&y.tokens.pop()),y.tokens.push({type:"RegularExpression",value:n.literal,range:[e,c],loc:t})),n}function fn(){var e,t,n,r=[];for(e=0;e<y.tokens.length;++e)t=y.tokens[e],
n={type:t.type,value:t.value},y.range&&(n.range=t.range),y.loc&&(n.loc=t.loc),r.push(n);y.tokens=r}function ln(){return!y.loc&&!y.range?null:(M(),{range:[c,c],loc:{start:{line:h,column:c-p},end:{line:h
,column:c-p}},end:function(){this.range[1]=c,this.loc.end.line=h,this.loc.end.column=c-p},apply:function(e){e.range=[this.range[0],this.range[1]],e.loc={start:{line:this.loc.start.line,column:this.loc.
start.column},end:{line:this.loc.end.line,column:this.loc.end.column}},e=v.postProcess(e)},applyIf:function(e){return y.range&&!e.range&&this.apply(e),y.loc&&!e.loc&&this.apply(e),e}})}function cn(e){var t
;delete e.groupRange,delete e.groupLoc;for(t in e)e.hasOwnProperty(t)&&typeof e[t]=="object"&&e[t]&&(e[t].type||e[t].length&&!e[t].substr)&&cn(e[t])}function hn(e,t){return function(n){function r(e){return e
.type===i.LogicalExpression||e.type===i.BinaryExpression}function s(n){var i,o;r(n.left)&&s(n.left),r(n.right)&&s(n.right),e&&(n.left.groupRange||n.right.groupRange?(i=n.left.groupRange?n.left.groupRange
[0]:n.left.range[0],o=n.right.groupRange?n.right.groupRange[1]:n.right.range[1],n.range=[i,o]):typeof n.range=="undefined"&&(i=n.left.range[0],o=n.right.range[1],n.range=[i,o])),t&&(n.left.groupLoc||n.
right.groupLoc?(i=n.left.groupLoc?n.left.groupLoc.start:n.left.loc.start,o=n.right.groupLoc?n.right.groupLoc.end:n.right.loc.end,n.loc={start:i,end:o},n=v.postProcess(n)):typeof n.loc=="undefined"&&(n.
loc={start:n.left.loc.start,end:n.right.loc.end},n=v.postProcess(n)))}return function(){var i,o;return i=ln(),o=n.apply(null,arguments),i.end(),e&&typeof o.range=="undefined"&&i.apply(o),t&&typeof o.loc=="undefined"&&
i.apply(o),r(o)&&s(o),o}}}function pn(){var e;y.comments&&(y.skipComment=M,M=sn);if(y.range||y.loc)e=hn(y.range,y.loc),y.parseBinaryExpression=Et,Et=e(y.parseBinaryExpression);typeof y.tokens!="undefined"&&
(y.advance=W,y.scanRegExp=R,W=un,R=an)}function dn(){typeof y.skipComment=="function"&&(M=y.skipComment);if(y.range||y.loc)Et=y.parseBinaryExpression;typeof y.scanRegExp=="function"&&(W=y.advance,R=y.scanRegExp
)}function vn(e,t){var n,r={};for(n in e)e.hasOwnProperty(n)&&(r[n]=e[n]);for(n in t)t.hasOwnProperty(n)&&(r[n]=t[n]);return r}function mn(e,n){var r,i,s;r=String,typeof e!="string"&&!(e instanceof String
)&&(e=r(e)),v=a,f=e,c=0,h=f.length>0?1:0,p=0,d=f.length,m=null,g={allowIn:!0,labelSet:{},inFunctionBody:!1,inIteration:!1,inSwitch:!1},y={},n=n||{},n.tokens=!0,y.tokens=[],y.tokenize=!0,y.openParenToken=-1
,y.openCurlyToken=-1,y.range=typeof n.range=="boolean"&&n.range,y.loc=typeof n.loc=="boolean"&&n.loc,typeof n.comment=="boolean"&&n.comment&&(y.comments=[]),typeof n.tolerant=="boolean"&&n.tolerant&&(y
.errors=[]),d>0&&typeof f[0]=="undefined"&&e instanceof String&&(f=e.valueOf()),pn();try{V();if(m.type===t.EOF)return y.tokens;i=X();while(m.type!==t.EOF)try{i=X()}catch(o){i=m;if(y.errors){y.errors.push
(o);break}throw o}fn(),s=y.tokens,typeof y.comments!="undefined"&&(on(),s.comments=y.comments),typeof y.errors!="undefined"&&(s.errors=y.errors)}catch(u){throw u}finally{dn(),y={}}return s}function gn(
e,t){var n,r;r=String,typeof e!="string"&&!(e instanceof String)&&(e=r(e)),v=a,f=e,c=0,h=f.length>0?1:0,p=0,d=f.length,m=null,g={allowIn:!0,labelSet:{},inFunctionBody:!1,inIteration:!1,inSwitch:!1},y={
},typeof t!="undefined"&&(y.range=typeof t.range=="boolean"&&t.range,y.loc=typeof t.loc=="boolean"&&t.loc,typeof t.range=="boolean"&&t.range&&(g.rangeStack=[],v=vn(v,{markStart:function(){M(),g.rangeStack
.push(c)}}),v=vn(v,{markEnd:function(e){return e.range=[g.rangeStack.pop(),c],e}})),typeof t.loc=="boolean"&&t.loc&&(g.locStack=[],v=vn(v,{markStart:function(){M(),g.locStack.push({line:h,column:c-p}),
g.rangeStack&&g.rangeStack.push(c)}}),v=vn(v,{markEnd:function(e){return g.rangeStack&&(e.range=[g.rangeStack.pop(),c]),e.loc={},e.loc.start=g.locStack.pop(),e.loc.end={line:h,column:c-p},t.source!==null&&
t.source!==undefined&&(e.loc.source=r(t.source)),e}}),v=vn(v,{markGroupEnd:function(e){return g.rangeStack&&(e.groupRange=[g.rangeStack.pop(),c]),e.groupLoc={},e.groupLoc.start=g.locStack.pop(),e.groupLoc
.end={line:h,column:c-p},t.source!==null&&t.source!==undefined&&(e.groupLoc.source=r(t.source)),e}})),y.loc&&t.source!==null&&t.source!==undefined&&(v=vn(v,{postProcess:function(e){return e.loc.source=
r(t.source),e}})),typeof t.tokens=="boolean"&&t.tokens&&(y.tokens=[]),typeof t.comment=="boolean"&&t.comment&&(y.comments=[]),typeof t.tolerant=="boolean"&&t.tolerant&&(y.errors=[])),d>0&&typeof f[0]=="undefined"&&
e instanceof String&&(f=e.valueOf()),pn();try{n=nn(),typeof y.comments!="undefined"&&(on(),n.comments=y.comments),typeof y.tokens!="undefined"&&(fn(),n.tokens=y.tokens),typeof y.errors!="undefined"&&(n
.errors=y.errors),(y.range||y.loc)&&cn(n.body)}catch(i){throw i}finally{dn(),y={}}return n}var t,n,r,i,s,o,u,a,f,l,c,h,p,d,v,m,g,y;t={BooleanLiteral:1,EOF:2,Identifier:3,Keyword:4,NullLiteral:5,NumericLiteral
:6,Punctuator:7,StringLiteral:8,RegularExpression:9},n={},n[t.BooleanLiteral]="Boolean",n[t.EOF]="<end>",n[t.Identifier]="Identifier",n[t.Keyword]="Keyword",n[t.NullLiteral]="Null",n[t.NumericLiteral]="Numeric"
,n[t.Punctuator]="Punctuator",n[t.StringLiteral]="String",n[t.RegularExpression]="RegularExpression",r=["(","{","[","in","typeof","instanceof","new","return","case","delete","throw","void","=","+=","-="
,"*=","/=","%=","<<=",">>=",">>>=","&=","|=","^=",",","+","-","*","/","%","++","--","<<",">>",">>>","&","|","^","!","~","&&","||","?",":","===","==",">=","<=","<",">","!=","!=="],i={AssignmentExpression
:"AssignmentExpression",ArrayExpression:"ArrayExpression",BlockStatement:"BlockStatement",BinaryExpression:"BinaryExpression",BreakStatement:"BreakStatement",CallExpression:"CallExpression",CatchClause
:"CatchClause",ConditionalExpression:"ConditionalExpression",ContinueStatement:"ContinueStatement",DoWhileStatement:"DoWhileStatement",DebuggerStatement:"DebuggerStatement",EmptyStatement:"EmptyStatement"
,ExpressionStatement:"ExpressionStatement",ForStatement:"ForStatement",ForInStatement:"ForInStatement",FunctionDeclaration:"FunctionDeclaration",FunctionExpression:"FunctionExpression",Identifier:"Identifier"
,IfStatement:"IfStatement",Literal:"Literal",LabeledStatement:"LabeledStatement",LogicalExpression:"LogicalExpression",MemberExpression:"MemberExpression",NewExpression:"NewExpression",ObjectExpression
:"ObjectExpression",Program:"Program",Property:"Property",ReturnStatement:"ReturnStatement",SequenceExpression:"SequenceExpression",SwitchStatement:"SwitchStatement",SwitchCase:"SwitchCase",ThisExpression
:"ThisExpression",ThrowStatement:"ThrowStatement",TryStatement:"TryStatement",UnaryExpression:"UnaryExpression",UpdateExpression:"UpdateExpression",VariableDeclaration:"VariableDeclaration",VariableDeclarator
:"VariableDeclarator",WhileStatement:"WhileStatement",WithStatement:"WithStatement"},s={Data:1,Get:2,Set:4},o={UnexpectedToken:"Unexpected token %0",UnexpectedNumber:"Unexpected number",UnexpectedString
:"Unexpected string",UnexpectedIdentifier:"Unexpected identifier",UnexpectedReserved:"Unexpected reserved word",UnexpectedEOS:"Unexpected end of input",NewlineAfterThrow:"Illegal newline after throw",InvalidRegExp
:"Invalid regular expression",UnterminatedRegExp:"Invalid regular expression: missing /",InvalidLHSInAssignment:"Invalid left-hand side in assignment",InvalidLHSInForIn:"Invalid left-hand side in for-in"
,MultipleDefaultsInSwitch:"More than one default clause in switch statement",NoCatchOrFinally:"Missing catch or finally after try",UnknownLabel:"Undefined label '%0'",Redeclaration:"%0 '%1' has already been declared"
,IllegalContinue:"Illegal continue statement",IllegalBreak:"Illegal break statement",IllegalReturn:"Illegal return statement",StrictModeWith:"Strict mode code may not include a with statement",StrictCatchVariable
:"Catch variable may not be eval or arguments in strict mode",StrictVarName:"Variable name may not be eval or arguments in strict mode",StrictParamName:"Parameter name eval or arguments is not allowed in strict mode"
,StrictParamDupe:"Strict mode function may not have duplicate parameter names",StrictFunctionName:"Function name may not be eval or arguments in strict mode",StrictOctalLiteral:"Octal literals are not allowed in strict mode."
,StrictDelete:"Delete of an unqualified identifier in strict mode.",StrictDuplicateProperty:"Duplicate data property in object literal not allowed in strict mode",AccessorDataProperty:"Object literal may not have data and accessor property with the same name"
,AccessorGetSet:"Object literal may not have multiple get/set accessors with the same name",StrictLHSAssignment:"Assignment to eval or arguments is not allowed in strict mode",StrictLHSPostfix:"Postfix increment/decrement may not have eval or arguments operand in strict mode"
,StrictLHSPrefix:"Prefix increment/decrement may not have eval or arguments operand in strict mode",StrictReservedWord:"Use of future reserved word in strict mode"},u={NonAsciiIdentifierStart:new RegExp
("[\u00aa\u00b5\u00ba\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]"
),NonAsciiIdentifierPart:new RegExp("[\u00aa\u00b5\u00ba\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0300-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u0483-\u0487\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u05d0-\u05ea\u05f0-\u05f2\u0610-\u061a\u0620-\u0669\u066e-\u06d3\u06d5-\u06dc\u06df-\u06e8\u06ea-\u06fc\u06ff\u0710-\u074a\u074d-\u07b1\u07c0-\u07f5\u07fa\u0800-\u082d\u0840-\u085b\u08a0\u08a2-\u08ac\u08e4-\u08fe\u0900-\u0963\u0966-\u096f\u0971-\u0977\u0979-\u097f\u0981-\u0983\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bc-\u09c4\u09c7\u09c8\u09cb-\u09ce\u09d7\u09dc\u09dd\u09df-\u09e3\u09e6-\u09f1\u0a01-\u0a03\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a59-\u0a5c\u0a5e\u0a66-\u0a75\u0a81-\u0a83\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abc-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ad0\u0ae0-\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3c-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b5c\u0b5d\u0b5f-\u0b63\u0b66-\u0b6f\u0b71\u0b82\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd0\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c58\u0c59\u0c60-\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbc-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0cde\u0ce0-\u0ce3\u0ce6-\u0cef\u0cf1\u0cf2\u0d02\u0d03\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d-\u0d44\u0d46-\u0d48\u0d4a-\u0d4e\u0d57\u0d60-\u0d63\u0d66-\u0d6f\u0d7a-\u0d7f\u0d82\u0d83\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e01-\u0e3a\u0e40-\u0e4e\u0e50-\u0e59\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb9\u0ebb-\u0ebd\u0ec0-\u0ec4\u0ec6\u0ec8-\u0ecd\u0ed0-\u0ed9\u0edc-\u0edf\u0f00\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e-\u0f47\u0f49-\u0f6c\u0f71-\u0f84\u0f86-\u0f97\u0f99-\u0fbc\u0fc6\u1000-\u1049\u1050-\u109d\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u135d-\u135f\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176c\u176e-\u1770\u1772\u1773\u1780-\u17d3\u17d7\u17dc\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u1820-\u1877\u1880-\u18aa\u18b0-\u18f5\u1900-\u191c\u1920-\u192b\u1930-\u193b\u1946-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u19d0-\u19d9\u1a00-\u1a1b\u1a20-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1aa7\u1b00-\u1b4b\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1bf3\u1c00-\u1c37\u1c40-\u1c49\u1c4d-\u1c7d\u1cd0-\u1cd2\u1cd4-\u1cf6\u1d00-\u1de6\u1dfc-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u200c\u200d\u203f\u2040\u2054\u2071\u207f\u2090-\u209c\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d7f-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2de0-\u2dff\u2e2f\u3005-\u3007\u3021-\u302f\u3031-\u3035\u3038-\u303c\u3041-\u3096\u3099\u309a\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua62b\ua640-\ua66f\ua674-\ua67d\ua67f-\ua697\ua69f-\ua6f1\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua827\ua840-\ua873\ua880-\ua8c4\ua8d0-\ua8d9\ua8e0-\ua8f7\ua8fb\ua900-\ua92d\ua930-\ua953\ua960-\ua97c\ua980-\ua9c0\ua9cf-\ua9d9\uaa00-\uaa36\uaa40-\uaa4d\uaa50-\uaa59\uaa60-\uaa76\uaa7a\uaa7b\uaa80-\uaac2\uaadb-\uaadd\uaae0-\uaaef\uaaf2-\uaaf6\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabea\uabec\uabed\uabf0-\uabf9\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\ufe70-\ufe74\ufe76-\ufefc\uff10-\uff19\uff21-\uff3a\uff3f\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]"
)},a={name:"SyntaxTree",markStart:function(){},markEnd:function(e){return e},markGroupEnd:function(e){return e},postProcess:function(e){return e},createArrayExpression:function(e){return{type:i.ArrayExpression
,elements:e}},createAssignmentExpression:function(e,t,n){return{type:i.AssignmentExpression,operator:e,left:t,right:n}},createBinaryExpression:function(e,t,n){var r=e==="||"||e==="&&"?i.LogicalExpression
:i.BinaryExpression;return{type:r,operator:e,left:t,right:n}},createBlockStatement:function(e){return{type:i.BlockStatement,body:e}},createBreakStatement:function(e){return{type:i.BreakStatement,label:
e}},createCallExpression:function(e,t){return{type:i.CallExpression,callee:e,arguments:t}},createCatchClause:function(e,t){return{type:i.CatchClause,param:e,body:t}},createConditionalExpression:function(
e,t,n){return{type:i.ConditionalExpression,test:e,consequent:t,alternate:n}},createContinueStatement:function(e){return{type:i.ContinueStatement,label:e}},createDebuggerStatement:function(){return{type
:i.DebuggerStatement}},createDoWhileStatement:function(e,t){return{type:i.DoWhileStatement,body:e,test:t}},createEmptyStatement:function(){return{type:i.EmptyStatement}},createExpressionStatement:function(
e){return{type:i.ExpressionStatement,expression:e}},createForStatement:function(e,t,n,r){return{type:i.ForStatement,init:e,test:t,update:n,body:r}},createForInStatement:function(e,t,n){return{type:i.ForInStatement
,left:e,right:t,body:n,each:!1}},createFunctionDeclaration:function(e,t,n,r){return{type:i.FunctionDeclaration,id:e,params:t,defaults:n,body:r,rest:null,generator:!1,expression:!1}},createFunctionExpression
:function(e,t,n,r){return{type:i.FunctionExpression,id:e,params:t,defaults:n,body:r,rest:null,generator:!1,expression:!1}},createIdentifier:function(e){return{type:i.Identifier,name:e}},createIfStatement
:function(e,t,n){return{type:i.IfStatement,test:e,consequent:t,alternate:n}},createLabeledStatement:function(e,t){return{type:i.LabeledStatement,label:e,body:t}},createLiteral:function(e){return{type:i
.Literal,value:e.value,raw:f.slice(e.range[0],e.range[1])}},createMemberExpression:function(e,t,n){return{type:i.MemberExpression,computed:e==="[",object:t,property:n}},createNewExpression:function(e,t
){return{type:i.NewExpression,callee:e,arguments:t}},createObjectExpression:function(e){return{type:i.ObjectExpression,properties:e}},createPostfixExpression:function(e,t){return{type:i.UpdateExpression
,operator:e,argument:t,prefix:!1}},createProgram:function(e){return{type:i.Program,body:e}},createProperty:function(e,t,n){return{type:i.Property,key:t,value:n,kind:e}},createReturnStatement:function(e
){return{type:i.ReturnStatement,argument:e}},createSequenceExpression:function(e){return{type:i.SequenceExpression,expressions:e}},createSwitchCase:function(e,t){return{type:i.SwitchCase,test:e,consequent
:t}},createSwitchStatement:function(e,t){return{type:i.SwitchStatement,discriminant:e,cases:t}},createThisExpression:function(){return{type:i.ThisExpression}},createThrowStatement:function(e){return{type
:i.ThrowStatement,argument:e}},createTryStatement:function(e,t,n,r){return{type:i.TryStatement,block:e,guardedHandlers:t,handlers:n,finalizer:r}},createUnaryExpression:function(e,t){return e==="++"||e==="--"?
{type:i.UpdateExpression,operator:e,argument:t,prefix:!0}:{type:i.UnaryExpression,operator:e,argument:t}},createVariableDeclaration:function(e,t){return{type:i.VariableDeclaration,declarations:e,kind:t
}},createVariableDeclarator:function(e,t){return{type:i.VariableDeclarator,id:e,init:t}},createWhileStatement:function(e,t){return{type:i.WhileStatement,test:e,body:t}},createWithStatement:function(e,t
){return{type:i.WithStatement,object:e,body:t}}},e.version="1.1.0-dev",e.tokenize=mn,e.parse=gn,e.Syntax=function(){var e,t={};typeof Object.create=="function"&&(t=Object.create(null));for(e in i)i.hasOwnProperty
(e)&&(t[e]=i[e]);return typeof Object.freeze=="function"&&Object.freeze(t),t}()});
/* END INSERT */

realExports.esprima = exports;
var esprima = exports;
/* Includes a minified jshint: http://www.jshint.com/ */
// Avoid clobber:
exports = {};

/* INSERT jshint.js */
var _=require("underscore"),events=require("events"),vars=require("../shared/vars.js"),messages=require("../shared/messages.js"),Lexer=require("./lex.js").Lexer,reg=require("./reg.js"),state=require("./state.js"
).state,style=require("./style.js"),console=require("console-browserify"),JSHINT=function(){"use strict";function O(e,t){e=e.trim();if(/^[+-]W\d{3}$/g.test(e))return!0;if(i[e]===undefined&&r[e]===undefined
)if(t.type!=="jslint"||o[e]===undefined)return z("E001",t,e),!1;return!0}function M(e){return Object.prototype.toString.call(e)==="[object String]"}function D(e,t){return e?!e.identifier||e.value!==t?!1
:!0:!1}function P(e){if(!e.reserved)return!1;if(e.meta&&e.meta.isFutureReservedWord){if(state.option.inES5(!0)&&!e.meta.es5)return!1;if(e.meta.strictOnly&&!state.option.strict&&!state.directive["use strict"
])return!1;if(e.isProperty)return!1}return!0}function H(e,t){return e.replace(/\{([^{}]*)\}/g,function(e,n){var r=t[n];return typeof r=="string"||typeof r=="number"?r:e})}function B(e,t){var n;for(n in 
t)_.has(t,n)&&!_.has(JSHINT.blacklist,n)&&(e[n]=t[n])}function j(){Object.keys(JSHINT.blacklist).forEach(function(e){delete S[e]})}function F(){state.option.es5&&R("I003"),state.option.couch&&B(S,vars.
couch),state.option.rhino&&B(S,vars.rhino),state.option.phantom&&B(S,vars.phantom),state.option.prototypejs&&B(S,vars.prototypejs),state.option.node&&B(S,vars.node),state.option.devel&&B(S,vars.devel),
state.option.dojo&&B(S,vars.dojo),state.option.browser&&B(S,vars.browser),state.option.nonstandard&&B(S,vars.nonstandard),state.option.jquery&&B(S,vars.jquery),state.option.mootools&&B(S,vars.mootools)
,state.option.worker&&B(S,vars.worker),state.option.wsh&&B(S,vars.wsh),state.option.globalstrict&&state.option.strict!==!1&&(state.option.strict=!0),state.option.yui&&B(S,vars.yui),state.option.inMoz=function(
e){return e?state.option.moz&&!state.option.esnext:state.option.moz},state.option.inESNext=function(e){return e?!state.option.moz&&state.option.esnext:state.option.moz||state.option.esnext},state.option
.inES5=function(e){return e?!state.option.moz&&!state.option.esnext&&!state.option.es3:!state.option.es3},state.option.inES3=function(e){return e?!state.option.moz&&!state.option.esnext&&state.option.es3
:state.option.es3}}function I(e,t,n){var r=Math.floor(t/state.lines.length*100),i=messages.errors[e].desc;throw{name:"JSHintError",line:t,character:n,message:i+" ("+r+"% scanned).",raw:i}}function q(e,
t,n,r){return JSHINT.undefs.push([e,t,n,r])}function R(e,t,n,r,i,s){var o,u,a,f;if(/^W\d{3}$/.test(e)){if(p[e])return;f=messages.warnings[e]}else/E\d{3}/.test(e)?f=messages.errors[e]:/I\d{3}/.test(e)&&
(f=messages.info[e]);return t=t||state.tokens.next,t.id==="(end)"&&(t=state.tokens.curr),u=t.line||0,o=t.from||0,a={id:"(error)",raw:f.desc,code:f.code,evidence:state.lines[u-1]||"",line:u,character:o,
scope:JSHINT.scope,a:n,b:r,c:i,d:s},a.reason=H(f.desc,a),JSHINT.errors.push(a),state.option.passfail&&I("E042",u,o),k+=1,k>=state.option.maxerr&&I("E043",u,o),a}function U(e,t,n,r,i,s,o){return R(e,{line
:t,from:n},r,i,s,o)}function z(e,t,n,r,i,s){R(e,t,n,r,i,s)}function W(e,t,n,r,i,s,o){return z(e,{line:t,from:n},r,i,s,o)}function X(e,t){var n;return n={id:"(internal)",elem:e,value:t},JSHINT.internals
.push(n),n}function V(e,t,n,r){t==="exception"&&_.has(l["(context)"],e)&&l[e]!==!0&&!state.option.node&&R("W002",state.tokens.next,e),_.has(l,e)&&!l["(global)"]&&(l[e]===!0?state.option.latedef&&(state
.option.latedef===!0&&_.contains([l[e],t],"unction")||!_.contains([l[e],t],"unction"))&&R("W003",state.tokens.next,e):(!state.option.shadow&&t!=="exception"||l["(blockscope)"].getlabel(e))&&R("W004",state
.tokens.next,e)),l["(blockscope)"]&&l["(blockscope)"].current.has(e)&&z("E044",state.tokens.next,e),r?l["(blockscope)"].current.add(e,t,state.tokens.curr):(l[e]=t,n&&(l["(tokens)"][e]=n),l["(global)"]?
(h[e]=l,_.has(d,e)&&(state.option.latedef&&(state.option.latedef===!0&&_.contains([l[e],t],"unction")||!_.contains([l[e],t],"unction"))&&R("W003",state.tokens.next,e),delete d[e])):x[e]=l)}function $()
{var e=state.tokens.next,t=e.body.split(",").map(function(e){return e.trim()}),n={};if(e.type==="globals"){t.forEach(function(e){e=e.split(":");var t=e[0],r=e[1];t.charAt(0)==="-"?(t=t.slice(1),r=!1,JSHINT
.blacklist[t]=t,j()):n[t]=r==="true"}),B(S,n);for(var r in n)_.has(n,r)&&(u[r]=e)}e.type==="exported"&&t.forEach(function(e){a[e]=!0}),e.type==="members"&&(w=w||{},t.forEach(function(e){var t=e.charAt(0
),n=e.charAt(e.length-1);t===n&&(t==='"'||t==="'")&&(e=e.substr(1,e.length-2).replace("\\b","\b").replace("\\t","	").replace("\\n","\n").replace("\\v","").replace("\\f","\f").replace("\\r","\r").replace
("\\\\","\\").replace('\\"','"')),w[e]=!1}));var i=["maxstatements","maxparams","maxdepth","maxcomplexity","maxerr","maxlen","indent"];if(e.type==="jshint"||e.type==="jslint")t.forEach(function(t){t=t.
split(":");var n=(t[0]||"").trim(),r=(t[1]||"").trim();if(!O(n,e))return;if(i.indexOf(n)>=0){r=+r;if(typeof r!="number"||!isFinite(r)||r<=0||Math.floor(r)!==r){z("E032",e,t[1].trim());return}n==="indent"&&
(state.option["(explicitIndent)"]=!0),state.option[n]=r;return}if(n==="validthis"){l["(global)"]?z("E009"):r==="true"||r==="false"?state.option.validthis=r==="true":z("E002",e);return}if(n==="quotmark"
){switch(r){case"true":case"false":state.option.quotmark=r==="true";break;case"double":case"single":state.option.quotmark=r;break;default:z("E002",e)}return}if(n==="unused"){switch(r){case"true":state.
option.unused=!0;break;case"false":state.option.unused=!1;break;case"vars":case"strict":state.option.unused=r;break;default:z("E002",e)}return}if(n==="latedef"){switch(r){case"true":state.option.latedef=!0
;break;case"false":state.option.latedef=!1;break;case"nofunc":state.option.latedef="nofunc";break;default:z("E002",e)}return}var u=/^([+-])(W\d{3})$/g.exec(n);if(u){p[u[2]]=u[1]==="-";return}var a;if(r==="true"||
r==="false"){e.type==="jslint"?(a=o[n]||n,state.option[a]=r==="true",s[a]!==undefined&&(state.option[a]=!state.option[a])):state.option[n]=r==="true",n==="newcap"&&(state.option["(explicitNewcap)"]=!0)
;return}z("E002",e)}),F()}function J(e){var t=e||0,n=0,r;while(n<=t)r=g[n],r||(r=g[n]=y.token()),n+=1;return r}function K(t,n){switch(state.tokens.curr.id){case"(number)":state.tokens.next.id==="."&&R("W005"
,state.tokens.curr);break;case"-":(state.tokens.next.id==="-"||state.tokens.next.id==="--")&&R("W006");break;case"+":(state.tokens.next.id==="+"||state.tokens.next.id==="++")&&R("W007")}if(state.tokens
.curr.type==="(string)"||state.tokens.curr.identifier)e=state.tokens.curr.value;t&&state.tokens.next.id!==t&&(n?state.tokens.next.id==="(end)"?z("E019",n,n.id):z("E020",state.tokens.next,t,n.id,n.line,
state.tokens.next.value):(state.tokens.next.type!=="(identifier)"||state.tokens.next.value!==t)&&R("W116",state.tokens.next,t,state.tokens.next.value)),state.tokens.prev=state.tokens.curr,state.tokens.
curr=state.tokens.next;for(;;){state.tokens.next=g.shift()||y.token(),state.tokens.next||I("E041",state.tokens.curr.line);if(state.tokens.next.id==="(end)"||state.tokens.next.id==="(error)")return;state
.tokens.next.check&&state.tokens.next.check();if(state.tokens.next.isSpecial)$();else if(state.tokens.next.id!=="(endline)")break}}function Q(t,n){var r,i=!1,s=!1,o=!1;!n&&state.tokens.next.value==="let"&&
J(0).value==="("&&(state.option.inMoz(!0)||R("W118",state.tokens.next,"let expressions"),o=!0,l["(blockscope)"].stack(),K("let"),K("("),state.syntax.let.fud.call(state.syntax.let.fud,!1),K(")")),state.
tokens.next.id==="(end)"&&z("E006",state.tokens.curr),K(),n&&(e="anonymous",l["(verb)"]=state.tokens.curr.value);if(n===!0&&state.tokens.curr.fud)r=state.tokens.curr.fud();else{state.tokens.curr.nud?r=
state.tokens.curr.nud():z("E030",state.tokens.curr,state.tokens.curr.id);var u=state.tokens.next.identifier&&!state.tokens.curr.led&&state.tokens.curr.line!==state.tokens.next.line;while(t<state.tokens
.next.lbp&&!u)i=state.tokens.curr.value==="Array",s=state.tokens.curr.value==="Object",r&&(r.value||r.first&&r.first.value)&&(r.value!=="new"||r.first&&r.first.value&&r.first.value===".")&&(i=!1,r.value!==
state.tokens.curr.value&&(s=!1)),K(),i&&state.tokens.curr.id==="("&&state.tokens.next.id===")"&&R("W009",state.tokens.curr),s&&state.tokens.curr.id==="("&&state.tokens.next.id===")"&&R("W010",state.tokens
.curr),r&&state.tokens.curr.led?r=state.tokens.curr.led(r):z("E033",state.tokens.curr,state.tokens.curr.id)}return o&&l["(blockscope)"].unstack(),r}function G(e,t){e=e||state.tokens.curr,t=t||state.tokens
.next,state.option.white&&e.character!==t.from&&e.line===t.line&&(e.from+=e.character-e.from,R("W011",e,e.value))}function Y(e,t){e=e||state.tokens.curr,t=t||state.tokens.next,state.option.white&&(e.character!==
t.from||e.line!==t.line)&&R("W012",t,t.value)}function Z(e,t){e=e||state.tokens.curr,t=t||state.tokens.next,state.option.white&&!e.comment&&e.line===t.line&&G(e,t)}function et(e,t){if(state.option.white
){e=e||state.tokens.curr,t=t||state.tokens.next;if(e.value===";"&&t.value===";")return;e.line===t.line&&e.character===t.from&&(e.from+=e.character-e.from,R("W013",e,e.value))}}function tt(e,t){e=e||state
.tokens.curr,t=t||state.tokens.next,!state.option.laxbreak&&e.line!==t.line?R("W014",t,t.id):state.option.white&&(e=e||state.tokens.curr,t=t||state.tokens.next,e.character===t.from&&(e.from+=e.character-
e.from,R("W013",e,e.value)))}function nt(e){if(!state.option.white&&!state.option["(explicitIndent)"])return;if(state.tokens.next.id==="(end)")return;var t=m+(e||0);state.tokens.next.from!==t&&R("W015"
,state.tokens.next,state.tokens.next.value,t,state.tokens.next.from)}function rt(e){e=e||state.tokens.curr,e.line!==state.tokens.next.line&&R("E022",e,e.value)}function it(e){e=e||{},state.tokens.curr.
line!==state.tokens.next.line?state.option.laxcomma||(it.first&&(R("I001"),it.first=!1),R("W014",state.tokens.curr,state.tokens.next.id)):!state.tokens.curr.comment&&state.tokens.curr.character!==state
.tokens.next.from&&state.option.white&&(state.tokens.curr.from+=state.tokens.curr.character-state.tokens.curr.from,R("W011",state.tokens.curr,state.tokens.curr.value)),K(","),state.tokens.next.value!=="]"&&
state.tokens.next.value!=="}"&&et(state.tokens.curr,state.tokens.next);if(state.tokens.next.identifier&&!state.option.inES5())switch(state.tokens.next.value){case"break":case"case":case"catch":case"continue"
:case"default":case"do":case"else":case"finally":case"for":case"if":case"in":case"instanceof":case"return":case"yield":case"switch":case"throw":case"try":case"var":case"let":case"while":case"with":z("E024"
,state.tokens.next,state.tokens.next.value);return}if(state.tokens.next.type==="(punctuator)")switch(state.tokens.next.value){case"}":case"]":case",":if(e.allowTrailing)return;case")":z("E024",state.tokens
.next,state.tokens.next.value)}}function st(e,t){var n=state.syntax[e];if(!n||typeof n!="object")state.syntax[e]=n={id:e,lbp:t,value:e};return n}function ot(e){return st(e,0)}function ut(e,t){var n=ot(
e);return n.identifier=n.reserved=!0,n.fud=t,n}function at(e,t){var n=ut(e,t);return n.block=!0,n}function ft(e){var t=e.id.charAt(0);if(t>="a"&&t<="z"||t>="A"&&t<="Z")e.identifier=e.reserved=!0;return e
}function lt(e,t){var n=st(e,150);return ft(n),n.nud=typeof t=="function"?t:function(){this.right=Q(150),this.arity="unary";if(this.id==="++"||this.id==="--")state.option.plusplus?R("W016",this,this.id
):(!this.right.identifier||P(this.right))&&this.right.id!=="."&&this.right.id!=="["&&R("W017",this);return this},n}function ct(e,t){var n=ot(e);return n.type=e,n.nud=t,n}function ht(e,t){var n=ct(e,t);
return n.identifier=!0,n.reserved=!0,n}function pt(e,t){var n=ct(e,function(){return this});return t=t||{},t.isFutureReservedWord=!0,n.value=e,n.identifier=!0,n.reserved=!0,n.meta=t,n}function dt(e,t){
return ht(e,function(){return typeof t=="function"&&t(this),this})}function vt(e,t,n,r){var i=st(e,n);return ft(i),i.led=function(i){return r||(tt(state.tokens.prev,state.tokens.curr),et(state.tokens.curr
,state.tokens.next)),e==="in"&&i.id==="!"&&R("W018",i,"!"),typeof t=="function"?t(i,this):(this.left=i,this.right=Q(n),this)},i}function mt(e){var t=st(e,42);return t.led=function(e){return state.option
.inESNext()||R("W104",state.tokens.curr,"arrow function syntax (=>)"),tt(state.tokens.prev,state.tokens.curr),et(state.tokens.curr,state.tokens.next),this.left=e,this.right=Ht(undefined,undefined,!1,e)
,this},t}function gt(e,t){var n=st(e,100);return n.led=function(e){tt(state.tokens.prev,state.tokens.curr),et(state.tokens.curr,state.tokens.next);var n=Q(100);return D(e,"NaN")||D(n,"NaN")?R("W019",this
):t&&t.apply(this,[e,n]),(!e||!n)&&I("E041",state.tokens.curr.line),e.id==="!"&&R("W018",e,"!"),n.id==="!"&&R("W018",n,"!"),this.left=e,this.right=n,this},n}function yt(e){return e&&(e.type==="(number)"&&+
e.value===0||e.type==="(string)"&&e.value===""||e.type==="null"&&!state.option.eqnull||e.type==="true"||e.type==="false"||e.type==="undefined")}function bt(e){return st(e,20).exps=!0,vt(e,function(e,t)
{t.left=e;if(e){S[e.value]===!1&&x[e.value]["(global)"]===!0?R("W020",e):e["function"]&&R("W021",e,e.value),l[e.value]==="const"&&z("E013",e,e.value);if(e.id===".")return e.left?e.left.value==="arguments"&&!
state.directive["use strict"]&&R("E031",t):R("E031",t),t.right=Q(19),t;if(e.id==="[")return state.tokens.curr.left.first?state.tokens.curr.left.first.forEach(function(e){l[e.value]==="const"&&z("E013",
e,e.value)}):e.left?e.left.value==="arguments"&&!state.directive["use strict"]&&R("E031",t):R("E031",t),t.right=Q(19),t;if(e.identifier&&!P(e))return l[e.value]==="exception"&&R("W022",e),t.right=Q(19)
,t;e===state.syntax["function"]&&R("W023",state.tokens.curr)}z("E031",t)},20)}function wt(e,t,n){var r=st(e,n);return ft(r),r.led=typeof t=="function"?t:function(e){return state.option.bitwise&&R("W016"
,this,this.id),this.left=e,this.right=Q(n),this},r}function Et(e){return st(e,20).exps=!0,vt(e,function(e,t){state.option.bitwise&&R("W016",t,t.id),et(state.tokens.prev,state.tokens.curr),et(state.tokens
.curr,state.tokens.next);if(e)return e.id==="."||e.id==="["||e.identifier&&!P(e)?(Q(19),t):(e===state.syntax["function"]&&R("W023",state.tokens.curr),t);z("E031",t)},20)}function St(e){var t=st(e,150);
return t.led=function(e){return state.option.plusplus?R("W016",this,this.id):(!e.identifier||P(e))&&e.id!=="."&&e.id!=="["&&R("W017",this),this.left=e,this},t}function xt(e,n){if(!state.tokens.next.identifier
)return;K();var r=state.tokens.curr,i=r.meta||{},s=state.tokens.curr.value;if(!P(r))return s;if(n)if(state.option.inES5()||i.isFutureReservedWord)return s;return e&&s==="undefined"?s:(n&&!t.getCache("displayed:I002"
)&&(t.setCache("displayed:I002",!0),R("I002")),R("W024",state.tokens.curr,state.tokens.curr.id),s)}function Tt(e,t){var n=xt(e,t);if(n)return n;state.tokens.curr.id==="function"&&state.tokens.next.id==="("?
R("W025"):z("E030",state.tokens.next,state.tokens.next.value)}function Nt(e){var t=0,n;if(state.tokens.next.id!==";"||E)return;for(;;){n=J(t);if(n.reach)return;if(n.id!=="(endline)"){if(n.id==="function"
){if(!state.option.latedef)break;R("W026",n);break}R("W027",n,n.value,e);break}t+=1}}function Ct(e){var t,n=m,r,i=x,s=state.tokens.next;if(s.id===";"){K(";");return}var o=P(s);o&&s.meta&&s.meta.isFutureReservedWord&&
(R("W024",s,s.id),o=!1);if(_.has(["[","{"],s.value)&&Wt().isDestAssign){state.option.inESNext()||R("W104",state.tokens.curr,"destructuring expression"),t=It(),t.forEach(function(e){q(l,"W117",e.token,e
.id)}),K("="),qt(t,Q(0,!0)),K(";");return}s.identifier&&!o&&J().id===":"&&(K(),K(":"),x=Object.create(i),V(s.value,"label"),!state.tokens.next.labelled&&state.tokens.next.value!=="{"&&R("W028",state.tokens
.next,s.value,state.tokens.next.value),reg.javascriptURL.test(s.value+":")&&R("W029",s,s.value),state.tokens.next.label=s.value,s=state.tokens.next);if(s.id==="{"){At(!0,!0);return}e||nt(),r=Q(0,!0);if(!
s.block){!state.option.expr&&(!r||!r.exps)?R("W030",state.tokens.curr):state.option.nonew&&r&&r.left&&r.id==="("&&r.left.id==="new"&&R("W031",s);if(state.tokens.next.id===",")return it();state.tokens.next
.id!==";"?state.option.asi||(!state.option.lastsemic||state.tokens.next.id!=="}"||state.tokens.next.line!==state.tokens.curr.line)&&U("W033",state.tokens.curr.line,state.tokens.curr.character):(G(state
.tokens.curr,state.tokens.next),K(";"),et(state.tokens.curr,state.tokens.next))}return m=n,x=i,r}function kt(e){var t=[],n;while(!state.tokens.next.reach&&state.tokens.next.id!=="(end)")state.tokens.next
.id===";"?(n=J(),(!n||n.id!=="("&&n.id!=="[")&&R("W032"),K(";")):t.push(Ct(e===state.tokens.next.line));return t}function Lt(){var e,t,n;for(;;){if(state.tokens.next.id==="(string)"){t=J(0);if(t.id==="(endline)"
){e=1;do n=J(e),e+=1;while(n.id==="(endline)");if(n.id!==";"){if(n.id!=="(string)"&&n.id!=="(number)"&&n.id!=="(regexp)"&&n.identifier!==!0&&n.id!=="}")break;R("W033",state.tokens.next)}else t=n}else if(
t.id==="}")R("W033",t);else if(t.id!==";")break;nt(),K(),state.directive[state.tokens.curr.value]&&R("W034",state.tokens.curr,state.tokens.curr.value),state.tokens.curr.value==="use strict"&&(state.option
["(explicitNewcap)"]||(state.option.newcap=!0),state.option.undef=!0),state.directive[state.tokens.curr.value]=!0,t.id===";"&&K(";");continue}break}}function At(e,t,n,r){var i,s=v,o=m,u,a=x,f,c,h;v=e;if(!
e||!state.option.funcscope)x=Object.create(x);et(state.tokens.curr,state.tokens.next),f=state.tokens.next;var p=l["(metrics)"];p.nestedBlockDepth+=1,p.verifyMaxNestedBlockDepthPerFunction();if(state.tokens
.next.id==="{"){K("{"),l["(blockscope)"].stack(),c=state.tokens.curr.line;if(state.tokens.next.id!=="}"){m+=state.option.indent;while(!e&&state.tokens.next.from>m)m+=state.option.indent;if(n){u={};for(
h in state.directive)_.has(state.directive,h)&&(u[h]=state.directive[h]);Lt(),state.option.strict&&l["(context)"]["(global)"]&&!u["use strict"]&&!state.directive["use strict"]&&R("E007")}i=kt(c),p.statementCount+=
i.length,n&&(state.directive=u),m-=state.option.indent,c!==state.tokens.next.line&&nt()}else c!==state.tokens.next.line&&nt();K("}",f),l["(blockscope)"].unstack(),m=o}else if(!e)if(n){t&&!r&&!state.option
.inMoz(!0)&&z("W118",state.tokens.curr,"function closure expressions");if(!t){u={};for(h in state.directive)_.has(state.directive,h)&&(u[h]=state.directive[h])}Q(0),state.option.strict&&l["(context)"]["(global)"
]&&!u["use strict"]&&!state.directive["use strict"]&&R("E007")}else z("E021",state.tokens.next,"{",state.tokens.next.value);else l["(nolet)"]=!0,(!t||state.option.curly)&&R("W116",state.tokens.next,"{"
,state.tokens.next.value),E=!0,m+=state.option.indent,i=[Ct(state.tokens.next.line===state.tokens.curr.line)],m-=state.option.indent,E=!1,delete l["(nolet)"];l["(verb)"]=null;if(!e||!state.option.funcscope
)x=a;return v=s,e&&state.option.noempty&&(!i||i.length===0)&&R("W035"),p.nestedBlockDepth-=1,i}function Ot(e){w&&typeof w[e]!="boolean"&&R("W036",state.tokens.curr,e),typeof b[e]=="number"?b[e]+=1:b[e]=1
}function Mt(e){var t=e.value,n=e.line,r=d[t];typeof r=="function"&&(r=!1),r?r[r.length-1]!==n&&r.push(n):(r=[n],d[t]=r)}function _t(){var e={};return e.exps=!0,l["(comparray)"].stack(),e.right=Q(0),K("for"
),state.tokens.next.value==="each"&&(K("each"),state.option.inMoz(!0)||R("W118",state.tokens.curr,"for each")),K("("),l["(comparray)"].setState("define"),e.left=Q(0),K(")"),state.tokens.next.value==="if"&&
(K("if"),K("("),l["(comparray)"].setState("filter"),e.filter=Q(0),K(")")),K("]"),l["(comparray)"].unstack(),e}function Dt(){var e=xt(!1,!0);return e||(state.tokens.next.id==="(string)"?(e=state.tokens.
next.value,K()):state.tokens.next.id==="(number)"&&(e=state.tokens.next.value.toString(),K())),e==="hasOwnProperty"&&R("W001"),e}function Pt(e){var t,n,r=[],i,s=[],o;if(e){if(e instanceof Array){for(var u in 
e){t=e[u];if(_.contains(["{","["],t.id))for(o in t.left)o=s[o],o.id&&(r.push(o.id),V(o.id,"unused",o.token));else{if(t.value==="..."){state.option.inESNext()||R("W104",t,"spread/rest operator");continue}
V(t.value,"unused",t)}}return r}if(e.identifier===!0)return V(e.value,"unused",e),[e]}n=state.tokens.next,K("("),Z();if(state.tokens.next.id===")"){K(")");return}for(;;){if(_.contains(["{","["],state.tokens
.next.id)){s=It();for(o in s)o=s[o],o.id&&(r.push(o.id),V(o.id,"unused",o.token))}else state.tokens.next.value==="..."?(state.option.inESNext()||R("W104",state.tokens.next,"spread/rest operator"),K("..."
),Z(),i=Tt(!0),r.push(i),V(i,"unused",state.tokens.curr)):(i=Tt(!0),r.push(i),V(i,"unused",state.tokens.curr));if(state.tokens.next.id!==",")return K(")",n),Z(state.tokens.prev,state.tokens.curr),r;it(
)}}function Ht(t,n,r,i){var s,o=state.option,u=x;return state.option=Object.create(state.option),x=Object.create(x),l={"(name)":t||'"'+e+'"',"(line)":state.tokens.next.line,"(character)":state.tokens.next
.character,"(context)":l,"(breakage)":0,"(loopage)":0,"(metrics)":Bt(state.tokens.next),"(scope)":x,"(statement)":n,"(tokens)":{},"(blockscope)":l["(blockscope)"],"(comparray)":l["(comparray)"]},r&&(l["(generator)"
]=!0),s=l,state.tokens.curr.funct=l,c.push(l),t&&V(t,"function"),l["(params)"]=Pt(i),l["(metrics)"].verifyMaxParametersPerFunction(l["(params)"]),At(!1,!0,!0,i?!0:!1),r&&l["(generator)"]!=="yielded"&&z
("E047",state.tokens.curr),l["(metrics)"].verifyMaxStatementsPerFunction(),l["(metrics)"].verifyMaxComplexityPerFunction(),l["(unusedOption)"]=state.option.unused,x=u,state.option=o,l["(last)"]=state.tokens
.curr.line,l["(lastcharacter)"]=state.tokens.curr.character,l=l["(context)"],s}function Bt(e){return{statementCount:0,nestedBlockDepth:-1,ComplexityCount:1,verifyMaxStatementsPerFunction:function(){state
.option.maxstatements&&this.statementCount>state.option.maxstatements&&R("W071",e,this.statementCount)},verifyMaxParametersPerFunction:function(t){t=t||[],state.option.maxparams&&t.length>state.option.
maxparams&&R("W072",e,t.length)},verifyMaxNestedBlockDepthPerFunction:function(){state.option.maxdepth&&this.nestedBlockDepth>0&&this.nestedBlockDepth===state.option.maxdepth+1&&R("W073",null,this.nestedBlockDepth
)},verifyMaxComplexityPerFunction:function(){var t=state.option.maxcomplexity,n=this.ComplexityCount;t&&n>t&&R("W074",e,n)}}}function jt(){l["(metrics)"].ComplexityCount+=1}function Ft(){switch(state.tokens
.next.id){case"=":case"+=":case"-=":case"*=":case"%=":case"&=":case"|=":case"^=":case"/=":state.option.boss||R("W084"),K(state.tokens.next.id),Q(20)}}function It(){var e,t,n=[];state.option.inESNext()||
R("W104",state.tokens.curr,"destructuring expression");var r=function(){var e;if(_.contains(["[","{"],state.tokens.next.value)){t=It();for(var r in t)r=t[r],n.push({id:r.id,token:r.token})}else state.tokens
.next.value===","?n.push({id:null,token:state.tokens.curr}):(e=Tt(),e&&n.push({id:e,token:state.tokens.curr}))};if(state.tokens.next.value==="["){K("["),r();while(state.tokens.next.value!=="]")K(","),r
();K("]")}else if(state.tokens.next.value==="{"){K("{"),e=Tt(),state.tokens.next.value===":"?(K(":"),r()):n.push({id:e,token:state.tokens.curr});while(state.tokens.next.value!=="}")K(","),e=Tt(),state.
tokens.next.value===":"?(K(":"),r()):n.push({id:e,token:state.tokens.curr});K("}")}return n}function qt(e,t){t.first&&_.zip(e,t.first).forEach(function(e){var t=e[0],n=e[1];t&&n?t.first=n:t&&t.first&&!
n&&R("W080",t.first,t.first.value)})}function Xt(){var e=Wt();e.notJson?(!state.option.inESNext()&&e.isDestAssign&&R("W104",state.tokens.curr,"destructuring assignment"),kt()):(state.option.laxbreak=!0
,state.jsonMode=!0,$t())}function $t(){function e(){var e={},t=state.tokens.next;K("{");if(state.tokens.next.id!=="}")for(;;){if(state.tokens.next.id==="(end)")z("E026",state.tokens.next,t.line);else{if(
state.tokens.next.id==="}"){R("W094",state.tokens.curr);break}state.tokens.next.id===","?z("E028",state.tokens.next):state.tokens.next.id!=="(string)"&&R("W095",state.tokens.next,state.tokens.next.value
)}e[state.tokens.next.value]===!0?R("W075",state.tokens.next,state.tokens.next.value):state.tokens.next.value==="__proto__"&&!state.option.proto||state.tokens.next.value==="__iterator__"&&!state.option
.iterator?R("W096",state.tokens.next,state.tokens.next.value):e[state.tokens.next.value]=!0,K(),K(":"),$t();if(state.tokens.next.id!==",")break;K(",")}K("}")}function t(){var e=state.tokens.next;K("[")
;if(state.tokens.next.id!=="]")for(;;){if(state.tokens.next.id==="(end)")z("E027",state.tokens.next,e.line);else{if(state.tokens.next.id==="]"){R("W094",state.tokens.curr);break}state.tokens.next.id===","&&
z("E028",state.tokens.next)}$t();if(state.tokens.next.id!==",")break;K(",")}K("]")}switch(state.tokens.next.id){case"{":e();break;case"[":t();break;case"true":case"false":case"null":case"(number)":case"(string)"
:K();break;case"-":K("-"),state.tokens.curr.character!==state.tokens.next.from&&R("W011",state.tokens.curr),G(state.tokens.curr,state.tokens.next),K("(number)");break;default:z("E003",state.tokens.next
)}}var e,t,n={"<":!0,"<=":!0,"==":!0,"===":!0,"!==":!0,"!=":!0,">":!0,">=":!0,"+":!0,"-":!0,"*":!0,"/":!0,"%":!0},r={asi:!0,bitwise:!0,boss:!0,browser:!0,camelcase:!0,couch:!0,curly:!0,debug:!0,devel:!0
,dojo:!0,eqeqeq:!0,eqnull:!0,es3:!0,es5:!0,esnext:!0,moz:!0,evil:!0,expr:!0,forin:!0,funcscope:!0,gcl:!0,globalstrict:!0,immed:!0,iterator:!0,jquery:!0,lastsemic:!0,laxbreak:!0,laxcomma:!0,loopfunc:!0,
mootools:!0,multistr:!0,newcap:!0,noarg:!0,node:!0,noempty:!0,nonew:!0,nonstandard:!0,nomen:!0,onevar:!0,passfail:!0,phantom:!0,plusplus:!0,proto:!0,prototypejs:!0,rhino:!0,undef:!0,scripturl:!0,shadow
:!0,smarttabs:!0,strict:!0,sub:!0,supernew:!0,trailing:!0,validthis:!0,withstmt:!0,white:!0,worker:!0,wsh:!0,yui:!0,onecase:!0,regexp:!0,regexdash:!0},i={maxlen:!1,indent:!1,maxerr:!1,predef:!1,quotmark
:!1,scope:!1,maxstatements:!1,maxdepth:!1,maxparams:!1,maxcomplexity:!1,unused:!0,latedef:!1},s={bitwise:!0,forin:!0,newcap:!0,nomen:!0,plusplus:!0,regexp:!0,undef:!0,white:!0,eqeqeq:!0,onevar:!0,strict
:!0},o={eqeq:"eqeqeq",vars:"onevar",windows:"wsh",sloppy:"strict"},u,a,f=["closure","exception","global","label","outer","unused","var"],l,c,h,p,d,v,m,g,y,b,w,E,S,x,T,N,C,k,L=[],A=new events.EventEmitter
;ct("(number)",function(){return this}),ct("(string)",function(){return this}),state.syntax["(identifier)"]={type:"(identifier)",lbp:0,identifier:!0,nud:function(){var t=this.value,n=x[t],r;typeof n=="function"?
n=undefined:typeof n=="boolean"&&(r=l,l=c[0],V(t,"var"),n=l,l=r);var i;_.has(l,"(blockscope)")&&(i=l["(blockscope)"].getlabel(t));if(l===n||i)switch(i?i[t]["(type)"]:l[t]){case"unused":i?i[t]["(type)"]="var"
:l[t]="var";break;case"unction":i?i[t]["(type)"]="function":l[t]="function",this["function"]=!0;break;case"function":this["function"]=!0;break;case"label":R("W037",state.tokens.curr,t)}else if(l["(global)"
])typeof S[t]!="boolean"&&(e!=="typeof"&&e!=="delete"||state.tokens.next&&(state.tokens.next.value==="."||state.tokens.next.value==="["))&&(l["(comparray)"].check(t)||q(l,"W117",state.tokens.curr,t)),Mt
(state.tokens.curr);else switch(l[t]){case"closure":case"function":case"var":case"unused":R("W038",state.tokens.curr,t);break;case"label":R("W037",state.tokens.curr,t);break;case"outer":case"global":break;
default:if(n===!0)l[t]=!0;else if(n===null)R("W039",state.tokens.curr,t),Mt(state.tokens.curr);else if(typeof n!="object")(e!=="typeof"&&e!=="delete"||state.tokens.next&&(state.tokens.next.value==="."||
state.tokens.next.value==="["))&&q(l,"W117",state.tokens.curr,t),l[t]=!0,Mt(state.tokens.curr);else switch(n[t]){case"function":case"unction":this["function"]=!0,n[t]="closure",l[t]=n["(global)"]?"global"
:"outer";break;case"var":case"unused":n[t]="closure",l[t]=n["(global)"]?"global":"outer";break;case"closure":l[t]=n["(global)"]?"global":"outer";break;case"label":R("W037",state.tokens.curr,t)}}return this
},led:function(){z("E033",state.tokens.next,state.tokens.next.value)}},ct("(regexp)",function(){return this}),ot("(endline)"),ot("(begin)"),ot("(end)").reach=!0,ot("(error)").reach=!0,ot("}").reach=!0,
ot(")"),ot("]"),ot('"').reach=!0,ot("'").reach=!0,ot(";"),ot(":").reach=!0,ot(","),ot("#"),ht("else"),ht("case").reach=!0,ht("catch"),ht("default").reach=!0,ht("finally"),dt("arguments",function(e){state
.directive["use strict"]&&l["(global)"]&&R("E008",e)}),dt("eval"),dt("false"),dt("Infinity"),dt("null"),dt("this",function(e){state.directive["use strict"]&&!state.option.validthis&&(l["(statement)"]&&
l["(name)"].charAt(0)>"Z"||l["(global)"])&&R("W040",e)}),dt("true"),dt("undefined"),bt("=","assign",20),bt("+=","assignadd",20),bt("-=","assignsub",20),bt("*=","assignmult",20),bt("/=","assigndiv",20).
nud=function(){z("E014")},bt("%=","assignmod",20),Et("&=","assignbitand",20),Et("|=","assignbitor",20),Et("^=","assignbitxor",20),Et("<<=","assignshiftleft",20),Et(">>=","assignshiftright",20),Et(">>>="
,"assignshiftrightunsigned",20),vt("?",function(e,t){return t.left=e,t.right=Q(10),K(":"),t["else"]=Q(10),t},30),vt("||","or",40),vt("&&","and",50),wt("|","bitor",70),wt("^","bitxor",80),wt("&","bitand"
,90),gt("==",function(e,t){var n=state.option.eqnull&&(e.value==="null"||t.value==="null");return!n&&state.option.eqeqeq?R("W116",this,"===","=="):yt(e)?R("W041",this,"===",e.value):yt(t)&&R("W041",this
,"===",t.value),this}),gt("==="),gt("!=",function(e,t){var n=state.option.eqnull&&(e.value==="null"||t.value==="null");return!n&&state.option.eqeqeq?R("W116",this,"!==","!="):yt(e)?R("W041",this,"!==",
e.value):yt(t)&&R("W041",this,"!==",t.value),this}),gt("!=="),gt("<"),gt(">"),gt("<="),gt(">="),wt("<<","shiftleft",120),wt(">>","shiftright",120),wt(">>>","shiftrightunsigned",120),vt("in","in",120),vt
("instanceof","instanceof",120),vt("+",function(e,t){var n=Q(130);return e&&n&&e.id==="(string)"&&n.id==="(string)"?(e.value+=n.value,e.character=n.character,!state.option.scripturl&&reg.javascriptURL.
test(e.value)&&R("W050",e),e):(t.left=e,t.right=n,t)},130),lt("+","num"),lt("+++",function(){return R("W007"),this.right=Q(150),this.arity="unary",this}),vt("+++",function(e){return R("W007"),this.left=
e,this.right=Q(130),this},130),vt("-","sub",130),lt("-","neg"),lt("---",function(){return R("W006"),this.right=Q(150),this.arity="unary",this}),vt("---",function(e){return R("W006"),this.left=e,this.right=
Q(130),this},130),vt("*","mult",140),vt("/","div",140),vt("%","mod",140),St("++","postinc"),lt("++","preinc"),state.syntax["++"].exps=!0,St("--","postdec"),lt("--","predec"),state.syntax["--"].exps=!0,
lt("delete",function(){var e=Q(0);return(!e||e.id!=="."&&e.id!=="[")&&R("W051"),this.first=e,this}).exps=!0,lt("~",function(){return state.option.bitwise&&R("W052",this,"~"),Q(150),this}),lt("...",function(
){return state.option.inESNext()||R("W104",this,"spread/rest operator"),state.tokens.next.identifier||z("E030",state.tokens.next,state.tokens.next.value),Q(150),this}),lt("!",function(){return this.right=
Q(150),this.arity="unary",this.right||I("E041",this.line||0),n[this.right.id]===!0&&R("W018",this,"!"),this}),lt("typeof","typeof"),lt("new",function(){var e=Q(155),t;if(e&&e.id!=="function")if(e.identifier
){e["new"]=!0;switch(e.value){case"Number":case"String":case"Boolean":case"Math":case"JSON":R("W053",state.tokens.prev,e.value);break;case"Function":state.option.evil||R("W054");break;case"Date":case"RegExp"
:break;default:e.id!=="function"&&(t=e.value.substr(0,1),state.option.newcap&&(t<"A"||t>"Z")&&!_.has(h,e.value)&&R("W055",state.tokens.curr))}}else e.id!=="."&&e.id!=="["&&e.id!=="("&&R("W056",state.tokens
.curr);else state.option.supernew||R("W057",this);return G(state.tokens.curr,state.tokens.next),state.tokens.next.id!=="("&&!state.option.supernew&&R("W058",state.tokens.curr,state.tokens.curr.value),this
.first=e,this}),state.syntax["new"].exps=!0,lt("void").exps=!0,vt(".",function(e,t){G(state.tokens.prev,state.tokens.curr),Y();var n=Tt(!1,!0);return typeof n=="string"&&Ot(n),t.left=e,t.right=n,n&&n==="hasOwnProperty"&&
state.tokens.next.value==="="&&R("W001"),!e||e.value!=="arguments"||n!=="callee"&&n!=="caller"?!state.option.evil&&e&&e.value==="document"&&(n==="write"||n==="writeln")&&R("W060",e):state.option.noarg?
R("W059",e,n):state.directive["use strict"]&&z("E008"),!state.option.evil&&(n==="eval"||n==="execScript")&&R("W061"),t},160,!0),vt("(",function(e,t){state.tokens.prev.id!=="}"&&state.tokens.prev.id!==")"&&
Y(state.tokens.prev,state.tokens.curr),Z(),state.option.immed&&e&&!e.immed&&e.id==="function"&&R("W062");var n=0,r=[];e&&e.type==="(identifier)"&&e.value.match(/^[A-Z]([A-Z0-9_$]*[a-z][A-Za-z0-9_$]*)?$/
)&&"Number String Boolean Date Object".indexOf(e.value)===-1&&(e.value==="Math"?R("W063",e):state.option.newcap&&R("W064",e));if(state.tokens.next.id!==")")for(;;){r[r.length]=Q(10),n+=1;if(state.tokens
.next.id!==",")break;it()}return K(")"),Z(state.tokens.prev,state.tokens.curr),typeof e=="object"&&(e.value==="parseInt"&&n===1&&R("W065",state.tokens.curr),state.option.evil||(e.value==="eval"||e.value==="Function"||
e.value==="execScript"?(R("W061",e),r[0]&&[0].id==="(string)"&&X(e,r[0].value)):!r[0]||r[0].id!=="(string)"||e.value!=="setTimeout"&&e.value!=="setInterval"?r[0]&&r[0].id==="(string)"&&e.value==="."&&e
.left.value==="window"&&(e.right==="setTimeout"||e.right==="setInterval")&&(R("W066",e),X(e,r[0].value)):(R("W066",e),X(e,r[0].value))),!e.identifier&&e.id!=="."&&e.id!=="["&&e.id!=="("&&e.id!=="&&"&&e
.id!=="||"&&e.id!=="?"&&R("W067",e)),t.left=e,t},155,!0).exps=!0,lt("(",function(){Z();var e,t=[],n,r,i=0;do n=J(i),i+=1,r=J(i),i+=1;while(n.value!==")"&&r.value!=="=>"&&r.value!==";"&&r.type!=="(end)"
);state.tokens.next.id==="function"&&(state.tokens.next.immed=!0);var s=[];if(state.tokens.next.id!==")")for(;;){if(r.value==="=>"&&state.tokens.next.value==="{"){e=state.tokens.next,e.left=It(),t.push
(e);for(var o in e.left)s.push(e.left[o].token)}else s.push(Q(0));if(state.tokens.next.id!==",")break;it()}return K(")",this),Z(state.tokens.prev,state.tokens.curr),state.option.immed&&s[0]&&s[0].id==="function"&&
state.tokens.next.id!=="("&&(state.tokens.next.id!=="."||J().value!=="call"&&J().value!=="apply")&&R("W068",this),state.tokens.next.value==="=>"?s:s[0]}),mt("=>"),vt("[",function(e,t){Y(state.tokens.prev
,state.tokens.curr),Z();var n=Q(0),r;return n&&n.type==="(string)"&&(!state.option.evil&&(n.value==="eval"||n.value==="execScript")&&R("W061",t),Ot(n.value),!state.option.sub&&reg.identifier.test(n.value
)&&(r=state.syntax[n.value],(!r||!P(r))&&R("W069",state.tokens.prev,n.value))),K("]",t),n&&n.value==="hasOwnProperty"&&state.tokens.next.value==="="&&R("W001"),Z(state.tokens.prev,state.tokens.curr),t.
left=e,t.right=n,t},160,!0),lt("[",function(){var e=Wt(!0);if(e.isCompArray)return state.option.inMoz(!0)||R("W118",state.tokens.curr,"array comprehension"),_t();e.isDestAssign&&!state.option.inESNext(
)&&R("W104",state.tokens.curr,"destructuring assignment");var t=state.tokens.curr.line!==state.tokens.next.line;this.first=[],t&&(m+=state.option.indent,state.tokens.next.from===m+state.option.indent&&
(m+=state.option.indent));while(state.tokens.next.id!=="(end)"){while(state.tokens.next.id===",")state.option.inES5()||R("W070"),K(",");if(state.tokens.next.id==="]")break;t&&state.tokens.curr.line!==state
.tokens.next.line&&nt(),this.first.push(Q(10));if(state.tokens.next.id!==",")break;it({allowTrailing:!0});if(state.tokens.next.id==="]"&&!state.option.inES5(!0)){R("W070",state.tokens.curr);break}}return t&&
(m-=state.option.indent,nt()),K("]",this),this},160),function(e){e.nud=function(){function u(e,t){o[e]&&_.has(o,e)?R("W075",state.tokens.next,n):o[e]={},o[e].basic=!0,o[e].basictkn=t}function a(e,t){o[
e]&&_.has(o,e)?(o[e].basic||o[e].setter)&&R("W075",state.tokens.next,n):o[e]={},o[e].setter=!0,o[e].setterToken=t}function f(e){o[e]&&_.has(o,e)?(o[e].basic||o[e].getter)&&R("W075",state.tokens.next,n)
:o[e]={},o[e].getter=!0,o[e].getterToken=state.tokens.curr}var e,t,n,r,i,s,o={};e=state.tokens.curr.line!==state.tokens.next.line,e&&(m+=state.option.indent,state.tokens.next.from===m+state.option.indent&&
(m+=state.option.indent));for(;;){if(state.tokens.next.id==="}")break;e&&nt();if(state.tokens.next.value==="get"&&J().id!==":")K("get"),state.option.inES5(!0)||z("E034"),n=Dt(),n||z("E035"),f(n),i=state
.tokens.next,G(state.tokens.curr,state.tokens.next),t=Ht(),r=t["(params)"],r&&R("W076",i,r[0],n),G(state.tokens.curr,state.tokens.next);else if(state.tokens.next.value==="set"&&J().id!==":")K("set"),state
.option.inES5(!0)||z("E034"),n=Dt(),n||z("E035"),a(n,state.tokens.next),i=state.tokens.next,G(state.tokens.curr,state.tokens.next),t=Ht(),r=t["(params)"],(!r||r.length!==1)&&R("W077",i,n);else{s=!1,state
.tokens.next.value==="*"&&state.tokens.next.type==="(punctuator)"&&(state.option.inESNext()||R("W104",state.tokens.next,"generator functions"),K("*"),s=!0),n=Dt(),u(n,state.tokens.next);if(typeof n!="string"
)break;state.tokens.next.value==="("?(state.option.inESNext()||R("W104",state.tokens.curr,"concise methods"),Ht(n,undefined,s)):(K(":"),et(state.tokens.curr,state.tokens.next),Q(10))}Ot(n);if(state.tokens
.next.id!==",")break;it({allowTrailing:!0}),state.tokens.next.id===","?R("W070",state.tokens.curr):state.tokens.next.id==="}"&&!state.option.inES5(!0)&&R("W070",state.tokens.curr)}e&&(m-=state.option.indent
,nt()),K("}",this);if(state.option.inES5())for(var l in o)_.has(o,l)&&o[l].setter&&!o[l].getter&&R("W078",o[l].setterToken);return this},e.fud=function(){z("E036",state.tokens.curr)}}(ot("{"));var Rt=ut
("const",function(e){var t,n,r;state.option.inESNext()||R("W104",state.tokens.curr,"const"),this.first=[];for(;;){var i=[];et(state.tokens.curr,state.tokens.next),_.contains(["{","["],state.tokens.next
.value)?(t=It(),r=!1):(t=[{id:Tt(),token:state.tokens.curr}],r=!0);for(var s in t)s=t[s],l[s.id]==="const"&&R("E011",null,s.id),l["(global)"]&&S[s.id]===!1&&R("W079",s.token,s.id),s.id&&(V(s.id,"const"
),i.push(s.token));if(e)break;this.first=this.first.concat(i),state.tokens.next.id!=="="&&R("E012",state.tokens.curr,state.tokens.curr.value),state.tokens.next.id==="="&&(et(state.tokens.curr,state.tokens
.next),K("="),et(state.tokens.curr,state.tokens.next),state.tokens.next.id==="undefined"&&R("W080",state.tokens.curr,state.tokens.curr.value),J(0).id==="="&&state.tokens.next.identifier&&z("E037",state
.tokens.next,state.tokens.next.value),n=Q(0),r?t[0].first=n:qt(i,n));if(state.tokens.next.id!==",")break;it()}return this});Rt.exps=!0;var Ut=ut("var",function(e){var t,n,r;l["(onevar)"]&&state.option.
onevar?R("W081"):l["(global)"]||(l["(onevar)"]=!0),this.first=[];for(;;){var i=[];et(state.tokens.curr,state.tokens.next),_.contains(["{","["],state.tokens.next.value)?(t=It(),n=!1):(t=[{id:Tt(),token:
state.tokens.curr}],n=!0);for(var s in t)s=t[s],state.option.inESNext()&&l[s.id]==="const"&&R("E011",null,s.id),l["(global)"]&&S[s.id]===!1&&R("W079",s.token,s.id),s.id&&(V(s.id,"unused",s.token),i.push
(s.token));if(e)break;this.first=this.first.concat(i),state.tokens.next.id==="="&&(et(state.tokens.curr,state.tokens.next),K("="),et(state.tokens.curr,state.tokens.next),state.tokens.next.id==="undefined"&&
R("W080",state.tokens.curr,state.tokens.curr.value),J(0).id==="="&&state.tokens.next.identifier&&z("E038",state.tokens.next,state.tokens.next.value),r=Q(0),n?t[0].first=r:qt(i,r));if(state.tokens.next.
id!==",")break;it()}return this});Ut.exps=!0;var zt=ut("let",function(e){var t,n,r,i;state.option.inESNext()||R("W104",state.tokens.curr,"let"),state.tokens.next.value==="("?(state.option.inMoz(!0)||R("W118"
,state.tokens.next,"let block"),K("("),l["(blockscope)"].stack(),i=!0):l["(nolet)"]&&z("E048",state.tokens.curr),l["(onevar)"]&&state.option.onevar?R("W081"):l["(global)"]||(l["(onevar)"]=!0),this.first=
[];for(;;){var s=[];et(state.tokens.curr,state.tokens.next),_.contains(["{","["],state.tokens.next.value)?(t=It(),n=!1):(t=[{id:Tt(),token:state.tokens.curr.value}],n=!0);for(var o in t)o=t[o],state.option
.inESNext()&&l[o.id]==="const"&&R("E011",null,o.id),l["(global)"]&&S[o.id]===!1&&R("W079",o.token,o.id),o.id&&!l["(nolet)"]&&(V(o.id,"unused",o.token,!0),s.push(o.token));if(e)break;this.first=this.first
.concat(s),state.tokens.next.id==="="&&(et(state.tokens.curr,state.tokens.next),K("="),et(state.tokens.curr,state.tokens.next),state.tokens.next.id==="undefined"&&R("W080",state.tokens.curr,state.tokens
.curr.value),J(0).id==="="&&state.tokens.next.identifier&&z("E037",state.tokens.next,state.tokens.next.value),r=Q(0),n?t[0].first=r:qt(s,r));if(state.tokens.next.id!==",")break;it()}return i&&(K(")"),At
(!0,!0),this.block=!0,l["(blockscope)"].unstack()),this});zt.exps=!0,at("function",function(){var e=!1;state.tokens.next.value==="*"&&(K("*"),state.option.inESNext(!0)?e=!0:R("W119",state.tokens.curr,"function*"
)),v&&R("W082",state.tokens.curr);var t=Tt();return l[t]==="const"&&R("E011",null,t),G(state.tokens.curr,state.tokens.next),V(t,"unction",state.tokens.curr),Ht(t,{statement:!0},e),state.tokens.next.id==="("&&
state.tokens.next.line===state.tokens.curr.line&&z("E039"),this}),lt("function",function(){var e=!1;state.tokens.next.value==="*"&&(state.option.inESNext()||R("W119",state.tokens.curr,"function*"),K("*"
),e=!0);var t=xt();return t||state.option.gcl?G(state.tokens.curr,state.tokens.next):et(state.tokens.curr,state.tokens.next),Ht(t,undefined,e),!state.option.loopfunc&&l["(loopage)"]&&R("W083"),this}),at
("if",function(){var e=state.tokens.next;return jt(),K("("),et(this,e),Z(),Q(20),Ft(),K(")",e),Z(state.tokens.prev,state.tokens.curr),At(!0,!0),state.tokens.next.id==="else"&&(et(state.tokens.curr,state
.tokens.next),K("else"),state.tokens.next.id==="if"||state.tokens.next.id==="switch"?Ct(!0):At(!0,!0)),this}),at("try",function(){function t(){var e=x,t;K("catch"),et(state.tokens.curr,state.tokens.next
),K("("),x=Object.create(e),t=state.tokens.next.value,state.tokens.next.type!=="(identifier)"&&(t=null,R("E030",state.tokens.next,t)),K(),l={"(name)":"(catch)","(line)":state.tokens.next.line,"(character)"
:state.tokens.next.character,"(context)":l,"(breakage)":l["(breakage)"],"(loopage)":l["(loopage)"],"(scope)":x,"(statement)":!1,"(metrics)":Bt(state.tokens.next),"(catch)":!0,"(tokens)":{},"(blockscope)"
:l["(blockscope)"],"(comparray)":l["(comparray)"]},t&&V(t,"exception"),state.tokens.next.value==="if"&&(state.option.inMoz(!0)||R("W118",state.tokens.curr,"catch filter"),K("if"),Q(0)),K(")"),state.tokens
.curr.funct=l,c.push(l),At(!1),x=e,l["(last)"]=state.tokens.curr.line,l["(lastcharacter)"]=state.tokens.curr.character,l=l["(context)"]}var e;At(!1);while(state.tokens.next.id==="catch")jt(),e&&!state.
option.inMoz(!0)&&R("W118",state.tokens.next,"multiple catch blocks"),t(),e=!0;if(state.tokens.next.id==="finally"){K("finally"),At(!1);return}return e||z("E021",state.tokens.next,"catch",state.tokens.
next.value),this}),at("while",function(){var e=state.tokens.next;return l["(breakage)"]+=1,l["(loopage)"]+=1,jt(),K("("),et(this,e),Z(),Q(20),Ft(),K(")",e),Z(state.tokens.prev,state.tokens.curr),At(!0,!0
),l["(breakage)"]-=1,l["(loopage)"]-=1,this}).labelled=!0,at("with",function(){var e=state.tokens.next;return state.directive["use strict"]?z("E010",state.tokens.curr):state.option.withstmt||R("W085",state
.tokens.curr),K("("),et(this,e),Z(),Q(0),K(")",e),Z(state.tokens.prev,state.tokens.curr),At(!0,!0),this}),at("switch",function(){var e=state.tokens.next,t=!1;l["(breakage)"]+=1,K("("),et(this,e),Z(),this
.condition=Q(20),K(")",e),Z(state.tokens.prev,state.tokens.curr),et(state.tokens.curr,state.tokens.next),e=state.tokens.next,K("{"),et(state.tokens.curr,state.tokens.next),m+=state.option.indent,this.cases=
[];for(;;)switch(state.tokens.next.id){case"case":switch(l["(verb)"]){case"yield":case"break":case"case":case"continue":case"return":case"switch":case"throw":break;default:reg.fallsThrough.test(state.lines
[state.tokens.next.line-2])||R("W086",state.tokens.curr,"case")}nt(-state.option.indent),K("case"),this.cases.push(Q(20)),jt(),t=!0,K(":"),l["(verb)"]="case";break;case"default":switch(l["(verb)"]){case"yield"
:case"break":case"continue":case"return":case"throw":break;default:this.cases.length&&(reg.fallsThrough.test(state.lines[state.tokens.next.line-2])||R("W086",state.tokens.curr,"default"))}nt(-state.option
.indent),K("default"),t=!0,K(":");break;case"}":m-=state.option.indent,nt(),K("}",e),l["(breakage)"]-=1,l["(verb)"]=undefined;return;case"(end)":z("E023",state.tokens.next,"}");return;default:if(t)switch(
state.tokens.curr.id){case",":z("E040");return;case":":t=!1,kt();break;default:z("E025",state.tokens.curr);return}else{if(state.tokens.curr.id!==":"){z("E021",state.tokens.next,"case",state.tokens.next
.value);return}K(":"),z("E024",state.tokens.curr,":"),kt()}}}).labelled=!0,ut("debugger",function(){return state.option.debug||R("W087"),this}).exps=!0,function(){var e=ut("do",function(){l["(breakage)"
]+=1,l["(loopage)"]+=1,jt(),this.first=At(!0),K("while");var e=state.tokens.next;return et(state.tokens.curr,e),K("("),Z(),Q(20),Ft(),K(")",e),Z(state.tokens.prev,state.tokens.curr),l["(breakage)"]-=1,
l["(loopage)"]-=1,this});e.labelled=!0,e.exps=!0}(),at("for",function(){var e,t=state.tokens.next,n=!1,r=null;t.value==="each"&&(r=t,K("each"),state.option.inMoz(!0)||R("W118",state.tokens.curr,"for each"
)),l["(breakage)"]+=1,l["(loopage)"]+=1,jt(),K("("),et(this,t),Z();var i,s=0,o=["in","of"];do i=J(s),++s;while(!_.contains(o,i.value)&&i.value!==";"&&i.type!=="(end)");if(_.contains(o,i.value)){!state.
option.inESNext()&&i.value==="of"&&z("W104",i,"for of");if(state.tokens.next.id==="var")K("var"),state.syntax["var"].fud.call(state.syntax["var"].fud,!0);else if(state.tokens.next.id==="let")K("let"),n=!0
,l["(blockscope)"].stack(),state.syntax.let.fud.call(state.syntax.let.fud,!0);else{switch(l[state.tokens.next.value]){case"unused":l[state.tokens.next.value]="var";break;case"var":break;default:l["(blockscope)"
].getlabel(state.tokens.next.value)||R("W088",state.tokens.next,state.tokens.next.value)}K()}K(i.value),Q(20),K(")",t),e=At(!0,!0),state.option.forin&&e&&(e.length>1||typeof e[0]!="object"||e[0].value!=="if"
)&&R("W089",this),l["(breakage)"]-=1,l["(loopage)"]-=1}else{r&&z("E045",r);if(state.tokens.next.id!==";")if(state.tokens.next.id==="var")K("var"),state.syntax["var"].fud.call(state.syntax["var"].fud);else if(
state.tokens.next.id==="let")K("let"),n=!0,l["(blockscope)"].stack(),state.syntax.let.fud.call(state.syntax.let.fud);else for(;;){Q(0,"for");if(state.tokens.next.id!==",")break;it()}rt(state.tokens.curr
),K(";"),state.tokens.next.id!==";"&&(Q(20),Ft()),rt(state.tokens.curr),K(";"),state.tokens.next.id===";"&&z("E021",state.tokens.next,")",";");if(state.tokens.next.id!==")")for(;;){Q(0,"for");if(state.
tokens.next.id!==",")break;it()}K(")",t),Z(state.tokens.prev,state.tokens.curr),At(!0,!0),l["(breakage)"]-=1,l["(loopage)"]-=1}return n&&l["(blockscope)"].unstack(),this}).labelled=!0,ut("break",function(
){var e=state.tokens.next.value;return l["(breakage)"]===0&&R("W052",state.tokens.next,this.value),state.option.asi||rt(this),state.tokens.next.id!==";"&&state.tokens.curr.line===state.tokens.next.line&&
(l[e]!=="label"?R("W090",state.tokens.next,e):x[e]!==l&&R("W091",state.tokens.next,e),this.first=state.tokens.next,K()),Nt("break"),this}).exps=!0,ut("continue",function(){var e=state.tokens.next.value
;return l["(breakage)"]===0&&R("W052",state.tokens.next,this.value),state.option.asi||rt(this),state.tokens.next.id!==";"?state.tokens.curr.line===state.tokens.next.line&&(l[e]!=="label"?R("W090",state
.tokens.next,e):x[e]!==l&&R("W091",state.tokens.next,e),this.first=state.tokens.next,K()):l["(loopage)"]||R("W052",state.tokens.next,this.value),Nt("continue"),this}).exps=!0,ut("return",function(){return this
.line===state.tokens.next.line?(state.tokens.next.id==="(regexp)"&&R("W092"),state.tokens.next.id!==";"&&!state.tokens.next.reach&&(et(state.tokens.curr,state.tokens.next),this.first=Q(0),this.first&&this
.first.type==="(punctuator)"&&this.first.value==="="&&!state.option.boss&&U("W093",this.first.line,this.first.character))):rt(this),Nt("return"),this}).exps=!0,ut("yield",function(){return state.option
.inESNext(!0)&&l["(generator)"]!==!0?z("E046",state.tokens.curr,"yield"):state.option.inESNext()||R("W104",state.tokens.curr,"yield"),l["(generator)"]="yielded",this.line===state.tokens.next.line?(state
.tokens.next.id==="(regexp)"&&R("W092"),state.tokens.next.id!==";"&&!state.tokens.next.reach&&(et(state.tokens.curr,state.tokens.next),this.first=Q(0),this.first.type==="(punctuator)"&&this.first.value==="="&&!
state.option.boss&&U("W093",this.first.line,this.first.character))):state.option.asi||rt(this),this}).exps=!0,ut("throw",function(){return rt(this),et(state.tokens.curr,state.tokens.next),this.first=Q(20
),Nt("throw"),this}).exps=!0,pt("abstract"),pt("boolean"),pt("byte"),pt("char"),pt("class",{es5:!0}),pt("double"),pt("enum",{es5:!0}),pt("export",{es5:!0}),pt("extends",{es5:!0}),pt("final"),pt("float"
),pt("goto"),pt("implements",{es5:!0,strictOnly:!0}),pt("import",{es5:!0}),pt("int"),pt("interface"),pt("long"),pt("native"),pt("package",{es5:!0,strictOnly:!0}),pt("private",{es5:!0,strictOnly:!0}),pt
("protected",{es5:!0,strictOnly:!0}),pt("public",{es5:!0,strictOnly:!0}),pt("short"),pt("static",{es5:!0,strictOnly:!0}),pt("super",{es5:!0}),pt("synchronized"),pt("throws"),pt("transient"),pt("volatile"
);var Wt=function(){var e,t,n=0,r=0,i={};_.contains(["[","{"],state.tokens.curr.value)&&(r+=1),_.contains(["[","{"],state.tokens.next.value)&&(r+=1),_.contains(["]","}"],state.tokens.next.value)&&(r-=1
);do{e=J(n),t=J(n+1),n+=1,_.contains(["[","{"],e.value)?r+=1:_.contains(["]","}"],e.value)&&(r-=1);if(e.identifier&&e.value==="for"&&r===1){i.isCompArray=!0,i.notJson=!0;break}if(_.contains(["}","]"],e
.value)&&t.value==="="){i.isDestAssign=!0,i.notJson=!0;break}e.value===";"&&(i.isBlock=!0,i.notJson=!0)}while(r>0&&e.id!=="(end)"&&n<15);return i},Vt=function(){function r(e){var t=n.variables.filter(function(
t){if(t.value===e)return t.undef=!1,e}).length;return t!==0}function i(e){var t=n.variables.filter(function(t){if(t.value===e&&!t.undef)return t.unused===!0&&(t.unused=!1),e}).length;return t===0}var e=
function(){this.mode="use",this.variables=[]},t=[],n;return{stack:function(){n=new e,t.push(n)},unstack:function(){n.variables.filter(function(e){e.unused&&R("W098",e.token,e.value),e.undef&&q(e.funct,"W117"
,e.token,e.value)}),t.splice(t[t.length-1],1),n=t[t.length-1]},setState:function(e){_.contains(["use","define","filter"],e)&&(n.mode=e)},check:function(e){return n&&n.mode==="use"?(n.variables.push({funct
:l,token:state.tokens.curr,value:e,undef:!0,unused:!1}),!0):n&&n.mode==="define"?(r(e)||n.variables.push({funct:l,token:state.tokens.curr,value:e,undef:!1,unused:!0}),!0):n&&n.mode==="filter"?(i(e)&&q(
l,"W117",state.tokens.curr,e),!0):!1}}},Jt=function(){function n(){for(var t in e)if(e[t]["(type)"]==="unused"&&state.option.unused){var n=e[t]["(token)"],r=n.line,i=n.character;U("W098",r,i,t)}}var e=
{},t=[e];return{stack:function(){e={},t.push(e)},unstack:function(){n(),t.splice(t.length-1,1),e=_.last(t)},getlabel:function(e){for(var n=t.length-1;n>=0;--n)if(_.has(t[n],e))return t[n]},current:{has
:function(t){return _.has(e,t)},add:function(t,n,r){e[t]={"(type)":n,"(token)":r}}}}},Kt=function(e,n,r){var i,s,o,f,E,D={};state.reset(),n&&n.scope?JSHINT.scope=n.scope:(JSHINT.errors=[],JSHINT.undefs=
[],JSHINT.internals=[],JSHINT.blacklist={},JSHINT.scope="(main)"),S=Object.create(null),B(S,vars.ecmaIdentifiers),B(S,vars.reservedVars),B(S,r||{}),u=Object.create(null),a=Object.create(null),p=Object.
create(null);if(n){i=n.predef,i&&(!Array.isArray(i)&&typeof i=="object"&&(i=Object.keys(i)),i.forEach(function(e){var t,r;e[0]==="-"?(t=e.slice(1),JSHINT.blacklist[t]=t):(r=Object.getOwnPropertyDescriptor
(n.predef,e),S[e]=r?r.value:!1)})),E=Object.keys(n);for(f=0;f<E.length;f++)/^-W\d{3}$/g.test(E[f])?p[E[f].slice(1)]=!0:(D[E[f]]=n[E[f]],E[f]==="newcap"&&n[E[f]]===!1&&(D["(explicitNewcap)"]=!0),E[f]==="indent"&&
(D["(explicitIndent)"]=!0))}state.option=D,state.option.indent=state.option.indent||4,state.option.maxerr=state.option.maxerr||50,m=1,h=Object.create(S),x=h,l={"(global)":!0,"(name)":"(global)","(scope)"
:x,"(breakage)":0,"(loopage)":0,"(tokens)":{},"(metrics)":Bt(state.tokens.next),"(blockscope)":Jt(),"(comparray)":Vt()},c=[l],C=[],T=null,b={},w=null,d={},v=!1,g=[],k=0,N=[];if(!M(e)&&!Array.isArray(e)
)return W("E004",0),!1;t={get isJSON(){return state.jsonMode},getOption:function(e){return state.option[e]||null},getCache:function(e){return state.cache[e]},setCache:function(e,t){state.cache[e]=t},warn
:function(e,t){U.apply(null,[e,t.line,t.char].concat(t.data))},on:function(e,t){e.split(" ").forEach(function(e){A.on(e,t)}.bind(this))}},A.removeAllListeners(),(L||[]).forEach(function(e){e(t)}),state
.tokens.prev=state.tokens.curr=state.tokens.next=state.syntax["(begin)"],y=new Lexer(e),y.on("warning",function(e){U.apply(null,[e.code,e.line,e.character].concat(e.data))}),y.on("error",function(e){W.
apply(null,[e.code,e.line,e.character].concat(e.data))}),y.on("fatal",function(e){I("E041",e.line,e.from)}),y.on("Identifier",function(e){A.emit("Identifier",e)}),y.on("String",function(e){A.emit("String"
,e)}),y.on("Number",function(e){A.emit("Number",e)}),y.start();for(var P in n)_.has(n,P)&&O(P,state.tokens.curr);F(),B(S,r||{}),it.first=!0;try{K();switch(state.tokens.next.id){case"{":case"[":Xt();break;
default:Lt(),state.directive["use strict"]&&!state.option.globalstrict&&!state.option.node&&R("W097",state.tokens.prev),kt()}K(state.tokens.next&&state.tokens.next.value!=="."?"(end)":undefined);var H=
function(e,t){do{if(typeof t[e]=="string")return t[e]==="unused"?t[e]="var":t[e]==="unction"&&(t[e]="closure"),!0;t=t["(context)"]}while(t);return!1},j=function(e,t){if(!d[e])return;var n=[];for(var r=0
;r<d[e].length;r+=1)d[e][r]!==t&&n.push(d[e][r]);n.length===0?delete d[e]:d[e]=n},q=function(e,t,n,r){var i=t.line,s=t.character;r===undefined&&(r=state.option.unused),r===!0&&(r="last-param");var o={vars
:["var"],"last-param":["var","last-param"],strict:["var","param","last-param"]};r&&o[r]&&o[r].indexOf(n)!==-1&&U("W098",i,s,e),N.push({name:e,line:i,character:s})},z=function(e,t){var n=e[t],r=e["(tokens)"
][t];if(t.charAt(0)==="(")return;if(n!=="unused"&&n!=="unction")return;if(e["(params)"]&&e["(params)"].indexOf(t)!==-1)return;if(e["(global)"]&&_.has(a,t))return;q(t,r,"var")};for(s=0;s<JSHINT.undefs.length
;s+=1)o=JSHINT.undefs[s].slice(0),H(o[2].value,o[0])?j(o[2].value,o[2].line):state.option.undef&&R.apply(R,o.slice(1));c.forEach(function(e){if(e["(unusedOption)"]===!1)return;for(var t in e)_.has(e,t)&&
z(e,t);if(!e["(params)"])return;var n=e["(params)"].slice(),r=n.pop(),i,s;while(r){i=e[r],s=n.length===e["(params)"].length-1?"last-param":"param";if(r==="undefined")return;(i==="unused"||i==="unction"
)&&q(r,e["(tokens)"][r],s,e["(unusedOption)"]),r=n.pop()}});for(var X in u)_.has(u,X)&&!_.has(h,X)&&q(X,u[X],"var")}catch(V){if(!V||V.name!=="JSHintError")throw V;var $=state.tokens.next||{};JSHINT.errors
.push({scope:"(main)",raw:V.raw,reason:V.message,line:V.line||$.line,character:V.character||$.from},null)}if(JSHINT.scope==="(main)"){n=n||{};for(s=0;s<JSHINT.internals.length;s+=1)o=JSHINT.internals[s
],n.scope=o.elem,Kt(o.value,n,r)}return JSHINT.errors.length===0};return Kt.addModule=function(e){L.push(e)},Kt.addModule(style.register),Kt.data=function(){var e={functions:[],options:state.option},t=
[],n=[],r,i,s,o,u,a;Kt.errors.length&&(e.errors=Kt.errors),state.jsonMode&&(e.json=!0);for(u in d)_.has(d,u)&&t.push({name:u,line:d[u]});t.length>0&&(e.implieds=t),C.length>0&&(e.urls=C),a=Object.keys(
x),a.length>0&&(e.globals=a);for(s=1;s<c.length;s+=1){i=c[s],r={};for(o=0;o<f.length;o+=1)r[f[o]]=[];for(o=0;o<f.length;o+=1)r[f[o]].length===0&&delete r[f[o]];r.name=i["(name)"],r.param=i["(params)"],
r.line=i["(line)"],r.character=i["(character)"],r.last=i["(last)"],r.lastcharacter=i["(lastcharacter)"],e.functions.push(r)}N.length>0&&(e.unused=N),n=[];for(u in b)if(typeof b[u]=="number"){e.member=b
;break}return e},Kt.jshint=Kt,Kt}();typeof exports=="object"&&exports&&(exports.JSHINT=JSHINT);
/* END INSERT */

var JSHINT = exports.JSHINT;
realExports.JSHINT = JSHINT;
exports = realExports;

// jshint-endignore

})(typeof exports == "undefined" ? (typeof doctest == "undefined" ? doctest = {} : doctest) : exports);
