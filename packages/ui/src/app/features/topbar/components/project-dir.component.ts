import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { projectFolderName } from '../utils/project-folder-name';
import { formatDocumentTitle } from '../utils/project-identity';

@Component({
	selector: 'lf-project-dir',
	standalone: true,
	imports: [AsyncPipe],
	host: {
		class: 'inline-flex items-center',
	},
	template: `
		@if (view$ | async; as view) {
			<span
				class="inline-flex max-w-64 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200"
				[title]="view.fullPath"
				[attr.aria-label]="'Project directory: ' + view.fullPath"
			>
				{{ view.folderName }}
			</span>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDirComponent {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly view$ = this.bridge.cached['toolConfig.snapshot'].pipe(
		map((payload) => ({
			folderName: projectFolderName(payload.config.projectDir),
			fullPath: payload.config.projectDir,
		})),
	);

	constructor() {
		this.bridge.cached['toolConfig.snapshot']
			.pipe(takeUntilDestroyed())
			.subscribe((payload) => {
				document.title = formatDocumentTitle(
					projectFolderName(payload.config.projectDir),
				);
			});
	}
}
