import type { CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHttpContext } from '../../../test-utils/http-context';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;
  let passportCanActivate: jest.SpyInstance;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
    // The passport AuthGuard('jwt') base class.
    const passportGuard = Object.getPrototypeOf(
      JwtAuthGuard.prototype,
    ) as CanActivate;
    passportCanActivate = jest
      .spyOn(passportGuard, 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('skips authentication for @Public() routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    expect(guard.canActivate(createHttpContext())).toBe(true);
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('delegates to passport for every other route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(createHttpContext())).toBe(true);
    expect(passportCanActivate).toHaveBeenCalledTimes(1);
  });
});
