export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  constructor(message: string, status = 400, code = "APP_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}
