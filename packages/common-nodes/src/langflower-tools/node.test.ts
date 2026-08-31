import { contextSymbol, type ToolHandle } from '@langflower/node-sdk';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
	attachRunHostServices,
	buildAgentToolCtx,
	getRunHostServices,
} from '../ai/features/run-host-services.js';
import { getCommonReactiveNode } from '../catalog.js';
import { langflowerToolsNode } from './node.js';

const invokeCompile = async (
	instance: ReturnType<typeof langflowerToolsNode.getInstance>,
	agentCtx: object,
	args: Record<string, unknown> = {},
): Promise<string> => {
	const tools = (await firstValueFrom(
		instance.outputs.tools.value$,
	)) as readonly ToolHandle[];
	const handle = tools.find((tool) => tool.toolId === 'compile_custom_nodes');

	expect(handle).toBeDefined();
	return handle!.invoke(
		args,
		agentCtx as { projectDir: string; runId: string },
	);
};

const seedNodeCtx = (
	instance: ReturnType<typeof langflowerToolsNode.getInstance>,
	ctx: object,
): void => {
	instance.inputs[contextSymbol].connect(of(ctx));
};

describe('common-langflower-tools', () => {
	it('registers in the system catalog', () => {
		const node = getCommonReactiveNode('common-langflower-tools');

		expect(node).toBe(langflowerToolsNode);
		expect(node?.displayName).toBe('Langflower Tools');
		expect(node?.category).toBe('Tools');
	});

	it('returns { ok: false } text when bus RPC is missing', async () => {
		const instance = langflowerToolsNode.getInstance();
		const text = await invokeCompile(instance, {
			projectDir: '/tmp/p',
			runId: 'run-1',
		});

		expect(text).toContain('{ ok: false }');
		expect(text).toContain('no bus RPC');
	});

	it('calls requestLangflowerBus on the node EC and formats snapshot', async () => {
		const requestLangflowerBus = vi.fn(async () => ({
			status: 'partial',
			nodes: [{ type: 'fixture-ok' }],
			errors: [
				{
					packageName: 'echo-pack',
					message: 'Typecheck failed',
				},
			],
		}));
		const instance = langflowerToolsNode.getInstance();
		seedNodeCtx(
			instance,
			attachRunHostServices(
				{ projectDir: '/tmp/p', runId: 'run-1' },
				{ requestLangflowerBus },
			),
		);

		const text = await invokeCompile(instance, {
			projectDir: '/tmp/agent',
			runId: 'agent-run',
		});

		expect(requestLangflowerBus).toHaveBeenCalledTimes(1);
		expect(requestLangflowerBus).toHaveBeenCalledWith(
			'customPalette.update.requested',
			{},
		);
		expect(text).toContain('status: partial');
		expect(text).toContain('nodeTypes: fixture-ok');
		expect(text).toContain('- echo-pack: Typecheck failed');
	});

	it('passes force on the bus when the tool argument is true', async () => {
		const requestLangflowerBus = vi.fn(async () => ({
			status: 'ok',
			nodes: [],
			errors: [],
		}));
		const instance = langflowerToolsNode.getInstance();
		seedNodeCtx(
			instance,
			attachRunHostServices(
				{ projectDir: '/tmp/p', runId: 'run-1' },
				{ requestLangflowerBus },
			),
		);

		await invokeCompile(
			instance,
			{ projectDir: '/tmp/agent', runId: 'agent-run' },
			{ force: true },
		);

		expect(requestLangflowerBus).toHaveBeenCalledWith(
			'customPalette.update.requested',
			{ force: true },
		);
	});

	it('ignores requestLangflowerBus on agent toolCtx', async () => {
		const requestLangflowerBus = vi.fn(async () => ({
			status: 'ok',
			nodes: [],
			errors: [],
		}));
		const instance = langflowerToolsNode.getInstance();
		seedNodeCtx(instance, {
			projectDir: '/tmp/p',
			runId: 'run-1',
		});
		const agentCtx = attachRunHostServices(
			{ projectDir: '/tmp/agent', runId: 'agent-run' },
			{ requestLangflowerBus },
		);

		const text = await invokeCompile(instance, agentCtx);

		expect(requestLangflowerBus).not.toHaveBeenCalled();
		expect(text).toContain('{ ok: false }');
		expect(text).toContain('no bus RPC');
	});

	it('buildAgentToolCtx does not attach the host bag', () => {
		const toolCtx = buildAgentToolCtx(
			{ projectDir: '/tmp/p', runId: 'run-1' },
			{
				getLiveWiredTools: () => [],
				requestLangflowerBus: async () => ({ status: 'ok' }),
			},
		);

		expect(getRunHostServices(toolCtx)).toBeUndefined();
	});
});
