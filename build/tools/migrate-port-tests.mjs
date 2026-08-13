#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import path from 'node:path';

const roots = [
	'packages/runtime/src',

	'packages/common-nodes/src',

	'packages/server/src',

	'packages/shared/src',

	'packages/ui/src',

	'packages/langflower-mcp/src',

	'packages/tools/src',

	'packages/node-sdk/src',

	'tests',
];

const skipDirs = new Set(['node_modules', 'dist', 'build', '.git']);

const collectTestFiles = (dir, out = []) => {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);

		const stat = statSync(full);

		if (stat.isDirectory()) {
			if (!skipDirs.has(entry)) {
				collectTestFiles(full, out);
			}

			continue;
		}

		if (entry.endsWith('.test.ts') || entry.includes('/tests/')) {
			out.push(full);
		}
	}

	return out;
};

const portEventVars =
	'errorEvent|failed|previewEvent|feedbackEvent|responseEvent|hitl|valueStates|finishInputs|delayEvents|outputEvents';

const replacements = [
	[/['"]runner\.output-emitted['"]/g, "'runner.port'"],

	[/['"]runner\.input-received['"]/g, "'runner.port'"],

	[/\.outputEmitted\$/g, '.runnerPort$'],

	[/\.inputReceived\$/g, '.runnerPort$'],

	[/\{\s*\['done',\s*([^\]]+)\]\s*\}/g, "['done', $1]"],

	[/event\.kind === 'output-emitted'/g, "event[0] === 'out'"],

	[/event\.kind === 'input-received'/g, "event[0] === 'in'"],

	[/event\.kind === 'done'/g, "event[0] === 'done'"],

	[/event\.kind !== 'output-emitted'/g, "event[0] !== 'out'"],

	[/event\.kind !== 'input-received'/g, "event[0] !== 'in'"],

	[/e\.kind === 'output-emitted'/g, "e[0] === 'out'"],

	[/e\.kind === 'input-received'/g, "e[0] === 'in'"],

	[/e\.kind === 'done'/g, "e[0] === 'done'"],

	[
		/event\.kind === 'output-emitted' \|\|\s*event\.kind === 'input-received'/g,

		"event[0] === 'out' || event[0] === 'in'",
	],

	[
		/\(event\.kind === 'output-emitted' \|\|\s*event\.kind === 'input-received'\)/g,

		"(event[0] === 'out' || event[0] === 'in')",
	],

	[
		new RegExp(`(${portEventVars})\\.kind === 'output-emitted'`, 'g'),

		"$1[0] === 'out'",
	],

	[
		new RegExp(`(${portEventVars})\\.kind === 'input-received'`, 'g'),

		"$1[0] === 'in'",
	],

	[
		new RegExp(
			`expect\\((${portEventVars})\\.kind\\)\\.toBe\\('output-emitted'\\)`,
			'g',
		),

		"expect($1[0]).toBe('out')",
	],

	[
		new RegExp(`(${portEventVars})\\.kind !== 'output-emitted'`, 'g'),

		"$1[0] !== 'out'",
	],

	[
		new RegExp(`(${portEventVars})\\.state === 'error'`, 'g'),

		"$1[3] === 'error'",
	],

	[
		new RegExp(`(${portEventVars})\\.state !== 'value'`, 'g'),

		"$1[3] !== 'value'",
	],

	[
		new RegExp(`String\\((${portEventVars})\\.value\\)`, 'g'),

		'String($1[4])',
	],

	[new RegExp(`(${portEventVars})\\.value`, 'g'), '$1[4]'],

	[/response\.value/g, 'response[4]'],

	[/event\.nodeId ===/g, 'event[1] ==='],

	[/event\.portId ===/g, 'event[2] ==='],

	[/event\.portId,/g, 'event[2],'],

	[/event\.portId\)/g, 'event[2])'],

	[/event\.portId\b/g, 'event[2]'],

	[/event\.state ===/g, 'event[3] ==='],

	[/event\.state !==/g, 'event[3] !=='],

	[/event\.value/g, 'event[4]'],

	[/e\.nodeId ===/g, 'e[1] ==='],

	[/e\.portId ===/g, 'e[2] ==='],

	[/e\.state ===/g, 'e[3] ==='],

	[/e\.value/g, 'e[4]'],

	[/typeof event\.portId/g, 'typeof event[2]'],

	[/typeof e\.portId/g, 'typeof e[2]'],

	[
		/expect\(event\.kind === 'output-emitted' && event\[4\]\)/g,

		"expect(event[0] === 'out' && event[4])",
	],

	[
		/expect\(event\.kind === 'input-received' && event\[4\]\)/g,

		"expect(event[0] === 'in' && event[4])",
	],

	[
		/previewEvent\.kind === 'output-emitted' && previewEvent\.value/g,

		"previewEvent[0] === 'out' && previewEvent[4]",
	],

	[
		/failed\.kind === 'output-emitted' && failed\.state === 'error'/g,

		"failed[0] === 'out' && failed[3] === 'error'",
	],

	[
		/events\.map\(\(event\) => event\.kind\)/g,
		'events.map((event) => event[0])',
	],

	[
		/\(event\): event is \{ kind: 'done'; runId: string \} =>/g,

		"(event): event is ['done', RunId] =>",
	],

	[/event\.kind === 'done'/g, "event[0] === 'done'"],

	[
		/expect\(events\.some\(\(event\) => event\.kind === 'done'\)\)/g,

		"expect(events.some((event) => event[0] === 'done'))",
	],

	[
		/toMatchObject\(\{\s*kind: 'output-emitted',\s*value: ([^,}\n]+),?\s*\}\)/g,

		"toEqual(expect.arrayContaining(['out', expect.anything(), expect.anything(), expect.anything(), $1]))",
	],

	[
		/await expect\((\w+)\)\.resolves\.toMatchObject\(\{\s*kind: 'output-emitted',\s*value: ([^,}\n]+),?\s*\}\)/g,

		'await expect($1[4]).resolves.toBe($2)',
	],
];

let changed = 0;

for (const root of roots) {
	const abs = path.resolve(root);

	try {
		statSync(abs);
	} catch {
		continue;
	}

	for (const file of collectTestFiles(abs)) {
		const original = readFileSync(file, 'utf8');

		let next = original;

		for (const [pattern, replacement] of replacements) {
			next = next.replace(pattern, replacement);
		}

		if (next !== original) {
			writeFileSync(file, next, 'utf8');

			changed += 1;
		}
	}
}

console.log(`Updated ${changed} test files`);
