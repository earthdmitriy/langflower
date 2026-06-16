/**
 * Result of Settings → Bootstrap (force skeleton reseed).
 *
 * Expected failures return `{ ok: false, message }` — not throws across the bus.
 */
export type ProjectBootstrapResultPayload =
	{ readonly ok: true } | { readonly ok: false; readonly message: string };
