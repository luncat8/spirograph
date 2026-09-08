#!/usr/bin/env python3
"""Link the spirograph scene files in save/ into index.html.

The app runs from file:// and cannot list a directory, so the panel's preset
dropdown is fed by what index.html loads. This script (run from the directory
that holds index.html) is the MULTI-FILE half of the preset system
(presets_merge_to_default.js.py is the single-file half); both work on the
save/ folder:

  - finds every saved scene file in save/ (*.js SETTINGS modules;
    default.js, *.delete-me and anything that does not parse as a scene are
    skipped - raw *.json cannot be a <script> tag and is left to the merge
    script),
  - converts each one into a preset module: the scene is kept as-is, but the
    file contributes to window.PRESETS instead of overwriting
    window.SETTINGS (several preset files must not clobber the startup
    scene) and a `// preset: NAME.js` marker is stamped as its first line,
  - inserts a <script src="save/NAME.js" class="preset"></script> tag into
    index.html (between save/default.js and js/main.js) for every file that
    has none,
  - keeps the links in sync with the files on every run: a RENAMED file
    (recognized by its marker) moves its tag to the new name, and a DELETED
    file drops its tag. delete or rename a preset, run the script, done.

a second run changes nothing: tags and markers are already in sync, so the
files are untouched.

Usage:  python3 save/link_presets_to_html.py     (from the app directory)
"""

import json
import re
import sys
from pathlib import Path

# the app dir holds index.html; the scene files live in save/ next to it.
SAVE_DIR = "save"
DEFAULT_NAME = "default.js"
DELETED_SUFFIX = ".delete-me"

# the only tags this script manages: its own one-line format. hand-edited
# variations (other attribute order, body on the same line, ...) are left
# alone - manage them by deleting the tag and re-running.
PRESET_TAG_RE = re.compile(
	'^(\s*)<script\s+src="([^"]+)"\s+class="preset"\s*>\s*</script>\s*$')
MARKER_RE = re.compile(r"^// preset: (\S+)$")
DEFAULT_TAG = '<script src="%s/%s"></script>' % (SAVE_DIR, DEFAULT_NAME)


def src_of(name):
	"""The <script src> of a scene file: save/NAME.js."""
	return "%s/%s" % (SAVE_DIR, name)


def die(msg):
	sys.exit(msg)


def read_text(path):
	try:
		return path.read_text(encoding="utf-8")
	except OSError:
		return None


def scan_json_literal(text, at):
	"""Return (python value, end index) for the JSON object/array whose first
	brace opens at `at`. Tracks string literals so braces inside strings or
	escapes cannot unbalance the scan. (same helper as the merge script -
	the two tools are meant to stay standalone)"""
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
	(the shape sceneJs() and both preset writers write). Returns None when
	the marker is absent; `null` values also come back as None."""
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


def read_scene(text):
	"""Parse file text as a spirograph scene; None when it is not one."""
	try:
		trimmed = text.lstrip("\ufeff \t\r\n")
		if trimmed.startswith("{") or trimmed.startswith("["):
			obj = json.loads(trimmed)
		else:
			obj = extract_var(text, "S")
		return obj if isinstance(obj, dict) and isinstance(obj.get("gears"), list) else None
	except (ValueError, OSError):
		return None


def read_marker(text):
	"""The file's first line, when it is a `// preset: NAME.js` marker."""
	if not text:
		return None
	m = MARKER_RE.match(text.split("\n", 1)[0].strip())
	return m.group(1) if m else None


def preset_module(name, scene):
	"""The linked file format: scene kept, exported as one PRESETS entry
	(preset name = file name without .js), marker line on top."""
	stem = name[:-3] if name.endswith(".js") else name
	return (
		"// preset: %s\n"
		"// linked from index.html by link_presets_to_html.py - renaming or\n"
		"// deleting this file and re-running the script moves or drops the\n"
		"// link; the marker line above is how the script tracks renames.\n"
		"(function (root) {\n"
		"\tvar S = %s;\n"
		'\troot.PRESETS = (root.PRESETS || []).concat([{ name: "%s", scene: S }]);\n'
		"\tif (typeof module !== 'undefined' && module.exports)\n"
		'\t\tmodule.exports = { SETTINGS: S, NAME: "%s" };\n'
		"})(typeof window !== 'undefined' ? window : globalThis);\n"
	) % (name, json.dumps(scene, indent="\t"), stem, stem)


def needs_rewrite(text, name):
	"""A linked file is only rewritten when its name/marker changed or the
	PRESETS export is missing - manual edits inside the scene survive."""
	if read_marker(text) != name:
		return True
	return "root.PRESETS" not in text


def find_tag_lines(lines):
	"""[(line index, src)] of the managed preset tags, in document order."""
	out = []
	for i, line in enumerate(lines):
		m = PRESET_TAG_RE.match(line)
		if m:
			out.append((i, m.group(2)))
	return out


def main():
	cwd = Path(".")
	if not (cwd / "index.html").is_file():
		die("no index.html in the working directory - run from the app dir")
	scenes_dir = cwd / SAVE_DIR
	if not scenes_dir.is_dir():
		die("no %s/ directory next to index.html - run from the app dir" % SAVE_DIR)

	html = (cwd / "index.html").read_text(encoding="utf-8")
	lines = html.split("\n")

	# candidate scene files (in name order; the tag order below follows it)
	candidates = sorted(
		p.name for p in scenes_dir.iterdir()
		if p.is_file() and p.name.endswith(".js")
		and p.name != DEFAULT_NAME and not p.name.endswith(DELETED_SUFFIX))
	scenes = {}
	texts = {}
	skipped = []
	for name in candidates:
		text = read_text(scenes_dir / name)
		if text is None:
			skipped.append(name + " (unreadable)")
			continue
		scene = read_scene(text)
		if scene is None:
			skipped.append(name + " (not a scene)")
			continue
		scenes[name] = scene
		texts[name] = text
	json_files = sorted(p.name for p in scenes_dir.iterdir() if p.suffix == ".json")

	tag_lines = find_tag_lines(lines)
	tag_by_src = {}
	for i, src in tag_lines:
		tag_by_src.setdefault(src, i)

	kept = set()            # tag lines whose file exists under the tag name
	renamed = {}            # tag line index -> new src (file was renamed)
	removed = set()         # stale tag lines (file gone)
	new_names = []          # files that need a fresh tag
	claimed = set()         # tag lines already matched to a file
	rewritten = []
	for name in sorted(scenes):
		text = texts[name]
		marker = read_marker(text)
		src = src_of(name)
		if src in tag_by_src:
			claimed.add(tag_by_src[src])
			kept.add(tag_by_src[src])
			if needs_rewrite(text, name):
				(scenes_dir / name).write_text(preset_module(name, scenes[name]), encoding="utf-8")
				rewritten.append(name)
			continue
		# the file was renamed after linking: its marker still names the tag.
		# a marker can only move a tag that no file claimed by name.
		old_src = src_of(marker) if marker else None
		if old_src and old_src in tag_by_src and tag_by_src[old_src] not in claimed:
			claimed.add(tag_by_src[old_src])
			renamed[tag_by_src[old_src]] = name
			(scenes_dir / name).write_text(preset_module(name, scenes[name]), encoding="utf-8")
			rewritten.append(name)
			continue
		new_names.append(name)
		(scenes_dir / name).write_text(preset_module(name, scenes[name]), encoding="utf-8")
		rewritten.append(name)

	for i, src in tag_lines:
		if i not in claimed:
			removed.add(i)

	if not kept and not renamed and not removed and not new_names:
		print("index.html has no preset tags and no scene files in %s/ to link - unchanged" % SAVE_DIR)
		if skipped:
			print("skipped: " + ", ".join(skipped))
		return

	default_idx = None
	for i, line in enumerate(lines):
		if DEFAULT_TAG in line:
			default_idx = i
			break
	if default_idx is None:
		die('index.html has no %s line to anchor the preset tags' % DEFAULT_TAG)

	out = []
	last_preset = None
	for i, line in enumerate(lines):
		if i in removed:
			continue
		if i in renamed:
			m = PRESET_TAG_RE.match(line)
			line = m.group(1) + '<script src="%s" class="preset"></script>' % src_of(renamed[i])
		out.append(line)
		if i in kept or i in renamed:
			last_preset = len(out) - 1
	if new_names:
		anchor = last_preset
		if anchor is None:
			anchor = out.index(next(l for l in out if DEFAULT_TAG in l))
		block = ['\t<script src="%s" class="preset"></script>' % src_of(n) for n in new_names]
		out[anchor + 1:anchor + 1] = block

	new_html = "\n".join(out)
	if new_html != html:
		(cwd / "index.html").write_text(new_html, encoding="utf-8")

	old_src_at = {i: src for i, src in tag_lines}
	print("index.html preset tags (between %s/%s and js/main.js):" % (SAVE_DIR, DEFAULT_NAME))
	if new_names:
		print("  added:   " + ", ".join(new_names))
	if renamed:
		print("  renamed: " + ", ".join(
			"%s -> %s" % (old_src_at[i], n) for i, n in sorted(renamed.items())))
	if removed:
		gone = [src for i, src in tag_lines if i in removed]
		print("  removed: " + ", ".join(gone) + " (file gone)")
	if kept:
		print("  kept:    " + ", ".join(src for i, src in tag_lines if i in kept))
	if rewritten:
		print("files rewritten (preset module + marker): " + ", ".join(rewritten))
	if not (new_names or renamed or removed or rewritten):
		print("  all in sync - nothing changed")
	if json_files:
		print("note: *.json scenes cannot be <script> tags - "
			"presets_merge_to_default.js.py handles those")
	if skipped:
		print("skipped: " + ", ".join(skipped))


if __name__ == "__main__":
	main()
