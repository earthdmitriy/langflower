export type ModelsRefreshState = {
	readonly loading: boolean;
	readonly error?: string;
};

export type ModelsFieldPresentation = {
	readonly disabled: boolean;
	readonly emptyHint?: string;
	readonly fieldError?: string;
};

const NO_MODELS_MESSAGE = 'No models available for this provider';

/**
 * Caption / disable state for the Inspector Model select after merging
 * static jsonc ids with a live catalog snapshot.
 */
export const resolveModelsFieldPresentation = (
	optionsCount: number,
	refreshState: ModelsRefreshState | undefined,
): ModelsFieldPresentation => {
	if (refreshState?.loading === true) {
		return { disabled: false, emptyHint: 'Loading models…' };
	}

	if (refreshState?.error !== undefined) {
		if (optionsCount === 0) {
			const message =
				refreshState.error.trim().length > 0
					? refreshState.error
					: NO_MODELS_MESSAGE;

			return { disabled: true, fieldError: message };
		}

		return {
			disabled: false,
			emptyHint: `Live catalog unavailable — using static models. ${refreshState.error}`,
		};
	}

	if (optionsCount === 0) {
		return { disabled: false, emptyHint: NO_MODELS_MESSAGE };
	}

	return { disabled: false };
};
