import type { HitlControlProjection } from './hitl-projection';

/** Empty textarea drafts cannot activate Send/Start; buttons always can. */
export const resolveComposerActionPayload = (
	entry: HitlControlProjection,
	draft: string,
):
	| { readonly ok: true; readonly payload: unknown }
	| { readonly ok: false } => {
	if (entry.config.kind === 'button') {
		return { ok: true, payload: entry.config.payload };
	}
	if (entry.config.kind === 'textarea') {
		const text = draft.trim();
		if (text.length === 0) {
			return { ok: false };
		}
		return { ok: true, payload: text };
	}
	return { ok: false };
};
