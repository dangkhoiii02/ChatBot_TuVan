export type AIInput = { provider?: string; apiKey?: string; model?: string; baseUrl?: string };
export type AISettings = { provider: string; apiKey: string; model: string; baseUrl: string };
export function resolveAI(input?: AIInput, env?: Record<string, string | undefined>): AISettings;
export function requestAI(settings: AISettings, system: string, prompt: string): Promise<Record<string, unknown>>;
