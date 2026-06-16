/**
 * Run npm workspace scripts sequentially with unified error handling.
 *
 * Used by all build/*.mjs entrypoints. Bash wrappers delegate here via Node.
 */

import { log } from './logger.mjs';
import {
	BuildError,
	formatCommandError,
	formatSpawnError,
} from './format-error.mjs';
import { logAngularBundleSize } from './format-bundle-size.mjs';
import { PACKAGES, ROOT } from './paths.mjs';
import { buildNpmArgs, runNpm } from './spawn-npm.mjs';

/** When BUILD_VERBOSE=1, stream child process output live. */
const VERBOSE = process.env.BUILD_VERBOSE === '1';

const UI_PACKAGE = PACKAGES.ui.name;

/**
 * Run a single npm script in a workspace package.
 */
export async function runStep({
	name,
	cwd = ROOT,
	script,
	workspace,
	env = {},
}) {
	const label = workspace ?? name;
	log.step(`${label} — npm run ${script}`);

	const npmArgs = buildNpmArgs({ script, workspace });
	const startedAt = Date.now();
	let stdout = '';
	let stderr = '';

	try {
		const result = await runNpm({
			args: npmArgs,
			cwd,
			env,
			onStdout: VERBOSE
				? (text) => process.stdout.write(text)
				: undefined,
			onStderr: VERBOSE
				? (text) => process.stderr.write(text)
				: undefined,
		});
		stdout = result.stdout ?? '';
		stderr = result.stderr ?? '';
	} catch (result) {
		if (result.error) {
			throw formatSpawnError(result.error, label);
		}

		throw formatCommandError({
			stepName: label,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			exitCode: result.exitCode ?? 1,
		});
	}

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.success(`${label} — done (${seconds}s)`);

	// Angular's size table is swallowed unless BUILD_VERBOSE=1; surface it
	// after a successful UI production build so agents/humans see the budget.
	if (
		!VERBOSE &&
		script === 'build' &&
		(workspace === UI_PACKAGE || name === UI_PACKAGE)
	) {
		logAngularBundleSize(`${stdout}\n${stderr}`);
	}

	return { durationMs: Date.now() - startedAt, stdout, stderr };
}

/**
 * Run multiple steps in order; stops on first failure.
 */
export async function runSteps(steps) {
	const results = [];

	for (const step of steps) {
		const result = await runStep(step);
		results.push({ ...step, result });
	}

	return results;
}

/**
 * Top-level wrapper: catches BuildError and exits with a readable message.
 */
export async function runMain(mainFn) {
	try {
		await mainFn();
	} catch (error) {
		if (error instanceof BuildError) {
			error.print();
			process.exit(error.exitCode);
		}

		const wrapped =
			error instanceof Error
				? new BuildError('build', error.message, {
						rawTail: error.stack,
					})
				: new BuildError('build', String(error), {});

		wrapped.print();
		process.exit(1);
	}
}
