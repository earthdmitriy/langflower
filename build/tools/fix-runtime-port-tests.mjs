#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('packages/runtime/src');

const collect = (dir, out = []) => {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			collect(full, out);
			continue;
		}
		if (entry.endsWith('.test.ts')) out.push(full);
	}
	return out;
};

const replacements = [
	[/\t\texpect\((\w+)\.runId\)\.toBe\([^)]+\);\n/g, ''],
	[/\t\texpect\(event\.runId\)\.toBe\(runId\);\n/g, ''],
	[/\t\t\texpect\(event\.runId\)\.toBe\(runId\);\n/g, ''],
	[/expect\((\w+)\.runId\)\.toBe\((\w+)\);\n/g, ''],
	[/expect\((\w+)\.value\)/g, 'expect($1[4])'],
	[/event\.runId === runId &&\s*\n?\s*/g, ''],
	[/event\.runId === runId2 &&\s*\n?\s*/g, ''],
	[/event\.edgeIds/g, 'edgeIdsFromPortEvent(event)'],
	[/emit\.edgeIds/g, 'edgeIdsFromPortEvent(emit)'],
	[
		/expect\(edgeIdsFromPortEvent\(event\)\)\.toBeInstanceOf\(Array\);\n/g,
		'',
	],
	[/from '\.\/workflow-events\.js';/g, "from './workflow-events.js';"],
];

for (const file of collect(root)) {
	let next = readFileSync(file, 'utf8');
	const original = next;
	for (const [pattern, replacement] of replacements) {
		next = next.replace(pattern, replacement);
	}
	if (
		next.includes('edgeIdsFromPortEvent(') &&
		!next.includes('edgeIdsFromPortEvent')
	) {
		next = next.replace(
			/from '\.\/workflow-events\.js';/,
			"from './workflow-events.js';\n// edgeIdsFromPortEvent imported below",
		);
	}
	if (
		next.includes('edgeIdsFromPortEvent(') &&
		!next.match(/edgeIdsFromPortEvent/)
	) {
		// noop
	}
	if (
		next.includes('edgeIdsFromPortEvent(') &&
		!next.includes('edgeIdsFromPortEvent,') &&
		!next.includes('edgeIdsFromPortEvent }')
	) {
		next = next.replace(
			/(import \{[^}]*)(} from '\.\/workflow-events\.js';)/,
			(match, head, tail) =>
				head.includes('edgeIdsFromPortEvent')
					? match
					: `${head.trimEnd()}, edgeIdsFromPortEvent ${tail}`,
		);
		next = next.replace(
			/(import \{[^}]*)(} from '\.\.\/workflows\/workflow-events\.js';)/,
			(match, head, tail) =>
				head.includes('edgeIdsFromPortEvent')
					? match
					: `${head.trimEnd()}, edgeIdsFromPortEvent ${tail}`,
		);
	}
	if (next !== original) writeFileSync(file, next, 'utf8');
}

console.log('runtime test port fixes applied');
