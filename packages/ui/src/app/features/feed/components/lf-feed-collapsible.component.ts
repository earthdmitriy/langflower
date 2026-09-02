import {
	ChangeDetectionStrategy,
	Component,
	input,
	model,
} from '@angular/core';
import { formatPortValue } from '../../../utils/format-port-value.js';

@Component({
	selector: 'lf-feed-collapsible',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<details
			[class]="
				'min-w-0 w-full max-w-full text-[11px] text-zinc-500 dark:text-zinc-400 ' +
				detailsClass()
			"
			[open]="open()"
			(toggle)="onToggle($event)"
		>
			<summary
				[class]="
					'cursor-pointer select-none list-none truncate [&::-webkit-details-marker]:hidden ' +
					summaryClass()
				"
			>
				{{ summary() }}
			</summary>
			@if (open()) {
				<pre
					class="max-w-full min-w-0 whitespace-pre-wrap break-words font-sans [overflow-wrap:anywhere]"
					[class]="bodyClass()"
					>{{ formatPortValue(value()) }}</pre>
			}
		</details>
	`,
})
export class LfFeedCollapsibleComponent {
	readonly open = model(false);
	readonly summary = input.required<string>();
	readonly value = input.required<unknown>();
	readonly detailsClass = input('');
	readonly summaryClass = input('');
	readonly bodyClass = input('mt-1');
	readonly formatPortValue = formatPortValue;

	onToggle(event: Event): void {
		const target = event.target;
		if (!(target instanceof HTMLDetailsElement)) {
			return;
		}

		this.open.set(target.open);
	}
}
