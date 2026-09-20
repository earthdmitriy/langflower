import { describe, expect, it } from 'vitest';
import {
	foldComposerDrafts,
	initialComposerDraftsState,
} from '../composer-drafts-fold';

describe('foldComposerDrafts', () => {
	it('clears drafts and pending on runner settle', () => {
		const withDraft = foldComposerDrafts(initialComposerDraftsState, {
			type: 'setDraft',
			key: 'n1:message',
			value: 'hello',
		});
		const pending = foldComposerDrafts(withDraft, {
			type: 'chatStartPending',
		});
		const settled = foldComposerDrafts(pending, { type: 'runnerSettled' });
		expect(settled.drafts.size).toBe(0);
		expect(settled.chatStartPending).toBe(false);
	});

	it('clears only pending when a run starts', () => {
		const withDraft = foldComposerDrafts(initialComposerDraftsState, {
			type: 'setDraft',
			key: 'n1:message',
			value: 'hello',
		});
		const pending = foldComposerDrafts(withDraft, {
			type: 'chatStartPending',
		});
		const started = foldComposerDrafts(pending, { type: 'runStarted' });
		expect(started.drafts.get('n1:message')).toBe('hello');
		expect(started.chatStartPending).toBe(false);
	});
});
