export const asString = (
	args: Readonly<Record<string, unknown>>,
	key: string,
): string | undefined => {
	const value = args[key];
	return typeof value === 'string' ? value : undefined;
};

export const asNumber = (
	args: Readonly<Record<string, unknown>>,
	key: string,
): number | undefined => {
	const value = args[key];
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: undefined;
};

export const asBoolean = (
	args: Readonly<Record<string, unknown>>,
	key: string,
	defaultValue: boolean,
): boolean => {
	const value = args[key];
	return typeof value === 'boolean' ? value : defaultValue;
};
