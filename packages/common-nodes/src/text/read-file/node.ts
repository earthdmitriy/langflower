import { defineReactiveNode } from '@langflower/node-sdk';
import { createProjectFilesContext } from '@langflower/tools/create-project-files-context';
import { from, mergeMap, throwError } from 'rxjs';
import { getRunHostServices } from '../../ai/features/run-host-services.js';

/**
 * Read a project-relative text file via `createProjectFilesContext` (no permission ask).
 * Wire `update` (dynamic) to re-read when the path is unchanged.
 */
export const readFileNode = defineReactiveNode({
	type: 'common-read-file',
	displayName: 'Read File',
	category: 'Text',
	description: `
Read a file inside the project into **content**. Absolute paths are refused.

Pulse **update** to read the same path again after it changes on disk.
`.trim(),
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const pathInput = makeInput<string>('path', {
			name: 'path',
			wireType: 'string',
			inline: 'text',
			required: true,
			defaultValue: '',
		});
		const update = makeInput<unknown>('update', {
			name: 'update',
			dynamic: true,
			defaultValue: null,
		});

		const content$ = combineInputs(
			[pathInput, update, ctx],
			([rawPath, _update, ec]) => ({
				path: String(rawPath ?? '').trim(),
				ec,
			}),
		).pipeValue(
			mergeMap(({ path: filePath, ec }) => {
				if (filePath.length === 0) {
					return throwError(
						() => new Error('Read File requires a non-empty path.'),
					);
				}

				const denyPaths = getRunHostServices(ec)?.denyPaths;
				const files = createProjectFilesContext({
					projectRoot: ec.projectDir,
					...(denyPaths !== undefined ? { denyPaths } : {}),
				});

				return from(files.read(filePath));
			}),
		);

		return {
			inputs: [pathInput, update],
			outputs: [
				configureOutput('content', content$, {
					wireType: 'string',
				}),
			],
		};
	},
});
