#!/usr/bin/env python3
"""Split the PRESETS in save/default.js back into separate scene files.

The reverse of presets_merge_to_default.js.py: it reads the combined module
and writes one standalone file per preset, named after the preset, in the
same shape the app's own save feature produces (a plain scene module that
appends { name, scene } to root.PRESETS when index.html loads it, and
exports { SETTINGS, NAME } to node):

  <preset-name>.js

The startup scene (SETTINGS) is not a preset, so it stays in default.js:
the script rewrites default.js with that scene plus only the entries it
could NOT unpack (unsafe name, <name>.js already exists, ...) - nothing is
dropped. default.js itself is never removed or renamed, since index.html
loads it. The written files are ordinary scene modules, so
link_presets_to_html.py can load them into index.html and
presets_merge_to_default.js.py can combine them right back.

Usage:  python3 save/presets_unpack_default.js.py [--force] [--keep]
   (from the app directory)
  --force  overwrite an existing <name>.js instead of keeping that preset
           in default.js
  --keep   leave default.js untouched (the unpacked names stay listed in
           its PRESETS too, so they would load twice once the files are
           linked)
"""

import json
import sys
from pathlib import Path

SAVE_DIR = "save"
DEFAULT_NAME = "default.js"

# same header presets_merge_to_default.js.py writes, so the round trip
# (unpack -> merge) leaves default.js byte-identical
HEADER = (
    "// spirograph default scene + preset list.\n"
    "// SETTINGS = the startup scene (loads when there is no autosave);\n"
    "// PRESETS = the panel's preset dropdown. regenerate with\n"
    "// presets_merge_to_default.js.py: it appends the scene files in this\n"
    "// folder and renames the consumed files to *.delete-me\n"
    "// (link_presets_to_html.py is the multi-file alternative).\n"
)

BAD_NAME_CHARS = '<>:"/\\|?*'
WINDOWS_RESERVED = {"con", "prn", "aux", "nul"} | \
    {"com" + str(n) for n in range(1, 10)} | {"lpt" + str(n) for n in range(1, 10)}


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
    (the shape both sceneJs() and the merge script write). Returns None when
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


def safe_name(name):
    """The preset name as a file stem; None when it cannot safely be one."""
    if not name or name in (".", "..") or len(name.encode("utf-8")) > 200:
        return None
    if any(c in BAD_NAME_CHARS for c in name) or any(ord(c) < 32 or ord(c) == 127 for c in name):
        return None
    if name.endswith(" ") or name.endswith("."):
        return None
    if name.split(".", 1)[0].lower() in WINDOWS_RESERVED:
        return None
    return name


def write_preset(path, name, scene):
    """One standalone scene module, the shape the app's save feature writes:
    loading it (an index.html <script> tag, via link_presets_to_html.py)
    appends { name, scene } to root.PRESETS; node gets { SETTINGS, NAME }."""
    body = (
        "(function (root) {\n"
        "\tvar S = " + json.dumps(scene, indent="\t") + ";\n"
        "\troot.PRESETS = (root.PRESETS || []).concat([{ name: " + json.dumps(name) + ", scene: S }]);\n"
        "\tif (typeof module !== 'undefined' && module.exports)\n"
        "\t\tmodule.exports = { SETTINGS: S, NAME: " + json.dumps(name) + " };\n"
        "})(typeof window !== 'undefined' ? window : globalThis);\n"
    )
    path.write_text(body, encoding="utf-8")


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
    args = sys.argv[1:]
    if "-h" in args or "--help" in args:
        print(__doc__.strip())
        return
    force = "--force" in args
    keep = "--keep" in args
    cwd = Path.cwd()
    if (cwd / DEFAULT_NAME).is_file():
        scenes_dir = cwd
        loc_label = "this folder"
    else:
        scenes_dir = cwd / SAVE_DIR
        loc_label = SAVE_DIR + "/"
    default_path = scenes_dir / DEFAULT_NAME
    if not default_path.is_file():
        raise SystemExit("no " + DEFAULT_NAME + " in " + loc_label
            + " - run from the app directory (or " + SAVE_DIR + "/),"
            + " or combine some presets first with presets_merge_to_default.js.py")
    scene, presets = read_default(default_path)
    if not presets:
        print(DEFAULT_NAME + " holds no presets - nothing to unpack")
        return

    # existing names lowercased: on a case-insensitive filesystem a preset
    # called "Foo" must not clobber an existing foo.js
    try:
        existing = {p.name.lower() for p in scenes_dir.iterdir()}
    except OSError:
        existing = set()

    written = []
    remaining = []   # entries that stay in default.js
    kept = []        # "name (reason)" notes for those
    for i, p in enumerate(presets):
        name = p.get("name") if isinstance(p, dict) else None
        scn = p.get("scene") if isinstance(p, dict) else None
        label = name if isinstance(name, str) and name else "entry " + str(i + 1)
        reason = None
        if not isinstance(name, str) or not isinstance(scn, dict):
            reason = "not a { name, scene } object"
        elif name + ".js" == DEFAULT_NAME:
            reason = "would overwrite " + DEFAULT_NAME
        elif not isinstance(scn.get("gears"), list):
            reason = "scene has no gears array"
        elif safe_name(name) is None:
            reason = "unsafe as a file name"
        elif not force and (name + ".js").lower() in existing:
            reason = name + ".js already exists (--force overwrites)"
        if reason is None:
            try:
                write_preset(scenes_dir / (name + ".js"), name, scn)
            except OSError as e:
                reason = "write failed (" + str(e) + ")"
            else:
                existing.add((name + ".js").lower())
                written.append(name)
                continue
        remaining.append(p)
        kept.append(label + " (" + reason + ")")

    if not written:
        print("nothing unpacked - " + DEFAULT_NAME + " unchanged")
        if kept:
            print("kept in " + DEFAULT_NAME + ": " + ", ".join(kept), file=sys.stderr)
        return

    print(DEFAULT_NAME + ": " + ", ".join("- " + n for n in written)
        + " (" + str(len(written)) + " of " + str(len(presets)) + " presets unpacked into " + loc_label + ")")
    if kept:
        print("kept in " + DEFAULT_NAME + ": " + ", ".join(kept), file=sys.stderr)
    if keep:
        print(DEFAULT_NAME + " left untouched - it still lists every preset;"
            " they would load twice once the files are linked")
    else:
        write_default(default_path, scene, remaining)
        print("rewrote " + DEFAULT_NAME + ": keeps the startup scene"
            + ("" if scene is not None else " (there is none)")
            + ("; its PRESETS list is now empty" if not kept
                else "; its PRESETS list keeps only the entries above"))
    print("load the files with link_presets_to_html.py, or re-combine them with presets_merge_to_default.js.py")


if __name__ == "__main__":
    main()