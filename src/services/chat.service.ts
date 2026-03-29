import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ChatDto } from '../schema/dtos/chat.dto';
import { PublicChatDto } from '../schema/dtos/public-chat.dto';
import { AiChatDto } from '../schema/dtos/ai-chat.dto';
import { SystemParameterService } from './system-parameter.service';
import { ChatSession } from '../schema/entities/chat-session.entity';
import { ChatMessage, ChatRole } from '../schema/entities/chat-message.entity';
import { Course } from '../schema/entities/course.entity';
import { CourseContent } from '../schema/entities/course-content.entity';
import { AI_PROVIDER, AI_MODEL_DEFAULT, AI_MODEL_PARAM_KEY } from '../config/ai-provider';
import {
    OpenAiMessage,
    buildChatMessages,
    buildRagMessages,
    buildSyllabusMessages,
    RagChunk,
} from '../utils/prompt-builder';

// ─────────────────────────────────────────────────────────────────────────────
// Các method gọi Gemini API (chat, publicChat) đã được comment lại.
// Toàn bộ nghiệp vụ AI giờ đi qua callThirdPartyAI() → router.ndtech.io.vn/v1
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ChatService {
    // private readonly geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    // private readonly apiKey = process.env.API_KEY_GEMINI;
    // private readonly publicApiKey = process.env.API_KEY_GEMINI_PUB;

    constructor(
        private readonly systemParamService: SystemParameterService,
        @InjectRepository(ChatSession)
        private readonly chatSessionRepo: Repository<ChatSession>,
        @InjectRepository(ChatMessage)
        private readonly chatMessageRepo: Repository<ChatMessage>,
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        @InjectRepository(CourseContent)
        private readonly courseContentRepo: Repository<CourseContent>,
        private readonly dataSource: DataSource,
    ) {}

    // ── Gọi OpenAI-compatible API (router.ndtech.io.vn) ────────────────────
    private async callThirdPartyAI(
        messages: OpenAiMessage[],
        options: { max_tokens?: number; temperature?: number; top_p?: number } = {},
    ): Promise<string> {
        const url = `${AI_PROVIDER.baseUrl}${AI_PROVIDER.chatEndpoint}`;
        const model = await this.systemParamService.getValue(AI_MODEL_PARAM_KEY, AI_MODEL_DEFAULT);

        if (!AI_PROVIDER.baseUrl || !AI_PROVIDER.apiKey) {
            throw new InternalServerErrorException('Thiếu cấu hình AI_BASE_URL hoặc AI_API_KEY trong biến môi trường');
        }

        const body = {
            model,
            messages,
            max_tokens: options.max_tokens ?? 2048,
            temperature: options.temperature ?? 0.3,
            top_p: options.top_p ?? 0.95,
            stream: false,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_PROVIDER.apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429) {
                throw new BadRequestException('Đã vượt quá hạn mức sử dụng AI API. Vui lòng thử lại sau.');
            }
            throw new InternalServerErrorException(`Lỗi khi gọi AI API: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            throw new InternalServerErrorException('Không nhận được phản hồi từ AI API');
        }

        return content as string;
    }

    // ── Format HTML cho response (giữ lại từ notebook format_response_html) ─
    private formatResponseHtml(text: string): string {
        if (!text) return '';

        if (text.includes('```')) {
            const result: string[] = [];
            let inCodeBlock = false;
            let codeLang = 'python';
            const codeLines: string[] = [];

            const lines = text.split('\n');
            let i = 0;
            while (i < lines.length) {
                const line = lines[i] ?? '';
                if (line.startsWith('```')) {
                    if (!inCodeBlock) {
                        inCodeBlock = true;
                        const langMatch = line.slice(3).trim();
                        codeLang = langMatch || 'python';
                        codeLines.length = 0;
                    } else {
                        inCodeBlock = false;
                        const escaped = codeLines.join('\n')
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        result.push(`<pre><code class="language-${codeLang}">${escaped}</code></pre>`);
                        codeLines.length = 0;
                    }
                    i++;
                    continue;
                }

                if (inCodeBlock) {
                    codeLines.push(line);
                } else {
                    if (line.trim()) {
                        const escaped = line
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        result.push(`<p>${escaped}</p>`);
                    } else {
                        result.push('<br>');
                    }
                }
                i++;
            }

            if (inCodeBlock && codeLines.length > 0) {
                const escaped = codeLines.join('\n')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                result.push(`<pre><code class="language-${codeLang}">${escaped}</code></pre>`);
            }

            return result.join('');
        }

        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        return `<div>${escaped}</div>`;
    }

    // ── Lấy chunks từ DB theo full-text search hoặc filter ─────────────────
    // Thay thế embed_query + retrieve_chunks từ notebook (vốn dùng pgvector).
    // Giờ BE lấy raw text chunks rồi inject vào prompt trước khi gọi third-party.
    private async retrieveChunks(
        query: string,
        topK: number,
        courseId?: string | null,
        contentId?: string | null,
    ): Promise<RagChunk[]> {
        const k = topK || 3;

        // Ưu tiên filter theo content_id → course_id → full-text search toàn bộ
        if (contentId) {
            const rows = await this.dataSource.query(
                `SELECT chunk_text, start_time, end_time
                 FROM transcript_chunks
                 WHERE content_id = $1
                 ORDER BY chunk_index ASC
                 LIMIT $2`,
                [contentId, k],
            );
            return rows;
        }

        if (courseId) {
            const rows = await this.dataSource.query(
                `SELECT chunk_text, start_time, end_time
                 FROM transcript_chunks
                 WHERE course_id = $1
                 ORDER BY ts_rank(chunk_text_tsv, plainto_tsquery('simple', $2)) DESC, chunk_index ASC
                 LIMIT $3`,
                [courseId, query, k],
            );
            return rows;
        }

        // Không có context cụ thể → full-text search toàn bộ
        const rows = await this.dataSource.query(
            `SELECT chunk_text, start_time, end_time
             FROM transcript_chunks
             WHERE chunk_text_tsv @@ plainto_tsquery('simple', $1)
             ORDER BY ts_rank(chunk_text_tsv, plainto_tsquery('simple', $1)) DESC
             LIMIT $2`,
            [query, k],
        );
        return rows;
    }

    // ── Lấy lịch sử chat từ DB (tương đương get_history trong notebook) ────
    private async getSessionHistory(sessionId: string, limit: number = 10): Promise<OpenAiMessage[]> {
        const messages = await this.chatMessageRepo.find({
            where: { session_id: sessionId },
            order: { created_at: 'DESC' },
            take: limit,
        });

        return messages
            .reverse()
            .filter((m) => m.role === ChatRole.USER || m.role === ChatRole.ASSISTANT)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    }

    // ── Tạo hoặc reuse session ─────────────────────────────────────────────
    private async resolveSession(
        sessionId: string | undefined,
        userId: string | null,
        metadata: Record<string, any> = {},
    ): Promise<ChatSession> {
        if (sessionId) {
            const existing = await this.chatSessionRepo.findOne({
                where: { session_id: sessionId },
            });
            if (existing) {
                if (userId && existing.user_id !== userId) {
                    throw new BadRequestException('Session không thuộc về user này');
                }
                return existing;
            }
        }

        const session = this.chatSessionRepo.create({ user_id: userId, metadata });
        return this.chatSessionRepo.save(session);
    }

    // ── Lưu cặp tin nhắn user/assistant vào DB ────────────────────────────
    private async saveMessages(sessionId: string, userContent: string, assistantContent: string): Promise<void> {
        await this.chatMessageRepo.save([
            { session_id: sessionId, role: ChatRole.USER, content: userContent, token_count: null },
            { session_id: sessionId, role: ChatRole.ASSISTANT, content: assistantContent, token_count: null },
        ]);

        await this.chatSessionRepo.update({ session_id: sessionId }, { last_active_at: new Date() });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC METHODS (gọi từ ChatController)
    // ─────────────────────────────────────────────────────────────────────────

    // ── POST /chat ─────────────────────────────────────────────────────────
    // Giữ nguyên endpoint và response shape { answer, rawAnswer } để client không phải sửa.
    // Trước đây gọi Gemini (API_KEY_GEMINI), giờ gọi third-party cùng logic.
    async chat(chatDto: ChatDto): Promise<{ answer: string; rawAnswer: string }> {
        if (!chatDto.message?.trim()) {
            throw new BadRequestException('Tin nhắn không được để trống');
        }

        const messages = buildChatMessages(chatDto.message.trim(), {});
        const rawAnswer = await this.callThirdPartyAI(messages);
        const answer = this.formatResponseHtml(rawAnswer);

        return { answer, rawAnswer };
    }

    // ── POST /chat/public ──────────────────────────────────────────────────
    // Giữ nguyên endpoint và response shape { answer, rawAnswer } để client không phải sửa.
    // Trước đây gọi Gemini (API_KEY_GEMINI_PUB), giờ gọi third-party cùng logic.
    async publicChat(chatDto: PublicChatDto): Promise<{ answer: string; rawAnswer: string }> {
        if (!chatDto.message?.trim()) {
            throw new BadRequestException('Tin nhắn không được để trống');
        }

        const messages = buildChatMessages(chatDto.message.trim(), {});
        const rawAnswer = await this.callThirdPartyAI(messages);
        const answer = this.formatResponseHtml(rawAnswer);

        return { answer, rawAnswer };
    }

    // ── POST /chat/ai ──────────────────────────────────────────────────────
    // Tương đương /finetune-rag (nếu có chunks) hoặc /finetune (không có chunks)
    // trong notebook. Giờ:
    //   1. Lấy context course/content từ DB
    //   2. Lấy chunks transcript từ DB nếu có course_id hoặc content_id
    //   3. Build messages (RAG hoặc plain chat)
    //   4. Gọi third-party AI
    //   5. Lưu session + messages
    async aiChat(aiChatDto: AiChatDto, userId: string | null): Promise<any> {
        if (!aiChatDto.prompt?.trim()) {
            throw new BadRequestException('Prompt không được để trống');
        }

        try {
            const maxTokens = await this.systemParamService.getNumber('AI_CHAT_MAX_NEW_TOKENS', 2048);
            const temperature = parseFloat(await this.systemParamService.getValue('AI_CHAT_TEMPERATURE', '0.3'));
            const topP = parseFloat(await this.systemParamService.getValue('AI_CHAT_TOP_P', '0.95'));
            const topK = await this.systemParamService.getNumber('TOP_K', 3);
            const systemPrompt = await this.systemParamService.getValue(
                'AI_CHAT_SYSTEM_PROMPT',
                'Bạn là trợ lý AI giảng dạy lập trình. Giải thích đúng trọng tâm câu hỏi. Trả lời tiếng Việt, code có comment tiếng Việt.',
            );

            const session = await this.resolveSession(aiChatDto.session_id, userId);
            const history = await this.getSessionHistory(session.session_id);

            let courseTitle: string | undefined;
            let courseDescription: string | undefined;
            let contentTitle: string | undefined;
            let contentDescription: string | undefined;

            if (aiChatDto.course_id) {
                const course = await this.courseRepo.findOne({
                    where: { course_id: aiChatDto.course_id },
                    select: ['title', 'description'],
                });
                if (course) {
                    courseTitle = course.title;
                    courseDescription = course.description ?? undefined;
                }
            }

            if (aiChatDto.content_id) {
                const content = await this.courseContentRepo.findOne({
                    where: { content_id: aiChatDto.content_id },
                    select: ['title', 'description'],
                });
                if (content) {
                    contentTitle = content.title;
                    contentDescription = content.description ?? undefined;
                }
            }

            const chunks = await this.retrieveChunks(
                aiChatDto.prompt.trim(),
                topK,
                aiChatDto.course_id ?? null,
                aiChatDto.content_id ?? null,
            );

            const chatContext = {
                systemPrompt,
                ...(courseTitle !== undefined && { courseTitle }),
                ...(courseDescription !== undefined && { courseDescription }),
                ...(contentTitle !== undefined && { contentTitle }),
                ...(contentDescription !== undefined && { contentDescription }),
            };

            let messages: OpenAiMessage[];
            if (chunks.length > 0) {
                messages = buildRagMessages(aiChatDto.prompt.trim(), chunks, chatContext, history);
            } else {
                messages = buildChatMessages(aiChatDto.prompt.trim(), chatContext, history);
            }

            const rawAnswer = await this.callThirdPartyAI(messages, {
                max_tokens: maxTokens,
                temperature,
                top_p: topP,
            });

            await this.saveMessages(session.session_id, aiChatDto.prompt.trim(), rawAnswer);

            return {
                response_raw: rawAnswer,
                response_html: this.formatResponseHtml(rawAnswer),
                session_id: session.session_id,
            };
        } catch (error: any) {
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new InternalServerErrorException('Lỗi kết nối đến AI service');
            }
            throw new InternalServerErrorException(`Đã xảy ra lỗi khi xử lý yêu cầu AI chat: ${error.message}`);
        }
    }

    // ── POST /chat/syllabus ────────────────────────────────────────────────
    // Tương đương /generate-syllabus trong notebook.
    // Notebook dùng syllabus LoRA model riêng; giờ gọi third-party với
    // system prompt định hướng tạo syllabus.
    async generateSyllabus(dto: any, userId: string | null): Promise<any> {
        if (!dto.instruction?.trim()) {
            throw new BadRequestException('Instruction không được để trống');
        }

        try {
            const session = await this.resolveSession(dto.session_id, userId, { type: 'syllabus' });

            const systemPrompt = await this.systemParamService.getValue('AI_CHAT_SYSTEM_PROMPT', '');
            const messages = buildSyllabusMessages(dto.instruction.trim(), systemPrompt || undefined);

            const rawAnswer = await this.callThirdPartyAI(messages, {
                max_tokens: dto.max_new_tokens ?? 1024,
                temperature: 0.7,
            });

            await this.saveMessages(session.session_id, dto.instruction.trim(), rawAnswer);

            return {
                session_id: session.session_id,
                syllabus_raw: rawAnswer,
                syllabus_html: this.formatResponseHtml(rawAnswer),
            };
        } catch (error: any) {
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            throw new InternalServerErrorException(`Đã xảy ra lỗi: ${error.message}`);
        }
    }

    // ── GET /chat/sessions ─────────────────────────────────────────────────
    async getUserSessions(userId: string, page: number = 1, limit: number = 10): Promise<any> {
        const skip = (page - 1) * limit;

        const [sessions, total] = await this.chatSessionRepo.findAndCount({
            where: { user_id: userId },
            order: { last_active_at: 'DESC' },
            skip,
            take: limit,
        });

        const sessionsWithDetails = await Promise.all(
            sessions.map(async (session) => {
                const messageCount = await this.chatMessageRepo.count({
                    where: { session_id: session.session_id },
                });

                const firstMessage = await this.chatMessageRepo.findOne({
                    where: { session_id: session.session_id, role: ChatRole.USER },
                    order: { created_at: 'ASC' },
                });

                return {
                    session_id: session.session_id,
                    created_at: session.created_at,
                    last_active_at: session.last_active_at,
                    message_count: messageCount,
                    first_message: firstMessage?.content || null,
                };
            }),
        );

        return { sessions: sessionsWithDetails, total, page, limit };
    }

    // ── GET /chat/sessions/:id/messages ───────────────────────────────────
    async getSessionMessages(sessionId: string, userId: string, limit: number = 50): Promise<any> {
        const session = await this.chatSessionRepo.findOne({
            where: { session_id: sessionId },
        });

        if (!session) {
            throw new BadRequestException('Session không tồn tại');
        }

        if (session.user_id !== userId) {
            throw new BadRequestException('Session không thuộc về user này');
        }

        const messages = await this.chatMessageRepo.find({
            where: { session_id: sessionId },
            order: { created_at: 'ASC' },
            take: limit,
        });

        return {
            session_id: sessionId,
            messages: messages.map((msg) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at,
                token_count: msg.token_count,
            })),
        };
    }

    // ── DELETE /chat/sessions ─────────────────────────────────────────────
    async deleteSession(sessionId: string | null | undefined, userId: string): Promise<any> {
        if (!sessionId || sessionId.trim() === '') {
            const deletedCount = await this.chatSessionRepo.count({ where: { user_id: userId } });
            await this.chatSessionRepo.delete({ user_id: userId });
            return { message: 'Tất cả sessions đã được xóa', deleted_count: deletedCount };
        }

        const session = await this.chatSessionRepo.findOne({ where: { session_id: sessionId } });

        if (!session) {
            throw new BadRequestException('Session không tồn tại');
        }

        if (session.user_id !== userId) {
            throw new BadRequestException('Session không thuộc về user này');
        }

        await this.chatSessionRepo.remove(session);
        return { message: 'Session đã được xóa', session_id: sessionId };
    }
}
