import { Transform } from 'class-transformer';

/** Trims string values before validation, so a blank string fails a length check. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
