import 'dotenv/config';

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
    token: required('TELEGRAM_BOT_TOKEN'),
  },
  groq: {
    apiKey: required('GROQ_API_KEY'),
    model: 'llama-3.3-70b-versatile',
    maxTokens: 10,
    temperature: 0.3,
  },
  hf: {
    apiToken: required('HF_API_TOKEN'),
    model: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    apiUrl: 'https://api-inference.huggingface.co/pipeline/feature-extraction',
  },
  imgflip: {
    apiUrl: 'https://api.imgflip.com/get_memes',
  },
  search: {
    topN: 5,
  },
  maxMessageLength: 1000,
};
