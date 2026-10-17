/**
 * Regenerate adr/bugs indexes, the code→docs map, and the router registry.
 * Callers decide whether to write. This module only builds strings.
 */

import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import prettierConfig from '../../../prettier.config.mjs';
import {
	GENERATED_MARKER,
	REGISTRY_END,
	REGISTRY_START,
	firstHeading,
	isGenerated,
	parseFrontmatter,
} from './frontmatter.mjs';

const formatMarkdown = (text) =>
	prettier.format(text, {
		...prettierConfig,
		parser: 'markdown',
	});

/**
 * Copied from the old FOUND_BUGS.md "When to log" / entry template.
 * The generator owns bugs/README.md, so this prose has to be emitted here.
 */
const BUG_GUIDE = [
	'## When to log',
	'',
	'Log an entry when **any** of the following is true:',
	'',
	'1. A user-reported or agent-found bug was **reproduced** locally.',
	'2. A fix landed and the root cause was **non-obvious** (not a typo or missing import).',
	'3. The bug reveals a **design assumption** that was wrong (state ownership, scope,',
	'   lifecycle, concurrency, etc.).',
	'',
	'**Who:** agents and humans — add the entry in the **same PR** as the fix when possible,',
	'or immediately after repro if the fix is deferred.',
	'',
	'**Retrospective:** skim this file for repeated _design flaw signals_ (same theme across',
	'entries) before large refactors or new ADRs.',
	'',
	'---',
	'',
	'## Entry template',
	'',
	'Copy for each new bug. The field list also lives in',
	'[docs/guides/writing-docs.md](../guides/writing-docs.md).',
	'',
	'```markdown',
	'### BUG-YYYY-MM-DD — short title',
	'',
	'| Field                  | Value                                                       |',
	'| ---------------------- | ----------------------------------------------------------- |',
	'| **Date**               | YYYY-MM-DD                                                  |',
	'| **Area**               | execution · ui · server · shared · canvas · ws · hitl · …   |',
	'| **Status**             | fixed · open · wontfix                                      |',
	'| **Symptom**            | What the user saw                                           |',
	'| **Repro**              | Minimal steps                                               |',
	'| **Root cause**         | Technical why                                               |',
	'| **Fix**                | Files / behaviour change (PR or commit ref if available)    |',
	'| **Design flaw signal** | What the architecture got wrong; candidate ADR or principle |',
	'| **Regression test**    | Test path, or `none` + reason                               |',
	'```',
].join('\n');

const cell = (value) =>
	String(value ?? '')
		.replace(/\|/g, '/')
		.replace(/\r?\n/g, ' ')
		.trim();

const readUtf8 = (abs) => {
	try {
		return fs.readFileSync(abs, 'utf8');
	} catch {
		return null;
	}
};

const listMd = (dir) => {
	let names;
	try {
		names = fs.readdirSync(dir);
	} catch {
		return [];
	}
	return names.filter((name) => name.endsWith('.md')).sort();
};

const scalar = (data, key) => {
	const value = data[key];
	return typeof value === 'string' ? value : '';
};

const listValue = (data, key) => {
	const value = data[key];
	return Array.isArray(value) ? value : [];
};

const walkFiles = (abs, skip, visit) => {
	let entries;
	try {
		entries = fs.readdirSync(abs, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (skip.has(entry.name)) {
			continue;
		}
		const full = path.join(abs, entry.name);
		if (entry.isDirectory()) {
			walkFiles(full, skip, visit);
			continue;
		}
		if (entry.isFile()) {
			visit(full);
		}
	}
};

const SKIP = new Set(['node_modules', 'dist', '.git', 'vendor']);

const relPosix = (root, abs) => path.relative(root, abs).replace(/\\/g, '/');

const packageLocalPaths = (root) => {
	const found = [];
	const add = (rel) => {
		if (rel.endsWith('.md') && fs.existsSync(path.join(root, rel))) {
			found.push(rel);
		}
	};
	const packagesDir = path.join(root, 'packages');
	if (fs.existsSync(packagesDir)) {
		for (const name of fs.readdirSync(packagesDir)) {
			const dir = path.join(packagesDir, name);
			if (!fs.statSync(dir).isDirectory()) {
				continue;
			}
			add(`packages/${name}/AGENTS.md`);
			add(`packages/${name}/README.md`);
			walkFiles(dir, SKIP, (full) => {
				const rel = relPosix(root, full);
				if (
					rel.endsWith('/NODE.md') ||
					rel.endsWith('/spec.md') ||
					rel.includes('/docs/')
				) {
					if (rel.endsWith('.md')) {
						found.push(rel);
					}
				}
			});
		}
	}
	const launcher = path.join(root, 'launcher');
	if (fs.existsSync(launcher)) {
		add('launcher/AGENTS.md');
		add('launcher/README.md');
		walkFiles(path.join(launcher, 'docs'), SKIP, (full) => {
			if (full.endsWith('.md')) {
				found.push(relPosix(root, full));
			}
		});
	}
	return [...new Set(found)].sort();
};

const renderRegistry = (root) => {
	const lines = [
		GENERATED_MARKER,
		'',
		'| Path | What it covers |',
		'| --- | --- |',
	];
	const paths = packageLocalPaths(root);
	if (paths.length === 0) {
		lines.push('| | |');
	}
	for (const rel of paths) {
		const text = readUtf8(path.join(root, rel)) ?? '';
		const blurb = cell(firstHeading(text) || rel);
		lines.push(`| \`${rel}\` | ${blurb} |`);
	}
	lines.push('');
	return lines.join('\n');
};

const applyRegistry = (readme, registry) => {
	const start = readme.indexOf(REGISTRY_START);
	const end = readme.indexOf(REGISTRY_END);
	if (start < 0 || end < start) {
		return null;
	}
	return (
		readme.slice(0, start) +
		REGISTRY_START +
		'\n' +
		registry +
		REGISTRY_END +
		readme.slice(end + REGISTRY_END.length)
	);
};

const adrEntries = (root) => {
	const dir = path.join(root, 'docs/adr');
	const entries = [];
	for (const name of listMd(dir)) {
		if (name === 'README.md') {
			continue;
		}
		const rel = `docs/adr/${name}`;
		const text = readUtf8(path.join(root, rel)) ?? '';
		const parsed = parseFrontmatter(text);
		const data = parsed.ok ? parsed.data : {};
		const fromName = /^(\d+)-/.exec(name);
		const id =
			scalar(data, 'id') ||
			(fromName ? `ADR-${fromName[1]}` : name.replace(/\.md$/, ''));
		const heading = firstHeading(text);
		const title =
			heading.replace(/^ADR-\d+\s+[—-]\s+/, '') || heading || name;
		entries.push({
			id,
			title: cell(title),
			status: cell(scalar(data, 'status')),
			packageName: cell(scalar(data, 'package')),
			supersedes: cell(listValue(data, 'supersedes').join(', ')),
			sort: Number((/^ADR-(\d+)$/.exec(id) ?? [])[1] ?? '9999'),
			name,
			rel,
		});
	}
	entries.sort(
		(left, right) =>
			left.sort - right.sort || left.rel.localeCompare(right.rel),
	);
	return entries;
};

const bugEntries = (root) => {
	const dir = path.join(root, 'docs/bugs');
	const entries = [];
	for (const name of listMd(dir)) {
		if (name === 'README.md') {
			continue;
		}
		const rel = `docs/bugs/${name}`;
		const text = readUtf8(path.join(root, rel)) ?? '';
		const parsed = parseFrontmatter(text);
		const data = parsed.ok ? parsed.data : {};
		const heading = firstHeading(text);
		const title = heading
			.replace(/^BUG-\d{4}-\d{2}-\d{2}[a-z]?\s+[—-]\s+/, '')
			.trim();
		const shown = cell(title || heading || name);
		const short =
			shown.length > 40 ? `${shown.slice(0, 37).trimEnd()}...` : shown;
		entries.push({
			date: cell(scalar(data, 'date')),
			title: short,
			packageName: cell(scalar(data, 'package')),
			flaw: cell(scalar(data, 'flaw') || 'unclassified'),
			fixed: cell(scalar(data, 'fixed')),
			name,
		});
	}
	entries.sort(
		(left, right) =>
			left.date.localeCompare(right.date) ||
			left.name.localeCompare(right.name),
	);
	return entries;
};

const renderAdr = (entries) => {
	const lines = [
		GENERATED_MARKER,
		'',
		'# ADR index',
		'',
		'| Id | Title | Status | Package | Supersedes |',
		'| --- | --- | --- | --- | --- |',
	];
	for (const entry of entries) {
		const label = entry.id.replace(/[\[\]]/g, '');
		lines.push(
			`| [${label}](${entry.name}) | ${entry.title} | ${entry.status} | ${entry.packageName} | ${entry.supersedes} |`,
		);
	}
	lines.push('');
	return lines.join('\n');
};

const renderBugs = (entries) => {
	const lines = [
		GENERATED_MARKER,
		'',
		'# Bug index',
		'',
		BUG_GUIDE,
		'',
		'## Logged bugs',
		'',
		'| Date | Title | Package | Flaw | Fixed |',
		'| --- | --- | --- | --- | --- |',
	];
	for (const entry of entries) {
		const label = entry.title.replace(/[\[\]]/g, '') || entry.name;
		lines.push(
			`| ${entry.date} | [${label}](${entry.name}) | ${entry.packageName} | ${entry.flaw} | ${entry.fixed} |`,
		);
	}
	lines.push('', '## By flaw', '');
	const flaws = [...new Set(entries.map((entry) => entry.flaw))].sort();
	if (flaws.length === 0) {
		lines.push('No bugs yet.', '');
	}
	for (const flaw of flaws) {
		lines.push(`### ${flaw}`, '');
		for (const entry of entries.filter((item) => item.flaw === flaw)) {
			lines.push(`- ${entry.date} ${entry.title}`);
		}
		lines.push('');
	}
	return lines.join('\n');
};

const docMapRows = (root) => {
	const rows = [];
	const docsDir = path.join(root, 'docs');
	walkFiles(docsDir, SKIP, (full) => {
		const rel = relPosix(root, full);
		if (!rel.endsWith('.md') || rel.startsWith('docs/_archive/')) {
			return;
		}
		const text = readUtf8(full);
		if (text === null || isGenerated(text)) {
			return;
		}
		const parsed = parseFrontmatter(text);
		if (!parsed.ok) {
			return;
		}
		const covers = listValue(parsed.data, 'covers');
		for (const glob of covers) {
			if (glob.trim() === '') {
				continue;
			}
			rows.push({ glob: cell(glob), doc: rel });
		}
	});
	rows.sort(
		(left, right) =>
			left.glob.localeCompare(right.glob) ||
			left.doc.localeCompare(right.doc),
	);
	return rows;
};

const renderDocMap = (rows) => {
	const lines = [
		GENERATED_MARKER,
		'',
		'# Code to docs',
		'',
		'| Covers | Doc |',
		'| --- | --- |',
	];
	if (rows.length === 0) {
		lines.push('| | |');
	}
	for (const row of rows) {
		lines.push(`| \`${row.glob}\` | \`${row.doc}\` |`);
	}
	lines.push('');
	return lines.join('\n');
};

export const buildPlan = async (root) => {
	const files = new Map();
	files.set(
		'docs/adr/README.md',
		await formatMarkdown(renderAdr(adrEntries(root))),
	);
	files.set(
		'docs/bugs/README.md',
		await formatMarkdown(renderBugs(bugEntries(root))),
	);
	files.set(
		'docs/architecture/DOC_MAP.md',
		await formatMarkdown(renderDocMap(docMapRows(root))),
	);
	const readmePath = path.join(root, 'docs/README.md');
	const readme = readUtf8(readmePath);
	const registry = renderRegistry(root);
	let nextReadme = null;
	let readmeError = null;
	if (readme === null) {
		readmeError =
			'docs/README.md is missing package-local registry markers';
	} else {
		const spliced = applyRegistry(readme, registry);
		nextReadme = spliced === null ? null : await formatMarkdown(spliced);
		if (nextReadme === null) {
			readmeError =
				'docs/README.md is missing package-local registry markers';
		}
	}
	return { files, readme: nextReadme, readmeError };
};

export const indexesMissing = (root) => {
	const adr = path.join(root, 'docs/adr');
	const bugs = path.join(root, 'docs/bugs');
	return !fs.existsSync(adr) || !fs.existsSync(bugs);
};

export const diffPlan = (root, plan) => {
	const diffs = [];
	if (plan.readmeError) {
		diffs.push(plan.readmeError);
	} else if (plan.readme !== null) {
		const current = readUtf8(path.join(root, 'docs/README.md'));
		if (current !== plan.readme) {
			diffs.push('would change docs/README.md');
		}
	}
	for (const [rel, content] of plan.files) {
		const current = readUtf8(path.join(root, rel));
		if (current !== content) {
			diffs.push(`would change ${rel}`);
		}
	}
	return diffs;
};

export const writePlan = (root, plan) => {
	for (const [rel, content] of plan.files) {
		const abs = path.join(root, rel);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, content);
	}
	if (plan.readme !== null) {
		fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
		fs.writeFileSync(path.join(root, 'docs/README.md'), plan.readme);
	}
};
