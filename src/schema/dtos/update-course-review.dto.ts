import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator';

export class UpdateCourseReviewDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(5)
    rating?: number;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    content?: string;
}
