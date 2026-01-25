import {IsString, IsOptional, IsArray, IsBoolean, ValidateNested, IsNumber, Min} from 'class-validator';
import {Type} from 'class-transformer';

export class CreateAnswerDto {
    @IsString()
    content!: string;

    @IsBoolean()
    is_correct!: boolean;

    @IsOptional()
    @IsString()
    explanation?: string;
}

export class CreateQuestionDto {
    @IsString()
    question_text!: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    time_limit_sec?: number;

    @IsArray()
    @ValidateNested({each: true})
    @Type(() => CreateAnswerDto)
    answers!: CreateAnswerDto[];
}


export class CreateQuestionsDto {
    @IsString()
    quiz_id!: string; 

    @IsArray()
    @ValidateNested({each: true})
    @Type(() => CreateQuestionDto)
    questions!: CreateQuestionDto[];
}
