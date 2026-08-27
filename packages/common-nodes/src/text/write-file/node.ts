import { defineReactiveNode, withLoading } from '@langflower/node-sdk';
import { createProjectFilesContext } from '@langflower/tools/create-project-files-context';
import { from, map, mergeMap, throwError } from 'rxjs';
import { getRunHostServices } from '../../ai/features/run-host-services.js';

/**
 * Overwrite a project-relative text file via `createProjectFilesContext` (no permission ask).
 */
export const writeFileNode = defineReactiveNode({
	type: 'common-write-file',
	displayName: 'Write File',
	category: 'Text',
	description: `
Write **content** to a file inside the project (creates folders if needed). Absolute paths are refused.

Typical uses:
- Save an LLM draft
- Persist a generated config
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
		const content = makeInput<string>('content', {
			name: 'content',
			wireType: 'string',
			required: true,
			multi: 'merge',
		});

		const path$ = combineInputs(
			[pathInput, content, ctx],
			([rawPath, rawContent, ec]) => ({
				path: String(rawPath ?? '').trim(),
				content: String(rawContent ?? ''),
				ec,
			}),
		)
			.pipe(withLoading())
			.pipeValue(
				mergeMap(({ path: filePath, content: fileContent, ec }) => {
					if (filePath.length === 0) {
						return throwError(
							() =>
								new Error(
									'Write File requires a non-empty path.',
								),
						);
					}

					const denyPaths = getRunHostServices(ec)?.denyPaths;
					const files = createProjectFilesContext({
						projectRoot: ec.projectDir,
						...(denyPaths !== undefined ? { denyPaths } : {}),
					});

					return from(files.write(filePath, fileContent)).pipe(
						map(() => filePath),
					);
				}),
			);

		return {
			inputs: [pathInput, content],
			outputs: [
				configureOutput('path', path$, {
					wireType: 'string',
				}),
			],
		};
	},
});
