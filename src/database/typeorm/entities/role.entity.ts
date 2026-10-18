import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RoleScope } from '../../../modules/shared/domain/role';
import { OrganizationEntity } from './organization.entity';

/**
 * A named set of permissions.
 *
 * - `organizationId = NULL`: a platform role. `scope = global` roles are held
 *   platform-wide; `scope = organization` roles are templates any org can
 *   assign to its members.
 * - `organizationId` set: a custom role that only that org can see or assign.
 *   It is always `scope = organization`.
 */
@Entity({ name: 'roles' })
@Index('UQ_roles_platform_key', ['key'], {
  unique: true,
  where: '"organization_id" IS NULL',
})
@Index('UQ_roles_organization_key', ['organizationId', 'key'], {
  unique: true,
  where: '"organization_id" IS NOT NULL',
})
@Check(
  'CHK_roles_global_platform_wide',
  `"scope" = 'organization' OR "organization_id" IS NULL`,
)
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: RoleScope })
  scope: RoleScope;

  @Index('IDX_roles_organization_id')
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_roles_organization',
  })
  @ManyToOne(() => OrganizationEntity, { nullable: true, onDelete: 'CASCADE' })
  organization: OrganizationEntity | null;

  /** Seeded and kept in sync by the seed; read-only through the API. */
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
