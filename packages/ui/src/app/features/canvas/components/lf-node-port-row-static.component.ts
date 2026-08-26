import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
	selector: 'lf-node-port-row-static',
	standalone: true,
	host: {
		class: 'lf-port-row-host',
	},
	template: `
		<div
			class="lf-port-row"
			[class.lf-port-row--in]="side() === 'in'"
			[class.lf-port-row--out]="side() === 'out'"
		>
			@if (side() === 'in' && !hidden()) {
				<div class="lf-port-anchor lf-port-anchor--in">
					<span class="lf-port-dot" aria-hidden="true"></span>
				</div>
			}

			<div class="lf-port-row__content">
				<span>{{ label() }}</span>
				<span class="text-zinc-400 dark:text-zinc-500">
					· {{ wireType() }}
				</span>
			</div>

			@if (side() === 'out') {
				<div class="lf-port-anchor lf-port-anchor--out">
					<span class="lf-port-dot" aria-hidden="true"></span>
				</div>
			}
		</div>
	`,
	styleUrl: './../styles/node-port-layout.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfNodePortRowStaticComponent {
	readonly side = input.required<'in' | 'out'>();
	readonly label = input.required<string>();
	readonly wireType = input.required<string>();
	readonly hidden = input(false);
}
