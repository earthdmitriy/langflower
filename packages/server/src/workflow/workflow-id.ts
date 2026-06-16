export const slugifyWorkflowId = (name: string): string => {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug.length > 0 ? slug : 'workflow';
};

export const allocateWorkflowId = (
	base: string,
	existingIds: ReadonlySet<string> | readonly string[],
): string => {
	const taken =
		existingIds instanceof Set ? existingIds : new Set(existingIds);

	if (!taken.has(base)) {
		return base;
	}

	let suffix = 2;

	while (taken.has(`${base}-${suffix}`)) {
		suffix += 1;
	}

	return `${base}-${suffix}`;
};
