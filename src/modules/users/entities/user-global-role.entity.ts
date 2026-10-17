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
import { UserEntity } from './user.entity';

@Entity({ name: 'user_global_roles' })
@Index(['userId', 'roleId'], { unique: true })
export class UserGlobalRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  user: UserEntity;

  @Index()
  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @JoinColumn({ name: 'role_id' })
  @ManyToOne(() => RoleEntity, { nullable: false, onDelete: 'CASCADE' })
  role: RoleEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
