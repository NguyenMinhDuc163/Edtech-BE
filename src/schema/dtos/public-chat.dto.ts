import { IsString, IsNotEmpty } from 'class-validator';

export class PublicChatDto {
    @IsString()
    @IsNotEmpty()
    message!: string;
}
