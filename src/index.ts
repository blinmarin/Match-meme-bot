import { bot } from './bot.ts';
import { loadMemes, loadGifs } from './services/meme.ts';

async function main() {
  console.log('Starting Meme Match Bot...');

  loadMemes();
  loadGifs();

  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());

  bot.start();
  console.log('Bot is running...');
}

main().catch(console.error);
