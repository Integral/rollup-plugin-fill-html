'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = require('fs');
var fs__default = _interopDefault(fs);
var crypto = _interopDefault(require('crypto'));
var path = require('path');

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var isStream_1 = createCommonjsModule(function (module) {

var isStream = module.exports = function (stream) {
	return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function';
};

isStream.writable = function (stream) {
	return isStream(stream) && stream.writable !== false && typeof stream._write === 'function' && typeof stream._writableState === 'object';
};

isStream.readable = function (stream) {
	return isStream(stream) && stream.readable !== false && typeof stream._read === 'function' && typeof stream._readableState === 'object';
};

isStream.duplex = function (stream) {
	return isStream.writable(stream) && isStream.readable(stream);
};

isStream.transform = function (stream) {
	return isStream.duplex(stream) && typeof stream._transform === 'function' && typeof stream._transformState === 'object';
};
});

var hasha = function (input, opts) {
	opts = opts || {};

	var outputEncoding = opts.encoding || 'hex';

	if (outputEncoding === 'buffer') {
		outputEncoding = undefined;
	}

	var hash = crypto.createHash(opts.algorithm || 'sha512');

	var update = function (buf) {
		var inputEncoding = typeof buf === 'string' ? 'utf8' : undefined;
		hash.update(buf, inputEncoding);
	};

	if (Array.isArray(input)) {
		input.forEach(update);
	} else {
		update(input);
	}

	return hash.digest(outputEncoding);
};

hasha.stream = function (opts) {
	opts = opts || {};

	var outputEncoding = opts.encoding || 'hex';

	if (outputEncoding === 'buffer') {
		outputEncoding = undefined;
	}

	var stream = crypto.createHash(opts.algorithm || 'sha512');
	stream.setEncoding(outputEncoding);
	return stream;
};

hasha.fromStream = function (stream, opts) {
	if (!isStream_1(stream)) {
		return Promise.reject(new TypeError('Expected a stream'));
	}

	opts = opts || {};

	return new Promise(function (resolve, reject) {
		stream
			.on('error', reject)
			.pipe(hasha.stream(opts))
			.on('error', reject)
			.on('finish', function () {
				resolve(this.read());
			});
	});
};

hasha.fromFile = function (fp, opts) { return hasha.fromStream(fs__default.createReadStream(fp), opts); };

hasha.fromFileSync = function (fp, opts) { return hasha(fs__default.readFileSync(fp), opts); };

var hasha_1 = hasha;

// import cheerio from 'cheerio';
var cheerio = require('cheerio');

function traverse(dir, list) {
	var dirList = fs.readdirSync(dir);
	dirList.forEach(function (node) {
		var file = dir + "/" + node;
		if (fs.statSync(file).isDirectory()) {
			traverse(file, list);
		} else {
			if (/\.js$/.test(file)) {
				list.push({ type: 'js', file: file });
			} else if (/\.css$/.test(file)) {
				list.push({ type: 'css', file: file });
			}
		}
	});
}

function isURL(url){
  return /^(((https|http|ftp|rtsp|mms):)?\/\/)+[A-Za-z0-9]+\.[A-Za-z0-9]+[\/=\?%\-&_~`@[\]\':+!]*([^<>\"\"])*$/.test(url);
}

function index (opt) {
	if ( opt === void 0 ) opt = {};

	var template = opt.template;
	var filename = opt.filename;
	var externals = opt.externals;
	var inject = opt.inject;
	var defaultmode = opt.defaultmode;

	return {
		name: 'html',
		onwrite: function onwrite(config, data) {
			var $ = cheerio.load(fs.readFileSync(template).toString());
			var head = $('head');
			var body = $('body');
			var file = config.file;
			var fileList = [];
			// relative('./', dest) will not be equal to dest when dest is a absolute path
			var destPath = path.relative('./', file);
			var firstDir = destPath.slice(0, destPath.indexOf(path.sep));
			var destFile = firstDir + "/" + (filename || path.basename(template));

			traverse(firstDir, fileList);

			if (Array.isArray(externals)) {
				var firstBundle = 0;
				externals.forEach(function(node) {
					if (node.pos === 'before') {
						fileList.splice(firstBundle++, 0, node);
					} else {
						fileList.splice(fileList.length, 0, node);
					}
				});
			}

			fileList.forEach(function (node) {
				var type = node.type;
				var file = node.file;
				var hash = '';
				var code = '';

				if (/\[hash\]/.test(file)) {
					if (file === destPath) {
						// data.code will remove the last line of the source code(//# sourceMappingURL=xxx), so it's needed to add this
						code = data.code + "//# sourceMappingURL=" + (path.basename(file)) + ".map";
					} else {
						code = fs.readFileSync(file).toString();
					}
					hash = hasha_1(code, { algorithm: 'md5' });
					// remove the file without hash
					fs.unlinkSync(file);
					file = file.replace('[hash]', hash);
					fs.writeFileSync(file, code);
				}

				var src = isURL(file) ? file : path.relative(firstDir, file);

				if (type === 'js') {
					var attrs = {src: src};
					var mode = node.mode || defaultmode;
					if (mode) { attrs.type = mode; }
					attrs = Object.entries(function (ref) {
						var key = ref[0];
						var val = ref[1];

						return (key + "=\"" + val + "\"");
					}).join(' ');
					var script = "<script " + attrs + "></script>\n";
					// node.inject will cover the inject
					if (node.inject === 'head' || inject === 'head') {
						head.append(script);
					} else {
						body.append(script);
					}
				} else if (type === 'css') {
					head.append(("<link rel=\"stylesheet\" href=\"" + src + "\">\n"));
				}
			});
			fs.writeFileSync(destFile, $.html({ decodeEntities: false }));
		}
	};
}

module.exports = index;
