import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { stringMultilineNode } from './node.js';

describe('common-string-multiline node', () => {
	it('passes the connected value input straight through to the value output', async () => {
		const instance = stringMultilineNode.getInstance();

		instance.inputs.value.connect(of('line one\nline two'));

		await expect(
			firstValueFrom(instance.outputs.value.value$),
		).resolves.toBe('line one\nline two');
	});
});
