import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type {
  IRefreshTokenSessionRepository,
  NewRefreshTokenSession,
} from '../../../auth/repositories/refresh-token-session.repository.interface';
import { RefreshTokenSessionEntity } from '../entities/refresh-token-session.entity';

@Injectable()
export class TypeOrmRefreshTokenSessionRepository implements IRefreshTokenSessionRepository {
  constructor(
    @InjectRepository(RefreshTokenSessionEntity)
    private readonly repository: Repository<RefreshTokenSessionEntity>,
  ) {}

  async create(session: NewRefreshTokenSession): Promise<void> {
    await this.repository.insert({ ...session, revokedAt: null });
  }

  async revokeIfValid({
    sessionId,
    userId,
    tokenHash,
  }: {
    sessionId: string;
    userId: string;
    tokenHash: string;
  }): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()' })
      .where('session_id = :sessionId', { sessionId })
      .andWhere('user_id = :userId', { userId })
      .andWhere('token_hash = :tokenHash', { tokenHash })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > now()')
      .execute();

    return result.affected === 1;
  }

  async revokeActive(sessionId: string, userId: string): Promise<void> {
    await this.repository.update(
      { sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async deleteUnusable(userId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId', { userId })
      .andWhere('(expires_at <= now() OR revoked_at IS NOT NULL)')
      .execute();
  }
}
