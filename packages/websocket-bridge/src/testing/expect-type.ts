/** Compile-time equality — resolves to `true` or `never`. */
export type ExpectEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <U>() => U extends B ? 1 : 2
		? true
		: never;

export function assertTypeEqual<_T extends true>(): void {
	// compile-time assertion helper
}
