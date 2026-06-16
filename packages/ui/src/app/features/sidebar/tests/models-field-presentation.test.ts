import { describe, expect, it } from 'vitest';
import { resolveModelsFieldPresentation } from '../models-field-presentation';

describe('resolveModelsFieldPresentation', () => {
	it('shows a muted loading caption while refresh is in flight', () => {
		expect(resolveModelsFieldPresentation(0, { loading: true })).toEqual({
			disabled: false,
			emptyHint: 'Loading models…',
		});
	});

	it('disables the select with a red field error when fetch fails and options are empty', () => {
		expect(
			resolveModelsFieldPresentation(0, {
				loading: false,
				error: 'Provider credentials missing',
			}),
		).toEqual({
			disabled: true,
			fieldError: 'Provider credentials missing',
		});
	});

	it('uses a fallback error message when the server error string is blank', () => {
		expect(
			resolveModelsFieldPresentation(0, {
				loading: false,
				error: '   ',
			}),
		).toEqual({
			disabled: true,
			fieldError: 'No models available for this provider',
		});
	});

	it('keeps the select enabled with a muted warning when static options remain', () => {
		expect(
			resolveModelsFieldPresentation(2, {
				loading: false,
				error: 'upstream timeout',
			}),
		).toEqual({
			disabled: false,
			emptyHint:
				'Live catalog unavailable — using static models. upstream timeout',
		});
	});

	it('shows a muted empty hint when options are empty without an error', () => {
		expect(resolveModelsFieldPresentation(0, { loading: false })).toEqual({
			disabled: false,
			emptyHint: 'No models available for this provider',
		});
	});

	it('returns no caption when options exist and refresh succeeded', () => {
		expect(resolveModelsFieldPresentation(3, { loading: false })).toEqual({
			disabled: false,
		});
	});
});
