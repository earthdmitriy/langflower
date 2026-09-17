import { describe, expect, it } from 'vitest';
import { createLastEventWriter } from './last-event-writer.js';

const collectHost = (
	isTTY: boolean,
): {
	readonly chunks: string[];
	readonly host: {
		write: (c: string) => true;
		isTTY: boolean;
	};
} => {
	const chunks: string[] = [];
	return {
		chunks,
		host: {
			isTTY,
			write: (chunk) => {
				chunks.push(chunk);
				return true;
			},
		},
	};
};

describe('createLastEventWriter', () => {
	it('overwrites a TTY row and finishLine emits a newline', () => {
		const { chunks, host } = collectHost(true);
		const writer = createLastEventWriter(host);

		writer.writeLine('Last event: a');
		writer.writeLine('Last event: bb');
		writer.finishLine();

		expect(chunks).toEqual(['\rLast event: a', '\rLast event: bb', '\n']);
	});

	it('pads a shorter TTY update so leftover glyphs clear', () => {
		const { chunks, host } = collectHost(true);
		const writer = createLastEventWriter(host);
		const longLine = 'Last event: long-name';
		const shortLine = 'Last event: x';

		writer.writeLine(longLine);
		writer.writeLine(shortLine);

		const pad = ' '.repeat(longLine.length - shortLine.length);
		expect(chunks[1]).toBe(`\r${shortLine}${pad}`);
	});

	it('writes a newline per line when not a TTY', () => {
		const { chunks, host } = collectHost(false);
		const writer = createLastEventWriter(host);

		writer.writeLine('Last event: a');
		writer.writeLine('Last event: b');
		writer.finishLine();

		expect(chunks).toEqual(['Last event: a\n', 'Last event: b\n']);
	});
});
