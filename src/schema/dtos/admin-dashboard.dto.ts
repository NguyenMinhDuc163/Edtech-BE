import { Type } from 'class-transformer';
import { IsOptional, IsISO8601, IsIn } from 'class-validator';

export type TimeGranularity = 'day' | 'month' | 'week';

export class AdminDashboardQueryDto {
  @IsOptional()
  @Type(() => Date)
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  to?: Date;

  @IsOptional()
  @IsIn(['day', 'month', 'week'])
  granularity?: TimeGranularity;
}
