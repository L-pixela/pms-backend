export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
