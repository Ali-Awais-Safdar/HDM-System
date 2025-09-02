export type Role = "admin" | "user";

export interface AuthUser {
  id: string;          // subject (user id)
  role: Role;
  email?: string;
}