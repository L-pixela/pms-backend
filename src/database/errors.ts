/** Thrown by a repository when a write violates a unique constraint. */
export class DuplicateKeyError extends Error {
  constructor(message = 'Duplicate key.') {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}

/** Thrown by a repository when a write references a row that no longer exists. */
export class MissingReferenceError extends Error {
  constructor(message = 'Referenced row does not exist.') {
    super(message);
    this.name = 'MissingReferenceError';
  }
}
