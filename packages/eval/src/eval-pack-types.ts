export type EvalScorerKind = 'exact' | 'includes';

export type EvalCase = {
	readonly id: string;
	readonly input: string;
	readonly expected: string;
	readonly scorer?: EvalScorerKind;
};

export type EvalPack = {
	readonly id: string;
	readonly threshold: number;
	readonly scorer: EvalScorerKind;
	readonly skillPath?: string;
	readonly cases: readonly EvalCase[];
};
