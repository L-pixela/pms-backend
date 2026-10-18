import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { User } from '../../../modules/users/domain/user';
import type {
  IUserRepository,
  NewUser,
} from '../../../modules/users/repositories/user.repository.interface';
import { DuplicateKeyError } from '../../errors';
import { UserEntity } from '../entities/user.entity';
import { toUser } from '../mappers';
import { isUniqueViolation } from '../postgres-errors';
import { BaseTypeOrmRepository } from './base-typeorm.repository';

@Injectable()
export class TypeOrmUserRepository
  extends BaseTypeOrmRepository<UserEntity, User>
  implements IUserRepository
{
  constructor(
    @InjectRepository(UserEntity) repository: Repository<UserEntity>,
  ) {
    super(repository);
  }

  protected toDomain(entity: UserEntity): User {
    return toUser(entity);
  }

  async create(user: NewUser): Promise<User> {
    try {
      const saved = await this.repository.save(this.repository.create(user));
      return toUser(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError('Email is already registered.');
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.repository.findOne({ where: { email } });
    return entity ? toUser(entity) : null;
  }
}
