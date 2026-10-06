const UNIQUE_VIOLATION = '23505';

/**
 * True when `error` is a Postgres unique violation, optionally on a specific
 * constraint or index. Drizzle wraps driver errors, so the cause is checked too.
 */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    const { code, constraint: name } = e as Error & {
      code?: string;
      constraint?: string;
    };
    if (code === UNIQUE_VIOLATION) return !constraint || name === constraint;
  }
  return false;
}
