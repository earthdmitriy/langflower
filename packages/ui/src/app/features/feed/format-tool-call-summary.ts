import type { ToolCallFoldValue } from '../feed-folding/operators/tool-log-line.js';

const SUMMARY_CAP = 80;

const shortenArgs = (args: string): string => {
	const compact = args.replace(/\s+/g, ' ').trim();
	if (compact.length <= SUMMARY_CAP) {
		return compact;
	}

	return `${compact.slice(0, SUMMARY_CAP - 1)}…`;
};

/** Collapsed work-log summary: tool name plus a single-line args preview. */
export const formatToolCallSummary = (call: ToolCallFoldValue): string => {
	const name = call.name.length > 0 ? call.name : '(tool)';
	return `${name}(${shortenArgs(call.args)})`;
};

/** Opened tool-row body: full args and full result, untruncated. */
export const formatToolCallBody = (call: ToolCallFoldValue): string => {
	if (!('result' in call) || call.result === undefined) {
		return call.args;
	}

	if (call.args.length === 0) {
		return call.result;
	}

	if (call.result.length === 0) {
		return call.args;
	}

	return `${call.args}\n${call.result}`;
};
