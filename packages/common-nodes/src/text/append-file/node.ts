import { defineReactiveNode } from '@langflower/node-sdk';
import { createProjectFilesContext } from '@langflower/tools/create-project-files-context';
import { from, map, mergeMap, throwError } from 'rxjs';
import { getRunHostServices } from '../../ai/features/run-host-services.js';

/**
 * Append to a project-relative text file via `createProjectFilesContext` (no permission ask).
 * Non-empty files get `delimiter` between existing text and `content`.
 */
export const appendFileNode = defineReactiveNode({
	type: 'common-append-file',
	displayName: 'Append File',
	category: 'Text',
	description: `
Add **content** to the end of a project file. If the file already has text, **delimiter** is inserted first.

Typical uses:
- Append a log line
- Grow a notes file across loop iterations
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
		const delimiter = makeInput<string>('delimiter', {
			name: 'delimiter',
			wireType: 'string',
			inline: 'text-multiline',
			defaultValue: '\n\n',
		});
		const content = makeInput<string>('content', {
			name: 'content',
			wireType: 'string',
			required: true,
			multi: 'merge',
		});

		const path$ = combineInputs(
			[pathInput, delimiter, content, ctx],
			([rawPath, rawDelimiter, rawContent, ec]) => ({
				path: String(rawPath ?? '').trim(),
				delimiter: String(rawDelimiter ?? ''),
				content: String(rawContent ?? ''),
				ec,
			}),
		).pipeValue(
			mergeMap(
				({
					path: filePath,
					delimiter: fileDelimiter,
					content: fileContent,
					ec,
				}) => {
					if (filePath.length === 0) {
						return throwError(
							() =>
								new Error(
									'Append File requires a non-empty path.',
								),
						);
					}

					const denyPaths = getRunHostServices(ec)?.denyPaths;
					const files = createProjectFilesContext({
						projectRoot: ec.projectDir,
						...(denyPaths !== undefined ? { denyPaths } : {}),
					});

					return from(
						files.append(filePath, fileContent, fileDelimiter),
					).pipe(map(() => filePath));
				},
			),
		);

		return {
			inputs: [pathInput, delimiter, content],
			outputs: [
				configureOutput('path', path$, {
					wireType: 'string',
				}),
			],
		};
	},
});
