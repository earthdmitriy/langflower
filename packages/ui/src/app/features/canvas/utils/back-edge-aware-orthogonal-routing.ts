import type {
	EdgeRouting,
	EdgeRoutingConfig,
	EdgeRoutingContext,
	Point,
} from 'ng-diagram';
import { computeBackEdgeAwarePoints } from './compute-back-edge-aware-points';

export type ReverseEdgeLookup = (sourceId: string, targetId: string) => boolean;

/**
 * Drop-in replacement for `orthogonal`: the lower leg of a two-node loop
 * takes a U-route below both node boxes; everything else delegates to the
 * built-in orthogonal instance passed in (captured before `registerRouting`
 * replaces it).
 *
 * Must stay in **auto** routing mode — never use `routingMode: 'manual'` on
 * `ng-diagram-base-edge` (it syncs manual points into the model and freezes
 * the path on node drag).
 *
 * Note: `EdgeRoutingManager` is typed in ng-diagram but not a runtime export,
 * so callers must pass the live built-in orthogonal from the diagram service.
 */
export const createBackEdgeAwareOrthogonalRouting = (
	orthogonal: EdgeRouting,
	hasReverseEdgeBetween: ReverseEdgeLookup,
): EdgeRouting => ({
	name: 'orthogonal',
	computePoints(
		context: EdgeRoutingContext,
		config?: EdgeRoutingConfig,
	): Point[] {
		const sourceId = context.sourceNode?.id ?? context.edge.source;
		const targetId = context.targetNode?.id ?? context.edge.target;
		return computeBackEdgeAwarePoints(
			context,
			(ctx, cfg) => orthogonal.computePoints(ctx, cfg),
			config,
			{
				hasReverseEdge: hasReverseEdgeBetween(sourceId, targetId),
			},
		);
	},
	computeSvgPath(points: Point[], config?: EdgeRoutingConfig): string {
		return orthogonal.computeSvgPath(points, config);
	},
	computePointOnPath(points: Point[], percentage: number): Point {
		return (
			orthogonal.computePointOnPath?.(points, percentage) ??
			points[0] ?? { x: 0, y: 0 }
		);
	},
	computePointAtDistance(points: Point[], distancePx: number): Point {
		return (
			orthogonal.computePointAtDistance?.(points, distancePx) ??
			points[0] ?? { x: 0, y: 0 }
		);
	},
});
