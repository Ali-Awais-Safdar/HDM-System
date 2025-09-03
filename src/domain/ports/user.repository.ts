import { User } from "../entities/user.entity";
import { UserId, EmailAddress } from "../../shared/types/brand";
import { Result } from "../../shared/result/result";

export interface UserRepository {
  findById(id: UserId): Promise<Result<User | null, Error>>;
  findByEmail(email: EmailAddress): Promise<Result<User | null, Error>>;
  save(user: User): Promise<Result<User, Error>>;
  delete(id: UserId): Promise<Result<void, Error>>;
}
