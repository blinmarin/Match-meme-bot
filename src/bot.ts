import { Bot } from 'grammy';
import { config } from './config.ts';
import { handleMessage, handleCallback } from './handlers/message.ts';

export const bot = new Bot(config.telegram.token);

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Привет! Я подберу мем или GIF под твою ситуацию.\n\n' +
    'Просто опиши что произошло — я предложу выбрать формат!'
  );
});

bot.on('message:text', handleMessage);

bot.callbackQuery(/^pick:(meme|gif)$/, handleCallback);

bot.catch((err) => {
  console.error('Ошибка бота:', err);
});
