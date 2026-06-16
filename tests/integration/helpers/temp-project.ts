import fs from 'node:fs/promises';
import path from 'node:path';
import { bootstrapProject } from '@langflower/server/bootstrap';
import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import { getTestsTmpDir } from './repo-paths.js';
import { bootstrapExampleWorkflow } from './scenarios/smoke.js';

export type CreateTempProjectOptions = {
	/** When true, seed skeleton `my-nodes`. Default false for fast WS suites. */
	readonly seedCustomNodes?: boolean;
};

export const createTempProject = async (
	options: CreateTempProjectOptions = {},
): Promise<string> => {
	const projectDir = path.join(
		getTestsTmpDir(),
		`langflower-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);

	await fs.mkdir(projectDir, { recursive: true });
	await bootstrapProject(projectDir, {
		mode: 'create',
		seedCustomNodes: options.seedCustomNodes === true,
	});
	// Integration suites still use the classic `example` smoke graph; product
	// skeleton seed does not include it — write it for test harness only.
	await writeWorkflowDocument(projectDir, bootstrapExampleWorkflow());

	return projectDir;
};

export const writeWorkflowDocument = async (
	projectDir: string,
	payload: WorkflowSavePayload,
): Promise<void> => {
	const workflowsDir = path.join(projectDir, '.langflower', 'workflows');

	await fs.mkdir(workflowsDir, { recursive: true });
	await fs.writeFile(
		path.join(workflowsDir, `${payload.workflowId}.json`),
		`${JSON.stringify({ metadata: payload.metadata, graph: payload.graph }, null, '\t')}\n`,
		'utf8',
	);
};

const isRetryableRmError = (error: unknown): boolean => {
	if (error === null || typeof error !== 'object' || !('code' in error)) {
		return false;
	}

	const code = String(error.code);

	// Windows often holds handles briefly after server.close; Node's
	// fs.rm `{ maxRetries }` is ignored on Windows.
	return (
		code === 'ENOTEMPTY' ||
		code === 'EBUSY' ||
		code === 'EPERM' ||
		code === 'EACCES'
	);
};

export const removeTempProject = async (projectDir: string): Promise<void> => {
	const maxAttempts = 10;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await fs.rm(projectDir, { recursive: true, force: true });
			return;
		} catch (error) {
			if (attempt === maxAttempts || !isRetryableRmError(error)) {
				throw error;
			}

			await new Promise<void>((resolve) => {
				setTimeout(resolve, 40 * attempt);
			});
		}
	}
};
