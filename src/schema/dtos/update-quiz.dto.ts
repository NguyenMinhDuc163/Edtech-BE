import { IsOptional, IsEnum, IsString, IsNumber, IsBoolean, IsDateString, Min, Max } from 'class-validator';
import { QuizType, QuizStatus } from '../entities/question-bank.entity';

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  quiz_title?: string;

  @IsOptional()
  @IsString()
  quiz_description?: string;

  @IsOptional()
  @IsString()
  course_content?: string;

  @IsOptional()
  @IsEnum(QuizType)
  quiz_type?: QuizType;

  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passing_score?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_attempts?: number;

  @IsOptional()
  @IsBoolean()
  is_random_order?: boolean;

  @IsOptional()
  @IsBoolean()
  is_shuffle_answers?: boolean;

  @IsOptional()
  @IsDateString()
  start_time?: string;

  @IsOptional()
  @IsDateString()
  end_time?: string;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;
}
