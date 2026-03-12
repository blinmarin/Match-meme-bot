import { Context, InlineKeyboard } from "grammy";
import { selectMeme } from "../services/ai.ts";
import { getAllMemes, getAllGifs } from "../services/meme.ts";
import { embedText, findTopCandidates } from "../services/embedding.ts";
import { config } from "../config.ts";

const ERRORS = {
  EMBEDDING_ERROR: "Сервис поиска временно недоступен, попробуй позже",
  NO_RESULT: "Не могу подобрать результат, попробуй описать ситуацию иначе",
  NO_PENDING: "Сначала опиши ситуацию",
  GENERAL: "Что-то пошло не так, попробуй ещё раз",
};

const pendingSituations = new Map<number, { text: string; embedding: number[] }>();

const keyboard = new InlineKeyboard()
  .text("Мем", "pick:meme")
  .text("GIF", "pick:gif");

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text || text.startsWith("/") || text.length > config.maxMessageLength) {
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedText(text);
    } catch (error) {
      console.error("Ошибка эмбеддинга:", error);
      await ctx.reply(ERRORS.EMBEDDING_ERROR);
      return;
    }

    pendingSituations.set(chatId, { text, embedding: queryEmbedding });

    await ctx.reply("Что подобрать?", { reply_markup: keyboard });
  } catch (error) {
    console.error("Ошибка обработки сообщения:", error);
    await ctx.reply(ERRORS.GENERAL);
  }
}

export async function handleCallback(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const data = ctx.callbackQuery?.data;

  if (!chatId || !data) return;

  const pending = pendingSituations.get(chatId);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: ERRORS.NO_PENDING });
    return;
  }

  await ctx.answerCallbackQuery();
  pendingSituations.delete(chatId);

  const isGif = data === "pick:gif";
  const collection = isGif ? getAllGifs() : getAllMemes();

  try {
    const candidates = findTopCandidates(
      pending.embedding,
      collection,
      config.search.topN,
    );

    if (candidates.length === 0) {
      await ctx.reply(ERRORS.NO_RESULT);
      return;
    }

    let result = candidates[0];
    try {
      const selectedNumber = await selectMeme(pending.text, candidates);
      if (selectedNumber) {
        result = candidates[selectedNumber - 1];
      }
    } catch (error) {
      console.error("Ошибка AI, используем top-1 по сходству:", error);
    }

    if (isGif) {
      await ctx.replyWithAnimation(result.url);
    } else {
      await ctx.replyWithPhoto(result.url);
    }
  } catch (error) {
    console.error("Ошибка выбора контента:", error);
    await ctx.reply(ERRORS.GENERAL);
  }
}
