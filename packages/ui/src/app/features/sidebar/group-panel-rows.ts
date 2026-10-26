import type { UISchemaGroup } from '@langflower/node-sdk/create-typed-ui-schema';

const GENERAL_GROUP_LABEL = 'General';

type GroupedPanelRows<Row> = {
	/** Stable track key — scoped to the node so open state resets on selection change. */
	readonly key: string;
	readonly label: string;
	readonly collapsed: boolean;
	readonly order: number;
	readonly rows: readonly Row[];
};

/**
 * Splits Inspector panel rows into accordion sections. Unmarked rows form
 * "General" (always open, always first). Other sections sort by `order`
 * (ties keep first-appearance order), and the first row of a group decides
 * its initial `collapsed` state and `order`.
 */
export const groupPanelRows = <Row extends { readonly group?: UISchemaGroup }>(
	nodeId: string,
	rows: readonly Row[],
): readonly GroupedPanelRows<Row>[] => {
	const labels = rows.reduce<readonly string[]>((acc, row) => {
		const label = row.group?.label ?? GENERAL_GROUP_LABEL;

		return acc.includes(label) ? acc : [...acc, label];
	}, []);

	const groups = labels.map((label) => {
		const members = rows.filter(
			(row) => (row.group?.label ?? GENERAL_GROUP_LABEL) === label,
		);

		return {
			key: `${nodeId}:${label}`,
			label,
			collapsed:
				label !== GENERAL_GROUP_LABEL &&
				members[0]?.group?.collapsed === true,
			order:
				label === GENERAL_GROUP_LABEL
					? Number.NEGATIVE_INFINITY
					: (members[0]?.group?.order ?? 0),
			rows: members,
		};
	});

	// Array#sort is stable, so equal `order` keeps first-appearance order.
	return [...groups].sort((left, right) => left.order - right.order);
};
