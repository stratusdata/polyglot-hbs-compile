var cfg = {};
var handlebars = {};
var phraseHelpers = {
	't': function(statement, phraseMap) {
		var phrase = statement.params[0].string;
		return phrase;
	},

	'v': function(statement, phraseMap) {
		var phrasePrefix = statement.params[1].string;
		var matchedPhrases = Object.keys(phraseMap).filter(function(a) {
			return a.indexOf(phrasePrefix) === 0;
		});
		return matchedPhrases;
	}
}

var fs = require('fs');
var handlebars = require('handlebars');
var path = require('path');
var polyglot = require('node-polyglot');

function isMustache(node) {
	return node.type === 'mustache';
}

function hasValue(v) {
	return v;
}

function getHelper(statement) {
	var id = statement.id;
	return id && phraseHelpers[id.original];
}

function flatten(arr) {
	return [].concat.apply([], arr);
}

function replaceStatics(statements, phraseMap) {
	for (var i = 0, l = statements.length; i < l; i++) {
		var mustache = statements[i];
		var helper = getHelper(mustache);
		if (helper) {
			var phrase = helper(mustache);

			if (phrase instanceof Array) {
				continue;
			}

			// If a translation exists, replace the function call
			// with static content
			if (phraseMap && phraseMap[phrase]) {
				statements[i] = {
					type: 'content',
		  			string: phraseMap[phrase]
		  		};
			}
		}
	}
}

function unwindBlocks(statements) {
	var unwound = [];

	statements.forEach(function(s) {
		unwound = unwound.concat(unwindBlock(s));
	});

	return unwound;
}

function unwindBlock(block) {
	var statements = [];
	if (block) {
		if (block.program) {
			var program = block.program.statements.reduce(function(arr, statement) {
				var uw = unwindBlock(statement);
				arr = arr.concat(uw);
				return arr;
			}, []);

			statements = statements.concat(program);
		}

		if (block.inverse) {
			var inverse = block.inverse.statements.reduce(function(arr, statement) {
				var uw = unwindBlock(statement);
				arr = arr.concat(uw);
				return arr;
			}, []);

			statements = statements.concat(inverse);
		}

		statements.push(block);
	}

	return statements;
}


function template(locale, partialName, partialContents, cfg, next) {
	var rootName = cfg.rootName || 'pyhbs';

	var clientTemplate = {};
	var template = partialContents;

	if (template === null) {
		return;
	}

	var phraseMap = {};
	var localeMap = cfg.phraseMap || {};

	var ast = handlebars.parse(template);
	var statements = unwindBlocks(ast.statements);
	var mustaches = statements.filter(isMustache);

	if (false || cfg.aggressive) {
		replaceStatics(ast.statements, localeMap);
	}

	function getPhrase(statement) {
		var helper = getHelper(statement);
		if (helper) {
			var p = helper(statement, localeMap);
			return p instanceof Array ? p : [p];
		}

		return null;
	}

	var phrases = flatten(mustaches.map(getPhrase)).filter(hasValue);
	
	phrases.forEach(function(p) {
		phraseMap[p] = localeMap[p];
	});

	clientTemplate = {
		phraseMap: phraseMap,
		template: handlebars.precompile(ast).toString()
	};

	var fn = JSON.stringify(clientTemplate.template);

	return '(\'' + rootName + '\' in this) && ' + rootName + '.register("' + partialName + '", { phrases: ' + JSON.stringify(phraseMap) + ', template: ' + clientTemplate.template.toString() + ' });';
}

function compile(locale, name, partialContents, cfg, next) {
	return template(locale, name, partialContents, cfg);
}


module.exports.compile = compile;
