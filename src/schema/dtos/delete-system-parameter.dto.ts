import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class DeleteSystemParameterDto {
  @IsArray({ message: 'param_ids phải là một mảng' })
  @IsString({ each: true, message: 'Mỗi param_id phải là chuỗi' })
  @IsNotEmpty({ each: true, message: 'param_id không được để trống' })
  param_ids!: string[];
}
