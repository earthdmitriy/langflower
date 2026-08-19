/**
 * Canvas capability for batch embeddings. Parallel to {@link ToolHandle}
 * but **not** agent inventory: `embedTexts` returns float vectors, never
 * LLM-facing strings.
 *
 * Wire: provider `embed` out → consumer `embed` in, both
 * {@link EMBED_HANDLE_WIRE_TYPE}. Live closure (not JSON-serializable).
 */

export const EMBED_HANDLE_WIRE_TYPE = 'embed-handle';

export type EmbedTextRole = 'document' | 'query';

export type EmbedTextsOptions = {
	readonly role?: EmbedTextRole;
	readonly signal?: AbortSignal;
};

export type EmbedHandle = {
	/** Vector size for this bound model; packs MUST reject a mismatch. */
	readonly dim: number;
	readonly embedTexts: (
		texts: readonly string[],
		options?: EmbedTextsOptions,
	) => Promise<readonly Float32Array[]>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/**
 * Duck-type guard for {@link EmbedHandle} on `defineNode` `execute` inputs
 * (`Record<string, unknown>`). Requires a positive finite `dim` (emit only
 * once dim is set) and an `embedTexts` function.
 */
export const isEmbedHandle = (value: unknown): value is EmbedHandle => {
	if (!isRecord(value)) {
		return false;
	}
	const dim = value['dim'];
	return (
		typeof dim === 'number' &&
		Number.isFinite(dim) &&
		dim > 0 &&
		typeof value['embedTexts'] === 'function'
	);
};
