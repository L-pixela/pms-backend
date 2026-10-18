import type { IRepository } from '../../../database/repository.interface';
import type { User } from '../domain/user';

export interface NewUser {
  email: string;
  passwordHash: string;
  isActive: boolean;
}

export interface IUserRepository extends IRepository<User> {
  /** @throws DuplicateKeyError when the email is already taken. */
  create(user: NewUser): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
