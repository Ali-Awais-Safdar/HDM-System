import { UserId } from "../shared/types/brand";
import { Role } from "@domain/user/user.entity";

export interface AuthUser {
  id: UserId;
  roles: Role[];
  email: string;
}
