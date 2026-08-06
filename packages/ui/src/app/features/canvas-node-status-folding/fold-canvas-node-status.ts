import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import { combineLatest, merge, type Observable } from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';
import {
	feedCatalogFromSnaps,
	type FeedCatalog,
} from '../../services/execution-catalog';
import { mergePaletteCatalogs } from '../palette/types/palette-projection';
import {
	appendNodeChromeFrame,
	emptyNodeChromeFoldState,
	eventsForNode,
	foldStatusFromNodeState,
	rebuildNodeChromeFoldState,
	replayNodeChromeFromSnapshot,
	resetNodeChromeFoldState,
} from './operators/canvas-node-status-projection';
import type {
	CanvasNodeFoldStatus,
	CanvasNodeStatusBridgeSources,
	NodeChromeFoldState,
} from './types';

type ComposerState = {
	readonly events: readonly RuntimeRunnerEvent[];
	readonly catalog: FeedCatalog | null;
	readonly state: NodeChromeFoldState;
};

type ComposerAction =
	| {
			readonly type: 'snapshot';
			readonly snap: ExecutionFeedSnapshotPayload | null;
	  }
	| { readonly type: 'port'; readonly event: RuntimeRunnerEvent }
	| { readonly type: 'catalog'; readonly catalog: FeedCatalog }
	| { readonly type: 'reset'; readonly runId: RunId };

const emptyComposer = (): ComposerState => ({
	events: [],
	catalog: null,
	state: emptyNodeChromeFoldState(),
});

const foldComposer = (
	nodeId: string,
	composer: ComposerState,
	action: ComposerAction,
): ComposerState => {
	if (action.type === 'catalog') {
		const state =
			composer.events.length === 0
				? composer.state
				: rebuildNodeChromeFoldState(
						composer.events,
						composer.state.runId,
						action.catalog,
					);
		return {
			...composer,
			catalog: action.catalog,
			state,
		};
	}
	if (action.type === 'snapshot') {
		if (action.snap === null) {
			return {
				events: [],
				catalog: composer.catalog,
				state: emptyNodeChromeFoldState(),
			};
		}
		const events = eventsForNode(action.snap.events, nodeId);
		return {
			events,
			catalog: composer.catalog,
			state: replayNodeChromeFromSnapshot(
				action.snap,
				nodeId,
				composer.catalog,
			),
		};
	}
	if (action.type === 'reset') {
		const state = resetNodeChromeFoldState(action.runId, composer.state);
		if (state === composer.state) {
			return composer;
		}
		return {
			events: [],
			catalog: composer.catalog,
			state,
		};
	}
	const events = [...composer.events, action.event];
	return {
		events,
		catalog: composer.catalog,
		state: appendNodeChromeFrame(
			composer.state,
			action.event,
			composer.catalog,
		),
	};
};

/**
 * Filter bridge facts to one node, then append-only fold to chrome status.
 * Live frames are O(1); snapshot/catalog rebuild once for that node only.
 */
export const foldSingleNodeCanvasStatus = (
	nodeId: string,
	sources: Pick<
		CanvasNodeStatusBridgeSources,
		| 'executionFeedSnapshot$'
		| 'outputEmitted$'
		| 'inputReceived$'
		| 'runnerStarted$'
		| 'runnerStartNodeStarted$'
		| 'workflowSnapshot$'
		| 'paletteSnapshot$'
		| 'customPaletteSnapshot$'
	>,
): Observable<CanvasNodeFoldStatus> => {
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

	const forNode = (event: RuntimeRunnerEvent): boolean => {
		if (
			event.kind !== 'output-emitted' &&
			event.kind !== 'input-received'
		) {
			return false;
		}
		return event.nodeId === nodeId;
	};

	return merge(
		sources.executionFeedSnapshot$.pipe(
			map((snap): ComposerAction => ({
				type: 'snapshot',
				snap,
			})),
		),
		sources.outputEmitted$.pipe(
			filter(forNode),
			map((event): ComposerAction => ({ type: 'port', event })),
		),
		sources.inputReceived$.pipe(
			filter(forNode),
			map((event): ComposerAction => ({ type: 'port', event })),
		),
		merge(sources.runnerStarted$, sources.runnerStartNodeStarted$).pipe(
			map((runId): ComposerAction => ({ type: 'reset', runId })),
		),
		catalog$.pipe(
			map((catalog): ComposerAction => ({ type: 'catalog', catalog })),
		),
	).pipe(
		scan(
			(composer, action) => foldComposer(nodeId, composer, action),
			emptyComposer(),
		),
		startWith(emptyComposer()),
		map((composer) => foldStatusFromNodeState(composer.state)),
		shareReplay({ bufferSize: 1, refCount: true }),
	);
};
