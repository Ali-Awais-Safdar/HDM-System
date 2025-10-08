import { z } from "zod";
import { errorResponseSchema } from "./common";

/**
 * Zod schemas for authentication endpoints.
 */

export const signupSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .min(1, "Email is required")
    .max(254, "Email cannot exceed 254 characters"),
    
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password cannot exceed 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/\d/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
    
  role: z
    .enum(["admin", "user"])
    .optional()
    .default("user")
});

export const loginSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .min(1, "Email is required"),
    
  password: z
    .string()
    .min(1, "Password is required")
});

// Response schemas for documentation and validation
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(["admin", "user"]),
    createdAt: z.date().or(z.string().datetime())
  })
});

// Re-export common schemas for convenience
export { errorResponseSchema } from "./common";

// TypeScript types derived from schemas
export type SignupRequest = z.infer<typeof signupSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
