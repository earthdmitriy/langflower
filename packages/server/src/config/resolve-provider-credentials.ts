import type { LangflowerConfig } from '@langflower/shared/langflower.js';

type ResolvedProviderCredentials = {
	readonly apiKey?: string;
	readonly baseURL?: string;
};

export type ResolveProviderCredentialsResult =
	| {
			readonly ok: true;
			readonly credentials: ResolvedProviderCredentials;
	  }
	| {
			readonly ok: false;
			readonly message: string;
	  };

const ENV_REF_PATTERN = /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveEnvRef = (
	value: string,
	context: string,
):
	| { readonly ok: true; readonly value: string }
	| { readonly ok: false; readonly message: string } => {
	const match = ENV_REF_PATTERN.exec(value);
	if (match === null) {
		return { ok: true, value };
	}

	const varName = match[1]!;
	const resolved = process.env[varName];

	if (resolved === undefined || resolved === '') {
		return {
			ok: false,
			message: `Environment variable ${varName} is not set (${context})`,
		};
	}

	return { ok: true, value: resolved };
};

const resolveOptionString = (
	value: unknown,
	context: string,
):
	| { readonly ok: true; readonly value: string | undefined }
	| { readonly ok: false; readonly message: string } => {
	if (typeof value !== 'string' || value.length === 0) {
		return { ok: true, value: undefined };
	}

	const resolved = resolveEnvRef(value, context);
	if (!resolved.ok) {
		return resolved;
	}

	return { ok: true, value: resolved.value };
};

/**
 * Resolves `{env:VAR}` placeholders in provider options from `process.env`.
 * Server-only — never call from bridge payloads or `@langflower/common-nodes`.
 *
 * Never throws — missing provider / env returns `{ ok: false, message }`.
 */
export const resolveProviderCredentials = (
	config: LangflowerConfig,
	providerId: string,
): ResolveProviderCredentialsResult => {
	const provider = config.provider?.[providerId];

	if (provider === undefined) {
		return {
			ok: false,
			message: `Provider "${providerId}" is not configured`,
		};
	}

	const options = isRecord(provider.options) ? provider.options : {};
	const context = `provider ${providerId}`;
	const apiKey = resolveOptionString(options.apiKey, context);
	if (!apiKey.ok) {
		return apiKey;
	}

	const baseURL = resolveOptionString(options.baseURL, context);
	if (!baseURL.ok) {
		return baseURL;
	}

	return {
		ok: true,
		credentials: {
			...(apiKey.value !== undefined ? { apiKey: apiKey.value } : {}),
			...(baseURL.value !== undefined ? { baseURL: baseURL.value } : {}),
		},
	};
};
