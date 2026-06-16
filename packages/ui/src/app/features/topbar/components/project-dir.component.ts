import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { projectFolderName } from '../utils/project-folder-name';

@Component({
	selector: 'lf-project-dir',
	standalone: true,
	imports: [AsyncPipe],
	template: `
		@if (view$ | async; as view) {
			<span
				class="max-w-48 truncate rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
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
}
