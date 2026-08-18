import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
} from '@angular/core';
import {
	type InlineConfig,
	resolveMultilineInlineLayout,
} from '@langflower/node-sdk';
import { renderMarkdown } from '../../../utils/render-markdown.js';

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

function asDisplayString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	return typeof value === 'string' ? value : String(value);
}

type InlineKind =
	| 'text'
	| 'text-multiline'
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
				<textarea
					#control
					rows="2"
					[value]="textValue()"
					[disabled]="disabled()"
					(change)="valueChange.emit(control.value)"
					(keyup)="valueChange.emit(control.value)"
					class="lf-inline-control lf-inline-multiline lf-scroll"
					data-no-drag="true"
					data-no-pan="true"
				></textarea>
			}
			@case ('boolean') {
				<label
					class="flex items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-300"
				>
					<input
						#control
						type="checkbox"
						[checked]="booleanValue()"
						[disabled]="disabled()"
						(change)="valueChange.emit(control.checked)"
					/>
					{{ booleanValue() ? 'true' : 'false' }}
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
					class="lf-inline-preview lf-scroll prose prose-xs max-w-none dark:prose-invert"
					[innerHTML]="previewHtml()"
				></div>
			}
			@default {
				<div class="lf-inline-preview lf-scroll">
					{{ previewText() }}
				</div>
			}
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
		.lf-inline-multiline {
			resize: none;
			min-height: var(--lf-multiline-min, 100px);
			max-height: 12rem;
			overflow-y: auto;
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
			min-height: 1rem;
			max-height: 10rem;
			overflow-x: hidden;
			overflow-y: auto;
			border-radius: 0.25rem;
			padding: 0.125rem 0.5rem;
			font-size: 10px;
			color: rgb(100 116 139);
			white-space: pre-wrap;
			word-break: break-word;
			box-sizing: border-box;
		}
		.lf-inline-preview--code {
			font-family: monospace;
			background: rgb(250 250 250);
		}
		:host-context([data-theme='dark']) .lf-inline-preview--code {
			background: rgb(9 9 11);
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
	readonly selectedDescription = computed(() =>
		selectedSelectDescription(this.options(), this.value()),
	);
	readonly radioGroupName = `lf-inline-radio-${(radioGroupCounter += 1)}`;

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
