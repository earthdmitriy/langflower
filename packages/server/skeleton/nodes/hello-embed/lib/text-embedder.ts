import type { EmbedHandle, EmbedTextRole } from '@langflower/node-sdk';

export type TextEmbedder = {
	readonly expectedDim?: number;
	embedTexts: (texts: readonly string[]) => Promise<readonly Float32Array[]>;
};

export const textEmbedderFromHandle = (
	handle: EmbedHandle,
	role: EmbedTextRole,
): TextEmbedder => ({
	expectedDim: handle.dim,
	embedTexts: (texts) => handle.embedTexts(texts, { role }),
});
