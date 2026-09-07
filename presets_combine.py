#!/usr/bin/env python3
"""Combine the spirograph scene files in this directory into default.js.

The app runs from file:// and cannot list a directory, so the panel's preset
dropdown is fed by default.js itself. This script (run from the directory
that holds index.html + default.js):

  - finds every saved scene file in the working directory (*.js SETTINGS
    modules or raw *.json with a "gears" array; default.js and already
    combined *.delete-me files are skipped, as is anything that does not
    parse as a scene),
  - appends each one to default.js's PRESETS list (preset name = file name
    without its extension; a saved name like 3d-tails-whole-yy-mm-dd-hh-mm-ss
    says what the scene is),
  - rewrites default.js (the startup scene SETTINGS is preserved) and
    renames every consumed file to <name>.delete-me so the next run does not
    add it twice - the rename IS the "already combined" marker.

Usage:  python3 presets_combine.py        (from the app directory)
"""

import json
import sys
from pathlib import Path

DEFAULT_NAME = "default.js"
DELETED_SUFFIX = ".delete-me"

HEADER = (
	"// spirograph default scene + preset list.\n"
	"// SETTINGS = the startup scene (loads when there is no autosave);\n"
	"// PRESETS = the panel's preset dropdown. regenerate with\n"
	"// presets_combine.py: it appends the scene files saved next to\n"
	"// index.html and renames the consumed files to *.delete-me.\n"
)


def scan_json_literal(text, at):
	"""Return (python value, end index) for the JSON object/array whose first
	brace opens at `at`. Tracks string literals so braces inside strings or
	escapes cannot unbalance the scan."""
	depth = 0
	in_str = False
	esc = False
	for i in range(at, len(text)):
		c = text[i]
		if in_str:
			if esc:
				esc = False
			elif c == "\\":
				esc = True
			elif c == '"':
				in_str = False
		elif c == '"':
			in_str = True
		elif c in "{[":
			depth += 1
		elif c in "}]":
			depth -= 1
			if depth == 0:
				return json.loads(text[at:i + 1]), i + 1
	raise ValueError("unbalanced literal")


def extract_var(text, marker):
	"""Extract the value of `var <marker> = <json literal>;` from a JS module
	(the shape both sceneJs() and this script write). Returns None when the
	marker is absent; `null` values (a default.js without a startup scene)
	also come back as None."""
	pos = text.find("var " + marker + " ")
	if pos < 0:
		return None
	eq = text.find("=", pos)
	if eq < 0:
		raise ValueError("no = after var " + marker)
	at = eq + 1
	while at < len(text) and text[at] in " \t\r\n":
		at += 1
	if text.startswith("null", at):
		return None
	if at >= len(text) or text[at] not in "{[":
		raise ValueError("var " + marker + " is not a JSON literal")
	return scan_json_literal(text, at)[0]


def read_scene(path):
	"""Parse a file as a spirograph scene; None when it is not one."""
	try:
		text = path.read_text(encoding="utf-8")
		obj = None
		trimmed = text.lstrip("\ufeff \t\r\n")
		if trimmed.startswith("{") or trimmed.startswith("["):
			obj = json.loads(trimmed)
		elif path.suffix == ".js":
			obj = extract_var(text, "S")
		return obj if isinstance(obj, dict) and isinstance(obj.get("gears"), list) else None
	except (ValueError, OSError):
		return None


def read_default(path):
	"""(SETTINGS scene or None, PRESETS list) off an existing default.js."""
	if not path.is_file():
		return None, []
	text = path.read_text(encoding="utf-8")
	try:
		s = extract_var(text, "S")
		presets = extract_var(text, "PRESETS")
	except ValueError as e:
		raise SystemExit("default.js is not a generated spirograph module (" + str(e) + ")")
	if s is not None and not (isinstance(s, dict) and isinstance(s.get("gears"), list)):
		raise SystemExit("default.js: SETTINGS is not a scene (no gears array)")
	if presets is None:
		presets = []
	if not isinstance(presets, list):
		raise SystemExit("default.js: PRESETS is not a list")
	return s, presets


def write_default(path, scene, presets):
	body = (
		"(function (root) {\n"
		"\tvar S = " + json.dumps(scene, indent="\t") + ";\n"
		"\tvar PRESETS = " + json.dumps(presets, indent="\t") + ";\n"
		"\tif (typeof module !== 'undefined' && module.exports) "
		"module.exports = { SETTINGS: S, PRESETS: PRESETS };\n"
		"\telse { root.SETTINGS = S; root.PRESETS = PRESETS; }\n"
		"})(typeof window !== 'undefined' ? window : globalThis);\n"
	)
	path.write_text(HEADER + body, encoding="utf-8")


def main():
	cwd = Path.cwd()
	default_path = cwd / DEFAULT_NAME
	scene, presets = read_default(default_path)

	# existing preset names, so a re-saved file replaces its own entry
	by_name = {}
	for p in presets:
		if isinstance(p, dict) and isinstance(p.get("name"), str) and isinstance(p.get("scene"), dict):
			by_name[p["name"]] = p
	had = set(by_name)

	added = []
	skipped = []
	for path in sorted(cwd.iterdir(), key=lambda p: p.name):
		if not path.is_file() or path.name == DEFAULT_NAME or path.name.endswith(DELETED_SUFFIX):
			continue
		if path.suffix not in (".js", ".json"):
			continue
		obj = read_scene(path)
		if obj is None:
			skipped.append(path.name)
			continue
		name = path.stem
		by_name[name] = {"name": name, "scene": obj}
		added.append(path)

	if not added:
		print("no scene files found - " + DEFAULT_NAME + " unchanged"
			  + ("" if not skipped else " (skipped: " + ", ".join(skipped) + ")"))
		return

	presets = [by_name[k] for k in sorted(by_name)]
	write_default(default_path, scene, presets)
	for path in added:
		target = path.with_name(path.name + DELETED_SUFFIX)
		if target.exists():
			target.unlink()
		path.rename(target)
	# same-stem files (.js + .json) collapse onto one preset name: the later
	# file (alphabetical order) replaced the earlier entry, so report each
	# NAME once.
	added_names, replaced_names = [], []
	for path in added:
		if path.stem in had and path.stem not in replaced_names:
			replaced_names.append(path.stem)
		elif path.stem not in had and path.stem not in added_names:
			added_names.append(path.stem)
	parts = ["+ " + n for n in added_names] + ["* " + n + " (replaced)" for n in replaced_names]
	print(DEFAULT_NAME + ": " + ", ".join(parts) + " (" + str(len(presets)) + " presets total)")
	print("renamed to *" + DELETED_SUFFIX + ": " + ", ".join(p.name + DELETED_SUFFIX for p in added))
	if skipped:
		print("skipped (not scenes): " + ", ".join(skipped), file=sys.stderr)
	if scene is None:
		print("note: no startup scene in " + DEFAULT_NAME + " (the app falls back to its built-in default)")


if __name__ == "__main__":
	main()
