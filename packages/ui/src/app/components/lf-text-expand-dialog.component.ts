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
 * Near-fullscreen editor for one inline string. Own textarea; keyup and
 * change emit the same `valueChange` the small field already uses. Host is
 * moved to `document.body` so canvas transforms and overflow do not clip it.
 */
@Component({
	selector: 'lf-text-expand-dialog',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/40',
		'(click)': 'dismiss.emit()',
	},
	template: `
		<div
			role="dialog"
			aria-modal="true"
			[attr.aria-labelledby]="labelId"
			class="flex h-[calc(100vh-2rem)] w-[min(700px,calc(100vw-2rem))] max-w-[700px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
			(click)="$event.stopPropagation()"
		>
			<div
				class="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700"
			>
				<h2
					[id]="labelId"
					class="min-w-0 truncate text-sm font-medium text-zinc-950 dark:text-zinc-100"
				>
					{{ label() }}
				</h2>
				<button
					type="button"
					class="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
					(click)="dismiss.emit()"
				>
					Close
				</button>
			</div>
			<textarea
				#editor
				class="lf-scroll min-h-0 w-full flex-1 resize-none overflow-y-scroll border-0 bg-transparent p-3 text-sm leading-5 text-zinc-800 outline-none dark:text-zinc-100"
				[value]="value()"
				[disabled]="disabled()"
				(change)="emitValue(editor.value)"
				(keyup)="emitValue(editor.value)"
			></textarea>
		</div>
	`,
})
export class LfTextExpandDialogComponent implements OnDestroy {
	private readonly host = inject(ElementRef<HTMLElement>);
	private readonly injector = inject(Injector);
	private readonly editor =
		viewChild<ElementRef<HTMLTextAreaElement>>('editor');

	readonly value = input<string>('');
	readonly disabled = input<boolean>(false);
	readonly label = input<string>('Edit text');

	readonly valueChange = output<string>();
	readonly dismiss = output<void>();

	readonly labelId = `lf-text-expand-label-${(dialogLabelCounter += 1)}`;

	private placeholder: Comment | null = null;
	private destroyed = false;

	constructor() {
		afterNextRender(
			() => {
				this.attachToBody();
				this.focusEditor();
			},
			{ injector: this.injector },
		);
		document.addEventListener('keydown', this.onDocumentKeydown, true);
	}

	emitValue(next: string): void {
		if (this.disabled()) {
			return;
		}

		this.valueChange.emit(next);
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
			this.placeholder = document.createComment('lf-text-expand-dialog');
			parent.insertBefore(this.placeholder, element);
			document.body.appendChild(element);
		}
	}

	private focusEditor(): void {
		const element = this.editor()?.nativeElement;

		if (element === undefined || element.disabled) {
			return;
		}

		element.focus();
		const end = element.value.length;
		element.setSelectionRange(end, end);
	}

	ngOnDestroy(): void {
		this.destroyed = true;
		document.removeEventListener('keydown', this.onDocumentKeydown, true);
		// Angular skips removeChild once the host has been moved to body.
		// Putting it back afterwards reinserts a destroyed view into the field.
		this.host.nativeElement.remove();
		this.placeholder?.remove();
		this.placeholder = null;
	}
}
