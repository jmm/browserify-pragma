/*
Copyright (c) 2015 Jesse McCarthy <http://jessemccarthy.net/>
*/

var
  rs = require('readable-stream'),
  util = require('util');

module.exports = BrowserifyPragma;

/**
 * Implement browserify pragma handling logic. A pragma is a fragment that can
 * be prepended to bundles and subsequently detected by browserify during
 * bundling to apply appropriate handling to the module, e.g. omitting parsing
 * for `require()` calls. A pragma looks like (backticks not literal):
 * `({"compiler": "browserify", "version": "1.23.456"});`
 */
function BrowserifyPragma (opts) {
  if (!(this instanceof BrowserifyPragma)) return new BrowserifyPragma(opts);
  var self = this;
  opts = opts || {};

  Object.keys(opts).forEach(function (prop) {
    self[prop] = opts[prop];
  });

  // Store content from start of file.
  self.src = [];
  self.src.byteLength = 0;
  self.detected = false;
  self.present = false;
}
// BrowserifyPragma

/**
 * Generate browserify pragma.
 */
BrowserifyPragma.generate = function (opts) {
  opts = opts || {};

  // Manually construct this as a string (instead of using JSON.stringify()) to
  // ensure property order.
  return BrowserifyPragma.prototype.template.replace(
    'VERSION',
    opts.version
  );
};
// generate

/**
 * Test for browserify pragma.
 * @param string src
 * @return boolean
 */
BrowserifyPragma.detect = function (src) {
  return this.prototype.re.test(src);
};
// detect

var Pragma = BrowserifyPragma.prototype;

Pragma.encoding = 'utf-8';

// Placeholder version value to represent the max length.
Pragma.version = '123.456.789';

// Max bytes that may precede pragma. 3 = max BOM length.
Pragma.preMaxBytes = 3;

Pragma.template = '({"compiler": "browserify", "version": "VERSION"});';

Pragma.sample = Pragma.template.replace('VERSION', Pragma.version);

Pragma.re = new RegExp(
  "^" +
  // BOM
  "\\uFEFF?" +
  Pragma.template
    .replace(/[(){}]/g, '\\$&')
    .replace(
      'VERSION',
      '[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}'
    )
);

// Minimum number of bytes needed to detect pragma.
Pragma.minBytes =
  Pragma.preMaxBytes + Buffer.byteLength(Pragma.sample, Pragma.encoding);

function Detector () {
  rs.Transform.apply(this, arguments);
}
// Detector

util.inherits(Detector, rs.Transform);

Detector.prototype._transform = function _transform (chunk, enc, cb) {
  var pragma = this.pragma;
  if (!pragma.detected) {
    pragma.src.push(chunk);
    pragma.src.byteLength += chunk.length;

    if (pragma.src.byteLength >= pragma.minBytes) {
      pragma.present = BrowserifyPragma.detect(
        Buffer.concat(pragma.src).toString(Pragma.encoding)
      );

      pragma.detected = true;
      pragma.done(pragma);
    }
  }
  this.push(chunk);
  cb();
}
// _transform

Detector.prototype._flush = function _flush (cb) {
  // Source didn't contain enough bytes to test for pragma.
  if (!this.pragma.detected) this.pragma.done(this.pragma);
  this.pragma.src = [];
  cb();
}
// _flush

// Setup a stream to pipe source through first to check for the pragma
// before piping to other streams.
Pragma.detector = function () {
  if (!this._detector) {
    var stream = this._detector = new Detector;
    stream.pragma = this;
  }
  return this._detector;
};
// detector
