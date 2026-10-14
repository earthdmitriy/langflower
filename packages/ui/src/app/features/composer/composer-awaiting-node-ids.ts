/**
 * Node ids that own a composer tab.
 * An awaiting gate (Review, Steer, restored from the feed) is the only
 * surface. Idle chat-entry prompts stay hidden until that gate closes.
 */
export const composerAwaitingNodeIds = (
	awaiting: ReadonlySet<string>,
	idleChatEntryNodeIds: readonly string[],
): readonly string[] => {
	if (awaiting.size > 0) {
		return [...awaiting];
	}
	return idleChatEntryNodeIds;
};

/**
 * Recycle control for a restored gate whose runner is already idle.
 * A fresh chat prompt has an empty awaiting set, so it does not qualify.
 */
export const showSessionConversationReset = (
	isRunning: boolean,
	awaitingCount: number,
): boolean => !isRunning && awaitingCount > 0;
