import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	Output,
	inject,
} from '@angular/core';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { resolveComposerActionPayload } from '../hitl-action-payload';
import type { HitlControlProjection } from '../../../services/hitl-projection';
import { ComposerService } from '../composer.service';

/**
 * Footer CTAs for HITL replies and Chat Input Start. Text buttons are
 * `rounded-full` pills at `--lf-control-h`; Start is a round emerald icon.
 * Stop lives in `lf-composer-shell` on the left while running.
 */
@Component({
	selector: 'lf-hitl-actions',
	standalone: true,
	imports: [LfHoverTipComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@for (entry of entries; track entry.nodeId + ':' + entry.portId) {
			@switch (entry.config.kind) {
				@case ('textarea') {
					@if (entry.config.role === 'chat-start') {
						<lf-hover-tip
							[tip]="
								canSubmitStart(entry)
									? 'Start the chat run'
									: 'Type a message to start'
							"
						>
							<button
								type="button"
								class="lf-composer-icon-btn border border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300"
								[class.hover:bg-emerald-100]="
									canSubmitStart(entry)
								"
								[class.dark:hover:bg-emerald-950/60]="
									canSubmitStart(entry)
								"
								[class.opacity-50]="!canSubmitStart(entry)"
								aria-label="Start"
								[attr.aria-disabled]="
									canSubmitStart(entry) ? null : 'true'
								"
								(click)="submitEntry(entry)"
							>
								<svg
									viewBox="0 0 20 20"
									class="h-4 w-4"
									fill="currentColor"
									aria-hidden="true"
								>
									<path
										d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z"
									/>
								</svg>
							</button>
						</lf-hover-tip>
					} @else {
						<lf-hover-tip
							[tip]="
								draftOf(entry).trim().length > 0
									? ''
									: 'Type a message first'
							"
						>
							<button
								type="button"
								class="lf-composer-pill border border-zinc-200 text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
								[disabled]="draftOf(entry).trim().length === 0"
								(click)="submitEntry(entry)"
							>
								{{ entry.config.submitLabel ?? 'Send' }}
							</button>
						</lf-hover-tip>
					}
				}
				@case ('button') {
					<button
						type="button"
						class="lf-composer-pill border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
						(click)="submitEntry(entry)"
					>
						{{ entry.config.label }}
					</button>
				}
			}
		}
	`,
})
export class LfHitlActionsComponent {
	@Input({ required: true }) entries: readonly HitlControlProjection[] = [];
	@Output() submitted = new EventEmitter<
		readonly [nodeId: string, portId: string, payload: unknown]
	>();

	readonly composer = inject(ComposerService);

	draftOf(entry: HitlControlProjection): string {
		return this.composer.composerText(entry.nodeId, entry.portId);
	}

	canSubmitStart(entry: HitlControlProjection): boolean {
		return this.draftOf(entry).trim().length > 0;
	}

	submitEntry(entry: HitlControlProjection): void {
		const resolved = resolveComposerActionPayload(
			entry,
			this.draftOf(entry),
		);
		if (!resolved.ok) {
			return;
		}
		this.submitted.emit([entry.nodeId, entry.portId, resolved.payload]);
	}
}
