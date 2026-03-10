export interface BaseMeme {
  id: string;
  name: string;
  url: string;
}

export interface MemeWithDescription extends BaseMeme {
  description: string;
}

export interface EnrichedMeme extends MemeWithDescription {
  embedding: number[];
}

export interface IndexedMeme extends BaseMeme {
  description?: string;
  embedding?: number[];
}

export interface ImgflipResponse {
  success: boolean;
  data: {
    memes: BaseMeme[];
  };
}

export interface RawMemesFile {
  lastUpdated: string;
  source: string;
  count: number;
  memes: BaseMeme[];
}

export interface IndexedMemesFile {
  lastUpdated: string;
  model?: string;
  dimensions?: number;
  count: number;
  memes: IndexedMeme[];
}
