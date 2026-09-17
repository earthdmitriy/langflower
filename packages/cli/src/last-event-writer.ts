export type LastEventWriterHost = {
	readonly write: (chunk: string) => boolean | undefined;
	readonly isTTY?: boolean | undefined;
};

export type LastEventWriter = {
	readonly writeLine: (line: string) => void;
	readonly finishLine: () => void;
};

/**
 * TTY: overwrite one row with `\r`. Pipe: one newline per distinct line.
 * Throttle lives on the server reporter (identity + 4 Hz).
 */
export const createLastEventWriter = (
	stdout: LastEventWriterHost,
): LastEventWriter => {
	const isTty = stdout.isTTY === true;
	let previousWidth = 0;
	let rowOpen = false;

	return {
		writeLine: (line) => {
			if (isTty) {
				const width = Math.max(previousWidth, line.length);
				stdout.write(`\r${line.padEnd(width, ' ')}`);
				previousWidth = line.length;
				rowOpen = true;
				return;
			}
			stdout.write(`${line}\n`);
			rowOpen = false;
		},
		finishLine: () => {
			if (isTty && rowOpen) {
				stdout.write('\n');
			}
			rowOpen = false;
			previousWidth = 0;
		},
	};
};
