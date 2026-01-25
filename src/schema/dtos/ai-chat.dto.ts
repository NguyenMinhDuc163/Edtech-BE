import { IsString, IsNotEmpty, IsOptional, IsNumberString } from 'class-validator';

export class AiChatDto {
    @IsString()
    @IsNotEmpty()
    prompt!: string;

    @IsOptional()
    @IsNumberString()
    session_id?: string;

    @IsOptional()
    @IsNumberString()
    course_id?: string;

    @IsOptional()
    @IsNumberString()
    content_id?: string;

    @IsOptional()
    @IsString()
    custom_url?: string;
}
