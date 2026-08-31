/**
 * Named secret ids for the user-global KV store (`{lf_secrets:ID}`).
 * Same charset as `{env:VAR}` names.
 */
const SECRET_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const isValidSecretId = (id: string): boolean => SECRET_ID_RE.test(id);
