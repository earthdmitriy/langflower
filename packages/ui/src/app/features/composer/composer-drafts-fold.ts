export type ComposerDraftsState = {
	readonly drafts: ReadonlyMap<string, string>;
	readonly chatStartPending: boolean;
};

export type ComposerDraftsAction =
	| { readonly type: 'runnerSettled' }
	| { readonly type: 'runStarted' }
	| { readonly type: 'chatStartPending' }
	| {
			readonly type: 'setDraft';
			readonly key: string;
			readonly value: string;
	  }
	| { readonly type: 'clearPrefix'; readonly prefix: string }
	| { readonly type: 'deleteKey'; readonly key: string };

export const initialComposerDraftsState: ComposerDraftsState = {
	drafts: new Map(),
	chatStartPending: false,
};

export const foldComposerDrafts = (
	state: ComposerDraftsState,
	action: ComposerDraftsAction,
): ComposerDraftsState => {
	if (action.type === 'runnerSettled') {
		return { drafts: new Map(), chatStartPending: false };
	}

	if (action.type === 'runStarted') {
		return state.chatStartPending
			? { ...state, chatStartPending: false }
			: state;
	}

	if (action.type === 'chatStartPending') {
		return { ...state, chatStartPending: true };
	}

	if (action.type === 'setDraft') {
		const next = new Map(state.drafts);
		next.set(action.key, action.value);
		return { ...state, drafts: next };
	}

	if (action.type === 'clearPrefix') {
		const next = new Map<string, string>();
		for (const [key, value] of state.drafts) {
			if (!key.startsWith(action.prefix)) {
				next.set(key, value);
			}
		}
		return { ...state, drafts: next };
	}

	const next = new Map(state.drafts);
	next.delete(action.key);
	return { ...state, drafts: next };
};
