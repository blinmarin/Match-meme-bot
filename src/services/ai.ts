import OpenAI from "openai";
import { config } from "../config.ts";
import type { EnrichedMeme } from "./meme.ts";

const client = new OpenAI({
  apiKey: config.groq.apiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

const SYSTEM_PROMPT_TEMPLATE = `You are an internet meme expert with a great sense of humor.

The user will describe a situation in any language. You are given 5 candidate memes with descriptions.
Your task:
1. Understand the emotion and context of the situation
2. Consider the cultural context and "meme logic" — which meme is actually used in such situations
3. Pick the best fitting meme
4. Reply with ONLY the meme number (a single number from 1 to 5)

Do not write anything except the number. Just the number.

Candidate memes:
{CANDIDATES_LIST}`;

function formatCandidates(candidates: EnrichedMeme[]): string {
  return candidates
    .map((m, i) => `${i + 1}. ${m.name} — ${m.description}`)
    .join("\n");
}

export async function selectMeme(
  situation: string,
  candidates: EnrichedMeme[],
): Promise<number | null> {
  const candidatesList = formatCandidates(candidates);
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
    "{CANDIDATES_LIST}",
    candidatesList,
  );

  const response = await client.chat.completions.create({
    model: config.groq.model,
    temperature: config.groq.temperature,
    max_tokens: config.groq.maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Situation: ${situation}\n\nWhich meme fits best? Reply with only the number.`,
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
  if (number < 1 || number > candidates.length) {
    return null;
  }

  return number;
}
