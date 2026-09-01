import {
	emptyResolveSecret,
	type ExecutionContext,
} from '@langflower/node-sdk';
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
			resolveSecret: emptyResolveSecret,
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

	it('emits pending before file content', async () => {
		await fs.writeFile(path.join(projectDir, 'notes.txt'), 'v1', 'utf8');

		const instance = readFileNode.getInstance();
		const pendingSeen: boolean[] = [];
		const sub = instance.outputs.content.subscribe({
			pending: (pending) => {
				pendingSeen.push(pending);
			},
		});

		instance.ctxConnection.connect(
			of({
				projectDir,
				runId: 'test',
				nodeId: 'read-1',
				params: {},
				uiSchema: readFileNode.uiSchema,
				resolveSecret: emptyResolveSecret,
			}),
		);
		instance.inputs.update.connect(of(null));
		instance.inputs.path.connect(of('notes.txt'));

		await expect(
			firstValueFrom(instance.outputs.content.value$),
		).resolves.toBe('v1');
		sub.unsubscribe();
		expect(pendingSeen).toContain(true);
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
				resolveSecret: emptyResolveSecret,
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
						event[0] === 'out' &&
						'error' in event[3] &&
						event[1] === 'read-1',
				),
			),
		);

		runtime.runner.start();
		const errorEvent = await errorPromise;
		expect(String(errorEvent[3].error)).toMatch(/non-empty path/);
	});
});
