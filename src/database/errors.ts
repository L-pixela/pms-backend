/** Thrown by a repository when a write violates a unique constraint. */
export class DuplicateKeyError extends Error {
  constructor(message = 'Duplicate key.') {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}
