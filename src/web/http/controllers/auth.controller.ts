import { Request, Response } from "express";
import { SignupUseCase } from "../../../application/use-cases/signup.use-case";
import { LoginUseCase } from "../../../application/use-cases/login.use-case";
import { signupSchema, loginSchema } from "../schemas/auth.schema";
import { handleValidationError, sendErr, sendOk } from "../errors";

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
        handleValidationError(res, validationResult.error);
        return;
      }

      const request = validationResult.data;

      // Execute use case
      const result = await this.signupUseCase.execute(request);

      if (!result.ok) {
        sendErr(res, result.error, result.error.message);
        return;
      }

      // Success response
      sendOk(res, result.value, 201);

    } catch (error) {
      sendErr(res, error);
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate request using Zod
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        handleValidationError(res, validationResult.error);
        return;
      }

      const request = validationResult.data;

      // Execute use case
      const result = await this.loginUseCase.execute(request);

      if (!result.ok) {
        sendErr(res, result.error, result.error.message);
        return;
      }

      // Success response
      sendOk(res, result.value, 200);

    } catch (error) {
      sendErr(res, error);
    }
  }

}
