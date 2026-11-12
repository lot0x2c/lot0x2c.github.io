// playground: highlight typed code in both themes and print the matching config
(function () {
	"use strict";

	// palettes, as in the theme files
	var PALETTES = {
		candy: {
			b00: "#feedf3", b01: "#f8e2e7", b02: "#e0ccd1", b03: "#816473",
			b04: "#745268", b05: "#5c4250", b06: "#463840", b07: "#352930",
			b08: "#d12362", b09: "#a45174", b0A: "#ae39bd", b0B: "#057b66",
			b0C: "#007a6c", b0D: "#007888", b0E: "#c5278a", b0F: "#cb2762"
		},
		acid: {
			b00: "#1a1218", b01: "#2a2028", b02: "#3d2d38", b03: "#927885",
			b04: "#aa8e9b", b05: "#d4b8c8", b06: "#e8d0dc", b07: "#f5e8ef",
			b08: "#f03878", b09: "#d47098", b0A: "#d050e0", b0B: "#10d4b0",
			b0C: "#00c8b0", b0D: "#00b8d4", b0E: "#f848b8", b0F: "#db487b"
		}
	};

	// --- contrast, ported from candyflip-adjust-colors in candyflip.el

	var TARGETS = {
		high: { b03: 5.5, b04: 7.5, b05: 11, b06: 12, b07: 13, other: 6 },
		low: { b03: 3, b04: 4.5, b05: 6, b06: 7, b07: 8, other: 4.5 }
	};

	function rgb(h) {
		return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; });
	}
	function hex(c) {
		return "#" + c.map(function (x) {
			var v = Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16);
			return v.length < 2 ? "0" + v : v;
		}).join("");
	}
	function lum(h) {
		var c = rgb(h).map(function (x) {
			return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	}
	function ratio(a, b) {
		var x = lum(a), y = lum(b);
		return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
	}
	function mix(a, b, f) {
		var A = rgb(a), B = rgb(b);
		return hex(A.map(function (x, i) { return x + f * (B[i] - x); }));
	}
	function push(color, bg, target, done) {
		var f = 0, out = color;
		while (!done(ratio(out, bg)) && f < 1) {
			f += 0.02;
			out = mix(color, target, f);
		}
		return out;
	}
	function adjust(pal, level) {
		var t = TARGETS[level], out = {}, k;
		for (k in pal) out[k] = pal[k];
		if (!t) return out;
		var bg = pal.b00, away = lum(bg) < 0.5 ? "#ffffff" : "#000000";
		["b03", "b04", "b05", "b06", "b07", "b08", "b09", "b0A",
		 "b0B", "b0C", "b0D", "b0E", "b0F"].forEach(function (s) {
			var r = t[s] || t.other;
			out[s] = level === "high"
				? push(pal[s], bg, away, function (x) { return x >= r; })
				: push(pal[s], bg, bg, function (x) { return x <= r; });
		});
		return out;
	}

	// --- highlighters: each rule is [sticky regex, class or classifier]

	function set(words) {
		var s = {};
		words.split(/\s+/).forEach(function (w) { s[w] = true; });
		return s;
	}
	function nextChar(src, i) {
		while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
		return src[i] || "";
	}
	function prevToken(out) {
		for (var j = out.length - 1; j >= 0; j--) {
			if (!/^\s+$/.test(out[j][0])) return out[j];
		}
		return null;
	}
	function lineStart(src, i) {
		var j = i - 1;
		while (j >= 0 && (src[j] === " " || src[j] === "\t")) j--;
		return j < 0 || src[j] === "\n";
	}

	var C_KW = set("if else for while do return switch case break continue goto typedef sizeof default static const extern inline volatile register auto struct union enum");
	var C_TYPES = set("int char void float double long short unsigned signed bool FILE");
	var C_CONST = set("NULL true false EOF");

	var C_RULES = [
		[/\/\/.*|\/\*(?:[^*]|\*(?!\/))*(?:\*\/)?/y, "c"],
		[/^[ \t]*#[ \t]*\w+/ym, "p"],
		[/<[\w.\/]+>/y, function (m, out) {
			var p = prevToken(out);
			return p && p[1] === "p" ? "s" : null;
		}],
		[/"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y, "s"],
		[/\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)[uUlLfF]*\b/y, "n"],
		[/[A-Za-z_]\w*/y, function (m, out, src, end) {
			var w = m[0];
			if (C_KW[w]) return "k";
			if (C_TYPES[w] || /_t$/.test(w)) return "t";
			if (C_CONST[w]) return "n";
			if (nextChar(src, end) === "(") return "f";
			for (var j = out.length - 1; j >= 0; j--) {
				var t = out[j][0];
				if (/^\s+$/.test(t) || t === "*") continue;
				return out[j][1] === "t" ? "v" : null;
			}
			return null;
		}]
	];

	var SH_KW = set("if then else elif fi for in do done while until case esac function return select time");
	var SH_BUILTIN = set("echo printf cd read set unset source exit eval exec shift trap alias test let local export declare readonly pwd kill wait true false type");

	var SH_RULES = [
		[/(?<=^|[\s;])#.*/ym, "c"],
		[/"(?:\\.|[^"\\])*"?|'[^']*'?/y, "s"],
		[/\$(?:\{[^}\n]*\}|\w+|[@#?$!*-])/y, "v"],
		[/[A-Za-z_][\w-]*/y, function (m, out, src, end) {
			var w = m[0], p = prevToken(out);
			if (p && p[0] === "function") return "f";
			if (SH_KW[w]) return "k";
			if (src.substr(end, 2) === "()" || src.substr(end, 3) === " ()") return "f";
			if (src[end] === "=") return "v";
			if (SH_BUILTIN[w]) return "b";
			return null;
		}]
	];

	var HS_KW = set("module import where let in case of if then else do data type newtype class instance deriving qualified as hiding forall infixl infixr infix");

	var HS_RULES = [
		[/\{-#[\s\S]*?(?:#-\}|$(?![\s\S]))/y, "p"],
		[/\{-(?:[^-]|-(?!\}))*(?:-\})?/y, "c"],
		[/--(?![!#$%&*+.\/<=>?@\\^|~:]).*/y, "c"],
		[/"(?:\\.|[^"\\\n])*"?/y, "s"],
		[/'(?:\\.|[^'\\\n])'/y, "s"],
		[/[A-Z][\w']*(?:\.[A-Z][\w']*)*/y, "t"],
		[/[a-z_][\w']*/y, function (m, out, src, end) {
			if (HS_KW[m[0]]) return "k";
			var i = end - m[0].length;
			if (i === 0 || src[i - 1] === "\n") return "f";
			return null;
		}],
		[/[!#$%&*+.\/<=>?@\\^|~:-]+/y, "v"]
	];

	var EL_KW = set("defun defmacro defsubst defvar defvar-local defconst defcustom defface defgroup define-minor-mode define-derived-mode cl-defun cl-defmacro let let* if when unless cond progn prog1 prog2 while dolist dotimes lambda and or save-excursion save-restriction save-match-data condition-case unwind-protect pcase pcase-let pcase-dolist catch throw interactive when-let* if-let* and-let* with-current-buffer with-temp-buffer setq-local require provide");
	var EL_FUNDEF = set("defun defmacro defsubst cl-defun cl-defmacro define-minor-mode define-derived-mode");
	var EL_VARDEF = set("defvar defvar-local defconst defcustom defface defgroup");

	var EL_RULES = [
		[/;.*/y, "c"],
		[/"(?:\\[\s\S]|[^"\\])*"?/y, function (m, out, src, end) {
			return lineStart(src, end - m[0].length) ? "d" : "s";
		}],
		[/:[\w-]+/y, "b"],
		[/&(?:optional|rest|key)\b/y, "t"],
		[/[^\s()'"`,;#\[\]]+/y, function (m, out, src, end) {
			var w = m[0], p = prevToken(out);
			if (p && EL_FUNDEF[p[0]]) return "f";
			if (p && EL_VARDEF[p[0]]) return "v";
			if (p && p[1] === "n" && p[0] === "'") return "n";
			if (p && p[0] === "(" && EL_KW[w]) return "k";
			return null;
		}],
		[/'/y, function (m, out) {
			var p = prevToken(out);
			return p && (p[0] === "require" || p[0] === "provide") ? "n" : null;
		}]
	];

	function orgHeading(m) {
		var level = Math.min(m[1].length, 8), cls = "h" + level, pieces = [[m[1] + m[2], cls]];
		var rest = m[3], kw = /^(TODO|DONE)(\s|$)/.exec(rest);
		if (kw) {
			pieces.push([kw[1], kw[1] === "TODO" ? "todo" : "done"]);
			rest = rest.slice(kw[1].length);
		}
		pieces.push([rest, cls]);
		return pieces;
	}

	var ORG_RULES = [
		[/^(\*+)([ \t]+)(.*)$/ym, orgHeading],
		[/^([ \t]*#\+(?:title|TITLE):)(.*)$/ym, function (m) {
			return [[m[1], "ok"], [m[2], "otitle"]];
		}],
		[/^([ \t]*#\+(?:author|AUTHOR|date|DATE|email|EMAIL):)(.*)$/ym, function (m) {
			return [[m[1], "ok"], [m[2], "oinfo"]];
		}],
		[/^([ \t]*#\+begin_(\w+)[^\n]*)(\n?)([\s\S]*?)(^[ \t]*#\+end_\2[^\n]*|$(?![\s\S]))/ymi, function (m) {
			return [[m[1], "obl"], [m[3], null], [m[4], "oblk"], [m[5], "obl"]];
		}],
		[/^[ \t]*#\+\w+:.*$/ym, "c"],
		[/^[ \t]*# .*$/ym, "c"],
		[/^[ \t]*\|.*$/ym, "otable"],
		[/(?<=^|[ \t])(?:SCHEDULED|DEADLINE|CLOSED):/ym, "osk"],
		[/[<\[]\d{4}-\d{2}-\d{2}[^>\]\n]*[>\]]/y, "odate"],
		[/\[\[[^\]\n]*\](?:\[[^\]\n]*\])?\]/y, "olink"],
		[/(?<=^|[\s(])[=~][^\s=~](?:[^\n]*?[^\s])??[=~](?=[\s.,;:!?)]|$)/ym, "ov"],
		[/(?<=^|[\s(])\*[^\s*](?:[^*\n]*?[^\s*])?\*(?=[\s.,;:!?)]|$)/ym, "obold"],
		[/(?<=^|[\s(])\/[^\s\/](?:[^\/\n]*?[^\s\/])?\/(?=[\s.,;:!?)]|$)/ym, "oital"],
		[/[^\s=~\[<*\/|]+/y, null]
	];

	var LANGS = {
		c: { rules: C_RULES, buffer: "main.c", mode: "C" },
		bash: { rules: SH_RULES, buffer: "backup.sh", mode: "Shell-script[bash]" },
		haskell: { rules: HS_RULES, buffer: "Main.hs", mode: "Haskell" },
		elisp: { rules: EL_RULES, buffer: "count.el", mode: "ELisp/l" },
		org: { rules: ORG_RULES, buffer: "notes.org", mode: "Org" }
	};

	function tokenize(src, rules) {
		var out = [], i = 0;
		outer:
		while (i < src.length) {
			for (var r = 0; r < rules.length; r++) {
				var re = rules[r][0], how = rules[r][1];
				re.lastIndex = i;
				var m = re.exec(src);
				if (!m || !m[0].length) continue;
				var cls = typeof how === "function" ? how(m, out, src, i + m[0].length) : how;
				if (Array.isArray(cls)) {
					cls.forEach(function (p) { if (p[0]) out.push(p); });
				} else {
					out.push([m[0], cls]);
				}
				i += m[0].length;
				continue outer;
			}
			var ws = /\s+/y;
			ws.lastIndex = i;
			var w = ws.exec(src);
			var t = w ? w[0] : src[i];
			out.push([t, null]);
			i += t.length;
		}
		return out;
	}

	function esc(s) {
		return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	function render(src, lang) {
		return tokenize(src, LANGS[lang].rules).map(function (t) {
			return t[1] ? '<span class="' + t[1] + '">' + esc(t[0]) + "</span>" : esc(t[0]);
		}).join("");
	}

	// --- samples

	var SAMPLES = {
		c: [
			"#include <stdio.h>",
			"",
			"/* print each argument */",
			"int main(int argc, char **argv)",
			"{",
			"\tfor (int i = 1; i < argc; i++)",
			"\t\tprintf(\"%d: %s\\n\", i, argv[i]);",
			"\treturn 0;",
			"}"
		],
		bash: [
			"#!/usr/bin/env bash",
			"# back up every org file into a dated folder",
			"set -euo pipefail",
			"",
			"dest=\"$HOME/backup/$(date +%F)\"",
			"",
			"backup() {",
			"\tlocal src=$1",
			"\tmkdir -p \"$dest\"",
			"\tcp -- \"$src\" \"$dest/\"",
			"\techo \"saved ${src##*/}\"",
			"}",
			"",
			"for f in ~/org/*.org; do",
			"\t[ -f \"$f\" ] && backup \"$f\"",
			"done"
		],
		haskell: [
			"{-# LANGUAGE LambdaCase #-}",
			"module Main where",
			"",
			"import Data.Char (toUpper)",
			"",
			"-- | how loud to print",
			"data Mode = Loud | Quiet",
			"  deriving (Show, Eq)",
			"",
			"shout :: Mode -> String -> String",
			"shout = \\case",
			"  Loud  -> map toUpper",
			"  Quiet -> id",
			"",
			"main :: IO ()",
			"main = do",
			"  input <- getContents",
			"  mapM_ (putStrLn . shout Loud) (lines input)"
		],
		elisp: [
			";;; count words in a region",
			"(require 'subr-x)",
			"",
			"(defvar my-word-count 0",
			"  \"Words counted the last time.\")",
			"",
			"(defun my-count-words (start end)",
			"  \"Return the number of words between START and END.\"",
			"  (interactive \"r\")",
			"  (let ((n 0))",
			"    (save-excursion",
			"      (goto-char start)",
			"      (while (re-search-forward \"\\\\w+\" end t)",
			"        (setq n (1+ n))))",
			"    (setq my-word-count n)",
			"    (message \"%d words\" n)))"
		],
		org: [
			"#+title: candy notes",
			"#+author: ro15rend",
			"",
			"* TODO finish the website",
			"  SCHEDULED: <2026-11-14 Sat>",
			"  - [ ] add *screenshots*",
			"  - [X] write the /palette/ table",
			"* DONE rename the themes",
			"** colors live in =base16-candy-theme.el=",
			"*** see [[https://github.com/ro15rend/candyflip][the repo]]",
			"",
			"| theme      | background |",
			"|------------+------------|",
			"| candy      | #feedf3    |",
			"| acid       | #1a1218    |",
			"",
			"#+begin_src elisp",
			"(load-theme 'base16-candy t)",
			"#+end_src"
		]
	};
	Object.keys(SAMPLES).forEach(function (k) { SAMPLES[k] = SAMPLES[k].join("\n"); });

	// --- page wiring

	var TOKENS = [
		["keyword", "k"], ["string", "s"], ["function", "f"], ["type", "t"],
		["constant", "n"], ["variable", "v"], ["builtin", "b"], ["comment", "c"],
		["preprocessor", "p"], ["doc", "d"]
	];

	var src = document.getElementById("src");
	var langSel = document.getElementById("lang");
	var out = document.getElementById("out");
	var fmtCss = document.getElementById("fmtcss");
	var views = document.querySelectorAll(".emacs");
	var lastSample = SAMPLES[langSel.value];

	function val(name) {
		var el = document.querySelector('input[name="' + name + '"]:checked');
		return el ? el.value : null;
	}

	function formats() {
		var f = {};
		document.querySelectorAll("#fmt tr[data-token]").forEach(function (r) {
			var on = [];
			r.querySelectorAll("input").forEach(function (i) { if (i.checked) on.push(i.value); });
			if (on.length) f[r.getAttribute("data-token")] = on;
		});
		return f;
	}

	function update() {
		var lang = langSel.value, text = src.value;
		var accent = val("accent"), contrast = val("contrast");
		var region = val("region"), modeline = val("modeline");
		var transparent = val("transparent"), theme = val("theme");
		var fm = formats();
		var html = render(text, lang);
		var lines = text.split("\n").length;
		var nums = [];
		for (var n = 1; n <= lines; n++) {
			nums.push(n === lines ? '<span class="cur-ln">' + n + "</span>" : String(n));
		}

		views.forEach(function (v) {
			var pal = adjust(PALETTES[v.getAttribute("data-pal")], contrast);
			Object.keys(pal).forEach(function (k) { v.style.setProperty("--" + k, pal[k]); });
			v.style.setProperty("--acc", accent === "teal" ? pal.b0C : pal.b0E);
			v.setAttribute("data-region", region);
			v.setAttribute("data-modeline", modeline);
			v.querySelector(".gutter").innerHTML = nums.join("\n");
			v.querySelector(".text").innerHTML = html + '<span class="cursor"> </span>';
			v.querySelector(".bid").textContent = LANGS[lang].buffer;
			v.querySelector(".pos").textContent = "All L" + lines;
			v.querySelector(".mode").textContent = "(" + LANGS[lang].mode + ")";
		});

		var css = [];
		TOKENS.forEach(function (t) {
			var f = fm[t[0]] || [];
			var rule = [];
			if (f.indexOf("bold") >= 0) rule.push("font-weight:bold");
			if (f.indexOf("italic") >= 0) rule.push("font-style:italic");
			if (f.indexOf("underline") >= 0) rule.push("text-decoration:underline");
			if (rule.length) css.push(".emacs .text ." + t[1] + "{" + rule.join(";") + "}");
		});
		fmtCss.textContent = css.join("\n");

		var set = [];
		if (accent !== "pink") set.push("candyflip-accent '" + accent);
		if (contrast !== "normal") set.push("candyflip-contrast '" + contrast);
		if (region !== "inverse") set.push("candyflip-region-style '" + region);
		if (modeline !== "flat") set.push("candyflip-mode-line-style '" + modeline);
		if (transparent === "t") set.push("candyflip-transparent-background t");
		var entries = TOKENS.filter(function (t) { return fm[t[0]]; }).map(function (t) {
			return "(" + t[0] + " " + fm[t[0]].join(" ") + ")";
		});
		if (entries.length) {
			set.push("candyflip-formats '(" + entries.join("\n" + " ".repeat(21)) + ")");
		}
		var cfg = set.length
			? "(setq " + set.join("\n      ") + ")\n"
			: ";; all defaults, nothing to set\n";
		out.textContent = cfg + "(load-theme '" + theme + " t)";
	}

	langSel.addEventListener("change", function () {
		// keep whatever the reader typed; only swap untouched samples
		if (!src.value.trim() || src.value === lastSample) {
			src.value = SAMPLES[langSel.value];
		}
		lastSample = SAMPLES[langSel.value];
		update();
	});
	src.addEventListener("input", update);
	document.getElementById("controls").addEventListener("change", function (e) {
		if (e.target !== langSel) update();
	});

	src.value = SAMPLES[langSel.value];
	update();
})();
