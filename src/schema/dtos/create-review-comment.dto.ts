import { IsString, IsNotEmpty } from 'class-validator';

export class CreateReviewCommentDto {
    @IsString()
    @IsNotEmpty()
    content!: string;
}
