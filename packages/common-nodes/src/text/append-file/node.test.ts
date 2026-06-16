import type { ExecutionContext } from '@langflower/node-sdk';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendFileNode } from './node.js';

describe('common-append-file', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-append-file-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('appends to project dir with delimiter and emits path', async () => {
		await fs.writeFile(
			path.join(projectDir, 'log.txt'),
			'existing',
			'utf8',
		);

		const instance = appendFileNode.getInstance();
		const ctx: ExecutionContext<typeof appendFileNode.uiSchema> = {
			projectDir,
			runId: 'test',
			nodeId: 'append-1',
			params: {},
			uiSchema: appendFileNode.uiSchema,
		};

		instance.ctxConnection.connect(of(ctx));
		instance.inputs.path.connect(of('log.txt'));
		instance.inputs.delimiter.connect(of('\n---\n'));
		instance.inputs.content.connect(of('line'));

		const pathOut = await firstValueFrom(instance.outputs.path.value$);
		expect(pathOut).toBe('log.txt');
		expect(
			await fs.readFile(path.join(projectDir, 'log.txt'), 'utf8'),
		).toBe('existing\n---\nline');
	});
});
