import type {
	PortTelemetry,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import { combineLatest, merge, type Observable } from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';
import {
	feedCatalogFromSnaps,
	type FeedCatalog,
} from '../../services/execution-catalog';
import { mergePaletteCatalogs } from '../palette/types/palette-projection';
import { eventsForNode } from './operators/canvas-node-status-projection';
import {
	applyNodeHitlFrame,
	emptyNodeHitlAwaitState,
	rebuildNodeHitlAwaitState,
	replayNodeHitlFromSnapshot,
	resetNodeHitlAwaitState,
	type NodeHitlAwaitState,
} from './operators/canvas-node-hitl-projection';
import type { CanvasNodeStatusBridgeSources } from './types';

type HitlComposerState = {
	readonly events: readonly RuntimeRunnerEvent[];
	readonly catalog: FeedCatalog | null;
	readonly state: NodeHitlAwaitState;
	readonly runId: RunId | null;
};

type HitlComposerAction =
	| {
			readonly type: 'snapshot';
			readonly snap: ExecutionFeedSnapshotPayload | null;
	  }
	| { readonly type: 'port'; readonly event: PortTelemetry }
	| { readonly type: 'catalog'; readonly catalog: FeedCatalog }
	| { readonly type: 'reset'; readonly runId: RunId };

const emptyHitlComposer = (): HitlComposerState => ({
	events: [],
	catalog: null,
	state: emptyNodeHitlAwaitState(),
	runId: null,
});

const foldHitlComposer = (
	nodeId: string,
	composer: HitlComposerState,
	action: HitlComposerAction,
): HitlComposerState => {
	if (action.type === 'catalog') {
		const state =
			composer.events.length === 0 || composer.catalog === null
				? composer.state
				: rebuildNodeHitlAwaitState(
						composer.events,
						composer.runId,
						action.catalog,
						nodeId,
					);
		return { ...composer, catalog: action.catalog, state };
	}
	if (action.type === 'snapshot') {
		if (action.snap === null) {
			return {
				events: [],
				catalog: composer.catalog,
				state: emptyNodeHitlAwaitState(),
				runId: null,
			};
		}
		return {
			events: eventsForNode(action.snap.events, nodeId),
			catalog: composer.catalog,
			runId: action.snap.runId,
			state: replayNodeHitlFromSnapshot(
				action.snap,
				nodeId,
				composer.catalog,
			),
		};
	}
	if (action.type === 'reset') {
		if (action.runId === composer.runId) {
			return composer;
		}
		const state = resetNodeHitlAwaitState(action.runId, composer.state);
		if (composer.runId === null) {
			return {
				...composer,
				state,
				runId: action.runId,
			};
		}
		return {
			events: [],
			catalog: composer.catalog,
			state,
			runId: action.runId,
		};
	}
	const events = [...composer.events, action.event];
	return {
		events,
		catalog: composer.catalog,
		runId: composer.runId,
		state: applyNodeHitlFrame(
			composer.state,
			action.event,
			composer.catalog,
			nodeId,
			composer.runId,
		),
	};
};

/** Filter bridge facts to one node, then fold simplified HITL-await boolean. */
export const foldSingleNodeHitlAwaiting = (
	nodeId: string,
	sources: Pick<
		CanvasNodeStatusBridgeSources,
		| 'executionFeedSnapshot$'
		| 'runnerPort$'
		| 'runnerStarted$'
		| 'runnerStartNodeStarted$'
		| 'workflowSnapshot$'
		| 'paletteSnapshot$'
		| 'customPaletteSnapshot$'
	>,
): Observable<boolean> => {
	const catalog$ = combineLatest([
		sources.workflowSnapshot$,
		combineLatest([
			sources.paletteSnapshot$,
			sources.customPaletteSnapshot$,
		]).pipe(
			map(([system, custom]) => mergePaletteCatalogs(system, custom)),
		),
	]).pipe(
		map(([workflow, palette]) => feedCatalogFromSnaps(workflow, palette)),
		shareReplay({ bufferSize: 1, refCount: true }),
	);

	const forNode = (event: PortTelemetry): boolean => event[1] === nodeId;

	return merge(
		sources.executionFeedSnapshot$.pipe(
			map((snap): HitlComposerAction => ({ type: 'snapshot', snap })),
		),
		sources.runnerPort$.pipe(
			filter(forNode),
			map((event): HitlComposerAction => ({ type: 'port', event })),
		),
		merge(sources.runnerStarted$, sources.runnerStartNodeStarted$).pipe(
			map((runId): HitlComposerAction => ({ type: 'reset', runId })),
		),
		catalog$.pipe(
			map((catalog): HitlComposerAction => ({
				type: 'catalog',
				catalog,
			})),
		),
	).pipe(
		scan(
			(composer, action) => foldHitlComposer(nodeId, composer, action),
			emptyHitlComposer(),
		),
		startWith(emptyHitlComposer()),
		map((composer) => composer.state.awaiting),
		shareReplay({ bufferSize: 1, refCount: true }),
	);
};
