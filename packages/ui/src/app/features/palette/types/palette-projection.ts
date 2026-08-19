import type {
	CustomPaletteCompilationStatus,
	CustomPalettePackError,
	CustomPaletteSnapshotPayload,
	PaletteConfigPayload,
	PaletteNodeDefinition,
	PaletteNodeSource,
} from '@langflower/shared/langflower';

export type PaletteCategoryGroup = {
	readonly category: string;
	readonly nodes: readonly PaletteNodeDefinition[];
	/** Present only on the Advanced group — secondary nodes by domain. */
	readonly subcategories?: readonly PaletteCategoryGroup[];
};

export type PaletteSourceSection = {
	readonly source: PaletteNodeSource;
	readonly categories: readonly PaletteCategoryGroup[];
};

export type PaletteSidebarState = {
	readonly sections: readonly PaletteSourceSection[];
	readonly customStatus: CustomPaletteCompilationStatus;
	readonly customErrors: readonly CustomPalettePackError[];
};

export const emptyCustomPaletteSnapshot: CustomPaletteSnapshotPayload = {
	nodes: [],
	errors: [],
	status: 'not_compiled',
};

export const initialPaletteSidebarState: PaletteSidebarState = {
	sections: [
		{ source: 'system', categories: [] },
		{ source: 'custom', categories: [] },
	],
	customStatus: 'not_compiled',
	customErrors: [],
};

/** Merged catalog for canvas / execution lookups (system + custom nodes). */
export const mergePaletteCatalogs = (
	system: PaletteConfigPayload,
	custom: CustomPaletteSnapshotPayload,
): PaletteConfigPayload => ({
	nodes: [
		...system.nodes.map((node) => ({ ...node, source: 'system' as const })),
		...custom.nodes.map((node) => ({ ...node, source: 'custom' as const })),
	],
});

export const ADVANCED_CATEGORY = 'Advanced';

const SOURCE_ORDER: readonly PaletteNodeSource[] = ['system', 'custom'];

const CATEGORY_ORDER: readonly string[] = [
	'AI',
	'Embeddings',
	'Tools',
	'Primitives',
	'Logic',
	'Flow',
	'Text',
	'Output',
	'HITL',
	'Harness',
	'Memory',
	'Crawl',
	'Other',
	ADVANCED_CATEGORY,
];

function categorySortIndex(category: string): number {
	const index = CATEGORY_ORDER.indexOf(category);

	return index === -1 ? CATEGORY_ORDER.length - 1 : index;
}

function compareCategories(a: string, b: string): number {
	const order = categorySortIndex(a) - categorySortIndex(b);

	if (order !== 0) {
		return order;
	}

	return a.localeCompare(b);
}

function sortNodesByDisplayName(
	nodes: readonly PaletteNodeDefinition[],
): readonly PaletteNodeDefinition[] {
	return [...nodes].sort((left, right) =>
		left.displayName.localeCompare(right.displayName),
	);
}

function groupByCategory(
	nodes: readonly PaletteNodeDefinition[],
): readonly PaletteCategoryGroup[] {
	const buckets = new Map<string, PaletteNodeDefinition[]>();

	for (const node of nodes) {
		const category = node.category ?? 'Other';
		const list = buckets.get(category);

		if (list === undefined) {
			buckets.set(category, [node]);
		} else {
			list.push(node);
		}
	}

	return [...buckets.entries()]
		.sort(([left], [right]) => compareCategories(left, right))
		.map(([category, categoryNodes]) => ({
			category,
			nodes: sortNodesByDisplayName(categoryNodes),
		}));
}

function isPaletteSecondary(node: PaletteNodeDefinition): boolean {
	return node.paletteSecondary === true;
}

function buildCategoryGroups(
	nodes: readonly PaletteNodeDefinition[],
): readonly PaletteCategoryGroup[] {
	const primary: PaletteNodeDefinition[] = [];
	const secondary: PaletteNodeDefinition[] = [];

	for (const node of nodes) {
		if (isPaletteSecondary(node)) {
			secondary.push(node);
		} else {
			primary.push(node);
		}
	}

	const groups = [...groupByCategory(primary)];

	if (secondary.length > 0) {
		groups.push({
			category: ADVANCED_CATEGORY,
			nodes: [],
			subcategories: groupByCategory(secondary),
		});
	}

	return groups.sort((left, right) =>
		compareCategories(left.category, right.category),
	);
}

export function paletteFromSnapshot(
	payload: PaletteConfigPayload,
): PaletteSidebarState {
	return paletteFromSystemAndCustom(payload, emptyCustomPaletteSnapshot);
}

/**
 * System section from `palette.snapshot`; Custom section only from
 * `customPalette.snapshot` (source of truth for custom nodes / errors).
 */
export function paletteFromSystemAndCustom(
	system: PaletteConfigPayload,
	custom: CustomPaletteSnapshotPayload,
): PaletteSidebarState {
	const bySource = new Map<PaletteNodeSource, PaletteNodeDefinition[]>([
		['system', []],
		['custom', []],
	]);

	for (const node of system.nodes) {
		bySource.get('system')?.push({ ...node, source: 'system' });
	}

	for (const node of custom.nodes) {
		bySource.get('custom')?.push({ ...node, source: 'custom' });
	}

	return {
		sections: SOURCE_ORDER.map((source) => ({
			source,
			categories: buildCategoryGroups(bySource.get(source) ?? []),
		})),
		customStatus: custom.status,
		customErrors: custom.errors,
	};
}

export function categoryCollapseKey(
	source: PaletteNodeSource,
	category: string,
): string {
	return `${source}:${category}`;
}

/** Collapse key for a domain subcategory under Advanced. */
export function advancedSubcategoryCollapseKey(
	source: PaletteNodeSource,
	subcategory: string,
): string {
	return `${source}:${ADVANCED_CATEGORY}:${subcategory}`;
}

export function sourceSectionLabel(source: PaletteNodeSource): string {
	return source === 'system' ? 'System' : 'Custom';
}

const nodeMatchesFilter = (
	node: PaletteNodeDefinition,
	normalizedQuery: string,
): boolean =>
	node.displayName.toLowerCase().includes(normalizedQuery) ||
	node.type.toLowerCase().includes(normalizedQuery);

const filterCategoryGroup = (
	group: PaletteCategoryGroup,
	normalizedQuery: string,
): PaletteCategoryGroup | null => {
	if (group.subcategories !== undefined) {
		const subcategories = group.subcategories
			.map((sub) => filterCategoryGroup(sub, normalizedQuery))
			.filter((sub): sub is PaletteCategoryGroup => sub !== null);

		if (subcategories.length === 0) {
			return null;
		}

		return {
			category: group.category,
			nodes: [],
			subcategories,
		};
	}

	const nodes = group.nodes.filter((node) =>
		nodeMatchesFilter(node, normalizedQuery),
	);

	if (nodes.length === 0) {
		return null;
	}

	return { category: group.category, nodes };
};

/** Case-insensitive filter by displayName / type; drops empty groups. */
export const filterPaletteSections = (
	sections: readonly PaletteSourceSection[],
	query: string,
): readonly PaletteSourceSection[] => {
	const normalizedQuery = query.trim().toLowerCase();

	if (normalizedQuery.length === 0) {
		return sections;
	}

	return sections
		.map((section) => ({
			source: section.source,
			categories: section.categories
				.map((group) => filterCategoryGroup(group, normalizedQuery))
				.filter(
					(group): group is PaletteCategoryGroup => group !== null,
				),
		}))
		.filter((section) => section.categories.length > 0);
};
