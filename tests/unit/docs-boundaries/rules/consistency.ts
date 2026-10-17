/**
 * State reminders: code facts against the docs that must mention them.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	ALLOWED_WORKSPACE_DEPS,
	PACKAGE_DIRS,
	PACKAGE_NPM_NAME,
	type PackageDir,
} from '../../package-boundaries/allowed-edges.js';
import {
	CONSISTENCY_FACTS,
	type ConsistencyFactId,
} from '../consistency-facts.js';
import { makeFinding, type Finding } from '../reminder.js';
import {
	extractLinks,
	fileExists,
	hasToken,
	readRepoText,
	snapshot,
} from '../scan.js';

const GUIDE = 'docs/guides/writing-docs.md';
const NAVIGATION = 'docs/architecture/NAVIGATION.md';
const ROUTER = 'docs/README.md';
const NODES_DOC = 'docs/reference/NODES.md';
const COMMANDS_DOC = '.cursor/skills/langflower-build/commands.md';
const AGENT_RUN = 'build/tools/agent-run.mjs';
const ADR_MONOLITH = 'docs/adr/README.md';
const RUNTIME_ADR = 'docs/adr/042-runtime-editor-runner.md';
const LAYOUT = 'packages/server/skeleton/skills/langflower-helper/layout.md';

const factDoc = (id: ConsistencyFactId): string =>
	CONSISTENCY_FACTS.find((fact) => fact.id === id)?.reminderDoc ?? GUIDE;

const npmToDir = new Map<string, PackageDir>(
	PACKAGE_DIRS.map((dir) => [PACKAGE_NPM_NAME[dir], dir]),
);

export const matrixEdgeSet = (): ReadonlySet<string> => {
	const edges = new Set<string>();
	for (const consumer of PACKAGE_DIRS) {
		for (const depNpm of ALLOWED_WORKSPACE_DEPS[consumer]) {
			const dep = npmToDir.get(depNpm);
			if (dep !== undefined) {
				edges.add(`${dep}→${consumer}`);
			}
		}
	}
	return edges;
};

export type SketchParse =
	| { readonly ok: true; readonly edges: ReadonlySet<string> }
	| { readonly ok: false; readonly message: string };

export const parseDependencySketch = (text: string): SketchParse => {
	let body: string | null = null;
	for (const fence of text.matchAll(/```text\r?\n([\s\S]*?)```/g)) {
		const inner = fence[1] ?? '';
		if (inner.includes('→')) {
			body = inner;
			break;
		}
	}
	if (body === null) {
		return {
			ok: false,
			message:
				'Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (no ```text fence containing →).',
		};
	}
	const edges = new Set<string>();
	let pending = '';
	const flush = (logical: string): SketchParse | null => {
		const parts = logical.split('→');
		if (parts.length !== 2) {
			return {
				ok: false,
				message:
					'Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (a line does not have one →).',
			};
		}
		const deps = (parts[0] ?? '')
			.split('+')
			.map((token) => token.trim())
			.filter((token) => token.length > 0);
		const consumer = (parts[1] ?? '').trim();
		if (deps.length === 0 || !/^[a-z0-9-]+$/.test(consumer)) {
			return {
				ok: false,
				message:
					'Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (a dependency or consumer token is empty).',
			};
		}
		for (const dep of deps) {
			if (!/^[a-z0-9-]+$/.test(dep)) {
				return {
					ok: false,
					message: `Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (bad token ${dep}).`,
				};
			}
			edges.add(`${dep}→${consumer}`);
		}
		return null;
	};
	for (const raw of body.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === '') {
			continue;
		}
		if (!line.includes('→')) {
			if (pending !== '' && !line.startsWith('+')) {
				return {
					ok: false,
					message:
						'Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (a continuation line is missing →).',
				};
			}
			pending = pending === '' ? line : `${pending} ${line}`;
			continue;
		}
		const logical = pending === '' ? line : `${pending} ${line}`;
		pending = '';
		const error = flush(logical);
		if (error) {
			return error;
		}
	}
	if (pending !== '') {
		return {
			ok: false,
			message:
				'Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (the fence ended mid-edge).',
		};
	}
	if (edges.size === 0) {
		return {
			ok: false,
			message:
				'Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (no edges).',
		};
	}
	return { ok: true, edges };
};

export const checkPackageDag = (root: string): readonly Finding[] => {
	const text = readRepoText(root, NAVIGATION);
	if (text === null) {
		return [
			makeFinding(
				'consistency:package-dag',
				'Could not parse the dependency sketch in docs/architecture/NAVIGATION.md (file missing).',
				[NAVIGATION],
				[
					'Add the dependency → consumer sketch to docs/architecture/NAVIGATION.md so it matches ALLOWED_WORKSPACE_DEPS.',
				],
			),
		];
	}
	const parsed = parseDependencySketch(text);
	if (!parsed.ok) {
		return [
			makeFinding(
				'consistency:package-dag',
				parsed.message,
				[NAVIGATION],
				[
					'Fix the fenced dependency sketch in docs/architecture/NAVIGATION.md so each line is dependency → consumer.',
				],
			),
		];
	}
	const matrix = matrixEdgeSet();
	const missing = [...matrix].filter((edge) => !parsed.edges.has(edge));
	const extra = [...parsed.edges].filter((edge) => !matrix.has(edge));
	if (missing.length === 0 && extra.length === 0) {
		return [];
	}
	return [
		makeFinding(
			'consistency:package-dag',
			`Dependency sketch differs from ALLOWED_WORKSPACE_DEPS. Missing in NAVIGATION.md: ${missing.join(', ') || '(none)'}. Extra in the sketch: ${extra.join(', ') || '(none)'}.`,
			[NAVIGATION],
			[
				'Update the dependency sketch in docs/architecture/NAVIGATION.md so each dependency → consumer pair matches ALLOWED_WORKSPACE_DEPS in tests/unit/package-boundaries/allowed-edges.ts.',
			],
		),
	];
};

export const checkPackageList = (root: string): readonly Finding[] => {
	const navigation = readRepoText(root, NAVIGATION) ?? '';
	const readme = readRepoText(root, ROUTER) ?? '';
	const findings: Finding[] = [];
	for (const dir of PACKAGE_DIRS) {
		if (!hasToken(navigation, dir)) {
			findings.push(
				makeFinding(
					'consistency:package-list',
					`PACKAGE_DIRS name ${dir} is missing from docs/architecture/NAVIGATION.md`,
					[NAVIGATION, ROUTER],
					[
						`Add ${dir} to the package table in docs/architecture/NAVIGATION.md.`,
					],
				),
			);
		}
		if (!hasToken(readme, dir)) {
			findings.push(
				makeFinding(
					'consistency:package-list',
					`PACKAGE_DIRS name ${dir} is missing from docs/README.md`,
					[ROUTER, NAVIGATION],
					[`Mention ${dir} in the router docs/README.md.`],
				),
			);
		}
	}
	return findings;
};

export const checkPackageAgents = (root: string): readonly Finding[] => {
	const readme = readRepoText(root, ROUTER) ?? '';
	const findings: Finding[] = [];
	for (const dir of PACKAGE_DIRS) {
		const agents = `packages/${dir}/AGENTS.md`;
		const exists = fileExists(root, agents);
		const registered = readme.includes(agents);
		if (exists && registered) {
			continue;
		}
		const step = exists
			? `Register ${agents} in docs/README.md.`
			: `Create ${agents} and register it in docs/README.md.`;
		findings.push(
			makeFinding(
				'consistency:package-agents',
				exists
					? `${agents} is not registered in docs/README.md`
					: `${agents} is missing`,
				[factDoc('consistency:package-agents'), agents],
				[step],
			),
		);
	}
	return findings;
};

const listDir = (abs: string): readonly string[] => {
	try {
		return readdirSync(abs);
	} catch {
		return [];
	}
};

export const checkNodeDocs = (root: string): readonly Finding[] => {
	// Deviation: epic glob `**/nodes` misses real node folders (flow/, primitives/, …).
	// Every directory under packages/common-nodes/src that contains node.ts needs NODE.md.
	const start = path.join(root, 'packages/common-nodes/src');
	const findings: Finding[] = [];
	const visit = (abs: string): void => {
		let entries;
		try {
			entries = readdirSync(abs, { withFileTypes: true });
		} catch {
			return;
		}
		const names = entries.map((entry) => entry.name);
		if (names.includes('node.ts') && !names.includes('NODE.md')) {
			const rel = path.relative(root, abs).replace(/\\/g, '/');
			findings.push(
				makeFinding(
					'consistency:node-docs',
					`${rel} contains node.ts and is missing NODE.md`,
					[NODES_DOC, `${rel}/NODE.md`],
					[
						`Add ${rel}/NODE.md. The folder convention is documented in ${NODES_DOC}.`,
					],
				),
			);
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name === 'node_modules') {
				continue;
			}
			visit(path.join(abs, entry.name));
		}
	};
	if (fileExists(root, 'packages/common-nodes/src')) {
		visit(start);
	}
	return findings;
};

export const commandKeys = (source: string): readonly string[] | null => {
	const match = /const COMMANDS = \{([\s\S]*?)\n\};/.exec(source);
	if (!match) {
		return null;
	}
	const keys: string[] = [];
	for (const line of (match[1] ?? '').split(/\r?\n/)) {
		const key = /^\s*['"]?([A-Za-z0-9_-]+)['"]?\s*:/.exec(line);
		if (key?.[1]) {
			keys.push(key[1]);
		}
	}
	return keys;
};

export const checkAgentRunCommands = (root: string): readonly Finding[] => {
	const source = readRepoText(root, AGENT_RUN);
	if (source === null) {
		return [
			makeFinding(
				'consistency:agent-run-commands',
				`${AGENT_RUN} is missing, so COMMANDS keys cannot be checked`,
				[COMMANDS_DOC, AGENT_RUN],
				[
					'Keep COMMANDS in build/tools/agent-run.mjs and mention every key in .cursor/skills/langflower-build/commands.md.',
				],
			),
		];
	}
	const keys = commandKeys(source);
	if (keys === null) {
		return [
			makeFinding(
				'consistency:agent-run-commands',
				`Could not parse COMMANDS keys in ${AGENT_RUN}`,
				[COMMANDS_DOC, AGENT_RUN],
				[
					'Keep the COMMANDS object parseable and mention every key in .cursor/skills/langflower-build/commands.md.',
				],
			),
		];
	}
	const doc = readRepoText(root, COMMANDS_DOC) ?? '';
	const findings: Finding[] = [];
	for (const key of keys) {
		if (hasToken(doc, key)) {
			continue;
		}
		findings.push(
			makeFinding(
				'consistency:agent-run-commands',
				`COMMANDS key ${key} is missing from .cursor/skills/langflower-build/commands.md`,
				[COMMANDS_DOC],
				[
					`Mention \`${key}\` in .cursor/skills/langflower-build/commands.md.`,
				],
			),
		);
	}
	return findings;
};

const adrNumber = (raw: string): number =>
	Number(raw.replace(/^0+/, '') || '0');

const numberedAdrIds = (root: string): ReadonlySet<number> | null => {
	const dir = path.join(root, 'docs/adr');
	let names: readonly string[];
	try {
		names = readdirSync(dir);
	} catch {
		return null;
	}
	const ids = new Set<number>();
	for (const name of names) {
		const match = /^(\d+)-.+\.md$/.exec(name);
		if (match?.[1]) {
			ids.add(adrNumber(match[1]));
		}
	}
	return ids.size > 0 ? ids : null;
};

const monolithAdrIds = (root: string): ReadonlySet<number> => {
	const ids = new Set<number>();
	for (const rel of [ADR_MONOLITH, RUNTIME_ADR]) {
		const text = readRepoText(root, rel);
		if (text === null) {
			continue;
		}
		for (const match of text.matchAll(/^#{1,6}[ \t]+ADR-(\d+)\b/gm)) {
			if (match[1]) {
				ids.add(adrNumber(match[1]));
			}
		}
	}
	return ids;
};

export const checkAdrRefs = (root: string): readonly Finding[] => {
	const numbered = numberedAdrIds(root);
	const useFiles = numbered !== null;
	const known = useFiles ? numbered : monolithAdrIds(root);
	const snap = snapshot(root);
	const missing = new Map<string, string>();
	const consider = (rel: string, text: string): void => {
		for (const match of text.matchAll(/\bADR-(\d+)\b/g)) {
			const raw = match[1];
			if (!raw) {
				continue;
			}
			const id = adrNumber(raw);
			if (known.has(id)) {
				continue;
			}
			const label = `ADR-${raw}`;
			if (!missing.has(label)) {
				missing.set(label, rel);
			}
		}
	};
	for (const file of snap.markdown) {
		if (file.path.endsWith('.md')) {
			consider(file.path, file.text);
		}
	}
	for (const rel of snap.files) {
		if (!rel.endsWith('.ts')) {
			continue;
		}
		// Fixture strings in this suite are temp-repo examples, not citations.
		if (rel.startsWith('tests/unit/docs-boundaries/')) {
			continue;
		}
		const text = readRepoText(root, rel);
		if (text !== null) {
			consider(rel, text);
		}
	}
	const findings: Finding[] = [];
	for (const [label, rel] of missing) {
		findings.push(
			makeFinding(
				'consistency:adr-refs',
				`${label} is mentioned in ${rel} and does not resolve to an ADR file or heading`,
				[ADR_MONOLITH, `docs/adr/${label.replace('ADR-', '')}-*.md`],
				[
					`Add a heading \`${label}\` in docs/adr/README.md or docs/adr/042-runtime-editor-runner.md, or add a numbered file under docs/adr/ once that folder exists. A mention with no heading and no file fails here.`,
				],
			),
		);
	}
	return findings;
};

const childDirs = (abs: string): readonly string[] => {
	try {
		return readdirSync(abs).filter((name) => {
			try {
				return statSync(path.join(abs, name)).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
};

export const checkSkeletonSkills = (root: string): readonly Finding[] => {
	const skillsRoot = path.join(root, 'packages/server/skeleton/skills');
	const names = childDirs(skillsRoot);
	const layout = readRepoText(root, LAYOUT) ?? '';
	const findings: Finding[] = [];
	for (const name of names) {
		if (hasToken(layout, name)) {
			continue;
		}
		findings.push(
			makeFinding(
				'consistency:skeleton-skills',
				`Skeleton skill ${name} is not named in ${LAYOUT}`,
				[LAYOUT, ROUTER],
				[
					`List ${name} in packages/server/skeleton/skills/langflower-helper/layout.md.`,
				],
			),
		);
	}
	return findings;
};

const epicFolders: readonly (readonly [string, string])[] = [
	['docs/TODO/EPICS', 'docs/TODO/EPICS/README.md'],
	['docs/DONE/EPICS', 'docs/DONE/EPICS/README.md'],
	['docs/_work/TODO/EPICS', 'docs/_work/TODO/EPICS/README.md'],
	['docs/_archive/DONE/EPICS', 'docs/_archive/DONE/EPICS/README.md'],
];

export const checkEpicIndex = (root: string): readonly Finding[] => {
	const findings: Finding[] = [];
	for (const [dir, readme] of epicFolders) {
		if (!fileExists(root, dir)) {
			continue;
		}
		const readmeText = readRepoText(root, readme) ?? '';
		const linked = new Set<string>();
		for (const link of extractLinks(readme, readmeText)) {
			if (link.pathPart) {
				linked.add(path.posix.basename(link.pathPart));
			}
			if (link.resolved) {
				linked.add(path.posix.basename(link.resolved));
			}
		}
		for (const name of listDir(path.join(root, dir))) {
			if (!name.endsWith('.md') || name === 'README.md') {
				continue;
			}
			if (linked.has(name)) {
				continue;
			}
			findings.push(
				makeFinding(
					'consistency:epic-index',
					`${dir}/${name} is not linked from ${readme}`,
					[readme, `${dir}/${name}`],
					[`Add a markdown link to ${name} in ${readme}.`],
				),
			);
		}
	}
	return findings;
};

export const CONSISTENCY_RULES = {
	'consistency:package-dag': checkPackageDag,
	'consistency:package-list': checkPackageList,
	'consistency:package-agents': checkPackageAgents,
	'consistency:node-docs': checkNodeDocs,
	'consistency:agent-run-commands': checkAgentRunCommands,
	'consistency:adr-refs': checkAdrRefs,
	'consistency:skeleton-skills': checkSkeletonSkills,
	'consistency:epic-index': checkEpicIndex,
} as const;
