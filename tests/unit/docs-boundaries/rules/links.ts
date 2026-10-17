/**
 * Relative links, heading anchors, docs/ citations, and link direction.
 */

import path from 'node:path';
import {
	ARCHIVE_LINK_EXCEPTIONS,
	DOC_LAYER_RULES,
	type DocLayer,
} from '../layer-rules.js';
import { makeFinding, type Finding } from '../reminder.js';
import {
	anchorResolves,
	extractDocCitations,
	fileExists,
	readRepoText,
	snapshot,
} from '../scan.js';

const GUIDE = 'docs/guides/writing-docs.md';

/** A docs/ cite with any other extension is a phrase, not a file. */
const CITATION_EXTENSIONS = new Set([
	'.md',
	'.mdc',
	'.ts',
	'.mjs',
	'.json',
	'.yml',
	'.yaml',
	'.html',
	'.png',
	'.svg',
]);

/**
 * Frozen history is not a live citation. Planning notes under docs/_work
 * and the synced skill copies are live and must resolve.
 */
const frozenCitationSource = (rel: string): boolean =>
	rel.startsWith('docs/_archive/');

/** `*.test.ts` strings are fixtures, not live citations. */
const citationSourceIgnored = (rel: string): boolean =>
	frozenCitationSource(rel) || rel.endsWith('.test.ts');

const layerOf = (rel: string): DocLayer | null => {
	const parts = rel.split('/');
	if (parts[0] !== 'docs') {
		return null;
	}
	const segment = parts[1] ?? '';
	if (Object.prototype.hasOwnProperty.call(DOC_LAYER_RULES, segment)) {
		return segment as DocLayer;
	}
	return null;
};

const targetLayer = (resolved: string): DocLayer | null => {
	if (resolved === 'docs' || resolved.startsWith('docs/')) {
		return layerOf(
			resolved.endsWith('.md') ? resolved : `${resolved}/x.md`,
		);
	}
	return null;
};

const isMarkdownPath = (rel: string): boolean =>
	rel.endsWith('.md') || rel.endsWith('.mdc');

export const checkLinks = (root: string): readonly Finding[] => {
	const snap = snapshot(root);
	const findings: Finding[] = [];
	const byLower = new Map<string, string>();
	for (const rel of snap.files) {
		const lower = rel.toLowerCase();
		const previous = byLower.get(lower);
		if (previous !== undefined && previous !== rel) {
			findings.push(
				makeFinding(
					'links',
					`case collision between ${previous} and ${rel}`,
					[GUIDE, previous, rel],
					[
						'Rename one of the paths so they differ by more than case. Windows checkouts cannot tell them apart.',
					],
				),
			);
		} else {
			byLower.set(lower, rel);
		}
	}
	for (const file of snap.markdown) {
		if (frozenCitationSource(file.path)) {
			continue;
		}
		for (const link of file.links) {
			if (link.kind === 'external' || link.kind === 'absolute') {
				continue;
			}
			if (
				link.resolved === null ||
				link.resolved.startsWith('..') ||
				path.posix.isAbsolute(link.resolved)
			) {
				findings.push(
					makeFinding(
						'links',
						`${file.path} link ${link.target} escapes the repo`,
						[file.path, GUIDE],
						[`Point ${link.target} at a file inside the repo.`],
					),
				);
				continue;
			}
			if (!fileExists(root, link.resolved)) {
				findings.push(
					makeFinding(
						'links',
						`${file.path} -> ${link.target} does not resolve`,
						[file.path, GUIDE],
						[
							`Fix the relative link ${link.target} in ${file.path} so the file exists.`,
						],
					),
				);
				continue;
			}
			if (link.hash === '') {
				continue;
			}
			if (!isMarkdownPath(link.resolved)) {
				continue;
			}
			const target =
				snap.markdownByPath.get(link.resolved) ??
				(link.kind === 'anchor' ? file : undefined);
			if (target === undefined) {
				continue;
			}
			if (!anchorResolves(link.hash, target.anchors)) {
				findings.push(
					makeFinding(
						'links',
						`${file.path} -> ${link.target} anchor #${link.hash} is missing`,
						[file.path, target.path, GUIDE],
						[
							`Add a heading whose GitHub slug is ${link.hash}, or fix the anchor in ${file.path}.`,
						],
					),
				);
			}
		}
	}
	return findings;
};

const citationText = (
	snap: ReturnType<typeof snapshot>,
	rel: string,
): string | null => {
	const markdown = snap.markdownByPath.get(rel);
	if (markdown) {
		return markdown.text;
	}
	return readRepoText(snap.root, rel);
};

export const checkCodeRefs = (root: string): readonly Finding[] => {
	const snap = snapshot(root);
	const findings: Finding[] = [];
	const seen = new Set<string>();
	for (const rel of snap.files) {
		const ext = path.posix.extname(rel);
		if (
			ext !== '.ts' &&
			ext !== '.md' &&
			ext !== '.mdc' &&
			ext !== '.json'
		) {
			continue;
		}
		if (rel.endsWith('package-lock.json')) {
			continue;
		}
		// Fixture strings in this suite are temp-repo examples, not citations.
		if (rel.startsWith('tests/unit/docs-boundaries/')) {
			continue;
		}
		if (citationSourceIgnored(rel)) {
			continue;
		}
		const text = citationText(snap, rel);
		if (text === null) {
			continue;
		}
		for (const cited of extractDocCitations(text)) {
			const citedExt = path.posix.extname(cited).toLowerCase();
			if (!CITATION_EXTENSIONS.has(citedExt)) {
				continue;
			}
			const key = `${rel} -> ${cited}`;
			if (seen.has(key) || fileExists(root, cited)) {
				seen.add(key);
				continue;
			}
			seen.add(key);
			const docs = rel.endsWith('.md')
				? [rel, cited, GUIDE]
				: [GUIDE, cited];
			findings.push(
				makeFinding(
					'code-refs',
					`${rel} cites ${cited}, which does not resolve`,
					docs,
					[
						`Update the docs/ path in ${rel} so ${cited} exists, or create that file before citing it.`,
					],
				),
			);
		}
	}
	return findings;
};

const archiveAllowed = (
	source: string,
	sourceLayer: DocLayer | null,
): boolean => {
	if (sourceLayer === '_archive' || source.startsWith('docs/_archive/')) {
		return true;
	}
	return (ARCHIVE_LINK_EXCEPTIONS as readonly string[]).includes(source);
};

export const checkLinkDirection = (root: string): readonly Finding[] => {
	const snap = snapshot(root);
	const findings: Finding[] = [];
	for (const file of snap.markdown) {
		const sourceLayer = layerOf(file.path);
		for (const link of file.links) {
			if (link.resolved === null || link.resolved.startsWith('..')) {
				continue;
			}
			const dest = targetLayer(link.resolved);
			if (dest === null) {
				continue;
			}
			if (dest === '_archive') {
				if (archiveAllowed(file.path, sourceLayer)) {
					continue;
				}
				findings.push(
					makeFinding(
						'link-direction',
						`${file.path} links into docs/_archive/ via ${link.target}`,
						[GUIDE, 'docs/README.md', file.path],
						[
							'Remove the link into docs/_archive/. Files inside docs/_archive/ may link to each other. Outside the archive, only ARCHIVE_LINK_EXCEPTIONS may link in.',
						],
					),
				);
				continue;
			}
			if (sourceLayer === null) {
				continue;
			}
			const allowed = DOC_LAYER_RULES[sourceLayer].allowedLinkTargets;
			if (!allowed.includes(dest)) {
				findings.push(
					makeFinding(
						'link-direction',
						`${file.path} (${sourceLayer}) links to docs/${dest}/ via ${link.target}`,
						[GUIDE, 'docs/README.md', file.path],
						[
							`Remove the link from docs/${sourceLayer}/ into docs/${dest}/. product, architecture, reference, and guides do not link into _work.`,
						],
					),
				);
			}
		}
	}
	return findings;
};
