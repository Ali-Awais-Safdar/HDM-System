import { Request, Response } from "express";
import { SignupUseCase } from "../../../application/use-cases/signup.use-case";
import { LoginUseCase } from "../../../application/use-cases/login.use-case";
import { signupSchema, loginSchema } from "../schemas/auth.schema";
import { handleValidationError, sendErr, sendOk } from "../errors";
import { logger } from "../../../shared/logging/logger";

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
        logger.warn({
          errors: validationResult.error.issues,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId
        }, "Signup validation failed");
        handleValidationError(res, validationResult.error);
        return;
      }

      const request = validationResult.data;

      logger.info({
        email: request.email,
        role: request.role,
        ip: req.ip,
        correlationId: req.correlationId
      }, "Starting user signup");

      // Execute use case
      const result = await this.signupUseCase.execute(request);

      if (!result.ok) {
        logger.warn({
          email: request.email,
          error: result.error.message,
          ip: req.ip,
          correlationId: req.correlationId
        }, "Signup failed");
        sendErr(res, result.error, result.error.message);
        return;
      }

      logger.info({
        userId: result.value.user.id,
        email: result.value.user.email,
        role: result.value.user.role,
        ip: req.ip,
        correlationId: req.correlationId
      }, "User signup successful");

      // Success response
      sendOk(res, result.value, 201);

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        ip: req.ip,
        correlationId: req.correlationId
      }, "Unexpected error in signup");
      sendErr(res, error);
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate request using Zod
      const validationResult = loginSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn({
          errors: validationResult.error.issues,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId: req.correlationId
        }, "Login validation failed");
        handleValidationError(res, validationResult.error);
        return;
      }

      const request = validationResult.data;

      logger.info({
        email: request.email,
        ip: req.ip,
        correlationId: req.correlationId
      }, "Starting user login");

      // Execute use case
      const result = await this.loginUseCase.execute(request);

      if (!result.ok) {
        logger.warn({
          email: request.email,
          error: result.error.message,
          ip: req.ip,
          correlationId: req.correlationId
        }, "Login failed");
        sendErr(res, result.error, result.error.message);
        return;
      }

      logger.info({
        userId: result.value.user.id,
        email: result.value.user.email,
        role: result.value.user.role,
        ip: req.ip,
        correlationId: req.correlationId
      }, "User login successful");

      // Success response
      sendOk(res, result.value, 200);

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        ip: req.ip,
        correlationId: req.correlationId
      }, "Unexpected error in login");
      sendErr(res, error);
    }
  }

}
