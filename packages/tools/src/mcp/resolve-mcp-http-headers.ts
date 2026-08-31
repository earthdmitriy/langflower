/**
 * Parse MCP HTTP `headers` (object or JSON string) and interpolate
 * `{lf_secrets:ID}` / `{env:VAR}` in **values** only. Call this outside the
 * HTTP retry loop so bad JSON / missing secrets fail once.
 */

import {
	interpolatePlaceholders,
	type InterpolatePlaceholdersDeps,
} from '../secrets/interpolate-placeholders.js';

export type ResolveMcpHttpHeadersResult =
	| {
			readonly ok: true;
			readonly headers: Readonly<Record<string, string>>;
	  }
	| { readonly ok: false; readonly message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const parseHeadersObject = (
	raw: unknown,
):
	| { readonly ok: true; readonly record: Readonly<Record<string, unknown>> }
	| { readonly ok: false; readonly message: string } => {
	if (raw === undefined || raw === null) {
		return { ok: true, record: {} };
	}

	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed.length === 0) {
			return { ok: true, record: {} };
		}

		try {
			return parseHeadersObject(JSON.parse(trimmed) as unknown);
		} catch {
			return {
				ok: false,
				message: 'MCP HTTP headers JSON is invalid',
			};
		}
	}

	if (!isRecord(raw)) {
		return {
			ok: false,
			message: 'MCP HTTP headers must be a JSON object',
		};
	}

	return { ok: true, record: raw };
};

/**
 * Empty / `{}` → no extra headers. Missing secret or env fails loud without
 * echoing resolved values.
 */
export const resolveMcpHttpHeaders = (
	raw: unknown,
	deps: InterpolatePlaceholdersDeps,
): ResolveMcpHttpHeadersResult => {
	const parsed = parseHeadersObject(raw);
	if (!parsed.ok) {
		return parsed;
	}

	const headers: Record<string, string> = {};

	for (const [key, value] of Object.entries(parsed.record)) {
		if (typeof value !== 'string') {
			return {
				ok: false,
				message: 'MCP HTTP header values must be strings',
			};
		}

		const interpolated = interpolatePlaceholders(value, deps);
		if (!interpolated.ok) {
			return interpolated;
		}

		headers[key] = interpolated.value;
	}

	return { ok: true, headers };
};
