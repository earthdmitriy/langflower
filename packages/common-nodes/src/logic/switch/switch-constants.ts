import type { SwitchRule } from './switch-rules.js';

/** Default rules — also define the static output port set (plus `default`). */
export const DEFAULT_SWITCH_RULES: readonly SwitchRule[] = [
	{ match: 'pass', output: 'pass' },
	{ match: 'fail', output: 'fail' },
];

export const DEFAULT_SWITCH_OUTPUT = 'default';

export const SWITCH_MATCH_MODE_OPTIONS = [
	{ title: 'Equals', value: 'equals' },
	{ title: 'Regex', value: 'regex' },
] as const;

export type SwitchMatchMode = 'equals' | 'regex';

export const parseSwitchMatchMode = (raw: unknown): SwitchMatchMode =>
	raw === 'regex' ? 'regex' : 'equals';

/** Unique output port ids from rules + always-present default port. */
export const switchOutputPortIds = (
	rules: readonly SwitchRule[],
	defaultOutput: string = DEFAULT_SWITCH_OUTPUT,
): readonly string[] => {
	const ports: string[] = [];
	for (const rule of rules) {
		if (!ports.includes(rule.output)) {
			ports.push(rule.output);
		}
	}
	if (defaultOutput.length > 0 && !ports.includes(defaultOutput)) {
		ports.push(defaultOutput);
	}
	return ports;
};
