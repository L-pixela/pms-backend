import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Trim } from '../../shared/decorators/trim.decorator';
import { ORGANIZATION_SLUG_PATTERN } from './create-organization.dto';

/** Fields left out stay unchanged. */
export class UpdateOrganizationDto {
  /** New display name. */
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 200)
  name?: string;

  /** New slug, unique among live organizations. */
  @ApiPropertyOptional({
    pattern: ORGANIZATION_SLUG_PATTERN.source,
    minLength: 3,
    maxLength: 160,
    example: 'sunrise-properties',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(3, 160)
  @Matches(ORGANIZATION_SLUG_PATTERN, {
    message:
      'slug must be lowercase letters and digits separated by single hyphens',
  })
  slug?: string;
}
