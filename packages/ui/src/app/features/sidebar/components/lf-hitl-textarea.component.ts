import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
} from '@angular/core';
import type { HitlInputConfig } from '@langflower/node-sdk';
import { NodeHoverService } from '../../../services/node-hover.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';

/**
 * Full-bleed HITL textarea for the composer shell (palette §8). Fills the
 * shell stage; footer/tabs float over it. No field-title label — destination
 * is the pressed footer CTA. Bottom/top padding reserves overlay chrome.
 */
@Component({
	selector: 'lf-hitl-textarea',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'block h-full w-full',
	},
	template: `
		@switch (config.kind) {
			@case ('textarea') {
				<div
					class="h-full w-full"
					(mouseenter)="onPointerEnter()"
					(mouseleave)="onPointerLeave()"
				>
					<textarea
						id="hitl-{{ nodeId }}-{{ portId }}"
						class="lf-scroll h-full w-full resize-none border-0 bg-transparent px-3 pb-14 text-xs leading-5 text-zinc-900 focus:outline-none dark:text-zinc-100"
						[class.pt-11]="padTopForTabs"
						[class.pt-3]="!padTopForTabs"
						[attr.aria-label]="config.title"
						[placeholder]="config.placeholder ?? ''"
						[value]="execution.hitlDraft(nodeId, portId)"
						(input)="onDraft($event)"
						(keydown)="onKeydown($event)"
						(keyup)="onKeyup($event)"
						(focus)="onFocus()"
						(blur)="onBlur()"
					></textarea>
				</div>
			}
		}
	`,
})
export class LfHitlTextareaComponent {
	@Input({ required: true }) nodeId!: string;
	@Input({ required: true }) portId!: string;
	@Input({ required: true }) config!: HitlInputConfig;
	/** Extra top padding when the tab strip overlays the stage. */
	@Input() padTopForTabs = false;
	/** Enter (no Shift) while focused — activate rightmost footer CTA. */
	@Output() enterActivate = new EventEmitter<void>();

	readonly execution = inject(WorkflowExecutionService);
	private readonly hover = inject(NodeHoverService);

	private pointerInside = false;
	private focused = false;

	onDraft(event: Event): void {
		this.execution.setHitlDraft(
			this.nodeId,
			this.portId,
			(event.target as HTMLTextAreaElement).value,
		);
	}

	/** Block bare Enter newline; Shift+Enter keeps the line break. */
	onKeydown(event: KeyboardEvent): void {
		if (
			event.key !== 'Enter' ||
			event.shiftKey ||
			event.isComposing ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey
		) {
			return;
		}
		event.preventDefault();
	}

	onKeyup(event: KeyboardEvent): void {
		if (
			event.key !== 'Enter' ||
			event.shiftKey ||
			event.isComposing ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey
		) {
			return;
		}
		event.preventDefault();
		this.enterActivate.emit();
	}

	onPointerEnter(): void {
		this.pointerInside = true;
		this.hover.set(this.nodeId);
	}

	onPointerLeave(): void {
		this.pointerInside = false;
		if (!this.focused) {
			this.hover.clear();
		}
	}

	onFocus(): void {
		this.focused = true;
		this.hover.set(this.nodeId);
	}

	onBlur(): void {
		this.focused = false;
		if (!this.pointerInside) {
			this.hover.clear();
		}
	}
}
