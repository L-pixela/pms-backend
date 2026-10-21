/** Operations every aggregate repository shares, whatever the storage. */
export interface IRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  exists(id: ID): Promise<boolean>;
  delete(id: ID): Promise<void>;
}

/** Which slice of a list to return. */
export interface PageRequest {
  limit: number;
  offset: number;
}

/** One page of a list plus the size of the whole list. */
export interface Paginated<T> {
  items: T[];
  total: number;
}
