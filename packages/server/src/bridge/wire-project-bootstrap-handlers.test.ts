import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { ServerContext } from '../server-context.js';
import { LangflowerSession } from '../session/langflower-session.js';
import { indexClient } from './client-index.js';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';

const compileAndHotSwapCustomNodes = vi.hoisted(() =>
	vi.fn(async () => ({ nodes: [], errors: [], status: 'ok' as const })),
);
const bootstrapProject = vi.hoisted(() =>
	vi.fn(async () => ({ workflowIds: [] as string[] })),
);

vi.mock('./compile-and-hot-swap-custom-nodes.js', () => ({
	compileAndHotSwapCustomNodes,
}));

vi.mock('../bootstrap/project-bootstrap.service.js', () => ({
	bootstrapProject,
}));

describe('wireProjectBootstrapHandlers', () => {
	beforeEach(() => {
		compileAndHotSwapCustomNodes.mockClear();
		bootstrapProject.mockClear();
	});

	it('force-compiles custom nodes through the hot-swap composer after seed', async () => {
		const { wireProjectBootstrapHandlers } =
			await import('./wire-project-bootstrap-handlers.js');

		const requested$ = new Subject<unknown>();
		const list$ = new Subject<unknown>();
		const result$ = new Subject<unknown>();
		const results: unknown[] = [];
		result$.subscribe((value) => {
			results.push(value);
		});

		const bridge = {
			'project.bootstrap.requested': requested$,
			'workflow.list.snapshot': list$,
		} as unknown as LangflowerBridge;
		const client = {
			id: 'c1',
			'project.bootstrap.result': result$,
		} as unknown as LangflowerClient;
		indexClient(bridge, client);

		const session = new LangflowerSession();
		const context = {
			projectDir: '/tmp/lf-bootstrap',
			workflowService: {
				list: async () => [],
			},
			resolveDefinition: () => undefined,
			customPaletteService: {
				update: async () => {
					throw new Error(
						'bootstrap must not call customPaletteService.update directly',
					);
				},
			},
		} as unknown as ServerContext;

		const subscription = wireProjectBootstrapHandlers(
			bridge,
			context,
			session,
		);
		requested$.next({ clientId: 'c1', payload: {} });

		await vi.waitFor(() => {
			expect(compileAndHotSwapCustomNodes).toHaveBeenCalledOnce();
		});
		expect(compileAndHotSwapCustomNodes).toHaveBeenCalledWith(
			session,
			context,
			bridge,
			{ force: true },
		);
		await vi.waitFor(() => {
			expect(results).toEqual([{ ok: true }]);
		});

		subscription.unsubscribe();
		session.dispose();
	});
});
