import { IsOptional, IsString } from 'class-validator';

export class DeleteSessionDto {
    @IsOptional()
    @IsString()
    session_id?: string;
}

