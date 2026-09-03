import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class CanvasSnapshotDto {
  @IsArray()
  nodes!: unknown[];

  @IsArray()
  edges!: unknown[];

  @IsArray()
  @IsOptional()
  resources?: unknown[];

  @IsArray()
  @IsOptional()
  convergenceNodes?: unknown[];

  @IsArray()
  @IsOptional()
  convergenceEdges?: unknown[];

  @IsObject()
  @IsOptional()
  conversations?: Record<string, string[]>;

  @IsString()
  @IsOptional()
  summary?: string;
}
