import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { SESSION_UPLOAD_ACCEPT } from '../../../utils/session-upload';

/**
 * Footer paperclip for a composer textarea that takes files.
 * The owner decides what the picked files join; the MIME gate runs there.
 */
@Component({
	selector: 'lf-attach-button',
	standalone: true,
	imports: [LfHoverTipComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'inline-flex' },
	template: `
		<input
			#sessionFile
			type="file"
			class="sr-only"
			[attr.accept]="accept"
			multiple
			(change)="onChange(sessionFile)"
		/>
		<lf-hover-tip tip="Attach an image, audio, or PDF">
			<button
				type="button"
				class="lf-composer-icon-btn border border-zinc-300 text-zinc-500 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-100"
				aria-label="Attach file"
				(click)="sessionFile.click()"
			>
				<svg
					viewBox="0 0 20 20"
					class="h-4 w-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						d="M7.5 10.5l4.2-4.2a2.1 2.1 0 0 1 3 3l-5.7 5.7a3.2 3.2 0 0 1-4.5-4.5l5.6-5.6"
					/>
				</svg>
			</button>
		</lf-hover-tip>
	`,
})
export class LfAttachButtonComponent {
	readonly picked = output<readonly File[]>();

	protected readonly accept = SESSION_UPLOAD_ACCEPT;

	protected onChange(input: HTMLInputElement): void {
		const list = input.files;
		const files = list === null ? [] : Array.from(list);
		input.value = '';
		this.picked.emit(files);
	}
}
