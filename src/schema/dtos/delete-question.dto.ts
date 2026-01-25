import { IsString } from 'class-validator';

export class DeleteQuestionDto {
  @IsString()
  quiz_id!: string; 

  @IsString()
  question_id!: string; 
}
