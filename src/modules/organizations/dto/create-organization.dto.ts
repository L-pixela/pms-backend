import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { Trim } from '../../shared/decorators/trim.decorator';

export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateOrganizationDto {
  /** Display name. */
  @Trim()
  @IsString()
  @Length(1, 200)
  name: string;

  /** URL-safe identifier, unique among live organizations. */
  @ApiProperty({
    pattern: ORGANIZATION_SLUG_PATTERN.source,
    minLength: 3,
    maxLength: 160,
    example: 'sunrise-properties',
  })
  @Trim()
  @IsString()
  @Length(3, 160)
  @Matches(ORGANIZATION_SLUG_PATTERN, {
    message:
      'slug must be lowercase letters and digits separated by single hyphens',
  })
  slug: string;
}
