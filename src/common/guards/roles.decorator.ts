import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'role';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
