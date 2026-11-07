const pgCode = (e: unknown): string | undefined =>
  typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;

/** O Drizzle pode encapsular o erro do driver em `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined;
  return pgCode(error) === "23505" || pgCode(cause) === "23505";
}
