import { buildToolCatalog } from '@langflower/mcp/build-tool-catalog';
import { createBridgeSession } from '@langflower/mcp/create-bridge-session';
import { handleToolCall } from '@langflower/mcp/handle-tool-call';
import { afterEach, describe, expect, it } from 'vitest';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';

describe('langflower-mcp bridge (in-process)', () => {
	let urls: TestServerHandle | undefined;
	let projectDir: string | undefined;

	afterEach(async () => {
		await stopTestServer(urls);
		urls = undefined;
		if (projectDir !== undefined) {
			await removeTempProject(projectDir);
			projectDir = undefined;
		}
	});

	it('connects and lists workflows via MCP action tools', async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });

		const session = createBridgeSession({ wsUrl: urls.wsUrl });
		const tools = buildToolCatalog();
		const toolsByName = new Map(
			tools.map((tool) => [tool.name, tool] as const),
		);

		try {
			const connected = await handleToolCall(
				session,
				toolsByName,
				'ensure_connected',
				{},
			);
			expect(connected.ok).toBe(true);

			// Late re-call must not hang: session.ready is hot and already cached.
			const connectedAgain = await handleToolCall(
				session,
				toolsByName,
				'ensure_connected',
				{},
			);
			expect(connectedAgain.ok).toBe(true);

			const listed = await handleToolCall(
				session,
				toolsByName,
				'workflow_list_requested',
				{ payload: {} },
			);
			expect(listed.ok).toBe(true);
			expect(listed.text).toContain('workflows');

			const waitCurrent = await handleToolCall(
				session,
				toolsByName,
				'wait_event',
				{
					event: 'workflow.current.snapshot',
					mode: 'latest',
				},
			);
			expect(waitCurrent.ok).toBe(true);
		} finally {
			session.close();
		}
	});
});
