import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "../src/config.ts";
import type { BaseMeme, ImgflipResponse, RawMemesFile } from "../src/types.ts";

async function fetchMemes() {
  console.log("Загрузка мемов из Imgflip API...");

  const response = await fetch(config.imgflip.apiUrl);
  const json: ImgflipResponse = await response.json();

  if (!json.success) {
    throw new Error("Imgflip API вернул ошибку");
  }

  const memes: BaseMeme[] = json.data.memes.map((meme) => ({
    id: meme.id,
    name: meme.name,
    url: meme.url,
  }));

  const result: RawMemesFile = {
    lastUpdated: new Date().toISOString(),
    source: "imgflip-api",
    count: memes.length,
    memes,
  };

  const outputPath = config.data.rawMemesPath;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

  console.log(`Сохранено ${memes.length} мемов в ${outputPath}`);
}

fetchMemes().catch((error) => {
  console.error("Ошибка загрузки мемов:", error);
  process.exit(1);
});
