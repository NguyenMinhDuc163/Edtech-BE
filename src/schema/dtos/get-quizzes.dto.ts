import { IsOptional, IsString } from 'class-validator';

export class GetQuizzesDto {
  @IsOptional()
  @IsString()
  course_id?: string;

  @IsOptional()
  @IsString()
  section_id?: string;

  @IsOptional()
  @IsString()
  lesson_id?: string;
}
