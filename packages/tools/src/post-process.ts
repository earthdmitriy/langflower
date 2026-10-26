import vm from 'node:vm';

// Creating the VM context alone can take tens of ms on a loaded machine, so a
// tight limit rejects honest scripts. This only has to stop an endless loop.
const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_MAX_OUTPUT_CHARS = 200_000;

export type PostProcessOptions = {
	readonly timeoutMs?: number;
	readonly maxOutputChars?: number;
};

/**
 * Run agent-supplied `(res: string) => string` source in an isolated VM.
 * Fail closed: throw on timeout, non-function, non-string, or oversized output.
 */
export const runReadClassPostProcess = (
	source: string,
	input: string,
	options: PostProcessOptions = {},
): string => {
	const trimmed = source.trim();

	if (trimmed.length === 0) {
		throw new Error('postProcess source is empty.');
	}

	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
	const sandbox: {
		__input: string;
		__result: unknown;
	} = {
		__input: input,
		__result: undefined,
	};

	try {
		vm.runInNewContext(`__result = (${trimmed})(__input)`, sandbox, {
			timeout: timeoutMs,
			displayErrors: true,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`postProcess failed: ${message}`);
	}

	if (typeof sandbox.__result !== 'string') {
		throw new Error(
			`postProcess must return a string (got ${typeof sandbox.__result}).`,
		);
	}

	if (sandbox.__result.length > maxOutputChars) {
		throw new Error(
			`postProcess output exceeds ${maxOutputChars} characters.`,
		);
	}

	return sandbox.__result;
};
