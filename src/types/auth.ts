import { UserId } from "../shared/types/brand";
import { UserRole, Role } from "../domain/entities/user.entity";

export interface AuthUser {
  id: UserId;
  roles: Role[];
  email: string;
  // Backwards compatibility - computed property
  role: UserRole;
}