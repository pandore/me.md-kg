import { readFileSync } from 'node:fs';

export interface ParsedFact {
  source: { name: string; type: string };
  relation: string;
  target: { name: string; type: string };
  summary: string;
  confidence: number;
  provenance: string;
}

/**
 * Parse a MEMORY.md or USER.md file into structured facts.
 * Handles sections, bullets, key-value pairs.
 */
export function parseMarkdownFile(filePath: string, provenance: string, userName?: string): ParsedFact[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  return parseMarkdown(content, provenance, userName);
}

export function parseMarkdown(content: string, provenance: string, initialUserName?: string): ParsedFact[] {
  const facts: ParsedFact[] = [];
  const lines = content.split('\n');
  let currentSection = 'General';
  let userName = initialUserName || 'User';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section headers
    const headerMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      continue;
    }

    // Skip markdown frontmatter delimiters, links, and metadata
    if (trimmed === '---' || trimmed.startsWith('[') || trimmed.startsWith('<!--')) continue;

    // Key: Value pairs (e.g., "Name: Oleksii", "Location: Lisbon")
    const kvMatch = trimmed.match(/^[-*]?\s*\**([A-Za-z][A-Za-z\s]+?)\**\s*:\s*(.+)/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase();
      const value = kvMatch[2].trim();
      // Override userName when Name: is found
      if (key === 'name' && value) {
        userName = value;
      }
      const fact = keyValueToFact(key, value, userName, currentSection, provenance);
      if (fact) facts.push(fact);
      continue;
    }

    // Bullet points — treat as general facts
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      const bulletText = bulletMatch[1].trim();
      if (bulletText.length > 10) {
        const fact = bulletToFact(bulletText, userName, currentSection, provenance);
        if (fact) facts.push(fact);
      }
      continue;
    }

    // Plain text lines in a section — treat as descriptions
    if (trimmed.length > 20 && currentSection !== 'General') {
      facts.push({
        source: { name: userName, type: 'person' },
        relation: 'has_context',
        target: { name: currentSection, type: 'concept' },
        summary: trimmed,
        confidence: 0.6,
        provenance,
      });
    }
  }

  return facts;
}

function keyValueToFact(key: string, value: string, userName: string, _section: string, provenance: string): ParsedFact | null {
  const keyMap: Record<string, { relation: string; targetType: string }> = {
    'name': { relation: 'has_name', targetType: 'concept' },
    'location': { relation: 'lives_in', targetType: 'place' },
    'city': { relation: 'lives_in', targetType: 'place' },
    'country': { relation: 'lives_in', targetType: 'place' },
    'company': { relation: 'works_at', targetType: 'organization' },
    'employer': { relation: 'works_at', targetType: 'organization' },
    'role': { relation: 'has_role', targetType: 'concept' },
    'title': { relation: 'has_role', targetType: 'concept' },
    'occupation': { relation: 'has_role', targetType: 'concept' },
    'email': { relation: 'has_contact', targetType: 'contact' },
    'phone': { relation: 'has_contact', targetType: 'contact' },
    'language': { relation: 'speaks', targetType: 'skill' },
    'languages': { relation: 'speaks', targetType: 'skill' },
    'nationality': { relation: 'has_nationality', targetType: 'concept' },
    'age': { relation: 'has_property', targetType: 'concept' },
    'birthday': { relation: 'has_property', targetType: 'concept' },
    'doctor': { relation: 'has_doctor', targetType: 'doctor' },
    'preference': { relation: 'prefers', targetType: 'preference' },
  };

  const mapping = keyMap[key];
  if (mapping) {
    return {
      source: { name: userName, type: 'person' },
      relation: mapping.relation,
      target: { name: value, type: mapping.targetType },
      summary: `${key}: ${value}`,
      confidence: 0.85,
      provenance,
    };
  }

  // Generic key-value — store as property
  return {
    source: { name: userName, type: 'person' },
    relation: 'has_property',
    target: { name: `${key}: ${value}`, type: 'concept' },
    summary: `${key}: ${value}`,
    confidence: 0.7,
    provenance,
  };
}

function bulletToFact(text: string, userName: string, _section: string, provenance: string): ParsedFact | null {
  const lower = text.toLowerCase();

  // Try to detect relationships from text
  if (/\b(works?\s+at|employed\s+at|founder\s+of|ceo\s+of|cto\s+of)\b/i.test(text)) {
    const orgMatch = text.match(/(?:works?\s+at|employed\s+at|founder\s+of|ceo\s+of|cto\s+of)\s+(.+)/i);
    if (orgMatch) {
      return {
        source: { name: userName, type: 'person' },
        relation: 'works_at',
        target: { name: orgMatch[1].trim(), type: 'organization' },
        summary: text,
        confidence: 0.8,
        provenance,
      };
    }
  }

  if (/\b(lives?\s+in|based\s+in|moved\s+to|relocated\s+to)\b/i.test(text)) {
    const placeMatch = text.match(/(?:lives?\s+in|based\s+in|moved\s+to|relocated\s+to)\s+(.+)/i);
    if (placeMatch) {
      return {
        source: { name: userName, type: 'person' },
        relation: 'lives_in',
        target: { name: placeMatch[1].trim(), type: 'place' },
        summary: text,
        confidence: 0.8,
        provenance,
      };
    }
  }

  if (/\b(uses|using|subscriber|customer)\b/i.test(text)) {
    return {
      source: { name: userName, type: 'person' },
      relation: 'uses',
      target: { name: text, type: 'service' },
      summary: text,
      confidence: 0.65,
      provenance,
    };
  }

  if (/\b(values?|believes?|principle|philosophy)\b/i.test(lower)) {
    return {
      source: { name: userName, type: 'person' },
      relation: 'values',
      target: { name: text, type: 'value' },
      summary: text,
      confidence: 0.7,
      provenance,
    };
  }

  if (/\b(prefers?|likes?|enjoys?|loves?)\b/i.test(lower)) {
    return {
      source: { name: userName, type: 'person' },
      relation: 'prefers',
      target: { name: text, type: 'preference' },
      summary: text,
      confidence: 0.7,
      provenance,
    };
  }

  // Ukrainian patterns
  if (/(?:працює\s+(?:в|на)|засновник)\s+(.+)/i.test(text)) {
    const match = text.match(/(?:працює\s+(?:в|на)|засновник)\s+(.+)/i);
    if (match) {
      return {
        source: { name: userName, type: 'person' },
        relation: 'works_at',
        target: { name: match[1].trim(), type: 'organization' },
        summary: text,
        confidence: 0.75,
        provenance,
      };
    }
  }

  if (/(?:живе\s+в|переїхав\s+(?:до|в))\s+(.+)/i.test(text)) {
    const match = text.match(/(?:живе\s+в|переїхав\s+(?:до|в))\s+(.+)/i);
    if (match) {
      return {
        source: { name: userName, type: 'person' },
        relation: 'lives_in',
        target: { name: match[1].trim(), type: 'place' },
        summary: text,
        confidence: 0.75,
        provenance,
      };
    }
  }

  // Portuguese patterns
  if (/(?:trabalha\s+(?:em|na|no)|fundador\s+(?:de|da|do))\s+(.+)/i.test(text)) {
    const match = text.match(/(?:trabalha\s+(?:em|na|no)|fundador\s+(?:de|da|do))\s+(.+)/i);
    if (match) {
      return {
        source: { name: userName, type: 'person' },
        relation: 'works_at',
        target: { name: match[1].trim(), type: 'organization' },
        summary: text,
        confidence: 0.75,
        provenance,
      };
    }
  }

  if (/(?:mora\s+(?:em|na|no)|mudou\s+para)\s+(.+)/i.test(text)) {
    const match = text.match(/(?:mora\s+(?:em|na|no)|mudou\s+para)\s+(.+)/i);
    if (match) {
      return {
        source: { name: userName, type: 'person' },
        relation: 'lives_in',
        target: { name: match[1].trim(), type: 'place' },
        summary: text,
        confidence: 0.75,
        provenance,
      };
    }
  }

  // Default: general fact
  return {
    source: { name: userName, type: 'person' },
    relation: 'has_fact',
    target: { name: text.substring(0, 100), type: 'concept' },
    summary: text,
    confidence: 0.6,
    provenance,
  };
}
