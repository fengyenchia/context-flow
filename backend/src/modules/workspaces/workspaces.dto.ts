import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @Length(1, 255)
  name!: string;
}

export class UpdateWorkspaceDto {
  @IsString()
  @Length(1, 255)
  name!: string;
}

export class InviteMemberDto {
  @IsString()
  username!: string;

  @IsIn(['admin', 'editor', 'viewer'])
  role!: 'admin' | 'editor' | 'viewer';
}

export class UpdateMemberDto {
  @IsIn(['owner', 'admin', 'editor', 'viewer'])
  role!: 'owner' | 'admin' | 'editor' | 'viewer';
}

export class CreateProjectDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['LR', 'TB'])
  layoutDirection!: 'LR' | 'TB';
}
