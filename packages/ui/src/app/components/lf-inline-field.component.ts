import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
	signal,
} from '@angular/core';
import {
	type InlineConfig,
	resolveMultilineInlineLayout,
} from '@langflower/node-sdk';
import { renderMarkdown } from '../utils/render-markdown.js';
import { LfHoverTipComponent } from './lf-hover-tip.component';
import { LfTextExpandDialogComponent } from './lf-text-expand-dialog.component';

function formatPreviewValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	return String(value);
}

/** Text / textarea display. Objects JSON.stringify — `String({})` is `[object Object]`. */
export const asDisplayString = (value: unknown): string => {
	if (value === null || value === undefined || value === '[object Object]') {
		return '';
	}

	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return '';
		}
	}

	return String(value);
};

type InlineKind =
	| 'text'
	| 'text-multiline'
	| 'markdown'
	| 'boolean'
	| 'preview'
	| 'preview-markdown'
	| 'preview-code'
	| 'select'
	| 'multiselect'
	| 'radio'
	| 'number';

/** `InlineConfig` kind discriminator — collapses the select-family object variant. */
function kindOf(config: InlineConfig): InlineKind {
	return typeof config === 'string' ? config : config.type;
}

let radioGroupCounter = 0;

type SelectOption = {
	readonly value: unknown;
	readonly title: string;
	readonly description?: string;
};

/** Caption text for the currently selected select/radio option. */
export const selectedSelectDescription = (
	options: readonly {
		readonly value: unknown;
		readonly description?: string;
	}[],
	value: unknown,
): string | undefined => {
	const option = options.find((entry) => sameValue(entry.value, value));

	return option?.description;
};

/**
 * When the current value is no longer in the catalog (deleted provider, skill,
 * …), keep it visible as a selectable option. Otherwise HTML `<select>` shows
 * the first catalog entry while the stored value stays stale — and re-picking
 * the visible label often does not fire `change`.
 */
export const withOrphanSelectOptions = (
	options: readonly SelectOption[],
	value: unknown,
): readonly SelectOption[] => {
	const orphanValues = Array.isArray(value)
		? value.filter(
				(entry) =>
					entry !== undefined &&
					entry !== null &&
					entry !== '' &&
					!options.some((option) => sameValue(option.value, entry)),
			)
		: value !== undefined &&
			  value !== null &&
			  value !== '' &&
			  !options.some((option) => sameValue(option.value, value))
			? [value]
			: [];

	if (orphanValues.length === 0) {
		return options;
	}

	return [
		...orphanValues.map((orphan) => ({
			value: orphan,
			title: `${String(orphan)} (missing)`,
			description:
				'No longer available — choose another option to clear this',
		})),
		...options,
	];
};

/** Loose value equality for matching a select/radio option against the current value. */
function sameValue(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}

	try {
		return JSON.stringify(a) === JSON.stringify(b);
	} catch {
		return false;
	}
}

@Component({
	selector: 'lf-inline-field',
	standalone: true,
	imports: [LfHoverTipComponent, LfTextExpandDialogComponent],
	host: {
		'[class.lf-inline-field--fill]': 'fill()',
		'[style.--lf-multiline-min.px]': 'multilineMinHeightPx()',
	},
	template: `
		@switch (kind()) {
			@case ('text') {
				<input
					#control
					type="text"
					[value]="textValue()"
					[disabled]="disabled()"
					(change)="valueChange.emit(control.value)"
					(keyup)="valueChange.emit(control.value)"
					class="lf-inline-control"
				/>
			}
			@case ('number') {
				<input
					#control
					type="number"
					[value]="textValue()"
					[min]="numberConfig()?.min ?? null"
					[max]="numberConfig()?.max ?? null"
					[step]="numberConfig()?.step ?? 'any'"
					[disabled]="disabled()"
					(change)="onNumberChange(control.value)"
					(keyup)="onNumberChange(control.value)"
					class="lf-inline-control lf-inline-control--number"
				/>
			}
			@case ('text-multiline') {
				<div class="lf-inline-expand-host">
					<textarea
						#control
						rows="2"
						[value]="textValue()"
						[disabled]="disabled()"
						(change)="valueChange.emit(control.value)"
						(keyup)="valueChange.emit(control.value)"
						class="lf-inline-control lf-inline-multiline lf-scroll"
						[class.lf-inline-multiline--expand]="showExpand()"
						data-no-drag="true"
						data-no-pan="true"
					></textarea>
					@if (showExpand()) {
						<span class="lf-inline-expand-button">
							<lf-hover-tip
								tip="Expand"
								side="bottom"
								align="end"
							>
								<button
									type="button"
									class="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
									aria-label="Expand"
									data-no-drag="true"
									data-no-pan="true"
									(mousedown)="onExpandMouseDown($event)"
									(click)="openExpand($event)"
								>
									<svg
										viewBox="0 0 24 24"
										class="h-3 w-3"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
										/>
									</svg>
								</button>
							</lf-hover-tip>
						</span>
					}
				</div>
			}
			@case ('markdown') {
				<div class="lf-inline-expand-host">
					@if (markdownEditingActive()) {
						<textarea
							#control
							rows="2"
							[value]="textValue()"
							autofocus
							(change)="valueChange.emit(control.value)"
							(keyup)="valueChange.emit(control.value)"
							(blur)="stopMarkdownEdit()"
							class="lf-inline-control lf-inline-multiline lf-scroll"
							[class.lf-inline-multiline--expand]="showExpand()"
							data-no-drag="true"
							data-no-pan="true"
						></textarea>
					} @else {
						<div
							class="lf-inline-preview lf-scroll prose prose-xs max-w-full dark:prose-invert"
							[class.lf-inline-preview--expand]="showExpand()"
							tabindex="0"
							data-no-drag="true"
							data-no-pan="true"
							(click)="startMarkdownEdit()"
							(focus)="startMarkdownEdit()"
						>
							@if (textValue()) {
								<div [innerHTML]="authorMarkdownHtml()"></div>
							} @else {
								<span class="lf-inline-preview-placeholder"
									>Write a hint…</span
								>
							}
						</div>
					}
					@if (showExpand()) {
						<span class="lf-inline-expand-button">
							<lf-hover-tip
								tip="Expand"
								side="bottom"
								align="end"
							>
								<button
									type="button"
									class="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
									aria-label="Expand"
									data-no-drag="true"
									data-no-pan="true"
									(mousedown)="onExpandMouseDown($event)"
									(click)="openExpand($event)"
								>
									<svg
										viewBox="0 0 24 24"
										class="h-3 w-3"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
										/>
									</svg>
								</button>
							</lf-hover-tip>
						</span>
					}
				</div>
			}
			@case ('boolean') {
				<label
					class="inline-flex w-fit items-center gap-2 text-[10px] text-zinc-600 dark:text-zinc-300"
					[class.cursor-pointer]="!disabled()"
					[class.opacity-60]="disabled()"
				>
					<input
						#control
						type="checkbox"
						role="switch"
						class="peer sr-only"
						[checked]="booleanValue()"
						[disabled]="disabled()"
						(change)="valueChange.emit(control.checked)"
					/>
					<span
						aria-hidden="true"
						class="relative h-4 w-7 shrink-0 rounded-full bg-zinc-300 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-3 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 dark:bg-zinc-700 dark:peer-checked:bg-emerald-500"
					></span>
					{{ booleanValue() ? 'On' : 'Off' }}
				</label>
			}
			@case ('select') {
				<div class="flex flex-col gap-0.5">
					<select
						#control
						[disabled]="disabled()"
						(change)="onSelectChange(control.value)"
						class="lf-inline-control"
					>
						@for (option of options(); track $index) {
							<option
								[value]="$index"
								[selected]="sameValue(option.value, value())"
								[title]="option.description ?? ''"
							>
								{{ option.title }}
							</option>
						}
					</select>
					@if (selectedDescription(); as description) {
						<p class="lf-inline-select-caption">
							{{ description }}
						</p>
					}
				</div>
			}
			@case ('radio') {
				<div class="flex flex-col gap-0.5">
					@for (option of options(); track $index) {
						<label
							class="flex items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-300"
						>
							<input
								type="radio"
								[name]="radioGroupName"
								[checked]="sameValue(option.value, value())"
								[disabled]="disabled()"
								(change)="valueChange.emit(option.value)"
							/>
							{{ option.title }}
						</label>
					}
				</div>
			}
			@case ('multiselect') {
				<div class="flex flex-col gap-0.5">
					@for (option of options(); track $index) {
						<label
							class="flex items-start gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-300"
						>
							<input
								type="checkbox"
								class="mt-0.5"
								[checked]="isSelected(option.value)"
								[disabled]="disabled()"
								(change)="onMultiselectToggle(option.value)"
							/>
							<span class="flex min-w-0 flex-col gap-0.5">
								<span>{{ option.title }}</span>
								@if (option.description; as description) {
									<span class="lf-inline-select-caption">{{
										description
									}}</span>
								}
							</span>
						</label>
					}
				</div>
			}
			@case ('preview-code') {
				<pre
					class="lf-inline-preview lf-inline-preview--code lf-scroll"
				><code>{{ previewText() }}</code></pre>
			}
			@case ('preview-markdown') {
				<div
					class="lf-inline-preview lf-scroll prose prose-xs max-w-full dark:prose-invert"
					[innerHTML]="previewHtml()"
				></div>
			}
			@default {
				<div class="lf-inline-preview lf-scroll">
					{{ previewText() }}
				</div>
			}
		}
		@if (expanded() && showExpand()) {
			<lf-text-expand-dialog
				[value]="textValue()"
				[disabled]="disabled()"
				[label]="expandLabel()"
				(valueChange)="valueChange.emit($event)"
				(dismiss)="expanded.set(false)"
			/>
		}
	`,
	styles: `
		.lf-inline-control {
			width: 100%;
			border-radius: 0.25rem;
			border: 1px solid rgb(228 228 231);
			background: rgb(250 250 250);
			padding: 0.125rem 0.5rem;
			font-size: 10px;
			color: rgb(63 63 70);
		}
		.lf-inline-control:disabled,
		input:disabled {
			cursor: not-allowed;
		}
		:host-context([data-theme='dark']) .lf-inline-control {
			border-color: rgb(63 63 70);
			background: rgb(9 9 11);
			color: rgb(228 228 231);
		}
		/* Theme-aligned native steppers (webkit + firefox). */
		.lf-inline-control--number {
			padding-right: 0.125rem;
			-moz-appearance: textfield;
		}
		.lf-inline-control--number::-webkit-inner-spin-button,
		.lf-inline-control--number::-webkit-outer-spin-button {
			margin: 0;
			height: 1.25rem;
			opacity: 1;
			cursor: pointer;
			filter: grayscale(1) brightness(0.85);
		}
		:host-context([data-theme='dark'])
			.lf-inline-control--number::-webkit-inner-spin-button,
		:host-context([data-theme='dark'])
			.lf-inline-control--number::-webkit-outer-spin-button {
			filter: grayscale(1) invert(1) brightness(0.75);
		}
		.lf-inline-control--number:hover,
		.lf-inline-control--number:focus {
			-moz-appearance: number-input;
		}
		.lf-inline-control--number::-moz-number-spin-box {
			padding-inline: 0.125rem;
		}
		.lf-inline-control--number::-moz-number-spin-up,
		.lf-inline-control--number::-moz-number-spin-down {
			border: none;
			background: transparent;
			opacity: 0.55;
		}
		.lf-inline-control--number:hover::-moz-number-spin-up,
		.lf-inline-control--number:hover::-moz-number-spin-down,
		.lf-inline-control--number:focus::-moz-number-spin-up,
		.lf-inline-control--number:focus::-moz-number-spin-down {
			opacity: 0.85;
		}
		:host.lf-inline-field--fill {
			display: flex;
			flex: 1 1 auto;
			flex-direction: column;
			min-height: 0;
			height: 100%;
		}
		.lf-inline-expand-host {
			position: relative;
			width: 100%;
		}
		:host.lf-inline-field--fill .lf-inline-expand-host {
			display: flex;
			flex: 1 1 auto;
			flex-direction: column;
			min-height: 0;
			height: 100%;
		}
		.lf-inline-multiline {
			resize: none;
			min-height: var(--lf-multiline-min, 100px);
			max-height: 12rem;
			overflow-y: auto;
		}
		.lf-inline-expand-button {
			position: absolute;
			top: 0.125rem;
			/* Scrollbar gutter is ~11px; keep the control clear of it. */
			right: 1.5rem;
			z-index: 10;
		}
		/* Inspector sidebar: grip is safe (no node box / wires). */
		:host-context(lf-inspector-panel) .lf-inline-multiline {
			resize: vertical;
			max-height: none;
		}
		:host.lf-inline-field--fill .lf-inline-multiline {
			flex: 1 1 auto;
			height: 100%;
			max-height: none;
			/* Keep ADR-017 floor so SE resize cannot hide the field. */
			min-height: var(--lf-multiline-min, 100px);
		}
		.lf-inline-preview {
			width: 100%;
			max-width: 100%;
			min-height: 1rem;
			max-height: 10rem;
			overflow-x: hidden;
			overflow-y: auto;
			overflow-wrap: anywhere;
			border-radius: 0.25rem;
			padding: 0.125rem 0.5rem;
			font-size: 10px;
			color: rgb(24 24 27);
			white-space: pre-wrap;
			word-break: break-word;
			box-sizing: border-box;
			--tw-prose-body: rgb(24 24 27);
			--tw-prose-headings: rgb(24 24 27);
			--tw-prose-bold: rgb(24 24 27);
			--tw-prose-links: rgb(24 24 27);
			--tw-prose-counters: rgb(24 24 27);
			--tw-prose-bullets: rgb(24 24 27);
			--tw-prose-quotes: rgb(24 24 27);
			--tw-prose-captions: rgb(63 63 70);
			--tw-prose-code: rgb(24 24 27);
			--tw-prose-pre-code: rgb(24 24 27);
			--tw-prose-th-borders: rgb(212 212 216);
			--tw-prose-td-borders: rgb(228 228 231);
		}
		:host-context([data-theme='dark']) .lf-inline-preview {
			color: rgb(244 244 245);
			--tw-prose-body: rgb(244 244 245);
			--tw-prose-headings: rgb(244 244 245);
			--tw-prose-bold: rgb(244 244 245);
			--tw-prose-links: rgb(244 244 245);
			--tw-prose-counters: rgb(244 244 245);
			--tw-prose-bullets: rgb(244 244 245);
			--tw-prose-quotes: rgb(244 244 245);
			--tw-prose-captions: rgb(212 212 216);
			--tw-prose-code: rgb(244 244 245);
			--tw-prose-pre-code: rgb(244 244 245);
			--tw-prose-th-borders: rgb(63 63 70);
			--tw-prose-td-borders: rgb(63 63 70);
		}
		:host.lf-inline-field--fill .lf-inline-preview {
			flex: 1 1 auto;
			height: 100%;
			min-height: 1rem;
			max-height: none;
			min-width: 0;
			max-width: 100%;
			overflow-x: hidden;
			overflow-y: auto;
		}
		.lf-inline-multiline.lf-inline-multiline--expand,
		.lf-inline-preview.lf-inline-preview--expand,
		:host.lf-inline-field--fill
			.lf-inline-preview.lf-inline-preview--expand {
			padding-right: 3rem;
			overflow-y: scroll;
		}
		:host ::ng-deep .lf-inline-preview img,
		:host ::ng-deep .lf-inline-preview pre,
		:host ::ng-deep .lf-inline-preview table,
		:host ::ng-deep .lf-inline-preview code {
			max-width: 100%;
		}
		.lf-inline-preview--code {
			font-family: monospace;
			background: rgb(250 250 250);
		}
		:host-context([data-theme='dark']) .lf-inline-preview--code {
			background: rgb(9 9 11);
		}
		.lf-inline-preview-placeholder {
			color: rgb(161 161 170);
		}
		:host-context([data-theme='dark']) .lf-inline-preview-placeholder {
			color: rgb(113 113 122);
		}
		.lf-inline-select-caption {
			margin: 0;
			font-size: 10px;
			line-height: 1.25;
			color: rgb(100 116 139);
		}
		:host-context([data-theme='dark']) .lf-inline-select-caption {
			color: rgb(113 113 122);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfInlineFieldComponent {
	readonly config = input.required<InlineConfig>();
	readonly value = input<unknown>(undefined);
	readonly previewValue = input<unknown>(undefined);
	readonly disabled = input<boolean>(false);
	/** Canvas only: stretch textarea into flex-grown port row (ADR-017). */
	readonly fill = input<boolean>(false);
	/** Palette stubs pass false so the catalog card has no expand control. */
	readonly expandable = input<boolean>(true);
	/** Dialog title. Canvas port label or inspector field label. */
	readonly expandLabel = input<string>('Edit text');

	readonly valueChange = output<unknown>();

	readonly sameValue = sameValue;

	readonly kind = computed(() => kindOf(this.config()));
	readonly options = computed(() => {
		const config = this.config();
		const base =
			typeof config === 'string' || !('options' in config)
				? []
				: config.options;

		return withOrphanSelectOptions(base, this.value());
	});
	readonly numberConfig = computed(() => {
		const config = this.config();
		return typeof config === 'string' || config.type !== 'number'
			? undefined
			: config;
	});
	readonly multilineMinHeightPx = computed(
		() => resolveMultilineInlineLayout(this.config())?.minHeightPx,
	);
	readonly textValue = computed(() => asDisplayString(this.value()));
	readonly booleanValue = computed(() => this.value() === true);
	readonly previewText = computed(() =>
		formatPreviewValue(this.previewValue()),
	);
	readonly previewHtml = computed(() => renderMarkdown(this.previewText()));
	readonly authorMarkdownHtml = computed(() =>
		renderMarkdown(this.textValue()),
	);
	readonly markdownEditing = signal(false);
	/** UI chrome only: whether the expand dialog is open. */
	readonly expanded = signal(false);
	readonly showExpand = computed(
		() =>
			this.expandable() &&
			(this.kind() === 'text-multiline' || this.kind() === 'markdown'),
	);
	readonly markdownEditingActive = computed(
		() => this.markdownEditing() && !this.disabled(),
	);
	readonly selectedDescription = computed(() =>
		selectedSelectDescription(this.options(), this.value()),
	);
	readonly radioGroupName = `lf-inline-radio-${(radioGroupCounter += 1)}`;

	onExpandMouseDown(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
	}

	openExpand(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.expanded.set(true);
	}

	startMarkdownEdit(): void {
		if (this.disabled()) {
			return;
		}

		this.markdownEditing.set(true);
	}

	stopMarkdownEdit(): void {
		this.markdownEditing.set(false);
	}

	onNumberChange(rawValue: string): void {
		const parsed = Number(rawValue);

		if (rawValue.trim().length > 0 && !Number.isNaN(parsed)) {
			this.valueChange.emit(parsed);
		}
	}

	onSelectChange(rawIndex: string): void {
		const option = this.options()[Number(rawIndex)];

		if (option !== undefined) {
			this.valueChange.emit(option.value);
		}
	}

	isSelected(optionValue: unknown): boolean {
		const current = this.value();

		return Array.isArray(current)
			? current.some((entry) => sameValue(entry, optionValue))
			: false;
	}

	onMultiselectToggle(optionValue: unknown): void {
		const current = this.value();
		const list = Array.isArray(current) ? current : [];

		const next = this.isSelected(optionValue)
			? list.filter((entry) => !sameValue(entry, optionValue))
			: [...list, optionValue];

		this.valueChange.emit(next);
	}
}
