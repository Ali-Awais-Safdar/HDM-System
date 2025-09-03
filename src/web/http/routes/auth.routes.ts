import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { SignupUseCase } from "../../../application/use-cases/signup.use-case";
import { LoginUseCase } from "../../../application/use-cases/login.use-case";
import { AuthService } from "../../../domain/services/auth.service";
import { BcryptPasswordHasher } from "../../../infra/auth/bcrypt-password-hasher";
import { JwtServiceImpl } from "../../../infra/auth/jwt.service";
import { DrizzleUserRepository } from "../../../infra/db/repositories/user.repository";
import { db } from "../../../lib/db/connection";
import { env } from "../../../env/env";

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
