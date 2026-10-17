import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RoleScope {
  GLOBAL = 'global',
  ORGANIZATION = 'organization',
}

@Entity({ name: 'roles' })
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: RoleScope })
  scope: RoleScope;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
