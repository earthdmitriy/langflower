import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INTEGRATION_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);

export const getRepoRoot = (): string =>
	path.resolve(INTEGRATION_DIR, '..', '..');

export const getTestsTmpDir = (): string =>
	path.join(getRepoRoot(), 'tests', 'tmp');

export const getWorkflowFixturesDir = (): string =>
	path.join(getRepoRoot(), 'tests', 'fixtures', 'workflows');
