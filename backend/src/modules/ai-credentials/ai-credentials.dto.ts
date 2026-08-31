import { IsString, MinLength } from 'class-validator';

export class SaveGeminiCredentialDto {
  @IsString()
  @MinLength(20)
  apiKey!: string;
}
