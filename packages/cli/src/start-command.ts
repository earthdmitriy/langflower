import { writeSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import open from 'open';
import { DEFAULT_PORT } from '@langflower/shared/constants/defaults.js';
import { formatRunSettleLine } from '@langflower/shared/langflower.js';
import {
	bootstrapProject,
	hasLangflowerProject,
} from '@langflower/server/bootstrap';
import { createServer } from '@langflower/server/create-server';

const packageRoot = (): string =>
	path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolveUiDistPath = async (): Promise<string> => {
	const root = packageRoot();
	const candidates = [
		path.join(root, 'ui-dist'),
		path.join(root, '../ui/dist/browser'),
	];

	for (const candidate of candidates) {
		try {
			await fs.access(path.join(candidate, 'index.html'));
			return candidate;
		} catch {
			/* try next */
		}
	}

	throw new Error(
		[
			'Langflower UI assets not found. Tried:',
			...candidates.map((candidate) => `  ${candidate}`),
			'From the monorepo: run `npm run build` (or `npm run install-local`).',
		].join('\n'),
	);
};

/** Parse CLI `--port` / `-p` into a listen port (1–65535). */
export const parseListenPort = (raw: string): number => {
	if (!/^\d+$/.test(raw)) {
		throw new Error(
			`Invalid --port "${raw}": expected an integer between 1 and 65535`,
		);
	}
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(
			`Invalid --port "${raw}": expected an integer between 1 and 65535`,
		);
	}
	return port;
};

type StartOpts = {
	readonly dev?: boolean;
	readonly port?: number;
	readonly noOpen?: boolean;
};

/** Machine-readable listen fact for the launcher (and other supervisors). */
export const formatReadyLine = (input: {
	readonly url: string;
	readonly port: number;
	readonly projectDir: string;
}): string =>
	`LANGFLOWER_READY ${JSON.stringify({
		url: input.url,
		port: input.port,
		projectDir: input.projectDir,
	})}`;

const startProject = async (
	projectDirArg: string,
	opts: StartOpts,
): Promise<void> => {
	const projectDir = path.resolve(projectDirArg);

	// First-run only: existing `.langflower/` is left alone. Operators refresh
	// skeleton templates via Settings → Bootstrap (force seed).
	if (!(await hasLangflowerProject(projectDir))) {
		await bootstrapProject(projectDir, { mode: 'create' });
	}

	const dev = opts.dev === true;
	// CLI --port overrides project config for this run only (no config write).
	const httpServer = await createServer({
		projectDir,
		...(opts.port !== undefined ? { port: opts.port } : {}),
		...(dev ? {} : { uiDistPath: await resolveUiDistPath() }),
		onRunSettled: (status) => {
			console.log(formatRunSettleLine(status));
		},
	});

	const address = httpServer.address();
	const port =
		address !== null && typeof address === 'object'
			? address.port
			: DEFAULT_PORT;

	if (dev) {
		console.log(`Langflower API running at http://127.0.0.1:${port}`);
		console.log(
			`UI dev server: http://127.0.0.1:4200 (ng serve with proxy)`,
		);
		if (opts.port !== undefined && opts.port !== DEFAULT_PORT) {
			console.warn(
				`Warning: --dev with --port ${String(opts.port)}: ng serve proxy still targets http://127.0.0.1:${String(DEFAULT_PORT)}/ws`,
			);
		}
	} else {
		const url = `http://127.0.0.1:${port}`;
		if (opts.noOpen !== true) {
			await open(url);
		}
		console.log(`Langflower running at ${url}`);
		writeSync(
			1,
			`${formatReadyLine({
				url,
				port,
				projectDir,
			})}\n`,
		);
	}

	console.log(`Project: ${projectDir}`);
};

const runStartAction = async (
	projectDir: string,
	opts: {
		readonly dev?: boolean;
		readonly port?: string;
		readonly open?: boolean;
	},
): Promise<void> => {
	try {
		const port =
			opts.port !== undefined ? parseListenPort(opts.port) : undefined;
		await startProject(projectDir, {
			dev: opts.dev === true,
			noOpen: opts.open === false,
			...(port !== undefined ? { port } : {}),
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: 'Failed to start Langflower';
		console.error(message);
		process.exit(1);
	}
};

const PORT_OPTION = [
	'-p, --port <number>',
	'HTTP listen port (overrides .langflower/config.json for this run)',
] as const;

const NO_OPEN_OPTION = [
	'--no-open',
	'Do not open the system browser after listen',
] as const;

const applyStartOptions = (command: Command): Command =>
	command
		.option('--dev', 'Dev mode: API-only server, UI served by ng serve')
		.option(...PORT_OPTION)
		.option(...NO_OPEN_OPTION);

/** Wire default `langflower [project-dir]` and alias `langflower start`. */
export const registerStartCommand = (program: Command): void => {
	applyStartOptions(
		program.argument('[project-dir]', 'Project directory', process.cwd()),
	).action(runStartAction);

	applyStartOptions(
		program
			.command('start')
			.description(
				'Start Langflower server and open UI in browser (alias)',
			)
			.argument('[project-dir]', 'Project directory', process.cwd()),
	).action(runStartAction);
};
