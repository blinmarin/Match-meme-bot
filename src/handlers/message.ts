import { Context } from "grammy";
import { selectMeme } from "../services/ai.ts";
import { getAllMemes } from "../services/meme.ts";
import { embedText, findTopCandidates } from "../services/embedding.ts";
import { config } from "../config.ts";

const ERRORS = {
  EMBEDDING_ERROR: "Сервис поиска временно недоступен, попробуй позже",
  NO_MEME: "Не могу подобрать мем, попробуй описать ситуацию иначе",
  GENERAL: "Что-то пошло не так, попробуй ещё раз",
};

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;

  if (!text || text.startsWith("/") || text.length > config.maxMessageLength) {
    return;
  }

  try {
    // 1. Эмбеддинг запроса пользователя
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedText(text);
    } catch (error) {
      console.error("Ошибка эмбеддинга:", error);
      await ctx.reply(ERRORS.EMBEDDING_ERROR);
      return;
    }

    // 2. Поиск top-N кандидатов по косинусному сходству
    const candidates = findTopCandidates(
      queryEmbedding,
      getAllMemes(),
      config.search.topN,
    );

    if (candidates.length === 0) {
      await ctx.reply(ERRORS.NO_MEME);
      return;
    }

    // 3. AI выбирает лучший мем из кандидатов
    let meme = candidates[0]; // Фоллбэк: top-1 по сходству
    try {
      const selectedNumber = await selectMeme(text, candidates);
      if (selectedNumber) {
        meme = candidates[selectedNumber - 1];
      }
    } catch (error) {
      console.error("Ошибка AI, используем top-1 по сходству:", error);
    }

    // 4. Отправка мема
    await ctx.replyWithPhoto(meme.url);
  } catch (error) {
    console.error("Ошибка обработки сообщения:", error);
    await ctx.reply(ERRORS.GENERAL);
  }
}
