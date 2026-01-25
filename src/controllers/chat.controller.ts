import { Body, Controller, Post, Get, Delete, HttpCode, UseGuards, Req, Param, Query } from '@nestjs/common';
import { ChatDto } from '../schema/dtos/chat.dto';
import { PublicChatDto } from '../schema/dtos/public-chat.dto';
import { AiChatDto } from '../schema/dtos/ai-chat.dto';
import { GenerateSyllabusDto } from '../schema/dtos/generate-syllabus.dto';
import { DeleteSessionDto } from '../schema/dtos/delete-session.dto';
import { ChatService } from '../services/chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @Post()
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async chat(@Body() chatDto: ChatDto) {
        const result = await this.chatService.chat(chatDto);

        return result;
    }

    @Post('public')
    @HttpCode(200)
    async publicChat(@Body() chatDto: PublicChatDto) {
        const result = await this.chatService.publicChat(chatDto);

        return {
            code: 200,
            message: 'OK',
            data: result,
            error: null,
        };
    }

    @Post('ai')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async aiChat(@Body() aiChatDto: AiChatDto, @Req() req: any) {
        const userId = req.user?.id || null;
        const result = await this.chatService.aiChat(aiChatDto, userId);

        return result;
    }

    @Post('syllabus')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async generateSyllabus(@Body() dto: GenerateSyllabusDto, @Req() req: any) {
        const userId = req.user?.id || null;
        const result = await this.chatService.generateSyllabus(dto, userId);

        return result;
    }

    @Get('sessions')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async getSessions(
        @Req() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        const userId = req.user.id;
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;

        return this.chatService.getUserSessions(userId, pageNum, limitNum);
    }

    @Get('sessions/:id/messages')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async getSessionMessages(
        @Req() req: any,
        @Param('id') sessionId: string,
        @Query('limit') limit?: string
    ) {
        const userId = req.user.id;
        const limitNum = limit ? parseInt(limit, 10) : 50;

        return this.chatService.getSessionMessages(sessionId, userId, limitNum);
    }

    @Delete('sessions')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async deleteSession(
        @Req() req: any,
        @Body() deleteSessionDto: DeleteSessionDto
    ) {
        const userId = req.user.id;
        const sessionId = deleteSessionDto.session_id;

        return this.chatService.deleteSession(sessionId, userId);
    }
}
