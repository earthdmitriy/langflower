import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	input,
	signal,
} from '@angular/core';
import { isSessionUploadImageMime } from '../../../utils/session-upload';
import { LfAttachmentPreviewDialogComponent } from './lf-attachment-preview-dialog.component';

const formatBytes = (size: number): string =>
	size >= 1_048_576
		? `${(size / 1_048_576).toFixed(1)} MB`
		: `${Math.max(1, Math.round(size / 1024))} KB`;

/**
 * Tiny preview of one staged file. An image shows a thumbnail that opens
 * the full-size dialog. Audio and PDF show a label, with no player. The
 * object URL is the edge effect: created here, revoked on change or destroy.
 */
@Component({
	selector: 'lf-attachment-thumb',
	standalone: true,
	imports: [LfAttachmentPreviewDialogComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'inline-flex shrink-0' },
	template: `
		@if (src(); as url) {
			<button
				type="button"
				class="h-7 w-7 overflow-hidden rounded border border-zinc-300 dark:border-zinc-600"
				[attr.aria-label]="'Preview ' + file().name"
				(click)="open.set(true)"
			>
				<img
					[src]="url"
					alt=""
					class="h-full w-full object-cover"
					draggable="false"
				/>
			</button>
			@if (open()) {
				<lf-attachment-preview-dialog
					[src]="url"
					[name]="file().name"
					[detail]="detail()"
					(dismiss)="open.set(false)"
				/>
			}
		} @else {
			<span
				class="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-300 text-[9px] font-medium text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
				aria-hidden="true"
				>{{ kind() }}</span
			>
		}
	`,
})
export class LfAttachmentThumbComponent {
	readonly file = input.required<File>();

	protected readonly src = signal<string | null>(null);
	protected readonly open = signal(false);
	protected readonly detail = computed(
		() => `${this.file().type} · ${formatBytes(this.file().size)}`,
	);
	protected readonly kind = computed(() =>
		this.file().type.startsWith('audio/') ? 'AUD' : 'PDF',
	);

	constructor() {
		effect((onCleanup) => {
			const file = this.file();
			if (!isSessionUploadImageMime(file.type)) {
				this.src.set(null);
				return;
			}
			const url = URL.createObjectURL(file);
			this.src.set(url);
			onCleanup(() => {
				URL.revokeObjectURL(url);
			});
		});
	}
}
