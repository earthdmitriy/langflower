/**
 * Named secret ids for the user-global KV store (`{lf_secrets:ID}`).
 * Same charset as `{env:VAR}` names. Owner of the inspector/jsonc
 * charset; tools interpolator copy is
 * [ADR-039](../../../docs/architecture/ADR.md#adr-039--dag-forced-twins-stay-copies-until-the-dag-flips).
 */
const SECRET_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const isValidSecretId = (id: string): boolean => SECRET_ID_RE.test(id);
