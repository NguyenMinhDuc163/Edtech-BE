import { Controller, Post, HttpCode, UseGuards, Body } from '@nestjs/common';
import { RagService } from '../services/rag.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdateRagScheduleDto } from '../schema/dtos/update-rag-schedule.dto';

@Controller('rag')
export class RagController {
    constructor(private readonly ragService: RagService) {}

    @Post('trigger-chunking')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async triggerChunking() {
        const result = await this.ragService.processChunking();

        return {
            code: 200,
            message: 'Job chunking hoàn thành',
            data: result,
            error: null,
        };
    }

    @Post('update-schedule')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    async updateSchedule(@Body() dto: UpdateRagScheduleDto) {
        const result = await this.ragService.updateSchedule(dto);

        return {
            code: 200,
            message: result.message,
            data: result,
            error: null,
        };
    }
}
