/**
 * Postgres reports a unique constraint violation as SQLSTATE 23505. `pg`
 * surfaces it on the error object rather than throwing a typed error, so the
 * check has to be structural.
 *
 * O Drizzle embrulha o erro do `pg` num `DrizzleQueryError` e guarda o
 * original em `cause`, então olhar só o objeto de fora devolve 500 onde
 * deveria devolver 409. A checagem desce a cadeia de causas.
 */
export function isUniqueViolation(error: unknown, constraint?: string) {
  let candidate: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!candidate || typeof candidate !== "object") return false;

    const shaped = candidate as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (shaped.code === "23505") {
      return constraint ? shaped.constraint === constraint : true;
    }

    candidate = shaped.cause;
  }

  return false;
}
