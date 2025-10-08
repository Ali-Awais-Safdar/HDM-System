import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { SignupUseCase } from "../../../app/application/workflow/signup.use-case";
import { LoginUseCase } from "../../../app/application/workflow/login.use-case";
import { AuthService } from "../../../app/domain/services/auth.service";
import { BcryptPasswordHasher } from "../../../app/infra/services/bcrypt-password-hasher";
import { JwtServiceImpl } from "../../../app/infra/services/jwt.service";
import { DrizzleUserRepository } from "../../../app/infra/repositories/user.repository";
import { db } from "../../../app/infra/services/db/connection";
import { env } from "../../../app/infra/config/env";

/**
 * Authentication routes factory.
 * Sets up dependency injection and creates the router.
 */
export function createAuthRoutes(): Router {
  const router = Router();

  // Infrastructure dependencies
  const passwordHasher = new BcryptPasswordHasher();
  const jwtService = new JwtServiceImpl(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const userRepository = new DrizzleUserRepository(db);

  // Domain services
  const authService = new AuthService(passwordHasher, userRepository);

  // Application use cases
  const signupUseCase = new SignupUseCase(authService, jwtService);
  const loginUseCase = new LoginUseCase(authService, jwtService);

  // Controller
  const authController = new AuthController(signupUseCase, loginUseCase);

  // Routes
  router.post("/signup", authController.signup.bind(authController));
  router.post("/login", authController.login.bind(authController));

  return router;
}

export const authRouter = createAuthRoutes();
