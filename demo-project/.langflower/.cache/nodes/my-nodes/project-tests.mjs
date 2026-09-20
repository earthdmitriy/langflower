// project-tests.ts
import { defineReactiveNode } from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';
import {
	EMPTY,
	mergeMap,
	of,
} from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/rxjs/dist/cjs/index.js';
var project_tests_default = defineReactiveNode({
	type: 'project-tests',
	displayName: 'Project Tests',
	category: 'Logic',
	description:
		'Run project tests on the coder result. Failure sends feedback; pass continues.',
	uiSchema: [
		{
			field: 'failFirst',
			type: 'number',
			label: 'Fail first N runs',
			default: 1,
			min: 0,
			step: 1,
		},
	],
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const result = makeInput('result', {
			name: 'result',
			wireType: 'string',
			required: true,
			description: 'Coder summary / change under test.',
		});
		const note = makeInput('note', {
			name: 'Note',
			wireType: 'string',
			hidden: true,
			inline: 'markdown',
			defaultValue: '',
		});
		let attempt = 0;
		const decision$ = combineInputs([result, ctx], ([work, ec]) => {
			const raw = Number(ec.params.failFirst);
			const failFirst = Number.isFinite(raw)
				? Math.max(0, Math.floor(raw))
				: 1;
			attempt += 1;
			const pass = attempt > failFirst;
			const body = String(work ?? '');
			return {
				pass,
				work: body,
				detail: pass
					? body
					: `Project tests failed (attempt ${String(attempt)}/${String(failFirst)}): add coverage for the change, then retry.`,
			};
		});
		const response$ = decision$.pipeValue(
			mergeMap((decision) => (decision.pass ? of(decision.work) : EMPTY)),
		);
		const feedback$ = decision$.pipeValue(
			mergeMap((decision) =>
				decision.pass ? EMPTY : of(decision.detail),
			),
		);
		return {
			inputs: [result, note],
			outputs: [
				configureOutput('response', response$, {
					wireType: 'string',
					description: 'Passthrough of result when tests accept.',
				}),
				configureOutput('feedback', feedback$, {
					wireType: 'string',
					description: 'Revision notes when tests reject.',
				}),
			],
		};
	},
});
export { project_tests_default as default };
