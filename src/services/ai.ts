import OpenAI from "openai";
import { config } from "../config.ts";

const client = new OpenAI({
  apiKey: config.groq.apiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

const SYSTEM_PROMPT_TEMPLATE = `You are an internet meme expert with a great sense of humor.

The user will describe a situation in any language. Your task:
1. Understand the emotion and context of the situation
2. Pick the meme from the list that fits best
3. Reply with ONLY the meme number (a single number)

Do not write anything except the number. Just the number.

Meme list:
{MEME_LIST}`;

export async function selectMeme(
  situation: string,
  memeList: string,
): Promise<number | null> {
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{MEME_LIST}", memeList);

  const response = await client.chat.completions.create({
    model: config.groq.model,
    temperature: config.groq.temperature,
    max_tokens: config.groq.maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Situation: ${situation}\n\nWhich meme fits best?`,
      },
    ],
  });

  const content = response.choices[0].message.content?.trim();
  console.log(
    `AI ответ: "${content}" для ситуации: "${situation.slice(0, 50)}..."`,
  );

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
