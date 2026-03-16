import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { callAnthropic, isApiKeyConfigured } from '../extraction/anthropic.js';
import { extractFacts, insertFacts } from '../extraction/extract.js';
import { buildOnboardSystemPrompt } from '../onboarding/prompts.js';

const STATE_PATH = resolve(process.env.HOME || '~', '.memd', 'onboard-state.json');

interface OnboardState {
  messageCount: number;
  previousAnswers: string[];
  isComplete: boolean;
}

function loadState(): OnboardState {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch { /* empty */ }
  return { messageCount: 0, previousAnswers: [], isComplete: false };
}

function saveState(state: OnboardState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export async function onboard(userMessage: string) {
  if (!isApiKeyConfigured()) {
    return { ok: false as const, error: 'ANTHROPIC_API_KEY required for onboarding interviews' };
  }

  const state = loadState();

  if (state.isComplete && !userMessage) {
    return {
      ok: true as const,
      data: {
        message: 'Onboarding is already complete! Use `kg_add` to add more facts or `kg_stats` to see your graph.',
        isComplete: true,
      },
    };
  }

  // Reset if requested
  if (userMessage === '--reset') {
    saveState({ messageCount: 0, previousAnswers: [], isComplete: false });
    return { ok: true as const, data: { message: 'Onboarding reset. Run `onboard` to start fresh.' } };
  }

  // If user provides a message, process it
  if (userMessage && userMessage.length > 0) {
    state.previousAnswers.push(userMessage);

    // Extract facts from the user's response
    try {
      const facts = await extractFacts(userMessage);
      if (facts.length > 0) {
        const { inserted } = insertFacts(facts, `interview:onboard_q${state.messageCount}`);
        console.error(`[onboard] Extracted and inserted ${inserted} facts from answer`);
      }
    } catch (e: any) {
      console.error(`[onboard] Fact extraction failed: ${e.message}`);
    }

    state.messageCount++;
  }

  // Check if onboarding is complete (7 areas covered)
  if (state.messageCount >= 7) {
    state.isComplete = true;
    saveState(state);

    // Generate final summary
    const systemPrompt = 'Summarize the key themes from this onboarding interview in 3-5 sentences. Mention specific facts learned.';
    const summaryContent = state.previousAnswers.map((a, i) => `Q${i + 1}: ${a}`).join('\n');

    let summary = 'Onboarding complete! Your knowledge graph has been populated.';
    try {
      summary = await callAnthropic({
        system: systemPrompt,
        messages: [{ role: 'user', content: summaryContent }],
        maxTokens: 300,
      });
    } catch { /* empty */ }

    return {
      ok: true as const,
      data: {
        message: summary,
        isComplete: true,
        factsCollected: state.previousAnswers.length,
      },
    };
  }

  // Generate next question
  const systemPrompt = buildOnboardSystemPrompt(state.messageCount, state.previousAnswers);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (state.messageCount === 0) {
    messages.push({ role: 'user', content: 'Start the onboarding interview.' });
  } else {
    messages.push({ role: 'user', content: userMessage || 'Continue the interview.' });
  }

  let response: string;
  try {
    response = await callAnthropic({
      system: systemPrompt,
      messages,
      maxTokens: 500,
      temperature: 0.7,
    });
  } catch (e: any) {
    return { ok: false as const, error: `Failed to generate question: ${e.message}` };
  }

  saveState(state);

  return {
    ok: true as const,
    data: {
      message: response,
      questionNumber: state.messageCount + 1,
      totalQuestions: 7,
      isComplete: false,
    },
  };
}
