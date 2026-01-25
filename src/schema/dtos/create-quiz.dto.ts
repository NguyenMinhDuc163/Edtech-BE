import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDateString, Min, Max } from 'class-validator';
import { QuizType } from '../entities/question-bank.entity';

export enum QuestionType {
  TN = 'TN',      // Trắc nghiệm
  YN = 'YN',      // Đúng/Sai  
  TL = 'TL',      // Tự luận
  FILL = 'FILL'   // Điền từ
}

export class CreateQuizDto {
  @IsString()
  quiz_title!: string;

  @IsOptional()
  @IsString()
  quiz_description?: string;

  @IsString()
  course_content!: string;

  @IsOptional()
  @IsEnum(QuizType)
  quiz_type?: QuizType;

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

  @IsOptional()
  @IsEnum(QuestionType)
  question_type?: QuestionType;
}
