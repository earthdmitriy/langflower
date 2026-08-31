/**
 * Named secret ids for `{lf_secrets:ID}` (and `{env:VAR}` charset).
 * Boundary twin of `packages/shared/src/langflower-config/secret-id.ts`
 * — tools must not import shared; keep equal via `secret-id.parity.test.ts`.
 */
export const SECRET_ID_BODY = '[A-Za-z_][A-Za-z0-9_]*';

const SECRET_ID_RE = new RegExp(`^${SECRET_ID_BODY}$`);

export const isValidSecretId = (id: string): boolean => SECRET_ID_RE.test(id);
