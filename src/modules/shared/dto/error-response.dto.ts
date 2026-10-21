import { ApiProperty } from '@nestjs/swagger';

/** The body Nest sends for any `HttpException`. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  /** A list for validation failures, a single sentence otherwise. */
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Validation failed',
  })
  message: string | string[];

  /** The HTTP status text, e.g. `Bad Request`. */
  error?: string;
}
