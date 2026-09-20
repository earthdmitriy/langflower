export type SwitchRule = {
	readonly match: string;
	readonly output: string;
};

const isSwitchRuleEntry = (
	entry: unknown,
): entry is { readonly match: string; readonly output: string } => {
	if (typeof entry !== 'object' || entry === null) {
		return false;
	}

	const record = entry as Record<string, unknown>;
	return (
		typeof record['match'] === 'string' &&
		record['match'].length > 0 &&
		typeof record['output'] === 'string' &&
		record['output'].length > 0
	);
};

export const parseSwitchRules = (rules: unknown): readonly SwitchRule[] => {
	if (!Array.isArray(rules)) {
		return [];
	}

	const parsed: SwitchRule[] = [];

	for (const entry of rules) {
		if (!isSwitchRuleEntry(entry)) {
			continue;
		}

		parsed.push({ match: entry.match, output: entry.output });
	}

	return parsed;
};

export const resolveSwitchOutput = (
	value: string,
	rules: readonly SwitchRule[],
	matchMode: 'equals' | 'regex',
	defaultOutput?: string,
): string | undefined => {
	for (const rule of rules) {
		const matched =
			matchMode === 'regex'
				? matchesRegex(value, rule.match)
				: value === rule.match;

		if (matched) {
			return rule.output;
		}
	}

	if (defaultOutput !== undefined && defaultOutput.length > 0) {
		return defaultOutput;
	}

	return undefined;
};

const matchesRegex = (value: string, pattern: string): boolean => {
	try {
		return new RegExp(pattern).test(value);
	} catch {
		return false;
	}
};
