type ComposerAttachment = File;

export type ComposerDraftsState = {
	readonly drafts: ReadonlyMap<string, string>;
	readonly attachments: ReadonlyMap<string, readonly ComposerAttachment[]>;
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
	| {
			readonly type: 'setAttachments';
			readonly key: string;
			readonly files: readonly ComposerAttachment[];
	  }
	| { readonly type: 'clearPrefix'; readonly prefix: string }
	| { readonly type: 'deleteKey'; readonly key: string };

export const initialComposerDraftsState: ComposerDraftsState = {
	drafts: new Map(),
	attachments: new Map(),
	chatStartPending: false,
};

const withoutKey = <T>(
	map: ReadonlyMap<string, T>,
	key: string,
): ReadonlyMap<string, T> => {
	if (!map.has(key)) {
		return map;
	}
	const next = new Map(map);
	next.delete(key);
	return next;
};

const withoutPrefix = <T>(
	map: ReadonlyMap<string, T>,
	prefix: string,
): ReadonlyMap<string, T> => {
	const next = new Map<string, T>();
	for (const [key, value] of map) {
		if (!key.startsWith(prefix)) {
			next.set(key, value);
		}
	}
	return next;
};

export const foldComposerDrafts = (
	state: ComposerDraftsState,
	action: ComposerDraftsAction,
): ComposerDraftsState => {
	if (action.type === 'runnerSettled') {
		return {
			drafts: new Map(),
			attachments: new Map(),
			chatStartPending: false,
		};
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

	if (action.type === 'setAttachments') {
		if (action.files.length === 0) {
			return {
				...state,
				attachments: withoutKey(state.attachments, action.key),
			};
		}
		const next = new Map(state.attachments);
		next.set(action.key, action.files);
		return { ...state, attachments: next };
	}

	if (action.type === 'clearPrefix') {
		return {
			...state,
			drafts: withoutPrefix(state.drafts, action.prefix),
			attachments: withoutPrefix(state.attachments, action.prefix),
		};
	}

	return {
		...state,
		drafts: withoutKey(state.drafts, action.key),
		attachments: withoutKey(state.attachments, action.key),
	};
};
