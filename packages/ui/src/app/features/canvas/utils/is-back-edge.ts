import type { NodeBounds } from './build-below-route-points';

type PortPoint = {
	readonly x: number;
	readonly y: number;
};

type EdgeEnds = {
	readonly source: string;
	readonly target: string;
};

/**
 * How far right the upper node must sit before we treat the loop as
 * diagonal and swap which leg goes below. Y comparisons use no margin.
 */
const BACK_EDGE_DIAGONAL_X_MARGIN_PX = 40;

export type BackEdgeInput = {
	readonly sourceBounds: NodeBounds | null | undefined;
	readonly targetBounds: NodeBounds | null | undefined;
	readonly sourcePort?: PortPoint | undefined;
	readonly targetPort?: PortPoint | undefined;
	/** True when some edge runs the opposite way between the same two nodes. */
	readonly hasReverseEdge: boolean;
};

const centerX = (bounds: NodeBounds): number => bounds.left + bounds.width / 2;

const centerY = (bounds: NodeBounds): number => bounds.top + bounds.height / 2;

/**
 * True when `edges` contains a wire from `targetId` back to `sourceId`.
 */
export const hasReverseEdgeBetween = (
	edges: ReadonlyArray<EdgeEnds>,
	sourceId: string,
	targetId: string,
): boolean =>
	edges.some((edge) => edge.source === targetId && edge.target === sourceId);

/**
 * Below-route one leg of a two-node loop (no Y-threshold — equal centers
 * count as same-row).
 *
 * - **Same row:** leftward leg (`targetCenterX < sourceCenterX`).
 * - **Stacked / upper not clearly right of lower:** lower→upper return.
 * - **Diagonal (upper clearly right of lower):** swap — upper→lower forward.
 *
 * One-way edges never match. Port fallback mirrors the same rules.
 */
export const isBackEdge = (input: BackEdgeInput): boolean => {
	if (!input.hasReverseEdge) {
		return false;
	}

	const { sourceBounds, targetBounds, sourcePort, targetPort } = input;
	if (sourceBounds != null && targetBounds != null) {
		const sourceCy = centerY(sourceBounds);
		const targetCy = centerY(targetBounds);
		const sourceLower = sourceCy > targetCy;
		const sourceUpper = targetCy > sourceCy;

		if (!sourceLower && !sourceUpper) {
			return centerX(targetBounds) < centerX(sourceBounds);
		}

		const lowerBounds = sourceLower ? sourceBounds : targetBounds;
		const upperBounds = sourceLower ? targetBounds : sourceBounds;
		const upperIsRight =
			centerX(upperBounds) >
			centerX(lowerBounds) + BACK_EDGE_DIAGONAL_X_MARGIN_PX;

		if (upperIsRight) {
			return sourceUpper;
		}
		return sourceLower;
	}

	if (sourcePort === undefined || targetPort === undefined) {
		return false;
	}

	const sourceLower = sourcePort.y > targetPort.y;
	const sourceUpper = targetPort.y > sourcePort.y;
	if (!sourceLower && !sourceUpper) {
		return targetPort.x < sourcePort.x;
	}

	const upperIsRight = sourceUpper
		? sourcePort.x > targetPort.x + BACK_EDGE_DIAGONAL_X_MARGIN_PX
		: targetPort.x > sourcePort.x + BACK_EDGE_DIAGONAL_X_MARGIN_PX;

	if (upperIsRight) {
		return sourceUpper && targetPort.x < sourcePort.x;
	}
	return sourceLower;
};
