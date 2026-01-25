import { IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerSubmissionDto {
  @IsString()
  question_id!: string;

  @IsOptional()
  @IsString()
  answer_id?: string; // Cho câu hỏi trắc nghiệm

  @IsOptional()
  @IsString()
  text_answer?: string; // Cho câu hỏi tự luận
}

export class SubmitQuizDto {
  @IsString()
  quiz_id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerSubmissionDto)
  answers!: AnswerSubmissionDto[];
}
