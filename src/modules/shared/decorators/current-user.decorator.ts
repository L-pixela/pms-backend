import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    context: ExecutionContext,
  ):
    | AuthenticatedUser
    | AuthenticatedUser[keyof AuthenticatedUser]
    | undefined => {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
