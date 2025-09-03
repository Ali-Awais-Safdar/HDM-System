import { Request, Response } from "express";
import { SignupUseCase } from "../../../application/use-cases/signup.use-case";
import { LoginUseCase } from "../../../application/use-cases/login.use-case";
import { signupSchema, loginSchema } from "../schemas/auth.schema";

/**
 * Authentication controller handling signup and login endpoints.
 * Follows clean architecture principles with proper error handling.
 */
export class AuthController {
  constructor(
    private readonly signupUseCase: SignupUseCase,
    private readonly loginUseCase: LoginUseCase
  ) {}

  async signup(req: Request, res: Response): Promise<void> {
    try {
      // Validate request using Zod
      const validationResult = signupSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(422).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: validationResult.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
        return;
      }

      const request = validationResult.data;

      // Execute use case
      const result = await this.signupUseCase.execute(request);

      if (!result.ok) {
        // Determine appropriate status code based on error type
        const statusCode = this.getErrorStatusCode(result.error.message);
        res.status(statusCode).json({
          error: result.error.message,
          code: "SIGNUP_ERROR"
        });
        return;
      }

      // Success response
      res.status(201).json(result.value);

    } catch {
      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR"
      });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate request using Zod
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(422).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: validationResult.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
        return;
      }

      const request = validationResult.data;

      // Execute use case
      const result = await this.loginUseCase.execute(request);

      if (!result.ok) {
        res.status(401).json({
          error: result.error.message,
          code: "LOGIN_ERROR"
        });
        return;
      }

      // Success response
      res.status(200).json(result.value);

    } catch {
      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR"
      });
    }
  }

  private getErrorStatusCode(errorMessage: string): number {
    if (errorMessage.includes("already exists")) {
      return 409; // Conflict
    }
    if (errorMessage.includes("Invalid") || errorMessage.includes("must")) {
      return 400; // Bad Request
    }
    return 500; // Internal Server Error
  }
}
