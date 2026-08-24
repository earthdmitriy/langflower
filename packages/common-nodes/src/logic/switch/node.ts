import { defineReactiveNode } from '@langflower/node-sdk';
import { EMPTY, mergeMap, of } from 'rxjs';
import {
	DEFAULT_SWITCH_OUTPUT,
	DEFAULT_SWITCH_RULES,
	SWITCH_MATCH_MODE_OPTIONS,
	parseSwitchMatchMode,
	switchOutputPortIds,
} from './switch-constants.js';
import { parseSwitchRules, resolveSwitchOutput } from './switch-rules.js';

const STATIC_OUTPUT_PORTS = switchOutputPortIds(
	DEFAULT_SWITCH_RULES,
	DEFAULT_SWITCH_OUTPUT,
);

const ALLOWED_SWITCH_OUTPUTS = new Set(STATIC_OUTPUT_PORTS);

/**
 * Multi-rule string router. Output ports are fixed (`pass` / `fail` /
 * `default`). Panel `rules` may rematch values onto those port names only —
 * unknown `rule.output` / `defaultOutput` values fall back to `default`.
 */
export const switchNode = defineReactiveNode({
	type: 'common-switch',
	displayName: 'Switch',
	category: 'Logic',
	paletteSecondary: true,
	description: `
Match a string against rules and send it to **pass**, **fail**, or **default**.

Typical uses:
- Route by status text
- Several named outcomes without stacking IF nodes
`.trim(),
	uiSchema: [
		{
			field: 'rules',
			type: 'json',
			label: 'Rules',
			default: DEFAULT_SWITCH_RULES,
		},
		{
			field: 'matchMode',
			type: 'select',
			label: 'Match mode',
			default: 'equals',
			options: SWITCH_MATCH_MODE_OPTIONS,
		},
		{
			field: 'defaultOutput',
			type: 'string',
			label: 'Default output',
			default: DEFAULT_SWITCH_OUTPUT,
		},
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const value = makeInput<string>('value', {
			name: 'value',
			wireType: 'string',
			required: true,
		});

		const routed$ = combineInputs([value, ctx], ([raw, ec]) => {
			const rules = parseSwitchRules(ec.params.rules);
			const effectiveRules =
				rules.length > 0 ? rules : DEFAULT_SWITCH_RULES;
			const matchMode = parseSwitchMatchMode(ec.params.matchMode);
			const configuredDefault =
				typeof ec.params.defaultOutput === 'string' &&
				ec.params.defaultOutput.length > 0
					? ec.params.defaultOutput
					: DEFAULT_SWITCH_OUTPUT;
			const defaultOutput = ALLOWED_SWITCH_OUTPUTS.has(configuredDefault)
				? configuredDefault
				: DEFAULT_SWITCH_OUTPUT;
			const text = String(raw ?? '');
			const resolved = resolveSwitchOutput(
				text,
				effectiveRules,
				matchMode,
				defaultOutput,
			);
			const portId =
				resolved !== undefined && ALLOWED_SWITCH_OUTPUTS.has(resolved)
					? resolved
					: defaultOutput;
			return { text, portId };
		});

		const outputs = STATIC_OUTPUT_PORTS.map((portId) =>
			configureOutput(
				portId,
				routed$.pipeValue(
					mergeMap((decision) =>
						decision.portId === portId ? of(decision.text) : EMPTY,
					),
				),
				{ wireType: 'string' },
			),
		);

		return {
			inputs: [value],
			outputs,
		};
	},
});
