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

export function buildOnboardSystemPrompt(messageCount: number, previousAnswers: string[]): string {
  const methodology = selectMethodology(messageCount, 'explore');
  const currentArea = ONBOARD_AREAS[Math.min(messageCount, ONBOARD_AREAS.length - 1)];
  const angle = DEFAULT_ANGLES[messageCount % DEFAULT_ANGLES.length];

  const parts: string[] = [];

  parts.push(`You are conducting an onboarding interview for me.md-kg — a personal knowledge graph system. Your goal is to learn about the user through conversational questions to populate their knowledge graph.`);
  parts.push(`\nCurrent focus area: ${currentArea} (question ${messageCount + 1} of ~${ONBOARD_AREAS.length}).`);
  parts.push(`\nInterview angle: ${angle.label} — ${angle.description}`);
  parts.push(`Question focus: ${angle.questionFocus}`);
  parts.push(`\n## Methodology\n${METHODOLOGY_DESCRIPTIONS[methodology]}`);

  if (previousAnswers.length > 0) {
    parts.push(`\n## Previous Answers`);
    parts.push(`Build on what the user has already shared. Reference their specific words.`);
    previousAnswers.forEach((ans, i) => {
      const area = i < ONBOARD_AREAS.length ? ONBOARD_AREAS[i] : 'General';
      const truncated = ans.length > 250 ? ans.substring(0, 250) + '...' : ans;
      parts.push(`\n**${area}:** "${truncated}"`);
    });
  }

  parts.push(`\n## Response Guidelines`);
  parts.push(`1. If this is the first question (message count 0), introduce yourself warmly and ask the first question.`);
  parts.push(`2. Start with a brief acknowledgment of what they shared (1-2 sentences). Quote their words.`);
  parts.push(`3. Ask ONE focused question about the current area. Make it contextual.`);
  parts.push(`4. Keep it conversational — 3-5 sentences total.`);
  parts.push(`5. Use **bold** for the main question.`);

  if (messageCount >= ONBOARD_AREAS.length - 1) {
    parts.push(`\nThis is the final area. After the user responds, thank them warmly and summarize key themes. Indicate the onboarding is complete.`);
  }

  return parts.join('\n');
}
