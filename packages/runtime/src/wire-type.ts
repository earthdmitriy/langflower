/**
 * Port wire type. A scalar names one type (`'string'`). A list is a union:
 * an edge connects when the two sides share a member. `'any'` matches
 * everything. `'dynamic'` is scalar-only and never appears in a list.
 */
export type WireTypeSpec = string | readonly string[];

export const wireTypeList = (spec: WireTypeSpec): readonly string[] =>
	typeof spec === 'string' ? [spec] : spec;

/** Scalar and one-element list both mean "exactly this type". */
export const wireTypeIs = (
	spec: WireTypeSpec | symbol | undefined,
	name: string,
): boolean => {
	if (spec === undefined || typeof spec === 'symbol') {
		return false;
	}
	const list = wireTypeList(spec);
	return list.length === 1 && list[0] === name;
};

export const wireTypesCompatible = (
	source: WireTypeSpec,
	input: WireTypeSpec,
): boolean => {
	const sourceList = wireTypeList(source);
	const inputList = wireTypeList(input);
	return (
		sourceList.includes('any') ||
		inputList.includes('any') ||
		sourceList.some((type) => inputList.includes(type))
	);
};

/** `string | user-turn` for a union, the bare name for a scalar. */
export const formatWireType = (spec: WireTypeSpec | symbol): string =>
	typeof spec === 'symbol' ? String(spec) : wireTypeList(spec).join(' | ');
