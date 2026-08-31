import { IsNotEmpty, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'Username may only contain letters, numbers, _, . and -' })
  username!: string;

  @IsString()
  @Length(1, 100)
  displayName!: string;

  @IsString()
  @MinLength(10)
  password!: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  newPassword!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}

export class ResetPasswordDto {
  @IsString()
  resetCode!: string;

  @IsString()
  @MinLength(10)
  newPassword!: string;
}
