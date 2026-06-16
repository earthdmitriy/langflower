import {
	assertToolMetaCoverage,
	buildToolCatalog,
} from './build-tool-catalog.js';
import { createBridgeSession, resolveWsUrl } from './create-bridge-session.js';
import { runMcpStdioServer } from './mcp-stdio-server.js';

const parseArgs = (
	argv: readonly string[],
): { readonly wsUrl?: string; readonly port?: number } => {
	let wsUrl: string | undefined;
	let port: number | undefined;

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--ws-url' && argv[i + 1] !== undefined) {
			wsUrl = argv[i + 1];
			i += 1;
			continue;
		}
		if (arg === '--port' && argv[i + 1] !== undefined) {
			port = Number(argv[i + 1]);
			i += 1;
			continue;
		}
	}

	return {
		...(wsUrl !== undefined ? { wsUrl } : {}),
		...(port !== undefined && Number.isFinite(port) ? { port } : {}),
	};
};

const main = async (): Promise<void> => {
	assertToolMetaCoverage();
	const args = parseArgs(process.argv.slice(2));
	const session = createBridgeSession(args);
	const tools = buildToolCatalog();

	process.stderr.write(
		`[langflower-mcp] targeting ${resolveWsUrl(args)} (${String(tools.length)} tools)\n`,
	);

	await runMcpStdioServer({ session, tools });
};

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`[langflower-mcp] fatal: ${message}\n`);
	process.exit(1);
});
