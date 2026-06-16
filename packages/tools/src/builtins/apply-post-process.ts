import { runReadClassPostProcess } from '../post-process.js';
import { asString } from './args.js';

export const applyPostProcess = (
	args: Readonly<Record<string, unknown>>,
	text: string,
): string => {
	const source = asString(args, 'postProcess');

	if (source === undefined || source.trim().length === 0) {
		return text;
	}

	return runReadClassPostProcess(source, text);
};
