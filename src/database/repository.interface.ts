/** Operations every aggregate repository shares, whatever the storage. */
export interface IRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  exists(id: ID): Promise<boolean>;
  delete(id: ID): Promise<void>;
}
