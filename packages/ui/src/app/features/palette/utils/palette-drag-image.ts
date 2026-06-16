import {
	ApplicationRef,
	createComponent,
	EnvironmentInjector,
} from '@angular/core';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { PaletteDragPreviewComponent } from '../components/palette-drag-preview.component.js';
import {
	PALETTE_DRAG_ANCHOR_OFFSET_PX,
	PALETTE_DRAG_OPACITY,
} from './palette-drag-layout.js';

export type PaletteDragImageSession = {
	readonly destroy: () => void;
};

export function attachPaletteDragImage(
	environmentInjector: EnvironmentInjector,
	appRef: ApplicationRef,
	node: PaletteNodeDefinition,
	event: DragEvent,
): PaletteDragImageSession | null {
	const dataTransfer = event.dataTransfer;

	if (dataTransfer === null) {
		return null;
	}

	const host = document.createElement('div');
	host.style.position = 'fixed';
	host.style.top = '-2000px';
	host.style.left = '-2000px';
	// Block + fixed defaults to viewport width; setDragImage would capture that
	// huge empty box and the ghost looks absurdly wide.
	host.style.display = 'inline-block';
	host.style.width = 'max-content';
	host.style.pointerEvents = 'none';
	host.style.opacity = String(PALETTE_DRAG_OPACITY);
	document.body.appendChild(host);

	const previewRef = createComponent(PaletteDragPreviewComponent, {
		hostElement: host,
		environmentInjector,
	});
	previewRef.setInput('node', node);
	appRef.attachView(previewRef.hostView);
	previewRef.changeDetectorRef.detectChanges();

	dataTransfer.setDragImage(
		host,
		PALETTE_DRAG_ANCHOR_OFFSET_PX,
		PALETTE_DRAG_ANCHOR_OFFSET_PX,
	);

	return {
		destroy: () => {
			appRef.detachView(previewRef.hostView);
			previewRef.destroy();
			host.remove();
		},
	};
}
