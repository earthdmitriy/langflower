import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { concatNode } from './node.js';

describe('common-concat node', () => {
	it('replaces literal \\n in separator with a line break', async () => {
		const instance = concatNode.getInstance();

		instance.inputs.separator.connect(of('\\n'));
		instance.inputs.value.connect(of(['a', 'b', 'c']));

		await expect(
			firstValueFrom(instance.outputs.value.value$),
		).resolves.toBe('a\nb\nc');
	});

	it('joins with a plain separator unchanged', async () => {
		const instance = concatNode.getInstance();

		instance.inputs.separator.connect(of(', '));
		instance.inputs.value.connect(of(['a', 'b', 'c']));

		await expect(
			firstValueFrom(instance.outputs.value.value$),
		).resolves.toBe('a, b, c');
	});
});
