import { statefulObservable } from '@rx-evo/stateful-observable';
import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	defineReactiveNode,
	type NodeStateHook,
	type NodeStateJson,
} from '@langflower/node-sdk';

const stringOutput = () =>
	statefulObservable({
		loader: () => of('ok'),
		meta: {
			dir: 'out' as const,
			portId: 'out',
			wireType: 'string',
		},
	});

describe('node state hook', () => {
	it('copies state onto the live instance and does not restore during probe', () => {
		const restored: (NodeStateJson | null)[] = [];
		const hooks: NodeStateHook[] = [];

		const definition = defineReactiveNode({
			type: 'state-hook',
			displayName: 'State hook',
			uiSchema: [] as const,
			bind(_ctx, { configureOutput }) {
				const hook: NodeStateHook = {
					persist$: new Subject<NodeStateJson>(),
					restore: (state) => {
						restored.push(state);
						return { ok: true };
					},
				};
				hooks.push(hook);

				return {
					inputs: [],
					outputs: [
						configureOutput('out', stringOutput(), {
							wireType: 'string',
						}),
					],
					state: hook,
				};
			},
		});

		expect(hooks).toHaveLength(1);
		expect(restored).toEqual([]);

		const instance = definition.getInstance();

		expect(hooks).toHaveLength(2);
		expect(restored).toEqual([]);
		expect(instance.state).toBe(hooks[1]);
		expect(instance.state).not.toBe(hooks[0]);
	});
});
