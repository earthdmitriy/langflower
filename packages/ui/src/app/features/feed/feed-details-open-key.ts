export const feedDetailsOpenKey = (
	visitId: string,
	segmentId: string,
	seq: number,
): string => `${visitId}:${segmentId}:${seq}`;
