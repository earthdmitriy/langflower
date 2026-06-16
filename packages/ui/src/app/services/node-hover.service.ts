import { Injectable, signal } from '@angular/core';

/**
 * UI-only hover linkage between the sidebar / composer and the canvas nodes.
 *
 * Hover is transient local state (allowed per UI conventions) — it is never
 * sent to the server. Shared by the work-log panel, HITL composer (tabs +
 * textarea focus/hover), and canvas nodes so mousing (or focusing a HITL
 * input) highlights the related node on the other side. When several HITL
 * nodes await input at once, this makes obvious which node receives the
 * reply.
 */
@Injectable({ providedIn: 'root' })
export class NodeHoverService {
	private readonly hovered = signal<string | null>(null);

	readonly hoveredNodeId = this.hovered.asReadonly();

	set(nodeId: string): void {
		this.hovered.set(nodeId);
	}

	clear(): void {
		this.hovered.set(null);
	}

	isHovered(nodeId: string): boolean {
		return this.hovered() === nodeId;
	}
}
