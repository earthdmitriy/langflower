export const l2Normalize = (values: readonly number[]): Float32Array => {
	const out = new Float32Array(values.length);
	let sumSq = 0;
	for (let i = 0; i < values.length; i += 1) {
		const n = values[i] ?? 0;
		out[i] = n;
		sumSq += n * n;
	}
	const norm = Math.sqrt(sumSq);
	if (norm === 0) {
		return out;
	}
	const scale = 1 / norm;
	for (let i = 0; i < out.length; i += 1) {
		out[i] = (out[i] ?? 0) * scale;
	}
	return out;
};

export const float32ToBlob = (values: Float32Array): Uint8Array => {
	const bytes = new Uint8Array(values.byteLength);
	bytes.set(
		new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
	);
	return bytes;
};

export const blobToFloat32 = (blob: Uint8Array): Float32Array => {
	const copy = new Uint8Array(blob.byteLength);
	copy.set(blob);
	return new Float32Array(copy.buffer);
};

export type VecIndex = {
	readonly sqlitePath: string;
	readonly mtimeMs: number;
	readonly dim: number;
	readonly ids: readonly string[];
	readonly matrix: Float32Array;
};

const vecCache = new Map<string, VecIndex>();

export const loadVecIndex = (
	sqlitePath: string,
	rows: readonly {
		readonly id: string;
		readonly dim: number;
		readonly vector: Uint8Array;
	}[],
	mtimeMs: number,
): VecIndex => {
	const cached = vecCache.get(sqlitePath);
	if (cached !== undefined && cached.mtimeMs === mtimeMs) {
		return cached;
	}
	if (rows.length === 0) {
		const empty: VecIndex = {
			sqlitePath,
			mtimeMs,
			dim: 0,
			ids: [],
			matrix: new Float32Array(0),
		};
		vecCache.set(sqlitePath, empty);
		return empty;
	}
	const dim = rows[0]?.dim ?? 0;
	const ids: string[] = [];
	const matrix = new Float32Array(rows.length * dim);
	rows.forEach((row, index) => {
		if (row.dim !== dim) {
			throw new Error(
				`chunk_vec dim mismatch: ${String(row.dim)} vs ${String(dim)} at ${row.id}`,
			);
		}
		ids.push(row.id);
		const floats = blobToFloat32(row.vector);
		if (floats.length !== dim) {
			throw new Error(
				`chunk_vec blob length ${String(floats.length)} != dim ${String(dim)} at ${row.id}`,
			);
		}
		matrix.set(floats, index * dim);
	});
	const index: VecIndex = {
		sqlitePath,
		mtimeMs,
		dim,
		ids,
		matrix,
	};
	vecCache.set(sqlitePath, index);
	return index;
};

export const topCosine = (
	index: VecIndex,
	query: Float32Array,
	limit: number,
): readonly { readonly id: string; readonly score: number }[] => {
	if (index.dim === 0 || index.ids.length === 0) {
		return [];
	}
	if (query.length !== index.dim) {
		return [];
	}
	const scored: { id: string; score: number }[] = [];
	for (let row = 0; row < index.ids.length; row += 1) {
		const offset = row * index.dim;
		let sum = 0;
		for (let i = 0; i < index.dim; i += 1) {
			sum += (query[i] ?? 0) * (index.matrix[offset + i] ?? 0);
		}
		const id = index.ids[row];
		if (id !== undefined) {
			scored.push({ id, score: sum });
		}
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, Math.max(0, limit));
};

export const clearVecCache = (): void => {
	vecCache.clear();
};
