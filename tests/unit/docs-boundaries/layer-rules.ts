/**
 * Layer matrix for the docs-boundaries suite (epic 50 §3.A).
 * Directory names are the target folders under docs/.
 * docs/README.md is the router, not a layer.
 *
 * product, architecture, reference, and guides must not link to `_work`.
 * No layer lists `_archive` as a link target except `_archive` itself
 * (history may link to other history). External links into `_archive`
 * are only the paths in ARCHIVE_LINK_EXCEPTIONS.
 */

export type DocLayer =
	| 'product'
	| 'architecture'
	| 'reference'
	| 'guides'
	| 'adr'
	| 'bugs'
	| '_work'
	| '_archive'
	| 'assets';

export type DocKind =
	| 'product'
	| 'architecture'
	| 'reference'
	| 'guide'
	| 'adr'
	| 'bug'
	| 'feature'
	| 'use-case'
	| 'index'
	| 'work'
	| 'asset';

export type SizeBudget = {
	readonly warnAboveBytes: number | null;
	/** null means this layer must not fail the size rule. */
	readonly failAboveBytes: number | null;
};

/** Non-log docs: warn above 24 KiB, fail above 40 KiB. */
export const NON_LOG_SIZE_BUDGET: SizeBudget = {
	warnAboveBytes: 24_576,
	failAboveBytes: 40_960,
};

/** ADR and bug files: fail above 24 KiB. Warnings are not used. */
export const ADR_BUG_SIZE_BUDGET: SizeBudget = {
	warnAboveBytes: null,
	failAboveBytes: 24_576,
};

export type DocLayerRule = {
	readonly layer: DocLayer;
	readonly directory: `docs/${DocLayer}`;
	readonly allowedKinds: readonly DocKind[];
	readonly frontmatterRequired: boolean;
	readonly allowedLinkTargets: readonly DocLayer[];
	readonly sizeBudget: SizeBudget;
};

/**
 * Layers a searchable doc may link to.
 * `_work` and `_archive` are omitted on purpose.
 */
const SEARCHABLE_LINK_TARGETS: readonly DocLayer[] = [
	'product',
	'architecture',
	'reference',
	'guides',
	'adr',
	'bugs',
	'assets',
];

/** adr, bugs, assets, and _work may also link into live planning docs. */
const WORK_LINK_TARGETS: readonly DocLayer[] = [
	...SEARCHABLE_LINK_TARGETS,
	'_work',
];

export const DOC_KINDS: readonly DocKind[] = [
	'product',
	'architecture',
	'reference',
	'guide',
	'adr',
	'bug',
	'feature',
	'use-case',
	'index',
	'work',
	'asset',
];

export const DOC_OWNERS = [
	'server',
	'ui',
	'runtime',
	'shared',
	'node-sdk',
	'tools',
	'common-nodes',
	'compiler',
	'eval',
	'mcp',
	'cli',
	'launcher',
	'websocket-bridge',
	'docs',
] as const;

export type DocOwner = (typeof DOC_OWNERS)[number];

export const DOC_STATUSES = ['current', 'draft', 'superseded'] as const;

export type DocStatus = (typeof DOC_STATUSES)[number];

export const isDocKind = (value: string): value is DocKind =>
	(DOC_KINDS as readonly string[]).includes(value);

export const isDocOwner = (value: string): value is DocOwner =>
	(DOC_OWNERS as readonly string[]).includes(value);

export const isDocStatus = (value: string): value is DocStatus =>
	(DOC_STATUSES as readonly string[]).includes(value);

export const DOC_LAYER_RULES: Readonly<Record<DocLayer, DocLayerRule>> = {
	product: {
		layer: 'product',
		directory: 'docs/product',
		allowedKinds: ['product', 'feature', 'use-case', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: SEARCHABLE_LINK_TARGETS,
		sizeBudget: NON_LOG_SIZE_BUDGET,
	},
	architecture: {
		layer: 'architecture',
		directory: 'docs/architecture',
		allowedKinds: ['architecture', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: SEARCHABLE_LINK_TARGETS,
		sizeBudget: NON_LOG_SIZE_BUDGET,
	},
	reference: {
		layer: 'reference',
		directory: 'docs/reference',
		allowedKinds: ['reference', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: SEARCHABLE_LINK_TARGETS,
		sizeBudget: NON_LOG_SIZE_BUDGET,
	},
	guides: {
		layer: 'guides',
		directory: 'docs/guides',
		allowedKinds: ['guide', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: SEARCHABLE_LINK_TARGETS,
		sizeBudget: NON_LOG_SIZE_BUDGET,
	},
	adr: {
		layer: 'adr',
		directory: 'docs/adr',
		allowedKinds: ['adr', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: WORK_LINK_TARGETS,
		sizeBudget: ADR_BUG_SIZE_BUDGET,
	},
	bugs: {
		layer: 'bugs',
		directory: 'docs/bugs',
		allowedKinds: ['bug', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: WORK_LINK_TARGETS,
		sizeBudget: ADR_BUG_SIZE_BUDGET,
	},
	_work: {
		layer: '_work',
		directory: 'docs/_work',
		allowedKinds: ['work', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: WORK_LINK_TARGETS,
		sizeBudget: NON_LOG_SIZE_BUDGET,
	},
	_archive: {
		layer: '_archive',
		directory: 'docs/_archive',
		allowedKinds: DOC_KINDS,
		frontmatterRequired: false,
		allowedLinkTargets: [...WORK_LINK_TARGETS, '_archive'],
		// History is oversized on purpose. The size rule skips this tree.
		sizeBudget: {
			warnAboveBytes: null,
			failAboveBytes: null,
		},
	},
	assets: {
		layer: 'assets',
		directory: 'docs/assets',
		allowedKinds: ['asset', 'index'],
		frontmatterRequired: true,
		allowedLinkTargets: WORK_LINK_TARGETS,
		sizeBudget: NON_LOG_SIZE_BUDGET,
	},
};

export const layerRule = (layer: DocLayer): DocLayerRule =>
	DOC_LAYER_RULES[layer];

/**
 * Repo-relative markdown files that may link into docs/_archive/
 * from outside that tree.
 *
 * Standing doors: the router, the TODO index, and the epic queue index.
 * docs/TODO/README.md and docs/DONE/README.md stay in the list so a
 * checkout that still has those paths is not a new failure mode. After
 * step 6 the live files are docs/_work/TODO/README.md and the DONE tree
 * inside docs/_archive/ (archive may link to itself).
 */
export const ARCHIVE_LINK_EXCEPTIONS: readonly string[] = [
	'docs/README.md',
	'docs/_work/TODO/README.md',
	'docs/_work/TODO/EPICS/README.md',
	'docs/TODO/README.md',
	'docs/DONE/README.md',
];
