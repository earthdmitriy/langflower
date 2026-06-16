import type { ExecutionContext } from '@langflower/node-sdk';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileNode } from './node.js';

describe('common-write-file', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-write-file-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('writes to project dir and emits path', async () => {
		const instance = writeFileNode.getInstance();
		const ctx: ExecutionContext<typeof writeFileNode.uiSchema> = {
			projectDir,
			runId: 'test',
			nodeId: 'write-1',
			params: {},
			uiSchema: writeFileNode.uiSchema,
		};

		instance.ctxConnection.connect(of(ctx));
		instance.inputs.path.connect(of('out/a.txt'));
		instance.inputs.content.connect(of('body'));

		const pathOut = await firstValueFrom(instance.outputs.path.value$);
		expect(pathOut).toBe('out/a.txt');
		expect(
			await fs.readFile(path.join(projectDir, 'out/a.txt'), 'utf8'),
		).toBe('body');
	});
});
