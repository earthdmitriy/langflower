export type SwitchRule = {
	readonly match: string;
	readonly output: string;
};

export function parseSwitchRules(rules: unknown): readonly SwitchRule[] {
	if (!Array.isArray(rules)) {
		return [];
	}

	const parsed: SwitchRule[] = [];

	for (const entry of rules) {
		if (typeof entry !== 'object' || entry === null) {
			continue;
		}

		const match = (entry as { match?: unknown }).match;
		const output = (entry as { output?: unknown }).output;

		if (typeof match !== 'string' || typeof output !== 'string') {
			continue;
		}

		if (match.length === 0 || output.length === 0) {
			continue;
		}

		parsed.push({ match, output });
	}

	return parsed;
}

export function resolveSwitchOutput(
	value: string,
	rules: readonly SwitchRule[],
	matchMode: 'equals' | 'regex',
	defaultOutput?: string,
): string | undefined {
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
}

function matchesRegex(value: string, pattern: string): boolean {
	try {
		return new RegExp(pattern).test(value);
	} catch {
		return false;
	}
}
