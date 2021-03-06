/*
 * 
LispyScript - Javascript using tree syntax!
This is the compiler written in javascipt
 *
*/

var fs = require('fs'),
    path = require('path'),
    _ = require('underscore');

String.prototype.repeat = function(num) {
    return new Array(num + 1).join(this);
};

this.version = "0.1.6";
var _LS = {},
    banner = "// Generated by LispyScript v" + this.version + "\n",
    isWhitespace = /\s/,
    isFunction = /^function/,
    validName = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
    noReturn = /^var|set|throw\b/,
    indent = -4,
    keywords = {},
    macros = {},
    templates = {};
templates["var"] = _.template("var <%= rest %>");
templates["set"] = _.template("<%= name %> = <%= value %>");
templates["function"] = _.template("function(<%= params %>) {\n<%= expressions %><%= indent %>}");
templates["try"] = _.template("(function () {try {\n<%= trypart %><%= indent %>} catch (err) {return (<%= catchpart %>)(err);}})()");
templates["if"] = _.template("<%= condition %> ?\n<%= indent %><%= trueexpr %> : <%= falseexpr %>");
templates["get"] = _.template("<%= list %>[<%= key %>]");
templates["operator"] = _.template("(<%= loperand %> <%= operator %> <%= roperand %>)");
templates["str"] = _.template("[<%= elems %>].join('')");

var parse = function(code, filename) {
    code = "(" + code + ")";
    var length = code.length,
        pos = 1,
        lineno = 1;
        
    var parser = function() {
        var tree = [],
            token = "",
            isString = false,
            isSingleString = false,
            isJSArray = 0,
            isJSObject = 0,
            isListComplete = false,
            isComment = false,
            isRegex = false;
        tree._line = lineno;
        tree._filename = filename;
        var handleToken = function() {
            if (token) {
                tree.push(token);
                token = "";
            }
        };
        while (pos < length) {
            var c = code.charAt(pos);
            pos++;
            if (c == "\n") {
                lineno++;
                if (isComment) isComment = false;
            }
            if (isComment) continue;
            if (c == '"') {
                if (isString && token[token.length - 1] === "\\") {
                    token += c;
                    continue;
                }
                isString = !isString;
                token += c;
                continue;
            }
            if (isString) {
                if (c === "\n")
                    token += "\\n";
                else
                    token += c;
                continue;
            }
            if (c == "'") {
                isSingleString = !isSingleString;
                token += c;
                continue;
            }
            if (isSingleString) {
                token += c;
                continue;
            }
            if (c == '[') {
                isJSArray++;
                token += c;
                continue;
            }
            if (c == ']') {
                if (isJSArray === 0) throw handleError(4, tree._line, tree._filename);
                isJSArray--;
                token += c;
                continue;
            }
            if (isJSArray) {
                token += c;
                continue;
            }
            if (c == '{') {
                isJSObject++;
                token += c;
                continue;
            }
            if (c == '}') {
                if (isJSObject === 0) throw handleError(6, tree._line, tree._filename);
                isJSObject--;
                token += c;
                continue;
            }
            if (isJSObject) {
                token += c;
                continue;
            }
            if (c == "#") {
                isComment = true;
                continue;
            }
            if (c == "/") {
                isRegex = true;
                token += c;
                continue;
            }
            if (isRegex) {
                if (isWhitespace.test(c)) {
                    isRegex = false;
                } else {
                    token += c;
                    continue;
                }
            }
            if (c == "(") {
                tree.push(parser());
                continue;
            }
            if (c == ")") {
                isListComplete = true;
                handleToken();
                break;
            }
            if (isWhitespace.test(c)) {
                handleToken();
                continue;
            }
            token += c;
        }
        if (isString) throw handleError(3, tree._line, tree._filename);
        if (isSingleString) throw handleError(3, tree._line, tree._filename);
        if (isJSArray > 0) throw handleError(5, tree._line, tree._filename);
        if (isJSObject > 0) throw handleError(7, tree._line, tree._filename);
        if (!isListComplete) throw handleError(8, tree._line, tree._filename);
        return tree;
    };
    var ret = parser();
    if (pos < length) throw handleError(10);
    return ret;
};

var handleExpressions = function(exprs) {
    indent += 4;
    var ret = "",
        l = exprs.length,
        indentstr = " ".repeat(indent);
    _.each(exprs, function(expr, i, exprs) {
        var tmp = "", r = "";
        if (_.isArray(expr)) {
            if (expr[0] === "include") 
                ret += handleExpression(expr);
            else
                tmp = handleExpression(expr);
        } else {
            tmp = expr;
        }
        if (i === l - 1 && indent) {
            if (!noReturn.test(tmp)) r = "return ";
        }
        if (tmp.length > 0)
            ret += indentstr + r + tmp + ";\n";
    });
    indent -= 4;
    return ret;
};

var handleExpression = function(expr) {
    var command = expr[0];
    if (macros[command]) {
        expr = macroExpand(expr);
        return handleExpression(expr);
    }
    if (_.isString(command)) {
        if (keywords[command])
            return keywords[command](expr);
        if (command.charAt(0) === ".") {
            return "(" + (_.isArray(expr[1]) ? handleExpression(expr[1]) : expr[1]) + ")" + command;
        }
    }
    handleSubExpressions(expr);
    var fName = expr[0];
    if (!fName) throw handleError(1, expr._line);
    if (isFunction.test(fName)) fName = "(" + fName + ")";
    return fName + "(" + expr.slice(1).join(",") + ")";
    
};

var handleSubExpressions = function(expr) {
    _.each(expr, function(value, i, t) {
        if (_.isArray(value)) t[i] = handleExpression(value);
    });    
};

var macroExpand = function(tree) {
    var command = tree[0],
        template = macros[command]["template"],
        code = macros[command]["code"],
        replacements = {};
    for (var i = 0; i < template.length; i++) {
        if (template[i] == "rest...") {
            replacements["~rest..."] = tree.slice(i + 1);
        } else {
            replacements["~" + template[i]] = tree[i + 1];
        }
    }
    var replaceCode = function(source) {
        var ret = [];
        ret._line = tree._line;
        for (var i = 0; i < source.length; i++) {
            if (typeof source[i] == "object") {
                ret.push(replaceCode(source[i]));
            } else {
                var token = source[i];
                var isATSign = false;
                if (token.indexOf("@") >= 0) {
                    isATSign = true;
                    token = token.replace("@", "") ;
                }
                if (replacements[token]) {
                    var repl = replacements[token];
                    if (isATSign || token == "~rest...") {
                        for (var j = 0; j < repl.length; j++)
                            ret.push(repl[j]);
                    } else {
                        ret.push(repl);
                    }
                } else {                    
                    ret.push(token);
                }
            }
        }
        return ret;
    };
    return replaceCode(code);
};

var handleOperator = function(arr) {
    if (arr.length != 3)  throw handleError(0, arr._line);
    handleSubExpressions(arr);
    if (arr[0] == "=") arr[0] = "===";
    if (arr[0] == "!=") arr[0] = "!==";
    return templates["operator"]({operator: arr[0], loperand: arr[1], roperand: arr[2]});
};

var includeFile = (function () {
    var included = [];
    return function(filename) {
        var found = _.find(included, function(f) {return f === filename});
        if (found) return "";
        included.push(filename);
        var code = fs.readFileSync(filename);
        var tree = parse(code, filename);
        return handleExpressions(tree);
    };
})();

var handleError = function(no, line, filename) {
    return errors[no] + ((line) ? "\nLine no " + line : "") + ((filename) ? "\nFile " + filename : "");
};

keywords["var"] = function(arr) {
    if (!validName.test(arr[1])) throw handleError(9, arr._line, arr._filename);
    return templates["var"]({rest: keywords.set(arr)});
};

keywords["set"] = function(arr) {
    if (arr.length != 3) throw handleError(0, arr._line, arr._filename);
    return templates["set"]({
        name: arr[1],
        value: (typeof arr[2] == "object") ? handleExpression(arr[2]) : arr[2]});
};

keywords["function"] = function(arr) {
    if (arr.length < 3) throw handleError(0, arr._line, arr._filename);
    if (typeof arr[1] != "object") throw handleError(0, arr._line);
    return templates["function"]({
        params: arr[1].join(","),
        expressions: handleExpressions(arr.slice(2)),
        indent: " ".repeat(indent)});
};

keywords["try"] = function(arr) {
    if (arr.length < 3) throw handleError(0, arr._line, arr._filename);
    var c = arr.pop();
    return templates["try"]({
        trypart: handleExpressions(arr.slice(1)),
        catchpart: handleExpression(c),
        indent: " ".repeat(indent)});
};

keywords["if"] = function(arr) {
    if (arr.length < 3 || arr.length > 4)  throw handleError(0, arr._line, arr._filename);
    indent += 4;
    handleSubExpressions(arr);
    var ret = templates["if"]({
        condition: arr[1],
        trueexpr: arr[2],
        falseexpr: arr[3],
        indent: " ".repeat(indent)});
    indent -= 4;
    return ret;
};


keywords["get"] = function(arr) {
    if (arr.length != 3) throw handleError(0, arr._line, arr._filename);
    return templates["get"]({key: arr[1], list: arr[2]});
};

keywords["str"] = function(arr) {
    if (arr.length < 2) throw handleError(0, arr._line, arr._filename);
    handleSubExpressions(arr);
    return templates["str"]({elems: arr.slice(1).join(",")});
};

keywords["macro"] = function(arr) {
    if (arr.length != 4)  throw handleError(0, arr._line, arr._filename);
    macros[arr[1]] = {template: arr[2], code: arr[3]};
    return "";
};

keywords["include"] = function(arr) {
    if (arr.length != 2)  throw handleError(0, arr._line, arr._filename);
    indent -= 4;
    var filename = arr[1];
    if (typeof filename === "string")
        filename = filename.replace(/["']/g, "");
    try {
        filename = fs.realpathSync(filename);
    } catch (err) {
        throw handleError(11, arr._line, arr._filename);
    }
    var ret = includeFile(filename);
    indent += 4;
    return ret;
};

keywords["+"] = handleOperator;

keywords["-"] = handleOperator;

keywords["*"] = handleOperator;

keywords["/"] = handleOperator;

keywords["%"] = handleOperator;

keywords["="] = handleOperator;

keywords["!="] = handleOperator;

keywords[">"] = handleOperator;

keywords[">="] = handleOperator;

keywords["<"] = handleOperator;

keywords["<="] = handleOperator;

keywords["||"] = handleOperator;

keywords["&&"] = handleOperator;

keywords["!"] = function(arr) {
    if (arr.length != 2)  throw handleError(0, arr._line, arr._filename);
    handleSubExpressions(arr);
    return "(!" + arr[1] + ")";
};

errors = [];
errors[0] = "Syntax Error";
errors[1] = "Empty statement";
errors[2] = "Invalid characters in function name";
errors[3] = "End of File encountered, unterminated string";
errors[4] = "Closing square bracket, without an opening square bracket";
errors[5] = "End of File encountered, unterminated array";
errors[6] = "Closing curly brace, without an opening curly brace";
errors[7] = "End of File encountered, unterminated javascript object '}'";
errors[8] = "End of File encountered, unterminated parenthesis";
errors[9] = "Invalid character in var name";
errors[10] = "Extra chars at end of file. Maybe an extra ')'.";
errors[11] = "Cannot Open include File";

this._compile = function(code, filename) {
  includeFile(path.join(__dirname,"../src") + "/macros.ls");
  var tree = parse(code, filename);
  return banner + handleExpressions(tree);
};
