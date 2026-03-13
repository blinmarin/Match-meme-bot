import { bot } from "./bot.ts";
import { checkConnection } from "./services/db.ts";

async function main() {
  console.log("Starting Meme Match Bot...");

  await checkConnection();

  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());

  bot.start();
  console.log("Bot is running...");
}

main().catch(console.error);
