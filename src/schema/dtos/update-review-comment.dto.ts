import { IsString, IsOptional } from 'class-validator';

export class UpdateReviewCommentDto {
    @IsOptional()
    @IsString()
    content?: string;
}
