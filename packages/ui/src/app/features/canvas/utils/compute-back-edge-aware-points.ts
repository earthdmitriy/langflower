import type { EdgeRoutingConfig, EdgeRoutingContext, Point } from 'ng-diagram';
import {
	buildBelowRoutePoints,
	resolveNodeBounds,
} from './build-below-route-points';
import { isBackEdge } from './is-back-edge';

export type BackEdgeAwarePointsOptions = {
	readonly hasReverseEdge: boolean;
};

/**
 * Points for a wire: below-U for the lower leg of a two-node loop;
 * otherwise the provided fallback (usually built-in orthogonal).
 */
export const computeBackEdgeAwarePoints = (
	context: EdgeRoutingContext,
	fallback: (
		context: EdgeRoutingContext,
		config?: EdgeRoutingConfig,
	) => Point[],
	config?: EdgeRoutingConfig,
	options: BackEdgeAwarePointsOptions = { hasReverseEdge: false },
): Point[] => {
	const { sourcePoint, targetPoint, sourceNode, targetNode } = context;
	const sourceBounds = resolveNodeBounds(sourceNode ?? null);
	const targetBounds = resolveNodeBounds(targetNode ?? null);

	if (
		!isBackEdge({
			sourceBounds,
			targetBounds,
			sourcePort: sourcePoint,
			targetPort: targetPoint,
			hasReverseEdge: options.hasReverseEdge,
		})
	) {
		return fallback(context, config);
	}

	if (sourceBounds === null || targetBounds === null) {
		return fallback(context, config);
	}

	return [
		...buildBelowRoutePoints(
			sourcePoint,
			targetPoint,
			sourceBounds,
			targetBounds,
		),
	];
};
