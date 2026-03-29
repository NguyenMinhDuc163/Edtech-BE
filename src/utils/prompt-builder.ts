export interface OpenAiMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatContext {
    courseTitle?: string | undefined;
    courseDescription?: string | undefined;
    contentTitle?: string | undefined;
    contentDescription?: string | undefined;
    ragChunks?: RagChunk[] | undefined;
    history?: OpenAiMessage[] | undefined;
    systemPrompt?: string | undefined;
}

export interface RagChunk {
    chunk_text: string;
    start_time?: number | null;
    end_time?: number | null;
}

export interface AdaptiveContext {
    currentContentId: string;
    currentTheta: number;
    currentTitle: string;
    currentDescription: string;
    prereqAnalysis: string;
    nextOptions: string;
}

// ── Tương đương /finetune và /base trong notebook ──────────────────────────
export function buildChatMessages(
    prompt: string,
    context: ChatContext,
    history: OpenAiMessage[] = [],
): OpenAiMessage[] {
    const systemContent =
        context.systemPrompt ||
        'Bạn là trợ lý AI giảng dạy lập trình. Giải thích đúng trọng tâm câu hỏi. Trả lời tiếng Việt, code có comment tiếng Việt.';

    let systemFull = systemContent;

    if (context.courseTitle) {
        systemFull += `\n\nKHÓA HỌC HIỆN TẠI:\n- Tên: ${context.courseTitle}`;
        if (context.courseDescription) {
            systemFull += `\n- Mô tả: ${context.courseDescription}`;
        }
    }

    if (context.contentTitle) {
        systemFull += `\n\nBÀI HỌC HIỆN TẠI:\n- Tên: ${context.contentTitle}`;
        if (context.contentDescription) {
            systemFull += `\n- Mô tả: ${context.contentDescription}`;
        }
    }

    const messages: OpenAiMessage[] = [{ role: 'system', content: systemFull }];
    messages.push(...history);
    messages.push({ role: 'user', content: prompt });

    return messages;
}

// ── Tương đương /finetune-rag và /base-rag trong notebook ──────────────────
// Notebook build RAG prompt:
//   context_parts = ["[Đoạn i [start-end]]\\nchunk_text", ...]
//   rag_prompt = "Dựa trên các đoạn transcript video...\\n{context}\\nCâu hỏi: {query}"
// Thay vì dùng embedding model, BE tự lấy chunks từ DB (full-text / filter)
// rồi inject vào đây trước khi gọi third-party.
export function buildRagMessages(
    prompt: string,
    chunks: RagChunk[],
    context: ChatContext,
    history: OpenAiMessage[] = [],
): OpenAiMessage[] {
    const systemContent =
        context.systemPrompt ||
        'Bạn là trợ lý AI chuyên phân tích và tổng hợp thông tin từ video học tập. Trả lời tiếng Việt, code có comment tiếng Việt.';

    const contextParts = chunks.map((chunk, i) => {
        let timeInfo = '';
        if (chunk.start_time != null && chunk.end_time != null) {
            timeInfo = ` [${chunk.start_time.toFixed(1)}s - ${chunk.end_time.toFixed(1)}s]`;
        }
        return `[Đoạn ${i + 1}${timeInfo}]\n${chunk.chunk_text}`;
    });

    const contextText = contextParts.join('\n\n');

    const ragPrompt = `Dựa trên các đoạn transcript video sau đây, hãy trả lời câu hỏi:\n\n${contextText}\n\nCâu hỏi: ${prompt}\n\nHãy trả lời dựa trên thông tin trong các đoạn transcript trên.`;

    const messages: OpenAiMessage[] = [{ role: 'system', content: systemContent }];
    messages.push(...history);
    messages.push({ role: 'user', content: ragPrompt });

    return messages;
}

// ── Tương đương /generate-syllabus trong notebook ─────────────────────────
export function buildSyllabusMessages(instruction: string, systemPrompt?: string): OpenAiMessage[] {
    const system = systemPrompt
        ? `${systemPrompt}\n\nKhông tự giới thiệu bản thân. Chỉ tạo syllabus theo yêu cầu, có cấu trúc rõ ràng theo từng chủ đề, bài học, mục tiêu và thời lượng. Trả lời bằng tiếng Việt.`
        : 'Bạn là chuyên gia thiết kế chương trình học lập trình. Không tự giới thiệu bản thân. Tạo syllabus chi tiết, có cấu trúc rõ ràng theo từng chủ đề, bài học, mục tiêu và thời lượng. Trả lời bằng tiếng Việt.';

    return [
        { role: 'system', content: system },
        { role: 'user', content: instruction },
    ];
}

// ── Tương đương /adaptive trong notebook ──────────────────────────────────
// Notebook: adaptive_build_messages() tạo system + user prompt dựa trên
//   knowledge_graph_subgraph, user_mastery_profile, current_context.
// Logic xây dựng prereqAnalysis và nextOptions được làm ở service (masteryService)
// rồi truyền vào đây dưới dạng string đã render.
export function buildAdaptiveMessages(ctx: AdaptiveContext): OpenAiMessage[] {
    const system = `Bạn là một giảng viên, hãy đưa ra chiến lược giúp học viên hiểu sâu và bền vững hơn về bài học
CHIẾN LƯỢC TƯ DUY:
- Đọc nội dung bài học hiện tại và các bài liên quan để hiểu kiến thức cốt lõi đang được sử dụng.
- So sánh nội dung kiến thức nền tảng với mức độ hiểu hiện tại của học viên.
  Nếu học viên chưa nắm được các khái niệm cần thiết cho bài hiện tại, việc học tiếp sẽ kém hiệu quả → ưu tiên ôn tập.
- Nếu kiến thức nền đã đủ nhưng học viên vẫn gặp khó khăn ở bài hiện tại,
  hãy xem đây là vấn đề về độ khó hoặc khả năng áp dụng → cần củng cố thêm trước khi học mới.
- Chỉ đề xuất học tiếp khi học viên thể hiện sự sẵn sàng về mặt hiểu biết,
  dựa trên mối liên hệ nội dung giữa các bài học, không chỉ dựa vào con số.

OUTPUT FORMAT (JSON Only):
{"Action": "REVIEW/REMEDIAL/NEXT", "Description": "Giải thích dựa trên mối liên hệ nội dung bài học..."}`;

    const user = `
--- BỐI CẢNH BÀI ĐANG HỌC ---
Tên bài: ${ctx.currentTitle} (ID: ${ctx.currentContentId})
Mô tả nội dung: ${ctx.currentDescription}
Kết quả hiện tại: Theta ${ctx.currentTheta}

--- PHÂN TÍCH CÁC BÀI TIỀN ĐỀ (PREREQUISITES) ---
${ctx.prereqAnalysis || 'Không có bài tiền đề (Đây là bài nhập môn).'}

--- CÁC LỰA CHỌN TIẾP THEO ---
${ctx.nextOptions || 'Không có dữ liệu bài tiếp theo.'}

Dựa trên nội dung và kết quả trên, hãy đưa ra quyết định.`;

    return [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];
}
