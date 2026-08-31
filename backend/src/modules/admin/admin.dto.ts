import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}

export class UpdateUserRoleDto {
  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';
}
