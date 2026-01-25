import { IsNotEmpty, IsString } from 'class-validator';

export class AIGenerateCourseDto {
  @IsString()
  @IsNotEmpty()
  instruction!: string;
}
