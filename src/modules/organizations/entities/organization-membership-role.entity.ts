import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoleEntity } from '../../shared/entities/role.entity';
import { OrganizationMembershipEntity } from './organization-membership.entity';

@Entity({ name: 'organization_membership_roles' })
@Index(['membershipId', 'roleId'], { unique: true })
export class OrganizationMembershipRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId: string;

  @JoinColumn({ name: 'membership_id' })
  @ManyToOne(() => OrganizationMembershipEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  membership: OrganizationMembershipEntity;

  @Index()
  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @JoinColumn({ name: 'role_id' })
  @ManyToOne(() => RoleEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  role: RoleEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
