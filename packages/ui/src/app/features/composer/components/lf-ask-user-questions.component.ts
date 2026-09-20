import {
	ChangeDetectionStrategy,
	Component,
	effect,
	input,
	output,
	signal,
	untracked,
} from '@angular/core';
import type { AskUserQuestion } from '@langflower/shared/types/langflower-config';
import { toggleAskUserOption } from '@langflower/shared/langflower-config/format-ask-user-reply-text';

/**
 * Ordered ask_user prompts + option chips. Selection is local until Send.
 */
@Component({
	selector: 'lf-ask-user-questions',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (headline().trim().length > 0) {
			<p class="text-sm leading-5 text-zinc-800 dark:text-zinc-100">
				{{ headline() }}
			</p>
		}
		<ol class="flex flex-col gap-3">
			@for (question of questions(); track question.id) {
				<li class="flex min-w-0 flex-col gap-1.5">
					<p
						class="text-xs font-medium leading-4 text-zinc-700 dark:text-zinc-200"
					>
						{{ $index + 1 }}. {{ question.prompt }}
					</p>
					@if (question.options.length > 0) {
						<div
							class="flex min-w-0 flex-wrap gap-1.5"
							role="group"
							[attr.aria-label]="question.prompt"
						>
							@for (option of question.options; track option.id) {
								<button
									type="button"
									class="lf-composer-pill max-w-full min-h-[var(--lf-control-h)] h-auto whitespace-normal py-1 text-left"
									[class.border-zinc-900]="
										isSelected(question.id, option.id)
									"
									[class.bg-zinc-900]="
										isSelected(question.id, option.id)
									"
									[class.text-white]="
										isSelected(question.id, option.id)
									"
									[class.dark:border-zinc-100]="
										isSelected(question.id, option.id)
									"
									[class.dark:bg-zinc-100]="
										isSelected(question.id, option.id)
									"
									[class.dark:text-zinc-900]="
										isSelected(question.id, option.id)
									"
									[class.border-zinc-200]="
										!isSelected(question.id, option.id)
									"
									[class.text-zinc-700]="
										!isSelected(question.id, option.id)
									"
									[class.hover:bg-zinc-100]="
										!isSelected(question.id, option.id)
									"
									[class.dark:border-zinc-700]="
										!isSelected(question.id, option.id)
									"
									[class.dark:text-zinc-200]="
										!isSelected(question.id, option.id)
									"
									[class.dark:hover:bg-zinc-800]="
										!isSelected(question.id, option.id)
									"
									[attr.aria-pressed]="
										isSelected(question.id, option.id)
									"
									(click)="onToggle(question, option.id)"
								>
									{{ option.label }}
								</button>
							}
						</div>
					}
				</li>
			}
		</ol>
	`,
})
export class LfAskUserQuestionsComponent {
	readonly askId = input.required<string>();
	readonly headline = input('');
	readonly questions = input.required<readonly AskUserQuestion[]>();
	readonly selectionsChange =
		output<ReadonlyMap<string, readonly string[]>>();

	protected readonly selectedByQuestion = signal<
		ReadonlyMap<string, readonly string[]>
	>(new Map());

	constructor() {
		effect(() => {
			this.askId();
			untracked(() => {
				const empty = new Map<string, readonly string[]>();
				this.selectedByQuestion.set(empty);
				this.selectionsChange.emit(empty);
			});
		});
	}

	isSelected(questionId: string, optionId: string): boolean {
		return (
			this.selectedByQuestion().get(questionId)?.includes(optionId) ===
			true
		);
	}

	onToggle(question: AskUserQuestion, optionId: string): void {
		const current = this.selectedByQuestion().get(question.id) ?? [];
		const nextIds = toggleAskUserOption(question, current, optionId);
		const next = new Map(this.selectedByQuestion());
		if (nextIds.length === 0) {
			next.delete(question.id);
		} else {
			next.set(question.id, nextIds);
		}
		this.selectedByQuestion.set(next);
		this.selectionsChange.emit(next);
	}
}
