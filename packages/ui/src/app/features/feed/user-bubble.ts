import type { PortStreamItem } from '../feed-folding/types';
import {
	isSessionUploadImageMime,
	sessionUploadUrl,
} from '../../utils/session-upload';

export type UserBubbleFileView =
	| {
			readonly kind: 'image';
			readonly fileId: string;
			readonly name: string;
			readonly mimeType: string;
			readonly src: string;
	  }
	| {
			readonly kind: 'file';
			readonly fileId: string;
			readonly name: string;
			readonly mimeType: string;
	  };

export type UserBubbleView = {
	readonly presentation: 'hitl-user' | 'ask-user-reply';
	readonly text: string;
	readonly files: readonly UserBubbleFileView[];
};

/**
 * Person bubble for a composer turn and for steer (`hitl-user`).
 * Image MIME uses the session-upload GET. Audio and PDF are a name
 * plus MIME. This is not the agent markdown result bubble.
 */
/** One {@link projectToolRowFile} per staged file, in call order. */
export const projectToolRowFiles = (
	files:
		| readonly {
				readonly fileId: string;
				readonly name: string;
				readonly mimeType: string;
		  }[]
		| undefined,
): readonly UserBubbleFileView[] =>
	(files ?? []).flatMap((file) => projectToolRowFile(file) ?? []);

/** Image GET, or name plus MIME, for a file ref on a tool row. */
const projectToolRowFile = (
	file:
		| {
				readonly fileId: string;
				readonly name: string;
				readonly mimeType: string;
		  }
		| undefined,
): UserBubbleFileView | undefined => {
	if (file === undefined) {
		return undefined;
	}

	if (isSessionUploadImageMime(file.mimeType)) {
		return {
			kind: 'image',
			fileId: file.fileId,
			name: file.name,
			mimeType: file.mimeType,
			src: sessionUploadUrl(file.fileId),
		};
	}

	return {
		kind: 'file',
		fileId: file.fileId,
		name: file.name,
		mimeType: file.mimeType,
	};
};

export const projectUserBubble = (
	item: PortStreamItem,
): UserBubbleView | undefined => {
	const presentation = item.meta.presentation;
	if (presentation !== 'hitl-user' && presentation !== 'ask-user-reply') {
		return undefined;
	}

	const text = typeof item.value === 'string' ? item.value : '';
	const files =
		item.meta.presentation === 'hitl-user' ||
		item.meta.presentation === 'ask-user-reply'
			? (item.meta.files ?? [])
			: [];

	return {
		presentation,
		text,
		files: files.map((file) =>
			isSessionUploadImageMime(file.mimeType)
				? {
						kind: 'image' as const,
						fileId: file.fileId,
						name: file.name,
						mimeType: file.mimeType,
						src: sessionUploadUrl(file.fileId),
					}
				: {
						kind: 'file' as const,
						fileId: file.fileId,
						name: file.name,
						mimeType: file.mimeType,
					},
		),
	};
};
