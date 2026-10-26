import type { HitlUploadedFile } from '@langflower/node-sdk';
import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import type { HitlControlProjection } from '../../services/hitl-projection';

export type ComposerPayloadOptions = {
	readonly files?: readonly HitlUploadedFile[];
	/**
	 * Files selected in the composer and not yet uploaded. Empty steer
	 * text with a selection does not resume and does not POST.
	 */
	readonly pendingAttachmentCount?: number;
};

export const isSteerControlTextarea = (entry: HitlControlProjection): boolean =>
	entry.portId === STEER_CONTROL_PORT_ID && entry.config.kind === 'textarea';

/**
 * A textarea takes files next to the text when its input accepts a
 * `user-turn` (Chat Input, Chat Loop, Review Gate request-changes) or it is
 * Steer or the `ask_user` reply.
 */
export const textareaAcceptsFiles = (entry: HitlControlProjection): boolean =>
	entry.config.kind === 'textarea' && entry.acceptsFiles === true;

/**
 * Empty textarea drafts cannot activate Send/Start; buttons always can.
 * A textarea that takes files sends `{ text, files }` (Steer wraps it as
 * `{ kind: 'steer', text, files }`); any other textarea sends the string.
 */
export const resolveComposerActionPayload = (
	entry: HitlControlProjection,
	draft: string,
	options: ComposerPayloadOptions = {},
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
		if (isSteerControlTextarea(entry)) {
			return {
				ok: true,
				payload: {
					kind: 'steer' as const,
					text,
					files: options.files ?? [],
				},
			};
		}
		if (textareaAcceptsFiles(entry)) {
			return {
				ok: true,
				payload: { text, files: options.files ?? [] },
			};
		}
		return { ok: true, payload: text };
	}
	return { ok: false };
};

/** Continue on Steer — retry the checkpoint with no new user text. */
export const steerResumePayload = (): { readonly kind: 'resume' } => ({
	kind: 'resume',
});

/**
 * String drafts on `steerControl` become `{ kind: 'steer', text, files }`.
 * Object payloads (`{ kind: 'resume' }` and a steer object) pass through.
 */
export const wrapSteerHitlPayload = (
	portId: string,
	rawPayload: unknown,
): unknown =>
	portId === STEER_CONTROL_PORT_ID && typeof rawPayload === 'string'
		? { kind: 'steer' as const, text: rawPayload, files: [] }
		: rawPayload;

/**
 * Enter on an empty Steer textarea continues without text.
 * A non-empty draft still Sends; other controls keep their own rules.
 */
export const resolveComposerEnterPayload = (
	entry: HitlControlProjection,
	draft: string,
	options: ComposerPayloadOptions = {},
):
	| { readonly ok: true; readonly payload: unknown }
	| { readonly ok: false } => {
	if (isSteerControlTextarea(entry) && draft.trim().length === 0) {
		const selected =
			(options.pendingAttachmentCount ?? 0) > 0 ||
			(options.files?.length ?? 0) > 0;
		if (selected) {
			return { ok: false };
		}
		return { ok: true, payload: steerResumePayload() };
	}
	return resolveComposerActionPayload(entry, draft, options);
};
