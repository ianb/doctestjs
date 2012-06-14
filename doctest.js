(function (exports) {

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
      this.result = this.runner.eval(this.expr, globs);
    } catch (e) {
      if (e['doctest.abort']) {
        return;
      }
      this.write('Error: ' + e + '\n');
      // FIXME: doesn't format nicely:
      if (e.stack) {
        console.log('Exception Stack:');
        console.log(e.stack);
      }
    }
  },
  check: function () {
    var output = this.output.join('\n');
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
    var re = RegExpEscape(cleanExpected);
    re = '^' + re + '$';
    re = re.replace(/\\\.\\\.\\\./g, "[\\S\\s\\r\\n]*");
    re = re.replace(/\\\?/g, "[a-zA-Z0-9_.]+");
    re = re.replace(/[ \t]+/g, " +");
    re = re.replace(/["']/g, "['\"]");
    re = new RegExp(re);
    if (cleanGot.search(re) != -1) {
      this.runner.reporter.logSuccess(example, got);
      return;
    }
    this.runner.reporter.logFailure(example, got);
  },
  clean: function (s) {
    var lines = s.split(/(?:\r\n|\r|\n)/);
    var result = [];
    for (var i=0; i<lines.length; i++) {
      var line = strip(lines[i]);
      if (line) {
        result.push(line);
      }
    }
    return result.join('\n');
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
    var num = parseInt(this.successEl.innerHTML, 10);
    num++;
    this.successEl.innerHTML = num+'';
    addClass(this.successEl, 'doctest-nonzero');
    if (example.htmlSpan) {
      addClass(example.htmlSpan, 'doctest-success');
      if (example.expected.indexOf('...') != -1
          || example.expected.indexOf('?') != -1) {
        this.addExampleNote(example, 'Output:', 'doctest-actual-output', got);
      }
    }
    this.showConsoleOutput(example, false);
    this.runner._hook('reportSuccess', example, got);
  },

  logFailure: function (example, got) {
    var num = parseInt(this.failureEl.innerHTML, 10);
    num++;
    this.failureEl.innerHTML = num+'';
    addClass(this.failureEl, 'doctest-nonzero');
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
    if (example.blockEl) {
      addClass(example.blockEl, 'doctest-some-failure');
    }
    if (example.htmlID) {
      var anchor = makeElement('a', {href: '#' + example.htmlID, className: 'doctest-failure-link'}, [example.textSummary()]);
      this.failureLinksEl.appendChild(anchor);
    }
    this.showConsoleOutput(example, true);
    this.runner._hook('reportFailure', example, got);
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
  }
};

var ConsoleReporter = exports.ConsoleReporter = function (runner) {
  this.runner = runner;
};

ConsoleReporter.prototype = {
  logSuccess: function (example, got) {
    console.log('Passed:', example.textSummary());
  },
  logFailure: function (example, got) {
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
  defaultMaxLen: 120,

  repr: function (o, indentString) {
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
      } else if (typeof o.repr == 'function' && o.repr != arguments.callee
                 && o.repr != repr) {
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
      if (typeof(o.NAME) == 'string' && (
            o.toString == Function.prototype.toString ||
            o.toString == Object.prototype.toString)) {
        return o.NAME;
      }
    }
    try {
      var ostring = (o + "");
      if (ostring == '[object Object]' || ostring == '[object]') {
        ostring = this.objRepr(o, indentString);
      }
    } catch (e) {
      return "[" + (typeof o) + "]";
    }
    if (typeof o == "function") {
      var ostring = ostring.replace(/^\s+/, "").replace(/\s+/g, " ");
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
      return this.xmlRepr(el.childNodes[0], indentString);
    }
    var s = '<' + el.tagName;
    var attrs = [];
    if (el.attributes && el.attributes.length) {
      for (i=0; i<el.attributes.length; i++) {
        attrs.push(el.attributes[i].nodeName);
      }
      attrs.sort();
      for (i=0; i<attrs.length; i++) {
        s += ' ' + attrs[i] + '="';
        var value = el.getAttribute(attrs[i]);
        value = value.replace('&', '&amp;');
        value = value.replace('"', '&quot;');
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
      var el = el.childNodes[i];
      if (el.nodeType == el.TEXT_NODE) {
        s += strip(el.textContent);
      } else {
        if (! hasNewline) {
          s += '\n' + indentString;
          hasNewline = true;
        }
        s += '  ' + this.xmlRepr(el, indentString + '  ');
        s += '\n' + indentString;
      }
    }
    s += '</' + el.tagName + '>';
    return s;
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
    ]
  ]

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
    var self = this;
    this.logGrouped = false;
    this._abortCalled = false;
    var globs = {
      write: this.write.bind(this),
      writeln: this.writeln.bind(this),
      wait: this.wait.bind(this),
      Abort: this.Abort.bind(this),
      repr: repr,
      Spy: Spy
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
      return globs;
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

  wait: function (conditionOrTime, hardTimeout) {
    // FIXME: should support a timeout even with a condition
    if (conditionOrTime === undefined
        || conditionOrTime === null) {
      // same as wait-some-small-amount-of-time
      conditionOrTime = 0;
    }
    this._waitCondition = conditionOrTime;
    if (typeof conditionOrTime == "number") {
      if (((! hardTimeout) && this._defaultWaitTimeout < conditionOrTime)
          || hardTimeout < conditionOrTime) {
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
    var logFunc = origFunc || console.log.origFunc || console.log;;

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
      window.print = undefined;
      window.wait = undefined;
      window.onerror = undefined;
      window.console.log = window.console.log.origFunc;
      window.console.warn = window.console.warn.origFunc;
      window.console.error = window.console.error.origFunc;
      window.console.info = window.console.info.origFunc;
    }
  },

  eval: function (expr, context) {
    var e = eval;
    if (context) {
      if (typeof global != "undefined") {
        extend(global, context);
        var vm = require('vm');
        vm.runInThisContext(expr);
      } else {
        with (context) {
          var result = eval(expr);
        }
      }
    } else {
      var result = e(expr);
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
      if (this._abortCalled) {
        console.log('Abort called: ' + this._abortCalled);
      }
      this.evalUninit();
      this._currentExample.check();
      this._currentExample = null;
      if (this._abortCalled) {
        break;
      }
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
          return;
        }
        setTimeout(poll, self._waitPollTime);
        return;
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
  makeExample: function (text, expected) {
    return new this.Example(this, text, expected, this.exampleOptions);
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
  this.selector = selector || 'pre.doctest, pre.commenttest';
};

HTMLParser.prototype = {
  parse: function () {
    var els = this.findEls();
    for (var i=0; i<els.length; i++) {
      this.parseEl(els[i]);
    }
  },

  findEls: function () {
    return this.containerEl.querySelectorAll(this.selector);
  },

  parseEl: function (el) {
    if (hasClass(el, 'doctest')) {
      var examples = this.parseDoctestEl(el);
    } else if (hasClass(el, 'commenttest')) {
      var examples = this.parseCommentEl(el);
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
        makeElement('span', {className: 'doctest-expr'}, [rawExample + '\n']),
            makeElement('span', {className: 'doctest-output'}, [rawOutput + '\n'])
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
      if (/^[$]/.test(line) || i==lines.length-1) {
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
          throw ('Bad example: ' + this.runner.repr(line) + '\n'
            + '> line not preceded by $');
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
      if (comment.type != 'Block') {
        continue;
      }
      if (comment.value.search(/^\s*=>/) == -1) {
        // Not a comment we care about
        continue;
      }
      var start = comment.range[0];
      var end = comment.range[1];
      var example = contents.substr(pos, start-pos);
      var output = comment.value.replace(/^\s*=> ?/, '');
      result.push([example, output, example, '/*' + comment.value + '*/']);
      pos = end;
    }
    var last = contents.substr(pos, contents.length-pos);
    if (strip(last)) {
      result.push([last, '', last, '']);
    }
    return result;
  },

  loadRemotes: function (callback) {
    var els = this.findEls();
    var pending = 0;
    argsToArray(els).forEach(function (el) {
      var href = el.getAttribute('href');
      if (! href) {
        return;
      }
      pending++;
      var req = new XMLHttpRequest();
      req.open('GET', href);
      req.onreadystatechange = function () {
        if (req.readyState != 4) {
          return;
        }
        el.innerHTML = '';
        if (req.status != 200) {
          el.appendChild(doc.createTextNode('Error fetching ' + href + ' status: ' + req.status));
        } else {
          el.appendChild(doc.createTextNode(req.responseText));
        }
        pending--;
        if (! pending) {
          callback();
        }
      };
      req.send();
    });
    if (! pending) {
      callback();
    }
  }

};

var TextParser = exports.TextParser = function (runner, text) {
  if (typeof esprima == "undefined") {
    if (typeof require != "undefined") {
      esprima = require("./esprima/esprima.js");
    } else {
      throw 'You must install or include esprima.js';
    }
  }
  this.runner = runner;
  this.text = text;
};

TextParser.fromFile = function (runner, filename) {
  if (typeof filename != "string") {
    throw "You did you give a filename for the second argument: " + filename;
  }
  if (typeof require == "undefined") {
    throw "This method only works in Node, with the presence of require()";
  }
  var fs = require('fs');
  var text = fs.readFileSync(filename, 'UTF-8');
  return new TextParser(runner, text);
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
      if (comment.type != 'Block') {
        continue;
      }
      if (comment.value.search(/^\s*=>/) == -1) {
        // Not a comment we care about
        continue;
      }
      var start = comment.range[0];
      var end = comment.range[1];
      var example = this.text.substr(pos, start-pos);
      var output = comment.value.replace(/^\s*=>\s*/, '');
      var ex = this.runner.makeExample(example, output);
      this.runner.examples.push(ex);
      pos = end;
    }
    var last = this.text.substr(pos, this.text.length-pos);
    if (strip(last)) {
      this.runner.examples.push(this.runner.makeExample(last, ''));
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
  return text;
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
      '/', '.', '*', '+', '?', '|',
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
  self.binds = options.binds || null;
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
      writeln(self.formatCall());
    }
    if (self.throwError) {
      var throwError = self.throwError;
      if (typeof throwError == "function") {
        throwError = self.throwError.apply(this, arguments);
      }
      throw throwError;
    }
    if (self.applies) {
      return self.applies.apply(this, arguments);
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
      if (self.wrapArgs) {
        var maxLen = 10;
      } else {
        var maxLen = undefined;
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
      if (props[i] === props.prototype[i]) {
        continue;
      }
      self.method(i, props[i]);
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

var params = exports.params = {};

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
      if (parts[i].indexOf('=') == -1) {
        var name = decodeURIComponent(parts[i]);
        var value = null;
      } else {
        var name = decodeURIComponent(parts[i].substr(0, parts[i].indexOf('=')));
        var value = decodeURIComponent(parts[i].substr(parts[i].indexOf('=')+1));
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

  if (location.hash.substr(0, 8) == '#example') {
    location.hash = '';
  }
}

if (typeof window != 'undefined') {
  window.addEventListener('load', function () {
    if (hasClass(doc.body), 'autodoctest') {
      var runner = new Runner();
      var parser = new HTMLParser(runner);
      parser.loadRemotes(function () {
        parser.parse();
        runner.run();
      });
    }
  }, false);
}

})(typeof exports == "undefined" ? (typeof doctest == "undefined" ? doctest = {} : doctest) : exports);
