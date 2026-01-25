import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSearchHistoryDto {
  @IsNotEmpty({ message: 'Keyword không được để trống' })
  @IsString()
  @MaxLength(255)
  keyword!: string;
}
