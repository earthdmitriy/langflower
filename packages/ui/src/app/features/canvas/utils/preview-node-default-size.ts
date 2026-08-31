/** Palette type for the Preview sink node. */
export const PREVIEW_NODE_TYPE = 'common-preview';

/** Default canvas box — locks mode B so payload cannot grow width. */
const PREVIEW_DEFAULT_WIDTH_PX = 320;
const PREVIEW_DEFAULT_HEIGHT_PX = 280;

export const previewNodeDefaultSize = {
	width: PREVIEW_DEFAULT_WIDTH_PX,
	height: PREVIEW_DEFAULT_HEIGHT_PX,
} as const;

export const withPreviewDefaultDropPosition = (
	type: string,
	position: { readonly x: number; readonly y: number },
): {
	readonly x: number;
	readonly y: number;
	readonly width?: number;
	readonly height?: number;
} =>
	type === PREVIEW_NODE_TYPE
		? {
				x: position.x,
				y: position.y,
				...previewNodeDefaultSize,
			}
		: { x: position.x, y: position.y };
