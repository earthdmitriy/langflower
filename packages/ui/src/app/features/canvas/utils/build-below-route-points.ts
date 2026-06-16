type PortPoint = {
	readonly x: number;
	readonly y: number;
};

export type NodeBounds = {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
};

/** Horizontal stub out of / into side ports. */
export const BELOW_ROUTE_STUB_PX = 24;

/** Clearance under the lower of the two node bottoms. */
export const BELOW_ROUTE_GAP_PX = 24;

/**
 * Orthogonal U-route that runs below both node bounds (for leftward back-edges).
 *
 * Path: source → right stub → down to belowY → horizontal → up to target.y →
 * left stub into target.
 */
export const buildBelowRoutePoints = (
	source: PortPoint,
	target: PortPoint,
	sourceBounds: NodeBounds,
	targetBounds: NodeBounds,
	stubPx: number = BELOW_ROUTE_STUB_PX,
	gapPx: number = BELOW_ROUTE_GAP_PX,
): readonly PortPoint[] => {
	const sourceBottom = sourceBounds.top + sourceBounds.height;
	const targetBottom = targetBounds.top + targetBounds.height;
	const belowY = Math.max(sourceBottom, targetBottom) + gapPx;
	const sourceStubX = source.x + stubPx;
	const targetStubX = target.x - stubPx;

	return [
		{ x: source.x, y: source.y },
		{ x: sourceStubX, y: source.y },
		{ x: sourceStubX, y: belowY },
		{ x: targetStubX, y: belowY },
		{ x: targetStubX, y: target.y },
		{ x: target.x, y: target.y },
	];
};

/**
 * Resolve node box from ng-diagram node fields. Prefers `size`, then
 * `measuredBounds`. Returns null when neither yields a usable width/height.
 */
export const resolveNodeBounds = (
	node: {
		readonly position: PortPoint;
		readonly size?: { readonly width: number; readonly height: number };
		readonly measuredBounds?: {
			readonly x: number;
			readonly y: number;
			readonly width: number;
			readonly height: number;
		};
	} | null,
): NodeBounds | null => {
	if (node === null) {
		return null;
	}

	const size = node.size;
	if (
		size !== undefined &&
		Number.isFinite(size.width) &&
		Number.isFinite(size.height) &&
		size.width > 0 &&
		size.height > 0
	) {
		return {
			left: node.position.x,
			top: node.position.y,
			width: size.width,
			height: size.height,
		};
	}

	const measured = node.measuredBounds;
	if (
		measured !== undefined &&
		Number.isFinite(measured.width) &&
		Number.isFinite(measured.height) &&
		measured.width > 0 &&
		measured.height > 0
	) {
		return {
			left: measured.x,
			top: measured.y,
			width: measured.width,
			height: measured.height,
		};
	}

	return null;
};
