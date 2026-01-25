import { IsArray, ValidateNested, IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

class LessonDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsNotEmpty() type!: string;
  @IsString() @IsNotEmpty() content!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() is_preview?: 'Y' | 'N';
}

class SectionDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() is_preview?: 'Y' | 'N';
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LessonDto)
  lessons?: LessonDto[];
}

export class BulkAddSectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionDto)
  sections!: SectionDto[];
}