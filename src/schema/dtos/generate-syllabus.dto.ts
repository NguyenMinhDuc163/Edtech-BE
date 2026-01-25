import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';

export class GenerateSyllabusDto {
    @IsString()
    @IsNotEmpty()
    instruction!: string;

    @IsOptional()
    @IsInt()
    @Min(256)
    @Max(4096)
    max_new_tokens?: number;

    @IsOptional()
    @IsString()
    session_id?: string;
}
