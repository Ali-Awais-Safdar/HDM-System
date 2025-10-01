import { UserEntity } from "../entities/user.entity";
import { UserId } from "../value-objects/id.vo";
import { EmailAddress } from "../value-objects/email.vo";

export interface UserRepository {
  findById(id: UserId): Promise<UserEntity | null>;
  findByEmail(email: EmailAddress): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<UserEntity>;
  delete(id: UserId): Promise<void>;
}
