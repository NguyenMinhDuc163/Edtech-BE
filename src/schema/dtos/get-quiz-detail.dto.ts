import { IsString } from 'class-validator';

export class GetQuizDetailDto {
  @IsString()
  quiz_id!: string;
}
