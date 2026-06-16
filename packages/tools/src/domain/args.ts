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

	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);

		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
};

export const requireString = (
	args: Readonly<Record<string, unknown>>,
	key: string,
): string => {
	const value = asString(args, key)?.trim();

	if (value === undefined || value.length === 0) {
		throw new Error(`Missing required string argument «${key}».`);
	}

	return value;
};
