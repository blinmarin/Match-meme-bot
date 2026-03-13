/** Результат поиска из БД */
export interface MediaCandidate {
  id: number;
  name: string;
  description: string;
  image_data: Buffer;
  type: string;
}
