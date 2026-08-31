import { hasCustomNodePacks } from '@langflower/compiler/discover-packs';
import {
	langflowerWsConfig,
	resolveServerLogsEnabled,
	type TerminalExecutionProgressStatus,
} from '@langflower/shared/langflower.js';
import { createServer as createWsBridge } from '@langflower/websocket-bridge/create-server';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { attachLangflowerBridge } from './bridge/attach-langflower-bridge.js';
import { listenHttpServer } from './listen-http-server.js';
import { createServerContext } from './server-context.js';

export type CreateServerOptions = {
	readonly projectDir: string;
	readonly port?: number;
	readonly uiDistPath?: string;
	/** Fired once when a run settles naturally (`runner.done`). */
	readonly onRunSettled?: (status: TerminalExecutionProgressStatus) => void;
};

/** Warm custom-node registry before accepting clients / opening the browser. */
const warmCustomPalette = async (
	context: Awaited<ReturnType<typeof createServerContext>>,
): Promise<void> => {
	if (!(await hasCustomNodePacks(context.projectDir))) {
		context.customPaletteService.applyEmptyOk();
		return;
	}

	const { snapshot, compiled } = await context.customPaletteService.update(
		context.projectDir,
		{
			onCompile: () => {
				process.stdout.write('Compiling custom nodes ...');
			},
		},
	);
	if (compiled) {
		console.log(' done');
	} else {
		console.log('Custom nodes up to date');
	}

	if (snapshot.status === 'error' || snapshot.status === 'partial') {
		const count = String(snapshot.errors.length);
		console.warn(
			`Custom nodes compile ${snapshot.status}: ${count} pack error(s)`,
		);
	}
};

export async function createServer(
	options: CreateServerOptions,
): Promise<http.Server> {
	const context = await createServerContext(options.projectDir);
	await warmCustomPalette(context);

	const app = express();

	if (options.uiDistPath !== undefined) {
		const uiRoot = path.resolve(options.uiDistPath);
		app.use(express.static(uiRoot));
		app.get('*', (_request, response) => {
			response.sendFile(path.join(uiRoot, 'index.html'));
		});
	}

	const toolConfig = await context.configService.read();
	const langflowerConfig = await context.langflowerConfigService.read();
	const port = options.port ?? toolConfig.port;
	const httpServer = http.createServer(app);
	const bridge = createWsBridge(langflowerWsConfig, { httpServer });
	const detachBridge = attachLangflowerBridge(bridge, context, {
		serverLogsEnabled: resolveServerLogsEnabled(langflowerConfig),
		...(options.onRunSettled !== undefined
			? { onRunSettled: options.onRunSettled }
			: {}),
	});

	httpServer.on('close', () => {
		void detachBridge();
		bridge.close();
	});

	try {
		await listenHttpServer(httpServer, port, '127.0.0.1');
	} catch (error) {
		await detachBridge();
		bridge.close();
		httpServer.close();
		throw error;
	}

	return httpServer;
}
