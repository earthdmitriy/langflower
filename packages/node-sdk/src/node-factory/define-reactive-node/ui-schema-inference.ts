import type { InlineSelectOption } from './io-helpers.js';

/** Minimal const-tuple uiSchema item for Params inference. */
export type UISchemaConstItem = {
	readonly field: string;
	readonly type: string;
	readonly label?: string;
	readonly default?: unknown;
	readonly placement?: 'panel' | 'inline';
	/** Number field constraints — same semantics as canvas inline `{ type: 'number' }`. */
	readonly min?: number;
	readonly max?: number;
	readonly step?: number;
	readonly options?: readonly InlineSelectOption[];
	readonly optionsSource?:
		| 'langflower.providers'
		| 'langflower.models'
		| 'langflower.tools'
		| 'langflower.skills'
		| 'langflower.mcpServers'
		| 'node.wiredTools';
	readonly dependsOn?: string;
};

export type DataTypeToTsType<D extends string> = D extends
	'string' | 'url' | 'file-path' | 'select' | 'phase' | 'llm-message'
	? string
	: D extends 'number'
		? number
		: D extends 'boolean'
			? boolean
			: D extends
						| 'json'
						| 'tool-handle'
						| 'tool-registration'
						| 'mcp-handle'
						| 'mcp-transport'
						| 'tool-id-list'
						| 'tool-permission-table'
						| 'any'
				? unknown
				: D extends 'stream'
					? never
					: unknown;

export type UISchemaItemValue<I extends UISchemaConstItem> = DataTypeToTsType<
	I['type']
>;

export type UISchemaFieldNames<UI extends readonly UISchemaConstItem[]> =
	UI[number]['field'];

export type AssertConstUISchema<UI extends readonly UISchemaConstItem[]> =
	string extends UISchemaFieldNames<UI> ? never : UI;

export type UISchemaItemByField<
	UI extends readonly UISchemaConstItem[],
	F extends UISchemaFieldNames<UI>,
> = Extract<UI[number], { readonly field: F }>;

export type ParamsFromUISchema<UI extends readonly UISchemaConstItem[]> = {
	readonly [F in UISchemaFieldNames<UI>]?: UISchemaItemValue<
		UISchemaItemByField<UI, F>
	>;
};

export type TypedUISchema<UI extends readonly UISchemaConstItem[]> = {
	readonly items: UI;
	byField<F extends UISchemaFieldNames<UI>>(
		field: F,
	): UISchemaItemByField<UI, F>;
};

export function defaultParamsFromUiSchema<
	UI extends readonly UISchemaConstItem[],
>(uiSchema: UI): Readonly<ParamsFromUISchema<UI>> {
	return Object.fromEntries(
		uiSchema
			.filter((item) => item.default !== undefined)
			.map((item) => [item.field, item.default]),
	) as Readonly<ParamsFromUISchema<UI>>;
}

export function createTypedUISchema<UI extends readonly UISchemaConstItem[]>(
	items: UI,
): TypedUISchema<UI> {
	return {
		items,
		byField<F extends UISchemaFieldNames<UI>>(field: F) {
			const item = items.find((entry) => entry.field === field);

			if (item === undefined) {
				throw new Error(`Unknown uiSchema field: ${String(field)}`);
			}

			return item as UISchemaItemByField<UI, F>;
		},
	};
}
