import { config } from '../config.ts';

export interface Meme {
  id: string;
  name: string;
  url: string;
}

interface ImgflipResponse {
  success: boolean;
  data: {
    memes: Array<{
      id: string;
      name: string;
      url: string;
    }>;
  };
}

let memesArray: Meme[] = [];
let memesPromptString = '';

export async function loadMemes(): Promise<void> {
  const response = await fetch(config.imgflip.apiUrl);
  const json: ImgflipResponse = await response.json();

  if (!json.success) {
    throw new Error('Imgflip API вернул ошибку');
  }

  memesArray = json.data.memes.map((meme) => ({
    id: meme.id,
    name: meme.name,
    url: meme.url,
  }));

  memesPromptString = memesArray
    .map((meme, i) => `${i + 1}. ${meme.name}`)
    .join('\n');

  console.log(`Загружено ${memesArray.length} мемов`);
}

export function getMemeByNumber(number: number): Meme | null {
  if (number < 1 || number > memesArray.length) {
    return null;
  }
  return memesArray[number - 1];
}

export function getMemesForPrompt(): string {
  return memesPromptString;
}
