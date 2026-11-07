export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: FieldIssue[] | undefined;

  constructor(code: ErrorCode, status: number, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details: FieldIssue[], message = "Dados inválidos.") {
    super("VALIDATION_ERROR", 400, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super("UNAUTHENTICATED", 401, "Autenticação necessária.");
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super("FORBIDDEN", 403, "Sem permissão.");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", 404, `${resource} não encontrado(a).`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 409, message);
  }
}
