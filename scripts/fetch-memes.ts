import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const IMGFLIP_API_URL = "https://api.imgflip.com/get_memes";
const OUTPUT_PATH = "data/memes.json";

interface ImgflipMeme {
  id: string;
  name: string;
  url: string;
}

interface ImgflipResponse {
  success: boolean;
  data: {
    memes: Array<ImgflipMeme>;
  };
}

async function fetchMemes() {
  console.log("Загрузка мемов из Imgflip API...");

  const response = await fetch(IMGFLIP_API_URL);
  const json: ImgflipResponse = await response.json();

  if (!json.success) {
    throw new Error("Imgflip API вернул ошибку");
  }

  const memes: ImgflipMeme[] = json.data.memes.map((meme) => ({
    id: meme.id,
    name: meme.name,
    url: meme.url,
  }));

  const result = {
    lastUpdated: new Date().toISOString(),
    source: "imgflip-api",
    count: memes.length,
    memes,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), "utf-8");

  console.log(`Сохранено ${memes.length} мемов в ${OUTPUT_PATH}`);
}

fetchMemes().catch((error) => {
  console.error("Ошибка загрузки мемов:", error);
  process.exit(1);
});
