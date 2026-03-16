const MAX_CHUNK_SIZE = 12000;

/**
 * Split large content into processable chunks at sentence/paragraph boundaries.
 */
export function chunkContent(content: string): string[] {
  if (content.length <= MAX_CHUNK_SIZE) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = MAX_CHUNK_SIZE;

    // Try paragraph break first
    const paragraphBreak = remaining.lastIndexOf('\n\n', MAX_CHUNK_SIZE);
    if (paragraphBreak > MAX_CHUNK_SIZE * 0.5) {
      breakPoint = paragraphBreak + 2;
    } else {
      // Try sentence break
      const sentenceBreak = remaining.lastIndexOf('. ', MAX_CHUNK_SIZE);
      if (sentenceBreak > MAX_CHUNK_SIZE * 0.5) {
        breakPoint = sentenceBreak + 2;
      }
    }

    chunks.push(remaining.substring(0, breakPoint).trim());
    remaining = remaining.substring(breakPoint).trim();
  }

  return chunks;
}
