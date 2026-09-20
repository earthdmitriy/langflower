/**
 * Incremental MCP stdio frame parser (Content-Length CRLF/LF + newline JSON).
 * Twin of `@langflower/mcp` `mcp-stdio-framing.ts` parse path — tools must
 * not import mcp in production. Encode / reply-mode echo stays on the mcp
 * server. Gate: `mcp-stdio-frame-parser.parity.test.ts`. Do not restore
 * CRLF-only headers.
 */

const CRLF_HEADER_END = '\r\n\r\n';
const LF_HEADER_END = '\n\n';

const findHeaderEnd = (
	buffer: Buffer,
): { readonly index: number; readonly separatorLength: number } | null => {
	const crlf = buffer.indexOf(CRLF_HEADER_END);
	if (crlf !== -1) {
		return { index: crlf, separatorLength: CRLF_HEADER_END.length };
	}

	const lf = buffer.indexOf(LF_HEADER_END);
	if (lf !== -1) {
		return { index: lf, separatorLength: LF_HEADER_END.length };
	}

	return null;
};

const emitJsonRpcObject = (
	onMessage: (message: unknown) => void,
	raw: string,
): void => {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed)
		) {
			onMessage(parsed);
		}
	} catch {
		/* ignore malformed body */
	}
};

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
				const headerEnd = findHeaderEnd(buffer);
				if (headerEnd === null) {
					return;
				}

				const header = buffer
					.subarray(0, headerEnd.index)
					.toString('utf8');
				const match = /content-length:\s*(\d+)/i.exec(header);
				if (match === null) {
					buffer = buffer.subarray(1);
					continue;
				}

				const bodyLength = Number(match[1]);
				if (!Number.isFinite(bodyLength) || bodyLength < 0) {
					buffer = buffer.subarray(
						headerEnd.index + headerEnd.separatorLength,
					);
					continue;
				}

				const bodyStart = headerEnd.index + headerEnd.separatorLength;
				if (buffer.length < bodyStart + bodyLength) {
					return;
				}

				const body = buffer
					.subarray(bodyStart, bodyStart + bodyLength)
					.toString('utf8');
				buffer = buffer.subarray(bodyStart + bodyLength);
				emitJsonRpcObject(onMessage, body);
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

			emitJsonRpcObject(onMessage, line);
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
