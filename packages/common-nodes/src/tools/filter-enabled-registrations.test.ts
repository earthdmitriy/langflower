import { describe, expect, it } from 'vitest';
import { filterEnabledRegistrations } from './filter-enabled-registrations.js';

type Registration = { readonly toolId: string };

const idOf = (registration: Registration): string => registration.toolId;

describe('filterEnabledRegistrations', () => {
	const registrations: readonly Registration[] = [
		{ toolId: 'grep' },
		{ toolId: 'read_file' },
	];

	it('returns all registrations when allowlist is unset', () => {
		expect(
			filterEnabledRegistrations(registrations, undefined, idOf),
		).toEqual(registrations);
	});

	it('returns none when allowlist is empty', () => {
		expect(filterEnabledRegistrations(registrations, [], idOf)).toEqual([]);
	});

	it('keeps only allowlisted registrations', () => {
		expect(
			filterEnabledRegistrations(registrations, ['grep'], idOf),
		).toEqual([{ toolId: 'grep' }]);
	});
});
