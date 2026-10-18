import { IsOptional, IsUUID } from 'class-validator';

export class MyPermissionsQueryDto {
  /** Omit for platform-wide permissions only. */
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
