import OpenAI from 'openai';
import { config } from '../config.ts';

const client = new OpenAI({
  apiKey: config.groq.apiKey,
  baseURL: 'https://api.groq.com/openai/v1',
});

const SYSTEM_PROMPT_TEMPLATE = `Ты — эксперт по интернет-мемам с отличным чувством юмора.

Пользователь опишет ситуацию на любом языке. Твоя задача:
1. Понять эмоцию и контекст ситуации
2. Выбрать мем из списка, который лучше всего подходит
3. Ответить ТОЛЬКО номером мема (одно число)

Не пиши ничего кроме номера. Только число.

Список мемов:
{MEME_LIST}`;

export async function selectMeme(situation: string, memeList: string): Promise<number | null> {
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{MEME_LIST}', memeList);

  const response = await client.chat.completions.create({
    model: config.groq.model,
    temperature: config.groq.temperature,
    max_tokens: config.groq.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Ситуация: ${situation}\n\nКакой мем лучше всего подходит? Ответь только номером.` },
    ],
  });

  const content = response.choices[0].message.content?.trim();
  console.log(`AI ответ: "${content}" для ситуации: "${situation.slice(0, 50)}..."`);

  if (!content) {
    return null;
  }

  const match = content.match(/\d+/);
  if (!match) {
    return null;
  }

  const number = parseInt(match[0], 10);
  if (number < 1) {
    return null;
  }

  return number;
}
