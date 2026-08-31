import { IsInt, IsString, Max, Min } from 'class-validator';

export class CreateUploadUrlDto {
  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes!: number;
}
