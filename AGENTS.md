# AGENTS.md

guidance for LLM agents

## style

	use a single tab indentation. LF end

	avoid deep nesting of braces { } and long if-else.
	flatten with early returns, helper functions, or flat data tables.

	avoid duplication of code.

	avoid allocations in the hot path (per-frame loop, sim, render).
		no new {}, [], object literals, closures, or string concat
		inside the frame loop.
		reuse preallocated buffers / typed arrays / scratch objects.
		allocate once at setup, mutate in place per frame.

## runtime

	file:// friendly, classic <script> tags, no modules, no build.
	guard module.exports so files also run under node.
	no internet links; vendor any lib as a local js file.
	WebGL2 only, zero dependencies.

## don't forget

after gui changes if need - update save, load and reset

## files
	implementation-log.txt - what is already done and next step for LLM agents
	findings-pitfalls-skills.md - notes and pitfalls for LLM agents
	CHANGELOG.md - short release notes
	js/main.js - init, loop
	js/gear.js - gear math
	js/gui.js - context menu, sliders
	test/run.js - headless checks (node test/run.js), boots the real app on
	  DOM/WebGL stubs from test/stub-dom.js
	test/preview.js - offline PNG render of a bake (no browser needed)
