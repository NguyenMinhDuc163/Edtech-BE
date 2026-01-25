import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { AISyllabusLessonDto } from './ai-syllabus-lesson.dto';

export class AISyllabusSectionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AISyllabusLessonDto)
  lessons!: AISyllabusLessonDto[];
}
