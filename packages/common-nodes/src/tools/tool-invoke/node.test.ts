import type { ToolHandle } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { getCommonReactiveNode } from '../../catalog.js';
import { toolInvokeNode } from './node.js';

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

const handle = (
	toolId: string,
	invoke: ToolHandle['invoke'] = async () => '',
): ToolHandle => ({
	toolId,
	name: toolId,
	description: toolId,
	inputSchema: { type: 'object', properties: {} },
	invoke,
});

const seedCtx = (
	instance: ReturnType<typeof toolInvokeNode.getInstance>,
	runId = 'run-1',
): BehaviorSubject<{
	readonly projectDir: string;
	readonly runId: string;
	readonly nodeId: string;
	readonly params: Record<string, never>;
	readonly uiSchema: typeof toolInvokeNode.uiSchema;
}> => {
	const ctx$ = new BehaviorSubject({
		projectDir: '/tmp/project',
		runId,
		nodeId: 'invoke-1',
		params: {},
		uiSchema: toolInvokeNode.uiSchema,
	});
	instance.ctxConnection.connect(ctx$);
	return ctx$;
};

describe('common-tool-invoke', () => {
	it('registers in the Tools catalog', () => {
		const node = getCommonReactiveNode('common-tool-invoke');

		expect(node).toBeDefined();
		expect(node?.displayName).toBe('Tool invoke');
		expect(node?.category).toBe('Tools');
		expect(node?.getInstance).toBeTypeOf('function');
	});

	it('exposes tools (single), toolId, args, and result', () => {
		const inputIds = toolInvokeNode.inputsConfigs
			.map((meta) => meta.portId)
			.filter((id): id is string => typeof id === 'string');
		const toolsIn = toolInvokeNode.inputsConfigs.find(
			(meta) => meta.portId === 'tools',
		);

		expect(inputIds).toEqual(['tools', 'toolId', 'args']);
		expect(toolsIn?.mode).toBe('single');
		expect(toolsIn?.wireType).toBe('tool-handle');
		expect(
			toolInvokeNode.inputsConfigs.find((meta) => meta.portId === 'args')
				?.defaultValue,
		).toEqual('');
		expect(
			toolInvokeNode.outputsConfigs.map((meta) => String(meta.portId)),
		).toEqual(['result']);
	});

	it('invokes the matching handle with parsed args and ctx', async () => {
		const calls: unknown[] = [];
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.args.connect(new BehaviorSubject({ message: 'hi' }));
		instance.inputs.tools.connect(
			new BehaviorSubject([
				handle('echo__ping', async (args, ctx) => {
					calls.push({ args, ctx });
					return 'pong';
				}),
			]),
		);

		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe('pong');
		expect(calls).toEqual([
			{
				args: { message: 'hi' },
				ctx: { projectDir: '/tmp/project', runId: 'run-1' },
			},
		]);
	});

	it('treats blank args as an empty object', async () => {
		const seen: unknown[] = [];
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.args.connect(new BehaviorSubject(''));
		instance.inputs.tools.connect(
			new BehaviorSubject([
				handle('echo__ping', async (args) => {
					seen.push(args);
					return 'ok';
				}),
			]),
		);
		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe('ok');
		expect(seen).toEqual([{}]);
	});

	it('treats [object Object] args as an empty object', async () => {
		const seen: unknown[] = [];
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.args.connect(new BehaviorSubject('[object Object]'));
		instance.inputs.tools.connect(
			new BehaviorSubject([
				handle('echo__ping', async (args) => {
					seen.push(args);
					return 'ok';
				}),
			]),
		);
		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe('ok');
		expect(seen).toEqual([{}]);
	});

	it('does not error while inventory is empty', async () => {
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		const errors: unknown[] = [];
		const values: unknown[] = [];
		const errorSub = instance.outputs.result.error$.subscribe((err) => {
			errors.push(err);
		});
		const valueSub = instance.outputs.result.value$.subscribe((value) => {
			values.push(value);
		});

		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.args.connect(new BehaviorSubject({}));
		instance.inputs.tools.connect(new BehaviorSubject([]));
		await delay(40);

		errorSub.unsubscribe();
		valueSub.unsubscribe();
		expect(errors).toEqual([]);
		expect(values).toEqual([]);
	});

	it('errors when toolId is missing from a ready inventory', async () => {
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		const errorPromise = firstValueFrom(instance.outputs.result.error$);

		instance.inputs.toolId.connect(new BehaviorSubject('missing__tool'));
		instance.inputs.args.connect(new BehaviorSubject({}));
		instance.inputs.tools.connect(
			new BehaviorSubject([handle('echo__ping')]),
		);

		await expect(errorPromise).resolves.toMatchObject({
			message: expect.stringMatching(/missing__tool/),
		});
	});

	it('errors when args is invalid JSON', async () => {
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		const errorPromise = firstValueFrom(instance.outputs.result.error$);

		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.args.connect(new BehaviorSubject('{'));
		instance.inputs.tools.connect(
			new BehaviorSubject([handle('echo__ping')]),
		);

		await expect(errorPromise).resolves.toMatchObject({
			message: expect.stringMatching(/not valid JSON/),
		});
	});

	it('does not re-invoke the same toolId+args when tools reconnect', async () => {
		let calls = 0;
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		const values: string[] = [];
		const valueSub = instance.outputs.result.value$.subscribe((value) => {
			values.push(value);
		});
		const tools$ = new BehaviorSubject([
			handle('echo__ping', async () => {
				calls += 1;
				return 'one';
			}),
		]);
		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.args.connect(new BehaviorSubject({ n: 1 }));
		instance.inputs.tools.connect(tools$);

		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe('one');
		expect(calls).toBe(1);

		tools$.next([
			handle('echo__ping', async () => {
				calls += 1;
				return 'two';
			}),
		]);
		await delay(40);
		valueSub.unsubscribe();
		expect(calls).toBe(1);
		expect(values).toEqual(['one']);
	});

	it('invokes again on a new runId with the same toolId and args', async () => {
		let calls = 0;
		const instance = toolInvokeNode.getInstance();
		const ctx$ = seedCtx(instance);
		const valueSub = instance.outputs.result.value$.subscribe();
		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.args.connect(new BehaviorSubject({ n: 1 }));
		instance.inputs.tools.connect(
			new BehaviorSubject([
				handle('echo__ping', async () => {
					calls += 1;
					return 'ok';
				}),
			]),
		);
		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe('ok');
		expect(calls).toBe(1);

		ctx$.next({
			...ctx$.value,
			runId: 'run-2',
		});
		await delay(40);
		valueSub.unsubscribe();
		expect(calls).toBe(2);
	});

	it('invokes again when args change', async () => {
		const seen: unknown[] = [];
		const instance = toolInvokeNode.getInstance();
		seedCtx(instance);
		const valueSub = instance.outputs.result.value$.subscribe();
		const args$ = new BehaviorSubject<Record<string, unknown>>({ n: 1 });
		instance.inputs.toolId.connect(new BehaviorSubject('echo__ping'));
		instance.inputs.tools.connect(
			new BehaviorSubject([
				handle('echo__ping', async (args) => {
					seen.push(args);
					return 'ok';
				}),
			]),
		);
		instance.inputs.args.connect(args$);
		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe('ok');

		args$.next({ n: 2 });
		await delay(40);
		valueSub.unsubscribe();
		expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
	});
});
