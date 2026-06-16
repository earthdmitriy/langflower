/**
 * Incremental MCP stdio frame parser (Content-Length + newline JSON).
 * Kept local to `@langflower/tools` — no dependency on `@langflower/mcp`.
 */

const HEADER_SEPARATOR = '\r\n\r\n';

export const createMcpStdioFrameParser = (
	onMessage: (message: unknown) => void,
): {
	readonly push: (chunk: Buffer | string) => void;
} => {
	let buffer = Buffer.alloc(0);

	const tryParse = (): void => {
		for (;;) {
			if (buffer.length === 0) {
				return;
			}

			const prefix = buffer
				.subarray(0, Math.min(buffer.length, 64))
				.toString('utf8')
				.toLowerCase();
			const startsWithContentLength =
				prefix.startsWith('content-length:');

			if (startsWithContentLength) {
				const headerEnd = buffer.indexOf(HEADER_SEPARATOR);
				if (headerEnd === -1) {
					return;
				}

				const header = buffer.subarray(0, headerEnd).toString('utf8');
				const match = /content-length:\s*(\d+)/i.exec(header);
				if (match === null) {
					buffer = buffer.subarray(1);
					continue;
				}

				const bodyLength = Number(match[1]);
				if (!Number.isFinite(bodyLength) || bodyLength < 0) {
					buffer = buffer.subarray(
						headerEnd + HEADER_SEPARATOR.length,
					);
					continue;
				}

				const bodyStart = headerEnd + HEADER_SEPARATOR.length;
				if (buffer.length < bodyStart + bodyLength) {
					return;
				}

				const body = buffer
					.subarray(bodyStart, bodyStart + bodyLength)
					.toString('utf8');
				buffer = buffer.subarray(bodyStart + bodyLength);

				try {
					onMessage(JSON.parse(body));
				} catch {
					/* ignore malformed body */
				}
				continue;
			}

			const newlineIndex = buffer.indexOf(0x0a);
			if (newlineIndex === -1) {
				return;
			}

			const line = buffer
				.subarray(0, newlineIndex)
				.toString('utf8')
				.trim();
			buffer = buffer.subarray(newlineIndex + 1);

			if (line.length === 0) {
				continue;
			}

			try {
				onMessage(JSON.parse(line));
			} catch {
				/* ignore non-JSON lines */
			}
		}
	};

	return {
		push: (chunk) => {
			const next = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
			buffer = Buffer.concat([buffer, next]);
			tryParse();
		},
	};
};
