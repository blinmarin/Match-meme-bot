import OpenAI from "openai";
import { config } from "../config.ts";
import type { MediaCandidate } from "../types.ts";

const client = new OpenAI({
  apiKey: config.groq.apiKey,
  baseURL: config.groq.baseUrl,
});

const SEARCH_QUERY_PROMPT = `You are an expert at understanding emotions and social situations.

The user will describe a situation in any language. Your task:
1. Identify the core emotions (frustration, joy, shock, cringe, pride, etc.)
2. Identify the expected reaction (facepalm, laughter, crying, screaming, etc.)
3. Think about what kind of meme/GIF reaction would fit (e.g. "someone facepalming", "dramatic shocked face", "evil laugh")

Reply with a short English search query (max 15 words) combining the emotions, reactions, and visual description of an ideal meme.
Do not describe the original situation. Focus on emotions and reactions only.

Examples:
- "My cat knocked over the trash" → "frustration facepalm annoyed reaction why do I even bother"
- "Got promoted at work" → "celebration victory dance excited happy proud moment"
- "Reading war news" → "horror shock fear disturbing scared terrified reaction"`;

const SYSTEM_PROMPT_TEMPLATE = `You are an internet meme expert with a great sense of humor.

The user will describe a situation in any language. You are given up to {MAX_N} candidate memes with descriptions.
Your task:
1. Understand the emotion and context of the situation
2. Consider the cultural context and "meme logic" — which meme is actually used in such situations
3. Pick the best fitting meme
4. Reply with ONLY the meme number (a single number from 1 to {MAX_N})

Do not write anything except the number. Just the number.

Candidate memes:
{CANDIDATES_LIST}`;

/** Извлекает эмоции и контекст из ситуации для поиска по эмбеддингам */
export async function extractSearchQuery(situation: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: config.groq.model,
    temperature: 0.3,
    max_tokens: 50,
    messages: [
      { role: "system", content: SEARCH_QUERY_PROMPT },
      { role: "user", content: situation },
    ],
  });

  return response.choices[0].message.content?.trim() ?? situation;
}

function formatCandidates(candidates: MediaCandidate[]): string {
  return candidates
    .map((m, i) => `${i + 1}. ${m.name} — ${m.description}`)
    .join("\n");
}

export async function selectMeme(
  situation: string,
  candidates: MediaCandidate[],
): Promise<number | null> {
  const candidatesList = formatCandidates(candidates);
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
    "{CANDIDATES_LIST}",
    candidatesList,
  ).replace("{MAX_N}", String(candidates.length));

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
