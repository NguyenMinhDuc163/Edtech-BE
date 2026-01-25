import { IsArray, IsNotEmpty, IsString, ArrayMinSize, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class BatchPendingChangeDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Type(() => String)
  pendingChangeIds: string[] | undefined; 

  @IsOptional()
  @IsString()
  reason?: string; 
}