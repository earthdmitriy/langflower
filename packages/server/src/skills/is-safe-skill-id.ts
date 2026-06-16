/** Rejects path traversal and non–single-segment skill ids. */
export const isSafeSkillId = (skillId: string): boolean =>
	skillId.length > 0 &&
	!skillId.includes('/') &&
	!skillId.includes('\\') &&
	skillId !== '.' &&
	skillId !== '..' &&
	!skillId.includes('..');
