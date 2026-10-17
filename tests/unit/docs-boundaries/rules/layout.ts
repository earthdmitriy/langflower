/**
 * Placement, frontmatter, reachability, and size.
 * Old paths are not special-cased: until the move, placement stays red.
 */

import path from 'node:path';
import {
	ADR_BUG_SIZE_BUDGET,
	DOC_LAYER_RULES,
	DOC_STATUSES,
	NON_LOG_SIZE_BUDGET,
	isDocKind,
	isDocOwner,
	isDocStatus,
	type DocLayer,
} from '../layer-rules.js';
import { formatReminder, makeFinding, type Finding } from '../reminder.js';
import {
	globMatches,
	snapshot,
	type FrontmatterValue,
	type MarkdownFile,
} from '../scan.js';

const ROUTER = 'docs/README.md';
const GUIDE = 'docs/guides/writing-docs.md';

/** Process docs may keep an empty covers list. */
const PURE_PROCESS_DOCS = new Set([
	'docs/guides/writing-docs.md',
	'docs/guides/REFACTORING.md',
]);

const COVERS_REQUIRED_PREFIXES = [
	'docs/architecture/',
	'docs/reference/',
	'docs/guides/',
] as const;

const coversRequired = (rel: string): boolean => {
	if (PURE_PROCESS_DOCS.has(rel)) {
		return false;
	}
	return COVERS_REQUIRED_PREFIXES.some((prefix) => rel.startsWith(prefix));
};

const packageLocalFrontmatter = (rel: string): boolean => {
	if (rel === 'launcher/AGENTS.md') {
		return true;
	}
	if (/^packages\/[^/]+\/AGENTS\.md$/.test(rel)) {
		return true;
	}
	if (rel.startsWith('packages/ui/docs/') && rel.endsWith('.md')) {
		return true;
	}
	if (rel === 'packages/runtime/spec.md') {
		return true;
	}
	if (rel.startsWith('packages/common-nodes/') && rel.endsWith('/NODE.md')) {
		return true;
	}
	if (rel.startsWith('packages/server/src/') && rel.endsWith('.md')) {
		return true;
	}
	return rel === 'packages/common-nodes/src/README.md';
};

const layerOf = (rel: string): DocLayer | null => {
	const parts = rel.split('/');
	if (parts[0] !== 'docs' || parts.length < 3) {
		return null;
	}
	const segment = parts[1] ?? '';
	if (Object.prototype.hasOwnProperty.call(DOC_LAYER_RULES, segment)) {
		return segment as DocLayer;
	}
	return null;
};

const isDocsMarkdown = (rel: string): boolean =>
	rel.startsWith('docs/') && rel.endsWith('.md');

const isArchive = (rel: string): boolean => rel.startsWith('docs/_archive/');

const isDirectChild = (rel: string): boolean =>
	path.posix.dirname(rel) === 'docs';

const kindOf = (file: MarkdownFile): string | null => {
	if (!file.frontmatter.ok) {
		return null;
	}
	const kind = file.frontmatter.data.kind;
	return typeof kind === 'string' ? kind : null;
};

const asList = (
	value: FrontmatterValue | undefined,
): readonly string[] | null => {
	if (value === undefined) {
		return null;
	}
	if (typeof value === 'string') {
		return null;
	}
	return value;
};

export const checkPlacement = (root: string): readonly Finding[] => {
	const snap = snapshot(root);
	const findings: Finding[] = [];
	for (const file of snap.markdown) {
		if (!isDocsMarkdown(file.path)) {
			continue;
		}
		if (isArchive(file.path)) {
			continue;
		}
		if (file.generated) {
			if (isDirectChild(file.path) && file.path !== ROUTER) {
				findings.push(directChildFinding(file.path));
			}
			continue;
		}
		if (file.path === ROUTER) {
			const kind = kindOf(file);
			if (kind !== 'index') {
				findings.push(
					makeFinding(
						'placement',
						`${file.path} kind is ${kind ?? 'missing'}; the router kind is index`,
						[ROUTER, GUIDE],
						[
							'Set kind: index on docs/README.md. It is the only markdown file allowed directly in docs/.',
						],
					),
				);
			}
			continue;
		}
		if (isDirectChild(file.path)) {
			findings.push(directChildFinding(file.path));
			continue;
		}
		const layer = layerOf(file.path);
		if (layer === null) {
			findings.push(
				makeFinding(
					'placement',
					`${file.path} is not in a layer directory`,
					[ROUTER, GUIDE],
					[
						'Move this file into the layer directory for its kind (docs/product, docs/architecture, docs/reference, docs/guides, docs/adr, docs/bugs, docs/_work, or docs/assets). Do not leave the old path in place.',
					],
				),
			);
			continue;
		}
		const kind = kindOf(file);
		const allowed = DOC_LAYER_RULES[layer].allowedKinds;
		if (kind === null || !isDocKind(kind) || !allowed.includes(kind)) {
			findings.push(
				makeFinding(
					'placement',
					`${file.path} kind ${kind ?? 'missing'} does not match docs/${layer}/`,
					[GUIDE, file.path],
					[
						`Set kind to one of: ${allowed.join(', ')}. The directory docs/${layer}/ only allows those kinds.`,
					],
				),
			);
		}
	}
	return findings;
};

const directChildFinding = (rel: string): Finding =>
	makeFinding(
		'placement',
		`${rel} sits directly in docs/`,
		[ROUTER, GUIDE],
		[
			'Move this markdown file into a layer directory. Only docs/README.md may be a markdown file directly in docs/.',
		],
	);

const scalar = (
	data: Readonly<Record<string, FrontmatterValue>>,
	key: string,
): string | null => {
	const value = data[key];
	return typeof value === 'string' ? value : null;
};

const adrProblems = (
	data: Readonly<Record<string, FrontmatterValue>>,
): readonly string[] => {
	const problems: string[] = [];
	const id = scalar(data, 'id');
	if (id === null || !/^ADR-\d+$/.test(id)) {
		problems.push('adr id must be ADR-NNN');
	}
	for (const key of ['supersedes', 'superseded-by'] as const) {
		const list = asList(data[key]);
		if (list === null) {
			problems.push(`${key} must be a list`);
			continue;
		}
		for (const item of list) {
			if (!/^ADR-\d+$/.test(item)) {
				problems.push(`${key} entry ${item} is not ADR-NNN`);
			}
		}
	}
	const pkg = scalar(data, 'package');
	if (pkg === null || !isDocOwner(pkg)) {
		problems.push('adr package must be an owner');
	}
	return problems;
};

const bugProblems = (
	data: Readonly<Record<string, FrontmatterValue>>,
): readonly string[] => {
	const problems: string[] = [];
	const date = scalar(data, 'date');
	if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		problems.push('bug date must be YYYY-MM-DD');
	}
	const flaw = scalar(data, 'flaw');
	if (flaw === null || flaw.trim() === '') {
		problems.push('bug flaw must be a non-empty string');
	}
	const pkg = scalar(data, 'package');
	if (pkg === null || !isDocOwner(pkg)) {
		problems.push('bug package must be an owner');
	}
	const fixed = scalar(data, 'fixed');
	if (fixed !== 'yes' && fixed !== 'no' && fixed !== 'deferred') {
		problems.push('bug fixed must be yes, no, or deferred');
	}
	return problems;
};

export const checkFrontmatter = (root: string): readonly Finding[] => {
	const snap = snapshot(root);
	const findings: Finding[] = [];
	for (const file of snap.markdown) {
		const packageLocal = packageLocalFrontmatter(file.path);
		if (
			(!isDocsMarkdown(file.path) && !packageLocal) ||
			isArchive(file.path) ||
			file.generated
		) {
			continue;
		}
		if (!file.frontmatter.ok) {
			findings.push(
				makeFinding(
					'frontmatter',
					`${file.path}:${file.frontmatter.line} ${file.frontmatter.message}`,
					[file.path, GUIDE],
					[
						'Add a flat YAML frontmatter block with kind, owner, covers, and status. Fix the reported line; do not leave the file unparseable.',
					],
				),
			);
			continue;
		}
		const data = file.frontmatter.data;
		const problems: string[] = [];
		const kind = scalar(data, 'kind');
		if (kind === null) {
			problems.push('missing kind');
		} else if (!isDocKind(kind)) {
			problems.push(`kind ${kind} is not a known kind`);
		}
		const owner = scalar(data, 'owner');
		if (owner === null) {
			problems.push('missing owner');
		} else if (!isDocOwner(owner)) {
			problems.push(`owner ${owner} is not a known owner`);
		}
		const status = scalar(data, 'status');
		if (status === null) {
			problems.push('missing status');
		} else if (!isDocStatus(status)) {
			problems.push(`status ${status} is not ${DOC_STATUSES.join('|')}`);
		}
		const covers = asList(data.covers);
		if (data.covers === undefined) {
			problems.push('missing covers');
		} else if (covers === null) {
			problems.push('covers must be a list');
		} else {
			for (const glob of covers) {
				if (glob.trim() === '') {
					problems.push('covers contains an empty glob');
					continue;
				}
				const live = snap.files.some((rel) => globMatches(glob, rel));
				if (!live) {
					problems.push(`dead covers glob ${glob}`);
				}
			}
			if (
				covers.length === 0 &&
				(coversRequired(file.path) || packageLocal)
			) {
				problems.push('covers must name at least one glob');
			}
		}
		if (kind === 'adr') {
			problems.push(...adrProblems(data));
		}
		if (kind === 'bug') {
			problems.push(...bugProblems(data));
		}
		if (problems.length === 0) {
			continue;
		}
		findings.push(
			makeFinding(
				'frontmatter',
				`${file.path}: ${problems.join('; ')}`,
				[file.path, GUIDE],
				[
					'Fill kind, owner, covers, and status with valid values. Every covers glob must match at least one file. ADR and bug files also need their extra keys.',
				],
			),
		);
	}
	return findings;
};

const docTargets = (file: MarkdownFile): readonly string[] => {
	const targets: string[] = [];
	for (const link of file.links) {
		if (link.resolved === null || link.resolved.startsWith('..')) {
			continue;
		}
		if (!link.resolved.endsWith('.md')) {
			continue;
		}
		targets.push(link.resolved);
	}
	return targets;
};

export const checkReachable = (root: string): readonly Finding[] => {
	const snap = snapshot(root);
	const roots = [ROUTER];
	for (const layer of Object.keys(DOC_LAYER_RULES) as DocLayer[]) {
		const index = `docs/${layer}/README.md`;
		if (snap.markdownByPath.has(index)) {
			roots.push(index);
		}
	}
	const reachable = new Set<string>();
	const queue = [...roots];
	while (queue.length > 0) {
		const current = queue.pop();
		if (current === undefined || reachable.has(current)) {
			continue;
		}
		reachable.add(current);
		const file = snap.markdownByPath.get(current);
		if (file === undefined) {
			continue;
		}
		for (const target of docTargets(file)) {
			if (snap.markdownByPath.has(target)) {
				queue.push(target);
			}
		}
	}
	const findings: Finding[] = [];
	for (const file of snap.markdown) {
		if (
			!isDocsMarkdown(file.path) ||
			isArchive(file.path) ||
			file.generated
		) {
			continue;
		}
		if (reachable.has(file.path)) {
			continue;
		}
		const layer = layerOf(file.path);
		const index = layer === null ? ROUTER : `docs/${layer}/README.md`;
		findings.push(
			makeFinding(
				'reachable',
				`${file.path} is not linked from docs/README.md or a layer index`,
				[ROUTER, index, file.path],
				[
					`Add a markdown link to ${file.path} from docs/README.md or from ${index}.`,
				],
			),
		);
	}
	return findings;
};

const warnFinding = (rel: string, bytes: number): Finding =>
	makeFinding(
		'size',
		`${rel} is ${bytes} bytes (warn above ${NON_LOG_SIZE_BUDGET.warnAboveBytes})`,
		[rel, GUIDE],
		[
			'Split this doc before it crosses 40 KB. This warning does not fail the suite.',
		],
	);

export const checkSize = (root: string): readonly Finding[] => {
	const snap = snapshot(root);
	const findings: Finding[] = [];
	const warnAt = NON_LOG_SIZE_BUDGET.warnAboveBytes ?? 24_576;
	const failAt = NON_LOG_SIZE_BUDGET.failAboveBytes ?? 40_960;
	const logFail = ADR_BUG_SIZE_BUDGET.failAboveBytes ?? 24_576;
	for (const file of snap.markdown) {
		if (!isDocsMarkdown(file.path) || isArchive(file.path)) {
			continue;
		}
		const kind = kindOf(file);
		if (kind === 'adr' || kind === 'bug') {
			if (file.bytes > logFail) {
				findings.push(
					makeFinding(
						'size',
						`${file.path} is ${file.bytes} bytes; kind ${kind} fails above ${logFail}`,
						[file.path, GUIDE],
						[
							`Split ${file.path}. ADR and bug files fail above ${logFail} bytes.`,
						],
					),
				);
			}
			continue;
		}
		if (file.bytes > failAt) {
			findings.push(
				makeFinding(
					'size',
					`${file.path} is ${file.bytes} bytes; non-log docs fail above ${failAt}`,
					[file.path, GUIDE],
					[`Split ${file.path} so it is at most ${failAt} bytes.`],
				),
			);
			continue;
		}
		if (file.bytes > warnAt) {
			console.warn(formatReminder(warnFinding(file.path, file.bytes)));
		}
	}
	return findings;
};
