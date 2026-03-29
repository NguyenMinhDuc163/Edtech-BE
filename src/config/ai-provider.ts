export const AI_PROVIDER = {
    baseUrl: process.env.AI_BASE_URL ?? '',
    apiKey: process.env.AI_API_KEY ?? '',
    chatEndpoint: process.env.AI_CHAT_ENDPOINT ?? '/chat/completions',
} as const;

export const AI_MODEL_PARAM_KEY = 'AI_CHAT_MODEL';
export const AI_MODEL_DEFAULT = 'ag/gemini-3-flash';
