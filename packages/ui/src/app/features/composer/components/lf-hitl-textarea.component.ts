import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
	signal,
} from '@angular/core';
import type { HitlInputConfig } from '@langflower/node-sdk';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { NodeHoverService } from '../../../services/node-hover.service';
import {
	clipboardUploadFiles,
	dragCarriesFiles,
	dropUploadFiles,
} from '../../../utils/session-upload';
import { ComposerService } from '../composer.service';
import { LfAttachmentThumbComponent } from './lf-attachment-thumb.component';

/**
 * Full-bleed HITL textarea for the composer shell. Fills the
 * shell stage; footer/tabs float over it. No field-title label — destination
 * is the pressed footer CTA. Bottom/top padding reserves overlay chrome.
 */
@Component({
	selector: 'lf-hitl-textarea',
	standalone: true,
	imports: [LfHoverTipComponent, LfAttachmentThumbComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'block h-full w-full',
	},
	template: `
		@switch (config.kind) {
			@case ('textarea') {
				<div
					class="relative h-full w-full"
					[class.ring-2]="dragActive()"
					[class.ring-inset]="dragActive()"
					[class.ring-sky-400]="dragActive()"
					(mouseenter)="onPointerEnter()"
					(mouseleave)="onPointerLeave()"
					(dragover)="onDragOver($event)"
					(dragleave)="onDragLeave($event)"
					(drop)="onDrop($event)"
				>
					<textarea
						id="hitl-{{ nodeId }}-{{ portId }}"
						class="lf-scroll h-full w-full resize-none border-0 bg-transparent px-3 text-xs leading-5 text-zinc-900 focus:outline-none dark:text-zinc-100"
						[class.pt-11]="padTopForTabs"
						[class.pt-3]="!padTopForTabs"
						[class.pb-28]="showAttachmentStrip()"
						[class.pb-14]="!showAttachmentStrip()"
						[attr.aria-label]="config.title"
						[placeholder]="config.placeholder ?? ''"
						[value]="composer.composerText(nodeId, portId)"
						(input)="onDraft($event)"
						(paste)="onPaste($event)"
						(keydown)="onKeydown($event)"
						(keyup)="onKeyup($event)"
						(focus)="onFocus()"
						(blur)="onBlur()"
					></textarea>
					@if (showAttachmentStrip()) {
						<ul
							class="absolute bottom-16 left-3 right-3 z-[1] flex flex-wrap gap-1"
						>
							@for (file of attachments(); track file) {
								<li
									class="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-300 bg-white py-0.5 pr-2 pl-0.5 text-[11px] text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
								>
									<lf-attachment-thumb [file]="file" />
									<span class="max-w-40 truncate">{{
										file.name
									}}</span>
									<lf-hover-tip [tip]="'Remove ' + file.name">
										<button
											type="button"
											class="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
											[attr.aria-label]="
												'Remove ' + file.name
											"
											(click)="removeAttachment($index)"
										>
											×
										</button>
									</lf-hover-tip>
								</li>
							}
						</ul>
					}
				</div>
			}
		}
	`,
})
export class LfHitlTextareaComponent {
	@Input({ required: true }) nodeId!: string;
	@Input({ required: true }) portId!: string;
	@Input({ required: true }) config!: HitlInputConfig;
	/** The input accepts a `user-turn`, so the textarea takes files (attach, paste, drop). */
	@Input() acceptsFiles = false;
	/** Extra top padding when the tab strip overlays the stage. */
	@Input() padTopForTabs = false;
	/** Enter (no Shift) while focused — activate rightmost footer CTA. */
	@Output() enterActivate = new EventEmitter<void>();

	readonly composer = inject(ComposerService);
	private readonly hover = inject(NodeHoverService);

	readonly dragActive = signal(false);

	private pointerInside = false;
	private focused = false;

	attachments(): readonly File[] {
		return this.composer.attachmentsFor(this.nodeId, this.portId);
	}

	showAttachmentStrip(): boolean {
		return this.acceptsFiles && this.attachments().length > 0;
	}

	removeAttachment(index: number): void {
		this.composer.removeAttachment(this.nodeId, this.portId, index);
	}

	/** A pasted screenshot or file joins the draft. Plain text pastes as usual. */
	onPaste(event: ClipboardEvent): void {
		if (!this.canTakeFiles()) {
			return;
		}
		const files = clipboardUploadFiles(event.clipboardData);
		if (files.length === 0) {
			return;
		}
		event.preventDefault();
		this.composer.addAttachments(this.nodeId, this.portId, files);
	}

	onDragOver(event: DragEvent): void {
		if (
			!this.canTakeFiles() ||
			!dragCarriesFiles(event.dataTransfer?.types)
		) {
			return;
		}
		event.preventDefault();
		this.dragActive.set(true);
	}

	onDragLeave(event: DragEvent): void {
		const next = event.relatedTarget;
		const host = event.currentTarget;
		if (
			next instanceof Node &&
			host instanceof Node &&
			host.contains(next)
		) {
			return;
		}
		this.dragActive.set(false);
	}

	onDrop(event: DragEvent): void {
		this.dragActive.set(false);
		if (
			!this.canTakeFiles() ||
			!dragCarriesFiles(event.dataTransfer?.types)
		) {
			return;
		}
		event.preventDefault();
		this.composer.addAttachments(
			this.nodeId,
			this.portId,
			dropUploadFiles(event.dataTransfer),
		);
	}

	private canTakeFiles(): boolean {
		return this.acceptsFiles && !this.composer.uploading();
	}

	onDraft(event: Event): void {
		this.composer.setComposerText(
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
