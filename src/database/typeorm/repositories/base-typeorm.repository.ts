import type { FindOptionsWhere, Repository } from 'typeorm';
import type { IRepository } from '../../repository.interface';

/** `findById` / `exists` / `delete` once for every TypeORM-backed aggregate. */
export abstract class BaseTypeOrmRepository<
  TEntity extends { id: string },
  TDomain,
> implements IRepository<TDomain> {
  protected constructor(protected readonly repository: Repository<TEntity>) {}

  protected abstract toDomain(entity: TEntity): TDomain;

  async findById(id: string): Promise<TDomain | null> {
    const entity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<TEntity>,
    });
    return entity ? this.toDomain(entity) : null;
  }

  exists(id: string): Promise<boolean> {
    return this.repository.exists({
      where: { id } as FindOptionsWhere<TEntity>,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id } as FindOptionsWhere<TEntity>);
  }
}
