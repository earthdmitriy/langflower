import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	inject,
	Injector,
	input,
	type OnDestroy,
	output,
	viewChild,
} from '@angular/core';

let dialogLabelCounter = 0;

/**
 * Full-size look at one staged image before Send. Host is moved to
 * `document.body` so the composer's overflow does not clip it. Escape,
 * the backdrop, and Close dismiss.
 */
@Component({
	selector: 'lf-attachment-preview-dialog',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/60',
		'(click)': 'dismiss.emit()',
	},
	template: `
		<div
			role="dialog"
			aria-modal="true"
			[attr.aria-labelledby]="labelId"
			class="flex max-h-[calc(100vh-2rem)] max-w-[min(900px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
			(click)="$event.stopPropagation()"
		>
			<div
				class="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700"
			>
				<h2
					[id]="labelId"
					class="min-w-0 truncate text-sm font-medium text-zinc-950 dark:text-zinc-100"
				>
					{{ name() }}
					@if (detail().length > 0) {
						<span
							class="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400"
							>{{ detail() }}</span
						>
					}
				</h2>
				<button
					#close
					type="button"
					class="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
					(click)="dismiss.emit()"
				>
					Close
				</button>
			</div>
			<div class="flex min-h-0 flex-1 items-center justify-center p-3">
				<img
					[src]="src()"
					[alt]="name()"
					class="max-h-[calc(100vh-8rem)] max-w-full object-contain"
				/>
			</div>
		</div>
	`,
})
export class LfAttachmentPreviewDialogComponent implements OnDestroy {
	private readonly host = inject(ElementRef<HTMLElement>);
	private readonly injector = inject(Injector);
	private readonly closeButton =
		viewChild<ElementRef<HTMLButtonElement>>('close');

	readonly src = input.required<string>();
	readonly name = input.required<string>();
	/** MIME and size line beside the name. */
	readonly detail = input<string>('');

	readonly dismiss = output<void>();

	readonly labelId = `lf-attachment-preview-label-${(dialogLabelCounter += 1)}`;

	private placeholder: Comment | null = null;
	private destroyed = false;

	constructor() {
		afterNextRender(
			() => {
				this.attachToBody();
				this.closeButton()?.nativeElement.focus();
			},
			{ injector: this.injector },
		);
		document.addEventListener('keydown', this.onDocumentKeydown, true);
	}

	private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
		if (event.key !== 'Escape') {
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();
		this.dismiss.emit();
	};

	private attachToBody(): void {
		if (this.destroyed) {
			return;
		}

		const element = this.host.nativeElement;
		const parent = element.parentNode;

		if (parent !== null && parent !== document.body) {
			this.placeholder = document.createComment(
				'lf-attachment-preview-dialog',
			);
			parent.insertBefore(this.placeholder, element);
			document.body.appendChild(element);
		}
	}

	ngOnDestroy(): void {
		this.destroyed = true;
		document.removeEventListener('keydown', this.onDocumentKeydown, true);
		// Angular skips removeChild once the host has been moved to body.
		this.host.nativeElement.remove();
		this.placeholder?.remove();
		this.placeholder = null;
	}
}
