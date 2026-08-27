export const SCHEMA_SQL = `
CREATE TABLE chunk (
	id TEXT PRIMARY KEY,
	path TEXT NOT NULL,
	heading TEXT NOT NULL,
	text TEXT NOT NULL,
	embed_text TEXT NOT NULL
);

CREATE TABLE chunk_vec (
	id TEXT PRIMARY KEY REFERENCES chunk(id),
	dim INTEGER NOT NULL,
	vector BLOB NOT NULL
);

CREATE VIRTUAL TABLE chunk_fts USING fts5(
	id UNINDEXED,
	heading,
	text
);
`.trim();
