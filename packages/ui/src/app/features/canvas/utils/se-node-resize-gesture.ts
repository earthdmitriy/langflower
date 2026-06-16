export type SeResizePoint = {
	readonly x: number;
	readonly y: number;
};

export type SeResizeSize = {
	readonly width: number;
	readonly height: number;
};

/**
 * SE-corner size from pointer flow delta (top-left stays fixed).
 */
export const sizeFromSeResizeDelta = (
	startSize: SeResizeSize,
	startFlow: SeResizePoint,
	currentFlow: SeResizePoint,
	minSize: SeResizeSize,
): SeResizeSize => ({
	width: Math.max(
		minSize.width,
		startSize.width + (currentFlow.x - startFlow.x),
	),
	height: Math.max(
		minSize.height,
		startSize.height + (currentFlow.y - startFlow.y),
	),
});
