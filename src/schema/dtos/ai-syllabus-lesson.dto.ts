import { IsNotEmpty, IsString } from 'class-validator';

export class AISyllabusLessonDto {
  @IsString()
  title!: string;
}
