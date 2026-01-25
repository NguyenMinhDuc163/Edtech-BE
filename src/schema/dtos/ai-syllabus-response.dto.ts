import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AISyllabusSectionDto } from './ai-syllabus-section.dto';

export class AISyllabusResponse {
  @IsString()
  @IsNotEmpty()
  courseTitle!: string;

  @IsString()
  @IsOptional()
  objective?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AISyllabusSectionDto)
  sections!: AISyllabusSectionDto[];
}
