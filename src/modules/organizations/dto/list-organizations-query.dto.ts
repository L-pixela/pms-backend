import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../shared/dto/pagination-query.dto';

export class ListOrganizationsQueryDto extends PaginationQueryDto {
  /** Also list soft-deleted organizations. Needs the global `organizations.read` permission. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeDeleted?: boolean;
}
