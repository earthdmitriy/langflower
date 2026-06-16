import type { ExecutionContext } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BehaviorSubject, filter, firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileNode } from './node.js';

describe('common-read-file', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-read-file-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('reads from project dir and re-reads on update', async () => {
		await fs.writeFile(path.join(projectDir, 'notes.txt'), 'v1', 'utf8');

		const instance = readFileNode.getInstance();
		const ctx: ExecutionContext<typeof readFileNode.uiSchema> = {
			projectDir,
			runId: 'test',
			nodeId: 'read-1',
			params: {},
			uiSchema: readFileNode.uiSchema,
		};

		const update$ = new BehaviorSubject<unknown>(null);
		instance.ctxConnection.connect(of(ctx));
		instance.inputs.update.connect(update$);
		instance.inputs.path.connect(of('notes.txt'));

		await expect(
			firstValueFrom(instance.outputs.content.value$),
		).resolves.toBe('v1');

		await fs.writeFile(path.join(projectDir, 'notes.txt'), 'v2', 'utf8');

		const next = firstValueFrom(
			instance.outputs.content.value$.pipe(
				filter((value) => value === 'v2'),
			),
		);
		update$.next({});
		await expect(next).resolves.toBe('v2');
	});

	it('errors when path is empty', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const read = readFileNode.getInstance();
		read.ctxConnection.connect(
			of({
				projectDir,
				runId: 'test',
				nodeId: 'read-1',
				params: {},
				uiSchema: readFileNode.uiSchema,
			}),
		);
		read.inputs.path.connect(of(''));

		runtime.editor.addNode({
			nodeId: 'read-1',
			inputs: read.inputs,
			outputs: read.outputs,
			bypassPorts: read.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'error' &&
						event.nodeId === 'read-1',
				),
			),
		);

		runtime.runner.start();
		const errorEvent = await errorPromise;
		expect(String(errorEvent.value)).toMatch(/non-empty path/);
	});
});
