import { type Methodology, METHODOLOGY_DESCRIPTIONS, selectMethodology } from './methodologies.js';
import { DEFAULT_ANGLES } from './interview-map.js';

const ONBOARD_AREAS = [
  'Who You Are',
  'Work & Career',
  'Values & Principles',
  'How You Think',
  'Communication Style',
  'Relationships & Community',
  'Goals & Aspirations',
];

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  uk: 'Ukrainian',
  pt: 'Portuguese',
};

const FREE_FORM_LABELS: Record<string, string> = {
  en: 'I\'ll describe in my own words...',
  uk: 'Розкажу своїми словами...',
  pt: 'Vou descrever com minhas palavras...',
};

interface PromptContext {
  area: { area: string; answers: string[]; factsExtracted: number; isComplete: boolean };
  areaIndex: number;
  totalAreas: number;
  language: string;
  existingFacts: string[];
  lastQuestion: string | null;
  lastSuggestedAnswers: string[] | null;
}

export function buildOnboardSystemPrompt(ctx: PromptContext): string {
  const { area, areaIndex, totalAreas, language, existingFacts, lastQuestion } = ctx;
  const questionInArea = area.answers.length;
  const methodology = selectMethodology(areaIndex * 3 + questionInArea, 'explore');
  const angle = DEFAULT_ANGLES[areaIndex % DEFAULT_ANGLES.length];

  const parts: string[] = [];

  parts.push(`You are conducting an onboarding interview for me.md-kg — a personal knowledge graph system. Your goal is to learn about the user through conversational questions to populate their knowledge graph.`);

  // Language instruction
  const langName = LANGUAGE_NAMES[language] || language;
  if (language !== 'en') {
    parts.push(`\n**IMPORTANT: Respond entirely in ${langName}. All questions, acknowledgments, and suggested answers must be in ${langName}.**`);
  }

  parts.push(`\nCurrent focus area: ${area.area} (area ${areaIndex + 1} of ${totalAreas}).`);
  parts.push(`Questions asked in this area so far: ${questionInArea}`);
  parts.push(`\nInterview angle: ${angle.label} — ${angle.description}`);
  parts.push(`Question focus: ${angle.questionFocus}`);
  parts.push(`\n## Methodology\n${METHODOLOGY_DESCRIPTIONS[methodology]}`);

  // Existing graph facts
  if (existingFacts.length > 0) {
    parts.push(`\n## Known Facts (already in graph)`);
    parts.push(`You already know these facts about the user. Don't re-ask about them — go deeper or ask about gaps:`);
    existingFacts.forEach(f => parts.push(`- ${f}`));
  }

  // Previous answers in this area
  if (area.answers.length > 0) {
    parts.push(`\n## Answers in This Area`);
    parts.push(`The user has already shared the following in "${area.area}":`);
    area.answers.forEach((ans, i) => {
      const truncated = ans.length > 300 ? ans.substring(0, 300) + '...' : ans;
      parts.push(`\nAnswer ${i + 1}: "${truncated}"`);
    });
  }

  // Resume context
  if (lastQuestion) {
    parts.push(`\n## Resume Context`);
    parts.push(`Your last question was: "${lastQuestion}"`);
  }

  // Adaptive depth rules
  parts.push(`\n## Adaptive Depth Rules`);
  if (questionInArea === 0) {
    parts.push(`- This is the FIRST question for this area. Ask an open, inviting question.`);
    parts.push(`- If the user's answer is very short (< 20 words), you should ask a follow-up (do NOT mark area complete).`);
  } else if (area.answers.length >= 2 && area.factsExtracted >= 2) {
    parts.push(`- You've gotten substantial information (${area.factsExtracted} facts extracted). You MAY signal area completion.`);
    parts.push(`- To signal completion, set "areaComplete": true in your JSON response.`);
  }
  if (area.answers.length >= 2) {
    parts.push(`- After 3 answers in an area, it will automatically complete. Consider wrapping up.`);
  }

  // Response format
  const freeFormLabel = FREE_FORM_LABELS[language] || FREE_FORM_LABELS['en'];
  parts.push(`\n## Response Format`);
  parts.push(`You MUST respond with valid JSON (no markdown fences, no extra text):`);
  parts.push(`{`);
  parts.push(`  "message": "Your conversational question here (acknowledge previous answer, then ask ONE focused question)",`);
  parts.push(`  "suggestedAnswers": ["Option 1", "Option 2", "Option 3", "${freeFormLabel}"],`);
  parts.push(`  "areaComplete": false`);
  parts.push(`}`);
  parts.push(`\nRules for suggestedAnswers:`);
  parts.push(`- Provide 3-4 options that reveal DIFFERENT aspects of the topic`);
  parts.push(`- Each option should be a substantive answer (15+ words), not just a label`);
  parts.push(`- The last option should always be a free-form invitation: "${freeFormLabel}"`);
  parts.push(`- All options must be in ${langName}`);

  parts.push(`\n## Response Guidelines`);
  parts.push(`1. If this is the first question (area has no answers), introduce yourself warmly and ask the first question.`);
  parts.push(`2. For follow-ups, start with a brief acknowledgment (1-2 sentences). Reference their specific words.`);
  parts.push(`3. Ask ONE focused question about the current area. Make it contextual.`);
  parts.push(`4. Keep the message conversational — 3-5 sentences total.`);
  parts.push(`5. Use **bold** for the main question.`);

  if (areaIndex >= totalAreas - 1 && area.answers.length >= 1) {
    parts.push(`\nThis is the final area. After getting sufficient info, set "areaComplete": true and thank the user warmly.`);
  }

  return parts.join('\n');
}
