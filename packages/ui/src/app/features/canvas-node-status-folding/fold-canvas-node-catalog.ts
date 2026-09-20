import { combineLatest, type Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import {
	feedCatalogFromSnaps,
	mergePaletteCatalogs,
	type FeedCatalog,
} from '../../services/execution-catalog';
import type { CanvasNodeStatusBridgeSources } from './types';

/** Shared catalog combine for status + HITL canvas node folds. */
export const foldCanvasNodeCatalog$ = (
	sources: Pick<
		CanvasNodeStatusBridgeSources,
		'workflowSnapshot$' | 'paletteSnapshot$' | 'customPaletteSnapshot$'
	>,
): Observable<FeedCatalog> =>
	combineLatest([
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
