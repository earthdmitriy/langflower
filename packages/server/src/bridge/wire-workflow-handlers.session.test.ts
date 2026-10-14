import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { ServerContext } from '../server-context.js';
import { LangflowerSession } from '../session/langflower-session.js';
import { WorkflowSessionAutosave } from '../workflow-sessions/workflow-session-autosave.js';
import { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import { indexClient } from './client-index.js';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';
import { wireWorkflowHandlers } from './wire-workflow-handlers.js';

describe('wireWorkflowHandlers session binding', () => {
	it('does not write the workflow file while a session is bound', async () => {
		const requested$ = new Subject<unknown>();
		const failed$ = new Subject<unknown>();
		const failures: unknown[] = [];
		failed$.subscribe((value) => {
			failures.push(value);
		});

		const bridge = {
			'workflow.saveCurrent.requested': requested$,
			'workflowSession.action.failed': failed$,
			'workflow.load.requested': new Subject(),
			'workflow.renameCurrent.requested': new Subject(),
			'workflow.create.requested': new Subject(),
			'workflow.copy.requested': new Subject(),
			'workflow.delete.requested': new Subject(),
			'workflow.list.requested': new Subject(),
		} as unknown as LangflowerBridge;
		const client = { id: 'c1' } as unknown as LangflowerClient;
		indexClient(bridge, client);

		const save = vi.fn(async () => {
			throw new Error('workflow file must stay untouched');
		});
		const session = new LangflowerSession();
		session.binding = { kind: 'workflowSession', sessionId: 'session-1' };
		session.activeWorkflow = {
			workflowId: 'demo',
			metadata: {
				name: 'Demo',
				createdAt: '2026-10-14T00:00:00.000Z',
				updatedAt: '2026-10-14T00:00:00.000Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		};
		session.activeWorkflowId = 'demo';

		const store = new WorkflowSessionStore('/tmp/lf-session-bound');
		const autosave = new WorkflowSessionAutosave(session, store);
		const context = {
			projectDir: '/tmp/lf-session-bound',
			workflowService: { save },
			resolveDefinition: () => undefined,
		} as unknown as ServerContext;

		const subscription = wireWorkflowHandlers(
			bridge,
			context,
			session,
			store,
			autosave,
		);
		requested$.next({ clientId: 'c1', payload: {} });

		await vi.waitFor(() => {
			expect(failures).toEqual([
				{
					code: 'SESSION_BOUND',
					message:
						'A workflow session is bound; the workflow file was not changed',
				},
			]);
		});
		expect(save).not.toHaveBeenCalled();

		subscription.unsubscribe();
		session.dispose();
	});
});
