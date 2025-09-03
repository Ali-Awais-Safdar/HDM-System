import { UserId } from "../shared/types/brand";
import { UserRole } from "../domain/entities/user.entity";

export interface AuthUser {
  id: UserId;
  role: UserRole;
  email: string;
}