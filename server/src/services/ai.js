// Shared Claude helper for structured evaluations (written answers, viva). Returns null when no
// API key is configured or the call fails, so every caller must keep a non-AI fallback.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

let client = null;
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const claude = () => (aiEnabled() ? (client ??= new Anthropic()) : null);

export async function structured({ system, user, schema, effort = 'medium', maxTokens = 8000 }) {
  const c = claude();
  if (!c) return null;
  try {
    const response = await c.beta.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5',
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: zodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.error('Claude evaluation error:', e.message);
    return null;
  }
}
