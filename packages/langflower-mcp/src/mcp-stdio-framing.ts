/**
 * MCP stdio framing: Content-Length (MCP SDK) plus newline JSON (Cursor host
 * and `@langflower/tools` mcp-stdio-client).
 *
 * Replies must use the **same** framing the peer used on the last inbound
 * message — Cursor's host historically speaks newline JSON; forcing
 * Content-Length-only responses leaves initialize hanging ("server won't start").
 */

export type McpJsonMessage = Readonly<Record<string, unknown>>;

export type McpStdioFrameMode = 'content-length' | 'newline';

export type McpStdioParsedFrame = {
	readonly mode: McpStdioFrameMode;
	readonly message: McpJsonMessage;
};

const CRLF_HEADER_END = '\r\n\r\n';
const LF_HEADER_END = '\n\n';

export const encodeMcpStdioFrame = (
	message: unknown,
	mode: McpStdioFrameMode,
): Buffer => {
	const body = Buffer.from(JSON.stringify(message), 'utf8');
	if (mode === 'newline') {
		return Buffer.concat([body, Buffer.from('\n', 'utf8')]);
	}

	const header = Buffer.from(
		`Content-Length: ${String(body.length)}${CRLF_HEADER_END}`,
		'utf8',
	);
	return Buffer.concat([header, body]);
};

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

/**
 * Incremental parser for stdin/stdout MCP bytes.
 * Emits one JSON-RPC object per complete Content-Length or newline frame.
 */
export const createMcpStdioFrameParser = (
	onFrame: (frame: McpStdioParsedFrame) => void,
): {
	readonly push: (chunk: Buffer | string) => void;
} => {
	let buffer = Buffer.alloc(0);

	const emitObject = (mode: McpStdioFrameMode, raw: string): void => {
		try {
			const parsed: unknown = JSON.parse(raw);
			if (
				parsed !== null &&
				typeof parsed === 'object' &&
				!Array.isArray(parsed)
			) {
				onFrame({ mode, message: parsed as McpJsonMessage });
			}
		} catch {
			/* ignore malformed body */
		}
	};

	const tryParse = (): void => {
		for (;;) {
			if (buffer.length === 0) {
				return;
			}

			const asUtf8Start = buffer.subarray(0, Math.min(buffer.length, 64));
			const startsWithContentLength = asUtf8Start
				.toString('utf8')
				.toLowerCase()
				.startsWith('content-length:');

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
				emitObject('content-length', body);
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

			emitObject('newline', line);
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
