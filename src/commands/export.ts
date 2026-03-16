import { exportAsMarkdown } from '../export/markdown.js';
import { exportAsClaudeMd } from '../export/claude-md.js';
import { exportAsJson } from '../export/json.js';

export function exportKg(format: string, tagsStr?: string) {
  const tags = tagsStr ? tagsStr.split(',').map(s => s.trim()) : undefined;

  switch (format) {
    case 'md':
    case 'markdown': {
      const md = exportAsMarkdown(tags);
      return { ok: true as const, data: { format: 'markdown', content: md } };
    }
    case 'claude':
    case 'claude-md': {
      const md = exportAsClaudeMd(tags);
      return { ok: true as const, data: { format: 'claude-md', content: md } };
    }
    case 'json': {
      const json = exportAsJson(tags);
      return { ok: true as const, data: { format: 'json', content: json } };
    }
    default:
      return { ok: false as const, error: `Unknown format: ${format}. Use: md, claude, json` };
  }
}
