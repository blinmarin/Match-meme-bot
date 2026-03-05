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
  imgflip: {
    apiUrl: 'https://api.imgflip.com/get_memes',
  },
  maxMessageLength: 1000,
};
