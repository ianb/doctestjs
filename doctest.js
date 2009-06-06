/* 

Javascript doctest runner
Copyright 2006-2007 Ian Bicking

This program is free software; you can redistribute it and/or modify it under 
the terms of the MIT License.

*/


function doctest(verbosity/*default=0*/, elementId/*optional*/,
                 outputId/*optional*/) {
  var output = document.getElementById(outputId || 'doctestOutput');
  var reporter = new doctest.Reporter(output, verbosity || 0);
  if (elementId) {
      var el = document.getElementById(elementId);
      if (! el) {
          throw('No such element '+elementId);
      }
      doctest.runDoctest(el, reporter);
  } else {
      var els = doctest.getElementsByTagAndClassName('pre', 'doctest');
      for (var i=0; i<els.length; i++) {
          doctest.runDoctest(els[i], reporter);
      }
  }
  reporter.finish();
}

doctest.runDoctest = function (el, reporter) {
  logDebug('Testing element '+doctest.repr(el));
  reporter.startElement(el);
  var parsed = new doctest.Parser(el);
  var runner = new doctest.JSRunner(reporter)
  for (var i=0; i<parsed.examples.length; i++) {
    runner.run(parsed.examples[i]);
  }
};

doctest.Parser = function (el) {
  if (this === window) {
    throw('you forgot new!');
  }
  var text = doctest.getText(el);
  var lines = text.split(/(\r\n|\r|\n)/);
  this.examples = [];
  var example_lines = [];
  var output_lines = [];
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    if (/^[$]/.test(line)) {
      if (example_lines.length) {
        ex = new doctest.Example(example_lines, output_lines);
        this.examples.push(ex);
      }
      example_lines = [];
      output_lines = [];
      line = doctest.strip(line.substr(1));
      example_lines.push(line);
    } else if (/^>/.test(line)) {
      if (! example_lines.length) {
        throw('Bad example: '+doctest.repr(line)+'\n'
              +'> line not preceded by $');
      }
      line = doctest.strip(line.substr(1));
      example_lines.push(line);
    } else {
      output_lines.push(line);
    }
  }
  if (example_lines.length) {
    ex = new doctest.Example(example_lines, output_lines);
    this.examples.push(ex);
  }
};

doctest.Example = function (example, output) {
  if (this === window) {
    throw('you forgot new!');
  }
  this.example = example.join('\n');
  this.output = output.join('\n');
};

doctest.Reporter = function (container, verbosity) {
  if (this === window) {
    throw('you forgot new!');
  }
  if (! container) {
    throw('No container passed to doctest.Reporter');
  }
  this.container = container;
  this.verbosity = verbosity;
  this.success = 0;
  this.failure = 0;
  this.elements = 0;
}

doctest.Reporter.prototype.startElement = function (el) {
  this.elements += 1;
}

doctest.Reporter.prototype.reportSuccess = function (example, output) {
  if (this.verbosity > 0) {
    if (this.verbosity > 1) {
      this.write('Trying:\n');
      this.write(this.formatOutput(example.example));
      this.write('Expecting:\n');
      this.write(this.formatOutput(example.output));
      this.write('ok\n');
    } else {
      this.writeln(example.example + ' ... passed!');
    }
  }
  this.success += 1;
}

doctest.Reporter.prototype.reportFailure = function (example, output) {
  this.write('Failed example:\n');
  this.write('<span style="color: #00f">'
             +this.formatOutput(example.example)
             +'</span>');
  this.write('Expected:\n');
  this.write(this.formatOutput(example.output));
  this.write('Got:\n');
  this.write(this.formatOutput(output));
  this.failure += 1;
}

doctest.Reporter.prototype.finish = function () {
  this.writeln((this.success+this.failure)
               + ' tests in ' + this.elements + ' items.');
  if (this.failure) {
    var color = '#f00';
  } else {
    var color = '#0f0';
  }
  this.writeln(this.success + ' passed and '
               + '<span style="color: '+color+'">'
               + this.failure + '</span> failed.');
}

doctest.Reporter.prototype.writeln = function (text) {
  this.write(text+'\n');
}

doctest.Reporter.prototype.write = function (text) {
  var leading = /^[ ]*/.exec(text)[0];
  text = text.substr(leading.length);
  for (var i=0; i<leading.length; i++) {
    text = String.fromCharCode(160)+text;
  }
  text = text.replace(/\n/g, '<br>');
  this.container.innerHTML += text;
}

doctest.Reporter.prototype.formatOutput = function (text) {
  if (! text) {
    return '    <span style="color: #999">(nothing)</span>\n';
  }
  var lines = text.split(/\n/);
  var output = ''
  for (var i=0; i<lines.length; i++) {
    output += '    '+doctest.escapeHTML(lines[i])+'\n';
  }
  return output;
}

doctest.JSRunner = function (reporter) {
  if (this === window) {
    throw('you forgot new!');
  }
  this.reporter = reporter;
}

doctest.JSRunner.prototype.run = function (example) {
  var cap = new doctest.OutputCapturer();
  cap.capture();
  try {
    var result = window.eval(example.example);
  } catch (e) {
    writeln('Error: ' + e.message);
    result = null;
    logDebug('Traceback for error '+e+':');
    if (e.stack) {
      var stack = e.stack.split('\n');
      for (var i=0; i<stack.length; i++) {
        if (stack[i] == '@:0' || ! stack[i]) {
          continue;
        }
        var parts = stack[i].split('@');
        var context = parts[0];
        parts = parts[1].split(':');
        var filename = parts[parts.length-2].split('/');
        filename = filename[filename.length-1];
        var lineno = parts[parts.length-1];
        if (context != '' && filename != 'jsdoctest.js') {
          logDebug('  ' + context + ' -> '+filename+':'+lineno);
        }
      }
    }
  }
  if (typeof result != 'undefined'
      && result !== null) {
    writeln(doctest.repr(result));
  }
  cap.stopCapture();
  success = this.checkResult(cap.output, example.output)
  if (success) {
    this.reporter.reportSuccess(example, cap.output);
  } else {
    this.reporter.reportFailure(example, cap.output);
    logDebug('Failure: '+doctest.repr(example.output)
             +' != '+doctest.repr(cap.output));
  }
}

doctest.JSRunner.prototype.checkResult = function (got, expected) {
  expected = expected.replace(/[\n\r]*$/, '') + '\n';
  got = got.replace(/[\n\r]*$/, '') + '\n';
  if (expected == '...\n') {
    return true;
  }
  expected = RegExp.escape(expected);
  // Note: .* doesn't match newlines, but [^] matches everything
  expected = '^' + expected.replace(/\\.\\.\\./g, "[^]*") + '$';
  expected = expected.replace(/\n/, '\\n');
  var re = new RegExp(expected);
  return got.search(re) != -1;
}

RegExp.escape = function(text) {
  if (!arguments.callee.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    arguments.callee.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')', 'g'
    );
  }
  return text.replace(arguments.callee.sRE, '\\$1');
}

doctest.OutputCapturer = function () {
  if (this === window) {
    throw('you forgot new!');
  }
  this.output = '';
}

var output = null;

doctest.OutputCapturer.prototype.capture = function () {
  output = this;
}

doctest.OutputCapturer.prototype.stopCapture = function () {
  output = null;
}

doctest.OutputCapturer.prototype.write = function (text) {
  this.output += text;
}

function writeln() {
  for (var i=0; i<arguments.length; i++) {
    write(arguments[i]);
    if (i) {
      write(' ');
    }
  }
  write('\n');
}

doctest.writeln = writeln;

function write(text) {
  if (output !== null) {
    output.write(text);
  } else {
    log(text);
  }
}

doctest.write = write;

function assert(expr, statement) {
    if (typeof expr == 'string') {
        if (! statement) {
            statement = expr;
        }
        expr = eval(expr);
    }
    if (! expr) {
        throw('AssertionError: '+statement);
    }
}

doctest.assert = assert;

doctest.getText = function (el) {
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
      text += doctest.getText(sub);
    }
  }
  return text;
}

doctest.reload = function (button/*optional*/) {
    if (button) {
        button.innerHTML = 'reloading...';
        button.disabled = true;
    }
    location.reload();
};

/* Taken from MochiKit */
doctest.repr = function (o) {
    if (typeof o == 'undefined') {
        return 'undefined';
    } else if (o === null) {
        return "null";
    }
    try {
        if (typeof(o.__repr__) == 'function') {
            return o.__repr__();
        } else if (typeof(o.repr) == 'function' && o.repr != arguments.callee) {
            return o.repr();
        }
        for (var i=0; i<doctest.repr.registry.length; i++) {
            var item = doctest.repr.registry[i];
            if (item[0](o)) {
                return item[1](o);
            }
        }
    } catch (e) {
        if (typeof(o.NAME) == 'string' && (
                o.toString == Function.prototype.toString ||
                    o.toString == Object.prototype.toString)) {
            return o.NAME;
        }
    }
    try {
        var ostring = (o + "");
    } catch (e) {
        return "[" + typeof(o) + "]";
    }
    if (typeof(o) == "function") {
        ostring = ostring.replace(/^\s+/, "").replace(/\s+/g, " ");
        var idx = ostring.indexOf("{");
        if (idx != -1) {
            ostring = ostring.substr(o, idx) + "{...}";
        }
    }
    return ostring;
}

doctest.repr.registry = [
    [function (o) {
         return typeof o == 'string';},
     function (o) {
         o = '"' + o.replace(/([\"\\])/g, '\\$1') + '"';
         o = o.replace(/[\f]/g, "\\f")
         .replace(/[\b]/g, "\\b")
         .replace(/[\n]/g, "\\n")
         .replace(/[\t]/g, "\\t")
         .replace(/[\r]/g, "\\r"); 
         return o;
     }],
    [function (o) {
         return typeof o == 'number';},
     function (o) {
         return o + "";
     }],
    [function (o) {
         var typ = typeof o;
         if ((typ != 'object' && ! (type == 'function' && typeof o.item == 'function')) ||
             o === null || 
             typeof o.length != 'number' ||
             o.nodeType === 3) {
             return false;
         }
         return true;
     },
     function (o) {
         var s = "[";
         for (var i=0; i<o.length; i++) {
             s += repr(o[i]);
             if (i != o.length-1) {
                 s += ", ";
             }
         }
         s += "]";
         return s;
     }]];

doctest.getElementsByTagAndClassName = function (tagName, className, parent/*optional*/) {
    parent = parent || document;
    var els = parent.getElementsByTagName(tagName);
    var result = [];
    var re = new RegExp("\\b"+className+"\\b");
    for (var i=0; i<els.length; i++) {
        var el = els[i];
        if (el.className && el.className.search(re) != -1) {
            result.push(el);
        }
    }
    return result;
};

doctest.strip = function (str) {
    str = str + "";
    return str.replace(/\s+$/, "").replace(/^\s+/, "");
};

doctest.escapeHTML = function (s) {
    return s.replace(/&/g, '&amp;')
    .replace(/\"/g, "&quot;")
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

doctest.extend = function (obj, extendWith) {
    for (i in extendWith) {
        obj[i] = extendWith[i];
    }
    return obj;
};

doctest.extendDefault = function (obj, extendWith) {
    for (i in extendWith) {
        if (typeof obj[i] == 'undefined') {
            obj[i] = extendWith[i];
        }
    }
    return obj;
};

if (typeof repr == 'undefined') {
    repr = doctest.repr;
}

if (typeof log == 'undefined') {
    if (typeof console != 'undefined' 
        && typeof console.log != 'undefined') {
        log = console.log;
    } else {
        function log() {
            // FIXME: do something
        }
    }
}

if (typeof logDebug == 'undefined') {
    logDebug = log;
}

if (typeof logInfo == 'undefined') {
    logInfo = log;
}

