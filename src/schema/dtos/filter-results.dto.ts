import { IsOptional, IsEnum, IsString, IsNumber } from "class-validator";
import { ResultStatus } from "../entities/quiz-result.entity";
import { Type } from "class-transformer";

export class FilterResultsDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  quizId?: string;

  @IsOptional()
  @IsEnum(ResultStatus)
  status?: ResultStatus;
}

export class FilterResultsStudentDto {
  @IsOptional()
  @IsString()
  courseId?: string;
}

export class FilterTeacherStatDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  quizId?: string;
}
