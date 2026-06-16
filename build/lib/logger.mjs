/**
 * Terminal output helpers for build scripts.
 * Uses ANSI colors when stdout/stderr is a TTY.
 */

const c = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
};

function write(stream, color, prefix, message) {
	stream.write(`${color}${prefix}${c.reset} ${message}\n`);
}

export const log = {
	/** In-progress step marker. */
	step(message) {
		write(process.stdout, c.cyan, '▶', message);
	},
	/** Successful step completion. */
	success(message) {
		write(process.stdout, c.green, '✔', message);
	},
	/** Non-fatal warning. */
	warn(message) {
		write(process.stderr, c.yellow, '⚠', message);
	},
	/** Fatal or step failure message. */
	error(message) {
		write(process.stderr, c.red, '✖', message);
	},
	/** Secondary detail line. */
	info(message) {
		write(process.stdout, c.gray, '·', message);
	},
	/** Section heading. */
	title(message) {
		process.stdout.write(`\n${c.bold}${message}${c.reset}\n\n`);
	},
	blank() {
		process.stdout.write('\n');
	},
};
