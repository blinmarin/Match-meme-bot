import { Context } from 'grammy';
import { selectMeme } from '../services/ai.ts';
import { getMemeByNumber, getMemesForPrompt } from '../services/meme.ts';
import { config } from '../config.ts';

const ERRORS = {
  AI_ERROR: 'AI временно недоступен, попробуй позже',
  NO_MEME: 'Не могу подобрать мем, попробуй описать ситуацию иначе',
  GENERAL: 'Что-то пошло не так, попробуй ещё раз',
};

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;

  if (!text || text.startsWith('/') || text.length > config.maxMessageLength) {
    return;
  }

  try {
    const memeList = getMemesForPrompt();
    const memeNumber = await selectMeme(text, memeList);

    if (!memeNumber) {
      await ctx.reply(ERRORS.AI_ERROR);
      return;
    }

    const meme = getMemeByNumber(memeNumber);

    if (!meme) {
      await ctx.reply(ERRORS.NO_MEME);
      return;
    }

    await ctx.replyWithPhoto(meme.url);
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
    await ctx.reply(ERRORS.GENERAL);
  }
}
