import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Ошибка: переменная окружения ${name} не задана`);
    process.exit(1);
  }
  return value;
}

export const config = {
  telegram: {
    get token(): string {
      return required("TELEGRAM_BOT_TOKEN");
    },
  },
  groq: {
    get apiKey(): string {
      return required("GROQ_API_KEY");
    },
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    maxTokens: 10,
    temperature: 0.3,
  },
  hf: {
    get apiToken(): string {
      return required("HF_API_TOKEN");
    },
    model: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    apiUrl: "https://router.huggingface.co/hf-inference/models",
    embeddingDimensions: 384,
    coldStartDelayMs: 20_000,
  },
  imgflip: {
    apiUrl: "https://api.imgflip.com/get_memes",
    templatesUrl: "https://imgflip.com/memetemplates",
    gifTemplatesUrl: "https://imgflip.com/gif-templates",
  },
  search: {
    topN: 5,
  },
  data: {
    rawMemesPath: "data/memes.json",
    indexedMemesPath: "data/memes-indexed.json",
    rawGifsPath: "data/gifs.json",
    indexedGifsPath: "data/gifs-indexed.json",
  },
  maxMessageLength: 1000,
};
