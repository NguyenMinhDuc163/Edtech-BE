import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class UpdateRagScheduleDto {
    @IsOptional()
    @IsString()
    is_schedule?: string;

    @IsOptional()
    @IsInt()
    @Min(60)
    schedule_seconds?: number;
}
