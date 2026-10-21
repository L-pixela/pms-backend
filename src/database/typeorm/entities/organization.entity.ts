import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'organizations' })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Unique among live organizations only: a deleted org frees its slug.
  @Index('UQ_organizations_slug_active', {
    unique: true,
    where: '"deleted_at" IS NULL',
  })
  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Soft delete marker: set means deleted, and repository finds skip the row. */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
