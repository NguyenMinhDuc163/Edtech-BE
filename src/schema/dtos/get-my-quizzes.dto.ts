import { IsOptional, IsString, IsEnum } from 'class-validator';
import { QuizStatus } from '../entities/question-bank.entity';

export class GetMyQuizzesDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus;
}
