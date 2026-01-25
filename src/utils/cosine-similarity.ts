export class CosineSimilarity {
  private static readonly stopWords = new Set<string>([
    'là', 'và', 'của', 'trong', 'với', 'để', 'các', 'một', 'có', 'khi',
    'sẽ', 'từ', 'được', 'cho', 'về', 'này', 'đó', 'những', 'nhiều',
    'lại', 'cũng', 'như', 'đã', 'bạn', 'học', 'khóa', 'sau', 'trên',
    'dưới', 'trước', 'tại', 'vào', 'ra', 'ở', 'đây', 'nào', 'gì'
  ]);

  private static tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') 
      .replace(/[^a-z0-9\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 2 && !CosineSimilarity.stopWords.has(word));
  }

  static similarity(text1: string, text2: string, allDocs: string[] = []): number {
    const words1 = CosineSimilarity.tokenize(text1 || '');
    const words2 = CosineSimilarity.tokenize(text2 || '');

    if (words1.length === 0 || words2.length === 0) return 0;

    const allWords = [...new Set([...words1, ...words2])];
    const docs = [words1, words2, ...allDocs.map(t => CosineSimilarity.tokenize(t || ''))];

    // IDF
    const idf = new Map<string, number>();
    docs.forEach(doc => {
      new Set(doc).forEach(word => {
        idf.set(word, (idf.get(word) || 0) + 1);
      });
    });
    const totalDocs = docs.length || 1;
    idf.forEach((count, word) => {
      idf.set(word, Math.log(totalDocs / (1 + count)));
    });

    // Vector
    const vec1 = allWords.map(w => (words1.filter(x => x === w).length) * (idf.get(w) ?? 0));
    const vec2 = allWords.map(w => (words2.filter(x => x === w).length) * (idf.get(w) ?? 0));

    // Dot product
    const dot = vec1.reduce((sum, v, i) => sum + v * (vec2[i] ?? 0), 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0)) || 1;
    const mag2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0)) || 1;

    return dot / (mag1 * mag2);
  }
}