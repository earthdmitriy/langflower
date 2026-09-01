/**
 * Keyed secret lookup for {@link ExecutionContext.resolveSecret}.
 * Authors pass `lf_secret:ID` or `env:ID` — they cannot list the bag.
 * Charset matches tools `{lf_secrets:ID}` / `{env:VAR}`.
 */

const SECRET_ID_BODY = '[A-Za-z_][A-Za-z0-9_]*';
const SECRET_ID_RE = new RegExp(`^${SECRET_ID_BODY}$`);

const isValidSecretId = (id: string): boolean => SECRET_ID_RE.test(id);

export type ResolveSecretResult =
	| { readonly ok: true; readonly value: string }
	| { readonly ok: false; readonly message: string };

/**
 * Resolve one named secret. Refs: `lf_secret:API_TOKEN`, `env:API_TOKEN`
 * (`lf_secrets:` is an alias). Values are never listed.
 */
export type ResolveSecret = (ref: string) => ResolveSecretResult;

export type CreateResolveSecretDeps = {
	readonly secrets: Readonly<Record<string, string>>;
	readonly env?: Readonly<Record<string, string | undefined>>;
};

type SecretKind = 'lf_secret' | 'env';

type ParsedSecretRef =
	| { readonly ok: true; readonly kind: SecretKind; readonly id: string }
	| { readonly ok: false; readonly message: string };

const readProcessEnv = (): Readonly<Record<string, string | undefined>> => {
	const proc = (
		globalThis as {
			readonly process?: {
				readonly env?: Readonly<Record<string, string | undefined>>;
			};
		}
	).process;
	return proc?.env ?? {};
};

const parseSecretRef = (raw: string): ParsedSecretRef => {
	const trimmed = raw.trim();
	const colon = trimmed.indexOf(':');
	if (colon <= 0) {
		return { ok: false, message: 'Secret ref is invalid' };
	}

	const prefix = trimmed.slice(0, colon).trim();
	const id = trimmed.slice(colon + 1).trim();
	const kind: SecretKind | undefined =
		prefix === 'lf_secret' || prefix === 'lf_secrets'
			? 'lf_secret'
			: prefix === 'env'
				? 'env'
				: undefined;

	if (kind === undefined) {
		return { ok: false, message: 'Secret ref is invalid' };
	}

	if (!isValidSecretId(id)) {
		return {
			ok: false,
			message:
				id.length === 0
					? 'Secret id is invalid'
					: `Secret id ${id} is invalid`,
		};
	}

	return { ok: true, kind, id };
};

/**
 * Host factory. Closes over the KV map; the returned function cannot
 * enumerate ids.
 */
export const createResolveSecret = (
	deps: CreateResolveSecretDeps,
): ResolveSecret => {
	const secrets = deps.secrets;
	const envFallback = deps.env;

	return (ref: string): ResolveSecretResult => {
		const parsed = parseSecretRef(ref);
		if (!parsed.ok) {
			return parsed;
		}

		if (parsed.kind === 'lf_secret') {
			const fromKv = secrets[parsed.id];
			if (typeof fromKv === 'string' && fromKv !== '') {
				return { ok: true, value: fromKv };
			}

			return {
				ok: false,
				message: `Secret ${parsed.id} is not set`,
			};
		}

		const env = envFallback ?? readProcessEnv();
		const fromEnv = env[parsed.id];
		if (typeof fromEnv === 'string' && fromEnv !== '') {
			return { ok: true, value: fromEnv };
		}

		return {
			ok: false,
			message: `Environment variable ${parsed.id} is not set`,
		};
	};
};

/** Stub with no KV and no env — unit tests that do not resolve secrets. */
export const emptyResolveSecret = createResolveSecret({
	secrets: {},
	env: {},
});
