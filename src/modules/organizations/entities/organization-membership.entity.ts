import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { OrganizationEntity } from './organization.entity';

@Entity({ name: 'organization_memberships' })
@Index(['userId', 'organizationId'], { unique: true })
export class OrganizationMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  user: UserEntity;

  @Index()
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @JoinColumn({ name: 'organization_id' })
  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: 'CASCADE' })
  organization: OrganizationEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
