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
        return this.chatService.chat(chatDto);
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
        return this.chatService.aiChat(aiChatDto, userId);
    }

    // ── Legacy routes từ server Colab cũ → map về aiChat ──────────────────
    // Client gọi /finetune, /base, /base-rag, /finetune-rag đều có body { prompt, session_id?, course_id?, content_id? }
    // khớp AiChatDto nên forward thẳng, không cần transform.
    @Post('finetune')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async legacyFinetune(@Body() aiChatDto: AiChatDto, @Req() req: any) {
        const userId = req.user?.id || null;
        return this.chatService.aiChat(aiChatDto, userId);
    }

    @Post('base')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async legacyBase(@Body() aiChatDto: AiChatDto, @Req() req: any) {
        const userId = req.user?.id || null;
        return this.chatService.aiChat(aiChatDto, userId);
    }

    @Post('base-rag')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async legacyBaseRag(@Body() aiChatDto: AiChatDto, @Req() req: any) {
        const userId = req.user?.id || null;
        return this.chatService.aiChat(aiChatDto, userId);
    }

    @Post('finetune-rag')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async legacyFinetuneRag(@Body() aiChatDto: AiChatDto, @Req() req: any) {
        const userId = req.user?.id || null;
        return this.chatService.aiChat(aiChatDto, userId);
    }

    // ── Legacy /generate-syllabus → map về generateSyllabus ───────────────
    @Post('generate-syllabus')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async legacyGenerateSyllabus(@Body() dto: GenerateSyllabusDto, @Req() req: any) {
        const userId = req.user?.id || null;
        return this.chatService.generateSyllabus(dto, userId);
    }

    @Post('syllabus')
    @HttpCode(200)
    @UseGuards(OptionalJwtAuthGuard)
    async generateSyllabus(@Body() dto: GenerateSyllabusDto, @Req() req: any) {
        const userId = req.user?.id || null;
        return this.chatService.generateSyllabus(dto, userId);
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
