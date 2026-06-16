import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';

@Component({
	selector: 'lf-root',
	standalone: true,
	imports: [RouterOutlet],
	template: '<router-outlet />',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	constructor() {
		inject(ThemeService);
	}
}
