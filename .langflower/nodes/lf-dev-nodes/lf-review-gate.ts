import { defineReactiveNode } from '@langflower/node-sdk';
import { EMPTY, mergeMap, of } from 'rxjs';
import {
	runAllowlistedNpmResult,
	type NpmScriptName,
} from './lib/run-npm-script.ts';

const FORMAT_STEP = 'format' as const satisfies NpmScriptName;

const GATE_STEPS = [
	'typecheck',
	'test',
] as const satisfies readonly NpmScriptName[];

type GateResult =
	| { readonly ok: true; readonly trigger: unknown }
	| { readonly ok: false; readonly detail: string };

/**
 * Graph QA gate: `format` (rewrites, never fails the gate) → `typecheck`
 * (no emit) → `test`. Typecheck/test failure skips later steps. `ok`
 * passthroughs `trigger`; `fail` is stripped command text.
 *
 * `defineReactiveNode` is required so we can emit on one output and stay
 * silent on the other.
 */
export default defineReactiveNode({
	type: 'lf-review-gate',
	displayName: 'LF Review Gate',
	category: 'Logic',
	description: `
Runs \`npm run format\` (rewrites files; formatter findings do not fail
the gate), then \`npm run typecheck\`, then \`npm run test\`. Stops on the
first typecheck or test failure.

Typical uses:
- Block the next stage until types and tests are green
- Feed the first typecheck/test failure into an agent or Preview
`.trim(),
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput<unknown>('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
			defaultValue: null,
			description:
				'Emit to run format → typecheck → test. Passed through on `ok`.',
		});

		const result$ = combineInputs([trigger, ctx], ([triggerValue, ec]) => ({
			trigger: triggerValue,
			projectDir: String(ec.projectDir ?? ''),
		})).pipeValue(
			mergeMap(
				async ({
					trigger: triggerValue,
					projectDir,
				}): Promise<GateResult> => {
					for (const script of [FORMAT_STEP, ...GATE_STEPS]) {
						const step = await runAllowlistedNpmResult(
							script,
							projectDir,
						);
						if (script !== FORMAT_STEP && !step.ok) {
							return { ok: false, detail: step.text };
						}
					}

					return { ok: true, trigger: triggerValue };
				},
			),
		);

		const ok$ = result$.pipeValue(
			mergeMap((result) => (result.ok ? of(result.trigger) : EMPTY)),
		);
		const fail$ = result$.pipeValue(
			mergeMap((result) => (result.ok ? EMPTY : of(result.detail))),
		);

		return {
			inputs: [trigger],
			outputs: [
				configureOutput('ok', ok$, {
					inferTypeFrom: trigger,
					description:
						'Passthrough of `trigger` when typecheck and test pass (after format).',
				}),
				configureOutput('fail', fail$, {
					wireType: 'string',
					description:
						'Stripped failure from the first failing typecheck or test step. Silent when the gate passes.',
				}),
			],
		};
	},
});
