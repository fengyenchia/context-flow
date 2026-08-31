import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @MaxLength(20_000)
  prompt!: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class SynthesizeDto {
  @IsString()
  projectId!: string;

  @IsArray()
  @IsString({ each: true })
  nodeIds!: string[];
}
