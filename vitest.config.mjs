/**
 * Vitest config — unit + integration projects (see docs/TESTING.md).
 */

import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
	plugins: [
		angular({ tsconfig: path.join(ROOT, 'packages/ui/tsconfig.json') }),
	],
	resolve: {
		alias: {
			'@langflower/node-sdk/llm': path.join(
				ROOT,
				'packages/node-sdk/src/node-factory/define-llm-node/define-llm-node.ts',
			),
			'@langflower/node-sdk/mcp': path.join(
				ROOT,
				'packages/node-sdk/src/node-factory/define-mcp/mcp-handle.ts',
			),
			'@langflower/node-sdk/create-typed-ui-schema': path.join(
				ROOT,
				'packages/node-sdk/src/node-factory/define-reactive-node/ui-schema-inference.ts',
			),
			'@langflower/node-sdk': path.join(
				ROOT,
				'packages/node-sdk/src/node-factory/define-reactive-node/define-reactive-node.ts',
			),
			'@langflower/common-nodes/test': path.join(
				ROOT,
				'packages/common-nodes/src/test-nodes/test-index.ts',
			),
			'@langflower/common-nodes/ai/llm-role-preset': path.join(
				ROOT,
				'packages/common-nodes/src/ai/features/llm-role-preset.ts',
			),
			'@langflower/common-nodes/ai/run-host-services': path.join(
				ROOT,
				'packages/common-nodes/src/ai/features/run-host-services.ts',
			),
			'@langflower/common-nodes/ai/openai/create-chat-completion-stream':
				path.join(
					ROOT,
					'packages/common-nodes/src/ai/features/openai/create-chat-completion-stream.ts',
				),
			'@langflower/common-nodes/ai/openai/list-provider-models':
				path.join(
					ROOT,
					'packages/common-nodes/src/ai/features/openai/list-provider-models.ts',
				),
			'@langflower/common-nodes': path.join(
				ROOT,
				'packages/common-nodes/src/catalog.ts',
			),
			'@langflower/shared/langflower.js': path.join(
				ROOT,
				'packages/shared/dist/langflower.js',
			),
			'@langflower/shared/langflower-ws-waits': path.join(
				ROOT,
				'packages/shared/dist/langflower-ws-waits.js',
			),
			'@langflower/mcp/build-tool-catalog': path.join(
				ROOT,
				'packages/langflower-mcp/src/build-tool-catalog.ts',
			),
			'@langflower/mcp/create-bridge-session': path.join(
				ROOT,
				'packages/langflower-mcp/src/create-bridge-session.ts',
			),
			'@langflower/mcp/handle-tool-call': path.join(
				ROOT,
				'packages/langflower-mcp/src/handle-tool-call.ts',
			),
			'@langflower/runtime/port-meta': path.join(
				ROOT,
				'packages/runtime/src/port-meta.ts',
			),
			'@langflower/runtime': path.join(
				ROOT,
				'packages/runtime/src/runtime.ts',
			),
			'@langflower/tools/domain-tool-configs': path.join(
				ROOT,
				'packages/tools/src/domain/domain-tool-configs.ts',
			),
			'@langflower/tools/create-project-harness': path.join(
				ROOT,
				'packages/tools/src/create-project-harness.ts',
			),
			'@langflower/tools/permission': path.join(
				ROOT,
				'packages/tools/src/permission.ts',
			),
			'@langflower/tools/create-web-fetch': path.join(
				ROOT,
				'packages/tools/src/create-web-fetch.ts',
			),
			'@langflower/tools/create-crawl-context': path.join(
				ROOT,
				'packages/tools/src/create-crawl-context.ts',
			),
			'@langflower/tools/mcp-stdio-client': path.join(
				ROOT,
				'packages/tools/src/mcp/mcp-stdio-client.ts',
			),
			'@langflower/tools/mcp-http-client': path.join(
				ROOT,
				'packages/tools/src/mcp/mcp-http-client.ts',
			),
			'@langflower/tools/mcp-tool-id': path.join(
				ROOT,
				'packages/tools/src/mcp/mcp-tool-id.ts',
			),
			'@langflower/eval/load-pack': path.join(
				ROOT,
				'packages/eval/src/load-pack.ts',
			),
			'@langflower/eval/run-eval-suite': path.join(
				ROOT,
				'packages/eval/src/run-eval-suite.ts',
			),
			'@langflower/compiler/compile-project-nodes': path.join(
				ROOT,
				'packages/compiler/src/compile-project-nodes.ts',
			),

			'@langflower/websocket-bridge/create-server': path.join(
				ROOT,
				'packages/websocket-bridge/dist/create-server.js',
			),
			'@langflower/websocket-bridge/create-client': path.join(
				ROOT,
				'packages/websocket-bridge/dist/create-client.js',
			),
			'@langflower/websocket-bridge/bridge-codec': path.join(
				ROOT,
				'packages/websocket-bridge/dist/bridge-codec.js',
			),
			'@langflower/websocket-bridge/bridge-codec.js': path.join(
				ROOT,
				'packages/websocket-bridge/dist/bridge-codec.js',
			),
			'@langflower/websocket-bridge': path.join(
				ROOT,
				'packages/websocket-bridge/dist/bridge-types.js',
			),
			'@langflower/server/create-server': path.join(
				ROOT,
				'packages/server/dist/create-server.js',
			),
			'@langflower/server/bootstrap': path.join(
				ROOT,
				'packages/server/dist/bootstrap/project-bootstrap.service.js',
			),
			'@langflower/server/server-context': path.join(
				ROOT,
				'packages/server/dist/server-context.js',
			),
		},
	},
	test: {
		root: ROOT,
		passWithNoTests: true,
		// Hard lock: do not raise to "fix" flaky suites — remove slow work instead.
		testTimeout: 5000,
		typecheck: {
			enabled: true,
			tsconfig: path.join(ROOT, 'packages/ui/tsconfig.vitest.json'),
			include: ['packages/**/src/**/*.test.ts'],
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: [
						'packages/**/src/**/*.test.ts',
						'tests/unit/**/*.test.ts',
					],
					exclude: ['packages/runtime/src/v2/**'],
					// Keep file parallelism: Vitest sequential mode (fileParallelism:
					// false / maxWorkers:1) reuses a worker and leaks vi.mock factories.
				},
			},
			{
				extends: true,
				test: {
					name: 'integration',
					environment: 'node',
					include: ['tests/integration/**/*.test.ts'],
					// Sequential: parallel WS servers contend on disk/CPU and flake on 5s.
					fileParallelism: false,
					maxWorkers: 1,
				},
			},
		],
	},
});
