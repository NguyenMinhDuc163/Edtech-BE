import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatDto } from '../schema/dtos/chat.dto';
import { PublicChatDto } from '../schema/dtos/public-chat.dto';
import { AiChatDto } from '../schema/dtos/ai-chat.dto';
import { SystemParameterService } from './system-parameter.service';
import { ChatSession } from '../schema/entities/chat-session.entity';
import { ChatMessage, ChatRole } from '../schema/entities/chat-message.entity';
import { Course } from '../schema/entities/course.entity';
import { CourseContent } from '../schema/entities/course-content.entity';

@Injectable()
export class ChatService {
    private readonly geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    private readonly apiKey = process.env.API_KEY_GEMINI;
    private readonly publicApiKey = process.env.API_KEY_GEMINI_PUB;

    constructor(
        private readonly systemParamService: SystemParameterService,
        @InjectRepository(ChatSession)
        private readonly chatSessionRepo: Repository<ChatSession>,
        @InjectRepository(ChatMessage)
        private readonly chatMessageRepo: Repository<ChatMessage>,
        @InjectRepository(Course)
        private readonly courseRepo: Repository<Course>,
        @InjectRepository(CourseContent)
        private readonly courseContentRepo: Repository<CourseContent>
    ) {}

    async chat(chatDto: ChatDto): Promise<{ answer: string; rawAnswer: string }> {
        if (!this.apiKey) {
            throw new InternalServerErrorException('API key không được cấu hình');
        }

        if (!chatDto.message?.trim()) {
            throw new BadRequestException('Tin nhắn không được để trống');
        }

        try {
            const response = await fetch(this.geminiApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-goog-api-key': this.apiKey,
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: chatDto.message.trim()
                                }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API Error Response:', errorText);
                
                if (response.status === 429) {
                    try {
                        const errorData = JSON.parse(errorText);
                        const errorMessage = errorData?.error?.message || 'Đã vượt quá hạn mức sử dụng API';
                        throw new BadRequestException(`Quota đã hết: ${errorMessage}`);
                    } catch {
                        throw new BadRequestException('Đã vượt quá hạn mức sử dụng Gemini API. Vui lòng thử lại sau.');
                    }
                }
                
                throw new InternalServerErrorException(`Lỗi khi gọi Gemini API: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.candidates || data.candidates.length === 0) {
                throw new InternalServerErrorException('Không nhận được phản hồi từ Gemini');
            }

            const rawAnswer = data.candidates[0].content.parts[0].text;
            

            const formattedAnswer = rawAnswer
                ? rawAnswer.replace(/\n/g, '<br>').replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>')
                : 'Không thể tạo câu trả lời';
            
            return {
                answer: formattedAnswer,
                rawAnswer: rawAnswer
            };

        } catch (error: any) {
            console.error('Lỗi khi gọi Gemini API:', error);
            
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            

            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new InternalServerErrorException('Lỗi kết nối đến Gemini API');
            }
            
            throw new InternalServerErrorException(`Đã xảy ra lỗi khi xử lý yêu cầu chat: ${error.message}`);
        }
    }

    async publicChat(chatDto: PublicChatDto): Promise<{ answer: string; rawAnswer: string }> {
        if (!this.publicApiKey) {
            throw new InternalServerErrorException('Public API key không được cấu hình');
        }

        console.log('Using Public API Key:', this.publicApiKey.substring(0, 10) + '...');

        if (!chatDto.message?.trim()) {
            throw new BadRequestException('Tin nhắn không được để trống');
        }

        try {
            const response = await fetch(this.geminiApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-goog-api-key': this.publicApiKey,
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: chatDto.message.trim()
                                }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Gemini API Error Response:', errorText);
                
                if (response.status === 429) {
                    try {
                        const errorData = JSON.parse(errorText);
                        const errorMessage = errorData?.error?.message || 'Đã vượt quá hạn mức sử dụng API';
                        throw new BadRequestException(`Quota đã hết: ${errorMessage}`);
                    } catch {
                        throw new BadRequestException('Đã vượt quá hạn mức sử dụng Gemini API. Vui lòng thử lại sau.');
                    }
                }
                
                throw new InternalServerErrorException(`Lỗi khi gọi Gemini API: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.candidates || data.candidates.length === 0) {
                throw new InternalServerErrorException('Không nhận được phản hồi từ Gemini');
            }

            const rawAnswer = data.candidates[0].content.parts[0].text;
            

            const formattedAnswer = rawAnswer
                ? rawAnswer.replace(/\n/g, '<br>').replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>')
                : 'Không thể tạo câu trả lời';
            
            return {
                answer: formattedAnswer,
                rawAnswer: rawAnswer
            };

        } catch (error: any) {
            console.error('Lỗi khi gọi Gemini API:', error);
            
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            

            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new InternalServerErrorException('Lỗi kết nối đến Gemini API');
            }
            
            throw new InternalServerErrorException(`Đã xảy ra lỗi khi xử lý yêu cầu chat: ${error.message}`);
        }
    }

    async aiChat(aiChatDto: AiChatDto, userId: string | null): Promise<any> {
        if (!aiChatDto.prompt?.trim()) {
            throw new BadRequestException('Prompt không được để trống');
        }

        try {
            const baseUrl = aiChatDto.custom_url || await this.systemParamService.getValue('AI_CHAT_BASE_URL', '');
            const useCustomAI = baseUrl && baseUrl.trim() !== '';

            let existingSession: ChatSession | null = null;
            if (aiChatDto.session_id) {
                existingSession = await this.chatSessionRepo.findOne({
                    where: { session_id: aiChatDto.session_id }
                });

                if (existingSession && userId && existingSession.user_id !== userId) {
                    throw new BadRequestException('Session không thuộc về user này');
                }
            }

            let assistantMessage: string;
            let responseData: any;

            if (useCustomAI) {
                let systemPrompt = await this.systemParamService.getValue('AI_CHAT_SYSTEM_PROMPT', 'Bạn là giáo viên dạy lập trình');

                if (aiChatDto.course_id) {
                    const course = await this.courseRepo.findOne({
                        where: { course_id: aiChatDto.course_id },
                        select: ['title', 'description']
                    });
                    if (course) {
                        systemPrompt += `\n\nKHÓA HỌC HIỆN TẠI:\n- Tên: ${course.title}`;
                        if (course.description) {
                            systemPrompt += `\n- Mô tả: ${course.description}`;
                        }
                    }
                }

                if (aiChatDto.content_id) {
                    const content = await this.courseContentRepo.findOne({
                        where: { content_id: aiChatDto.content_id },
                        select: ['title', 'description']
                    });
                    if (content) {
                        systemPrompt += `\n\nBÀI HỌC HIỆN TẠI:\n- Tên: ${content.title}`;
                        if (content.description) {
                            systemPrompt += `\n- Mô tả: ${content.description}`;
                        }
                    }
                }

                const maxNewTokens = await this.systemParamService.getNumber('AI_CHAT_MAX_NEW_TOKENS', 2048);
                const temperature = parseFloat(await this.systemParamService.getValue('AI_CHAT_TEMPERATURE', '0.3'));
                const topP = parseFloat(await this.systemParamService.getValue('AI_CHAT_TOP_P', '0.95'));
                const doSample = (await this.systemParamService.getValue('AI_CHAT_DO_SAMPLE', 'true')) === 'true';
                const topK = await this.systemParamService.getNumber('TOP_K', 3);

                const requestBody: any = {
                    prompt: aiChatDto.prompt.trim(),
                    system: systemPrompt,
                    max_new_tokens: maxNewTokens,
                    temperature: temperature,
                    top_p: topP,
                    do_sample: doSample,
                    top_k: topK,
                };

                if (aiChatDto.session_id) {
                    requestBody.session_id = aiChatDto.session_id;
                }

                if (aiChatDto.course_id) {
                    requestBody.course_id = aiChatDto.course_id;
                }

                if (aiChatDto.content_id) {
                    requestBody.content_id = aiChatDto.content_id;
                }

                console.log('📦 Request Body:', JSON.stringify(requestBody, null, 2));

                const aiResponse = await fetch(baseUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!aiResponse.ok) {
                    const errorText = await aiResponse.text();
                    console.error('AI Service Error Response:', errorText);
                    throw new InternalServerErrorException(`Lỗi khi gọi AI service: ${aiResponse.status} - ${errorText}`);
                }

                const data = await aiResponse.json();
                responseData = data.data || data;
                assistantMessage = responseData.response_raw || responseData.response_html || '';
            } else {
                if (!this.publicApiKey) {
                    throw new InternalServerErrorException('AI server không khả dụng và Public API key không được cấu hình');
                }

                const geminiResponse = await fetch(this.geminiApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': this.publicApiKey,
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    {
                                        text: aiChatDto.prompt.trim()
                                    }
                                ]
                            }
                        ]
                    })
                });

                if (!geminiResponse.ok) {
                    const errorText = await geminiResponse.text();
                    console.error('Gemini API Error Response:', errorText);

                    if (geminiResponse.status === 429) {
                        try {
                            const errorData = JSON.parse(errorText);
                            const errorMessage = errorData?.error?.message || 'Đã vượt quá hạn mức sử dụng API';
                            throw new BadRequestException(`Quota đã hết: ${errorMessage}`);
                        } catch {
                            throw new BadRequestException('Đã vượt quá hạn mức sử dụng Gemini API. Vui lòng thử lại sau.');
                        }
                    }

                    throw new InternalServerErrorException(`Lỗi khi gọi Gemini API: ${geminiResponse.status} - ${errorText}`);
                }

                const data = await geminiResponse.json();

                if (!data.candidates || data.candidates.length === 0) {
                    throw new InternalServerErrorException('Không nhận được phản hồi từ Gemini');
                }

                const rawAnswer = data.candidates[0].content.parts[0].text;
                assistantMessage = rawAnswer || 'Không thể tạo câu trả lời';

                responseData = {
                    response_raw: rawAnswer,
                    response_html: rawAnswer ? rawAnswer.replace(/\n/g, '<br>').replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>') : 'Không thể tạo câu trả lời',
                    source: 'gemini'
                };
            }

            let session: ChatSession;

            if (existingSession) {
                session = existingSession;
            } else {
                session = this.chatSessionRepo.create({
                    user_id: userId,
                    metadata: {}
                });
                await this.chatSessionRepo.save(session);
            }

            await this.chatMessageRepo.save({
                session_id: session.session_id,
                role: ChatRole.USER,
                content: aiChatDto.prompt.trim(),
                token_count: null
            });

            await this.chatMessageRepo.save({
                session_id: session.session_id,
                role: ChatRole.ASSISTANT,
                content: assistantMessage,
                token_count: null
            });

            session.last_active_at = new Date();
            await this.chatSessionRepo.save(session);

            return {
                ...responseData,
                session_id: session.session_id
            };

        } catch (error: any) {
            console.error('Lỗi khi gọi AI service:', error);

            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }

            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new InternalServerErrorException('Lỗi kết nối đến AI service');
            }

            throw new InternalServerErrorException(`Đã xảy ra lỗi khi xử lý yêu cầu AI chat: ${error.message}`);
        }
    }

    async getUserSessions(userId: string, page: number = 1, limit: number = 10): Promise<any> {
        const skip = (page - 1) * limit;

        const [sessions, total] = await this.chatSessionRepo.findAndCount({
            where: { user_id: userId },
            order: { last_active_at: 'DESC' },
            skip,
            take: limit
        });

        const sessionsWithDetails = await Promise.all(
            sessions.map(async (session) => {
                const messageCount = await this.chatMessageRepo.count({
                    where: { session_id: session.session_id }
                });

                const firstMessage = await this.chatMessageRepo.findOne({
                    where: { session_id: session.session_id, role: ChatRole.USER },
                    order: { created_at: 'ASC' }
                });

                return {
                    session_id: session.session_id,
                    created_at: session.created_at,
                    last_active_at: session.last_active_at,
                    message_count: messageCount,
                    first_message: firstMessage?.content || null
                };
            })
        );

        return {
            sessions: sessionsWithDetails,
            total,
            page,
            limit
        };
    }

    async getSessionMessages(sessionId: string, userId: string, limit: number = 50): Promise<any> {
        const session = await this.chatSessionRepo.findOne({
            where: { session_id: sessionId }
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
            take: limit
        });

        return {
            session_id: sessionId,
            messages: messages.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at,
                token_count: msg.token_count
            }))
        };
    }

    async deleteSession(sessionId: string | null | undefined, userId: string): Promise<any> {
        if (!sessionId || sessionId.trim() === '') {
            const deletedCount = await this.chatSessionRepo.count({
                where: { user_id: userId }
            });

            await this.chatSessionRepo.delete({
                user_id: userId
            });

            return {
                message: 'Tất cả sessions đã được xóa',
                deleted_count: deletedCount
            };
        }

        const session = await this.chatSessionRepo.findOne({
            where: { session_id: sessionId }
        });

        if (!session) {
            throw new BadRequestException('Session không tồn tại');
        }

        if (session.user_id !== userId) {
            throw new BadRequestException('Session không thuộc về user này');
        }

        await this.chatSessionRepo.remove(session);

        return {
            message: 'Session đã được xóa',
            session_id: sessionId
        };
    }

    async generateSyllabus(dto: any, userId: string | null): Promise<any> {
        if (!dto.instruction?.trim()) {
            throw new BadRequestException('Instruction không được để trống');
        }

        try {
            const baseUrl = 'https://ai.nguyenduc.click';

            let existingSession: ChatSession | null = null;
            if (dto.session_id) {
                existingSession = await this.chatSessionRepo.findOne({
                    where: { session_id: dto.session_id }
                });

                if (existingSession && userId && existingSession.user_id !== userId) {
                    throw new BadRequestException('Session không thuộc về user này');
                }
            }

            const syllabusUrl = `${baseUrl.replace(/\/+$/, '')}/generate-syllabus`;
            const aiResponse = await fetch(syllabusUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: dto.instruction.trim(),
                    max_new_tokens: dto.max_new_tokens || 1024
                })
            });

            if (!aiResponse.ok) {
                const errorText = await aiResponse.text();
                console.error('AI Service Error:', errorText);
                throw new InternalServerErrorException(`Lỗi khi gọi AI service: ${aiResponse.status}`);
            }

            const data = await aiResponse.json();
            const responseData = data.data || data;
            const syllabusText = responseData.syllabus_raw || responseData.syllabus_html || '';

            let session: ChatSession;

            if (existingSession) {
                session = existingSession;
            } else {
                session = this.chatSessionRepo.create({
                    user_id: userId,
                    metadata: { type: 'syllabus' }
                });
                await this.chatSessionRepo.save(session);
            }

            await this.chatMessageRepo.save({
                session_id: session.session_id,
                role: 'user' as any,
                content: dto.instruction.trim(),
                token_count: null
            });

            await this.chatMessageRepo.save({
                session_id: session.session_id,
                role: 'assistant' as any,
                content: syllabusText,
                token_count: null
            });

            session.last_active_at = new Date();
            await this.chatSessionRepo.save(session);

            return {
                session_id: session.session_id,
                syllabus_raw: responseData.syllabus_raw,
                syllabus_html: responseData.syllabus_html
            };
        } catch (error: any) {
            console.error('Lỗi khi generate syllabus:', error);

            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }

            throw new InternalServerErrorException(`Đã xảy ra lỗi: ${error.message}`);
        }
    }
}
