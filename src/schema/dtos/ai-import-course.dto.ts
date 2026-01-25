import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { AISyllabusResponse } from './ai-syllabus-response.dto';

export class AIImportCourseDto {
  @ValidateNested()
  @Type(() => AISyllabusResponse)
  syllabus!: AISyllabusResponse;
  
  @IsOptional()
  @IsString()
  thumbnail_url?: string;
}
