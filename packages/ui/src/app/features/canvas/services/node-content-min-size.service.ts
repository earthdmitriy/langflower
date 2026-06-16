import { Injectable } from '@angular/core';

const DEFAULT_MIN = { width: 160, height: 72 } as const;

/**
 * Live content-fit floor for ng-diagram `resize.getMinNodeSize`.
 * Updated by {@link LfNodeComponent} from the inner content box (not the
 * stretched chrome host), so SE resize cannot shrink below ports/fields.
 */
@Injectable({ providedIn: 'root' })
export class NodeContentMinSizeService {
	private readonly byId = new Map<
		string,
		{ readonly width: number; readonly height: number }
	>();

	set(
		nodeId: string,
		size: { readonly width: number; readonly height: number },
	): void {
		this.byId.set(nodeId, size);
	}

	clear(nodeId: string): void {
		this.byId.delete(nodeId);
	}

	minFor(nodeId: string): {
		readonly width: number;
		readonly height: number;
	} {
		return this.byId.get(nodeId) ?? DEFAULT_MIN;
	}
}
