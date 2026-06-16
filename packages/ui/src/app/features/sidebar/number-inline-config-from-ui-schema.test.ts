import { describe, expect, it } from 'vitest';
import { numberInlineConfigFromUiSchema } from './number-inline-config-from-ui-schema.js';

describe('numberInlineConfigFromUiSchema', () => {
	it('forwards min, max, and step onto InlineConfig number', () => {
		expect(
			numberInlineConfigFromUiSchema({
				min: 0,
				max: 64,
				step: 1,
			}),
		).toEqual({
			type: 'number',
			min: 0,
			max: 64,
			step: 1,
		});
	});

	it('omits undefined constraints', () => {
		expect(numberInlineConfigFromUiSchema({})).toEqual({
			type: 'number',
		});
		expect(numberInlineConfigFromUiSchema({ min: 0 })).toEqual({
			type: 'number',
			min: 0,
		});
	});
});
