import type { NodeId, RuntimeRunnerEvent } from '@langflower/runtime';
import { filter, firstValueFrom, take } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';
import {
	delayPreviewWorkflow,
	stringFinishWorkflow,
} from '../helpers/scenarios/smoke.js';
import {
	createLangflowerWsClient,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	type LangflowerWsClient,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';

describe('runner pending events reach WS bridge', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	});

	afterEach(async () => {
		try {
			client['runner.interrupt.requested'].next('cancel');
			await firstValueFrom(client['runner.interrupted'].pipe(take(1)));
		} catch {
			// runner already idle
		}
	});

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('bridge forwards output-emitted events from sync nodes', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			stringFinishWorkflow('bridge-test'),
		);

		const allEvents: RuntimeRunnerEvent[] = [];
		const sub = client['runner.output-emitted'].subscribe((event) => {
			allEvents.push(event);
		});

		const donePromise = firstValueFrom(client['runner.done'].pipe(take(1)));

		client['runner.start.requested'].next([]);

		await donePromise;
		sub.unsubscribe();

		const outputEvents = allEvents.filter(
			(e) => e.kind === 'output-emitted',
		);

		const nodeIds = new Set(outputEvents.map((e) => e.nodeId));
		expect(nodeIds.has('string-1' as NodeId)).toBe(true);
		expect(nodeIds.has('finish-1' as NodeId)).toBe(true);

		for (const nodeId of nodeIds) {
			const states = outputEvents
				.filter((e) => e.nodeId === nodeId)
				.map((e) => e.state);
			expect(states).toContain('value');
		}
	});

	it('delay node emits pending then value through bridge', async () => {
		await seedWorkflowFromDisk(client, projectDir, delayPreviewWorkflow());

		const allEvents: RuntimeRunnerEvent[] = [];
		const sub = client['runner.output-emitted'].subscribe((event) => {
			allEvents.push(event);
		});

		const outputPromise = firstValueFrom(
			client['runner.output-emitted'].pipe(
				filter(
					(
						event,
					): event is Extract<
						RuntimeRunnerEvent,
						{
							kind: 'output-emitted';
							state: 'value';
							nodeId: 'preview-1';
						}
					> =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'preview-1',
				),
				take(1),
			),
		);

		client['runner.start.requested'].next([]);

		await outputPromise;
		sub.unsubscribe();

		const delayEvents = allEvents.filter(
			(e) =>
				e.kind === 'output-emitted' &&
				e.nodeId === 'delay-1' &&
				e.portId === 'value',
		);

		const states = delayEvents.map((e) => e.state);
		expect(states).toContain('pending');
		expect(states).toContain('value');
		expect(states.indexOf('pending')).toBeLessThan(states.indexOf('value'));
	});

	it('single always-on subscription fans pending out to all connected clients', async () => {
		await seedWorkflowFromDisk(client, projectDir, delayPreviewWorkflow());

		// A second client connects BEFORE the run starts. With a per-client
		// subscription this client would only receive events from its own
		// connect point; with the server's single always-on subscription both
		// tabs must receive the initial `pending` via live fan-out.
		const clientB = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(clientB);

		const eventsA: RuntimeRunnerEvent[] = [];
		const eventsB: RuntimeRunnerEvent[] = [];
		const subA = client['runner.output-emitted'].subscribe((e) =>
			eventsA.push(e),
		);
		const subB = clientB['runner.output-emitted'].subscribe((e) =>
			eventsB.push(e),
		);

		const valuePromise = firstValueFrom(
			client['runner.output-emitted'].pipe(
				filter(
					(
						event,
					): event is Extract<
						RuntimeRunnerEvent,
						{
							kind: 'output-emitted';
							state: 'value';
							nodeId: 'preview-1';
						}
					> =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'preview-1',
				),
				take(1),
			),
		);

		client['runner.start.requested'].next([]);
		await valuePromise;

		subA.unsubscribe();
		subB.unsubscribe();
		clientB.close();

		const statesOf = (events: RuntimeRunnerEvent[], nodeId: string) =>
			events
				.filter(
					(e) =>
						e.kind === 'output-emitted' &&
						e.nodeId === nodeId &&
						e.portId === 'value',
				)
				.map((e) => e.state);

		expect(statesOf(eventsA, 'delay-1')).toContain('pending');
		expect(statesOf(eventsB, 'delay-1')).toContain('pending');
	}, 30000);
});
