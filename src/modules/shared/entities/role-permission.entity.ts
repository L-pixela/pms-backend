import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PermissionEntity } from './permission.entity';
import { RoleEntity } from './role.entity';

@Entity({ name: 'role_permissions' })
@Index(['roleId', 'permissionId'], { unique: true })
export class RolePermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @JoinColumn({ name: 'role_id' })
  @ManyToOne(() => RoleEntity, { nullable: false, onDelete: 'CASCADE' })
  role: RoleEntity;

  @Index()
  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId: string;

  @JoinColumn({ name: 'permission_id' })
  @ManyToOne(() => PermissionEntity, { nullable: false, onDelete: 'CASCADE' })
  permission: PermissionEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
