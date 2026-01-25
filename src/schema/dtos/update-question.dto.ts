import { IsString, IsOptional, IsArray, IsBoolean, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAnswerDto {
  @IsOptional()
  @IsString()
  answer_id?: string; 

  @IsString()
  content!: string;

  @IsBoolean()
  is_correct!: boolean;

  @IsOptional()
  @IsString()
  explanation?: string;
}

export class UpdateQuestionDto {
  @IsString()
  quiz_id!: string; 

  @IsString()
  question_id!: string; 

  @IsOptional()
  @IsString()
  question_text?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  time_limit_sec?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAnswerDto)
  answers?: UpdateAnswerDto[];
}
