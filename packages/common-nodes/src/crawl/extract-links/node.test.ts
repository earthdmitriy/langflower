import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { extractLinksNode } from './node.js';

describe('common-extract-links', () => {
	it('emits absolute links offline', async () => {
		const instance = extractLinksNode.getInstance();

		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'links-1',
				params: {},
				uiSchema: extractLinksNode.uiSchema,
			}),
		);
		instance.inputs.html.connect(
			of(
				'<a href="/a">A</a><a href="https://other.example/b">B</a><a href="#skip">x</a>',
			),
		);
		instance.inputs.baseUrl.connect(of('https://example.com/start'));

		await expect(
			firstValueFrom(instance.outputs.links.value$),
		).resolves.toEqual([
			'https://example.com/a',
			'https://other.example/b',
		]);
	});
});
