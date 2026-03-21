import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { callAnthropic, isApiKeyConfigured } from '../extraction/anthropic.js';
import { extractFacts, insertFacts } from '../extraction/extract.js';
import { buildOnboardSystemPrompt } from '../onboarding/prompts.js';
import { getDb } from '../core/db.js';
import type { ExtractedFact } from '../core/types.js';

function statePath(sessionId?: string): string {
  const suffix = sessionId ? `-${sessionId}` : '';
  return resolve(process.env.HOME || '~', '.memd', `onboard-state${suffix}.json`);
}

const ONBOARD_AREAS = [
  'Who You Are',
  'Work & Career',
  'Values & Principles',
  'How You Think',
  'Communication Style',
  'Relationships & Community',
  'Goals & Aspirations',
];

// --- State interfaces ---

interface AreaState {
  area: string;
  answers: string[];
  factsExtracted: number;
  isComplete: boolean;
}

export interface OnboardStateV2 {
  version: 2;
  language: string | null;
  areas: AreaState[];
  currentAreaIndex: number;
  totalFactsExtracted: number;
  lastQuestion: string | null;
  lastSuggestedAnswers: string[] | null;
  isComplete: boolean;
  startedAt: string;
  lastActiveAt: string;
}

// v1 shape for migration
interface OnboardStateV1 {
  messageCount: number;
  previousAnswers: string[];
  completedAreas: string[];
  factsExtracted: number;
  isComplete: boolean;
  startedAt: string;
  lastActiveAt: string;
}

// --- Language detection ---

export function detectLanguage(text: string): string {
  // Ukrainian characters (Cyrillic unique to Ukrainian: і, ї, є, ґ)
  if (/[іїєґ]/i.test(text)) return 'uk';
  // General Cyrillic → default Ukrainian for this user
  if (/[\u0400-\u04FF]/.test(text)) return 'uk';
  // Portuguese diacritics
  if (/[ãõ]/.test(text) || /\b(não|sim|como|para|trabalh)\b/i.test(text)) return 'pt';
  return 'en';
}

// --- Graph awareness ---

const AREA_RELATION_MAP: Record<string, string[]> = {
  'Who You Are': ['has_name', 'has_nationality', 'has_property', 'has_fact', 'lives_in', 'born_in'],
  'Work & Career': ['works_at', 'has_role', 'founded', 'manages', 'created'],
  'Values & Principles': ['values', 'believes', 'prioritizes'],
  'How You Think': ['prefers', 'has_skill', 'uses', 'thinks'],
  'Communication Style': ['speaks', 'prefers', 'communicates'],
  'Relationships & Community': ['knows', 'has_doctor', 'family', 'friend', 'married_to'],
  'Goals & Aspirations': ['has_goal', 'wants', 'plans', 'aspires_to'],
};

export function getExistingFactsForArea(area: string): string[] {
  const db = getDb();
  const types = AREA_RELATION_MAP[area] || [];
  if (types.length === 0) return [];

  const placeholders = types.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT s.name || ' → ' || r.type || ' → ' || t.name as fact
    FROM relation r
    JOIN entity s ON r.source_id = s.id
    JOIN entity t ON r.target_id = t.id
    WHERE r.type IN (${placeholders}) AND r.valid_until IS NULL
    LIMIT 10
  `).all(...types) as Array<{ fact: string }>;

  return rows.map(r => r.fact);
}

// --- State management ---

function freshState(): OnboardStateV2 {
  return {
    version: 2,
    language: null,
    areas: ONBOARD_AREAS.map(area => ({
      area,
      answers: [],
      factsExtracted: 0,
      isComplete: false,
    })),
    currentAreaIndex: 0,
    totalFactsExtracted: 0,
    lastQuestion: null,
    lastSuggestedAnswers: null,
    isComplete: false,
    startedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

function migrateV1toV2(v1: OnboardStateV1): OnboardStateV2 {
  const state = freshState();
  state.startedAt = v1.startedAt || new Date().toISOString();
  state.lastActiveAt = v1.lastActiveAt || new Date().toISOString();
  state.totalFactsExtracted = v1.factsExtracted || 0;
  state.isComplete = v1.isComplete || false;

  // Map previousAnswers to areas
  const areaIndex = Math.min(v1.messageCount || 0, ONBOARD_AREAS.length);
  state.currentAreaIndex = areaIndex;

  for (let i = 0; i < v1.previousAnswers.length && i < ONBOARD_AREAS.length; i++) {
    state.areas[i].answers = [v1.previousAnswers[i]];
    state.areas[i].isComplete = true;
    state.areas[i].factsExtracted = Math.floor((v1.factsExtracted || 0) / Math.max(v1.previousAnswers.length, 1));
  }

  return state;
}

export function loadState(sessionId?: string): OnboardStateV2 {
  const path = statePath(sessionId);
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw.version === 2) {
        return raw as OnboardStateV2;
      }
      // v1 migration
      return migrateV1toV2(raw as OnboardStateV1);
    }
  } catch { /* empty */ }
  return freshState();
}

function saveState(state: OnboardStateV2, sessionId?: string): void {
  state.lastActiveAt = new Date().toISOString();
  const path = statePath(sessionId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

// --- AI response parsing ---

interface ParsedAIResponse {
  message: string;
  suggestedAnswers: string[];
  areaComplete: boolean;
}

function parseAIResponse(raw: string): ParsedAIResponse {
  // Try JSON parse first
  try {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    if (parsed.message) {
      return {
        message: parsed.message,
        suggestedAnswers: Array.isArray(parsed.suggestedAnswers) ? parsed.suggestedAnswers : [],
        areaComplete: !!parsed.areaComplete,
      };
    }
  } catch { /* not JSON, fallback */ }

  // Fallback: treat as plain text, check for [AREA_COMPLETE]
  const areaComplete = raw.includes('[AREA_COMPLETE]');
  const message = raw.replace(/\[AREA_COMPLETE\]/g, '').trim();
  return { message, suggestedAnswers: [], areaComplete };
}

// --- Core onboard function ---

export async function onboard(userMessage: string, sessionId?: string) {
  if (!isApiKeyConfigured()) {
    return { ok: false as const, error: 'ANTHROPIC_API_KEY required for onboarding interviews' };
  }

  const state = loadState(sessionId);

  // Status check
  if (userMessage === '--status') {
    const areaProgress = state.areas.map(a => ({
      area: a.area,
      questionsAsked: a.answers.length,
      factsExtracted: a.factsExtracted,
      isComplete: a.isComplete,
    }));
    return {
      ok: true as const,
      data: {
        message: state.isComplete
          ? 'Onboarding complete!'
          : `Onboarding in progress: area ${state.currentAreaIndex + 1}/${ONBOARD_AREAS.length} (${ONBOARD_AREAS[state.currentAreaIndex]})`,
        areaProgress,
        overallProgress: {
          completed: state.areas.filter(a => a.isComplete).map(a => a.area),
          remaining: state.areas.filter(a => !a.isComplete).map(a => a.area),
          totalFacts: state.totalFactsExtracted,
        },
        isComplete: state.isComplete,
      },
    };
  }

  // Reset
  if (userMessage === '--reset') {
    saveState(freshState(), sessionId);
    return { ok: true as const, data: { message: 'Onboarding reset. Run `onboard` to start fresh.' } };
  }

  if (state.isComplete && !userMessage) {
    return {
      ok: true as const,
      data: {
        message: 'Onboarding is already complete! Use `add` to add more facts or `stats` to see your graph.',
        isComplete: true,
        overallProgress: {
          completed: state.areas.filter(a => a.isComplete).map(a => a.area),
          totalFacts: state.totalFactsExtracted,
        },
      },
    };
  }

  // Skip handling
  const isSkip = /^(skip|пропустити|--skip)$/i.test(userMessage.trim());

  let lastExtractedFacts: string[] = [];

  // Process user answer
  if (userMessage && userMessage.length > 0 && !isSkip) {
    // Detect language from first answer
    if (state.language === null) {
      state.language = detectLanguage(userMessage);
      console.error(`[onboard] Detected language: ${state.language}`);
    }

    const currentArea = state.areas[state.currentAreaIndex];
    currentArea.answers.push(userMessage);

    // Extract facts
    try {
      const facts = await extractFacts(userMessage);
      if (facts.length > 0) {
        const { inserted } = insertFacts(facts, `interview:onboard_${currentArea.area}`, 'interview');
        currentArea.factsExtracted += inserted;
        state.totalFactsExtracted += inserted;
        lastExtractedFacts = facts.map(f =>
          `${f.source_entity.name} → ${f.relation_type} → ${f.target_entity.name}`
        );
        console.error(`[onboard] Extracted ${inserted} facts from answer`);
      }
    } catch (e: any) {
      console.error(`[onboard] Fact extraction failed: ${e.message}`);
    }
  }

  // Handle skip
  if (isSkip) {
    const currentArea = state.areas[state.currentAreaIndex];
    currentArea.isComplete = true;
    state.currentAreaIndex++;

    if (state.currentAreaIndex >= ONBOARD_AREAS.length) {
      state.isComplete = true;
      saveState(state, sessionId);
      return buildCompletionResponse(state);
    }

    // Generate question for next area
    return await generateNextQuestion(state, '', lastExtractedFacts, sessionId);
  }

  // If we have a user answer and it's not the first call, check area completion
  if (userMessage && userMessage.length > 0) {
    const currentArea = state.areas[state.currentAreaIndex];
    const wordCount = userMessage.split(/\s+/).length;

    // Short answers (< 5 words) on first question → always follow up
    // 3+ answers → always mark complete
    // Otherwise, let AI decide via prompt (we'll parse [AREA_COMPLETE] from response)
    if (currentArea.answers.length >= 3) {
      currentArea.isComplete = true;
      state.currentAreaIndex++;

      if (state.currentAreaIndex >= ONBOARD_AREAS.length) {
        state.isComplete = true;
        saveState(state, sessionId);
        return buildCompletionResponse(state);
      }
    }
    // For short first answers, don't advance — AI will probe deeper
    // For substantive answers, let AI decide via [AREA_COMPLETE]
  }

  return await generateNextQuestion(state, userMessage, lastExtractedFacts, sessionId);
}

async function generateNextQuestion(
  state: OnboardStateV2,
  userMessage: string,
  lastExtractedFacts: string[],
  sessionId?: string,
) {
  const currentArea = state.areas[state.currentAreaIndex];
  const existingFacts = getExistingFactsForArea(currentArea.area);

  const systemPrompt = buildOnboardSystemPrompt({
    area: currentArea,
    areaIndex: state.currentAreaIndex,
    totalAreas: ONBOARD_AREAS.length,
    language: state.language || 'en',
    existingFacts,
    lastQuestion: state.lastQuestion,
    lastSuggestedAnswers: state.lastSuggestedAnswers,
  });

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (state.currentAreaIndex === 0 && currentArea.answers.length === 0 && !userMessage) {
    messages.push({ role: 'user', content: 'Start the onboarding interview.' });
  } else if (userMessage && userMessage.length > 0) {
    // Include last question context if available
    const contextPrefix = state.lastQuestion
      ? `[Context: Your last question was: "${state.lastQuestion}". The user answered:]\n\n`
      : '';
    messages.push({ role: 'user', content: contextPrefix + userMessage });
  } else {
    messages.push({ role: 'user', content: 'Continue to the next area.' });
  }

  let response: string;
  try {
    response = await callAnthropic({
      system: systemPrompt,
      messages,
      maxTokens: 800,
      temperature: 0.7,
    });
  } catch (e: any) {
    return { ok: false as const, error: `Failed to generate question: ${e.message}` };
  }

  const parsed = parseAIResponse(response);

  // Handle AI signaling area complete
  if (parsed.areaComplete && currentArea.answers.length > 0) {
    currentArea.isComplete = true;
    state.currentAreaIndex++;

    if (state.currentAreaIndex >= ONBOARD_AREAS.length) {
      state.isComplete = true;
      saveState(state, sessionId);
      return buildCompletionResponse(state);
    }

    // Recursively get question for next area
    return await generateNextQuestion(state, '', lastExtractedFacts, sessionId);
  }

  // Save resume context
  state.lastQuestion = parsed.message;
  state.lastSuggestedAnswers = parsed.suggestedAnswers.length > 0 ? parsed.suggestedAnswers : null;
  saveState(state, sessionId);

  const areaObj = state.areas[state.currentAreaIndex];
  return {
    ok: true as const,
    data: {
      message: parsed.message,
      suggestedAnswers: parsed.suggestedAnswers,
      currentArea: areaObj.area,
      questionNumber: areaObj.answers.length + 1,
      areaProgress: {
        area: areaObj.area,
        questionsAsked: areaObj.answers.length,
        factsExtracted: areaObj.factsExtracted,
      },
      overallProgress: {
        completed: state.areas.filter(a => a.isComplete).map(a => a.area),
        remaining: state.areas.filter(a => !a.isComplete).map(a => a.area),
        totalFacts: state.totalFactsExtracted,
      },
      lastExtractedFacts,
      isComplete: false,
    },
  };
}

async function buildCompletionResponse(state: OnboardStateV2) {
  // Generate final summary
  const allAnswers = state.areas
    .filter(a => a.answers.length > 0)
    .map(a => `**${a.area}:** ${a.answers.join('; ')}`)
    .join('\n');

  const lang = state.language || 'en';
  const langInstruction = lang !== 'en' ? ` Respond in ${lang === 'uk' ? 'Ukrainian' : lang === 'pt' ? 'Portuguese' : lang}.` : '';

  let summary = 'Onboarding complete! Your knowledge graph has been populated.';
  try {
    summary = await callAnthropic({
      system: `Summarize the key themes from this onboarding interview in 3-5 sentences. Mention specific facts learned.${langInstruction}`,
      messages: [{ role: 'user', content: allAnswers }],
      maxTokens: 400,
    });
  } catch { /* empty */ }

  return {
    ok: true as const,
    data: {
      message: summary,
      isComplete: true,
      overallProgress: {
        completed: state.areas.filter(a => a.isComplete).map(a => a.area),
        remaining: [],
        totalFacts: state.totalFactsExtracted,
      },
      areaProgress: state.areas.map(a => ({
        area: a.area,
        questionsAsked: a.answers.length,
        factsExtracted: a.factsExtracted,
      })),
    },
  };
}

// --- Summary for API ---

export function getOnboardSummary(sessionId?: string) {
  const state = loadState(sessionId);
  const db = getDb();

  const entityCount = (db.prepare('SELECT COUNT(*) as c FROM entity').get() as any)?.c || 0;
  const relationCount = (db.prepare('SELECT COUNT(*) as c FROM relation WHERE valid_until IS NULL').get() as any)?.c || 0;

  const byArea: Record<string, number> = {};
  for (const a of state.areas) {
    byArea[a.area] = a.factsExtracted;
  }

  // Get highlight facts (high confidence, recent)
  const highlights = (db.prepare(`
    SELECT s.name || ' ' || r.type || ' ' || t.name as fact
    FROM relation r
    JOIN entity s ON r.source_id = s.id
    JOIN entity t ON r.target_id = t.id
    WHERE r.valid_until IS NULL AND r.provenance LIKE 'interview:%'
    ORDER BY r.confidence DESC, r.created_at DESC
    LIMIT 5
  `).all() as Array<{ fact: string }>).map(r => r.fact);

  return {
    totalFacts: state.totalFactsExtracted,
    byArea,
    entities: entityCount,
    relations: relationCount,
    highlights,
    isComplete: state.isComplete,
  };
}

// --- Interactive CLI mode ---

export async function onboardInteractive() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr, // prompts to stderr, JSON to stdout
    terminal: true,
  });

  const ask = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  console.error('\n🎯 me.md-kg Interactive Onboarding\n');
  console.error('Type your answers, pick a number for suggestions, or type "skip" to skip an area.\n');

  let input = '';
  while (true) {
    const result = await onboard(input);

    if (!result.ok) {
      console.error(`\nError: ${result.error}`);
      rl.close();
      return result;
    }

    const data = result.data as any;

    // Show extracted facts if any
    if (data.lastExtractedFacts && data.lastExtractedFacts.length > 0) {
      console.error(`\n  📋 Extracted: ${data.lastExtractedFacts.join(', ')}`);
    }

    // Show progress
    if (data.currentArea) {
      console.error(`\n  [${data.overallProgress.completed.length}/${ONBOARD_AREAS.length}] ${data.currentArea}`);
    }

    // Show question
    console.error(`\n${data.message}\n`);

    if (data.isComplete) {
      console.error('✅ Onboarding complete!\n');
      rl.close();
      // Output final JSON to stdout
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    // Show suggested answers
    const suggestions = data.suggestedAnswers || [];
    if (suggestions.length > 0) {
      suggestions.forEach((s: string, i: number) => {
        console.error(`  ${i + 1}. ${s}`);
      });
      console.error('');
    }

    const raw = await ask('> ');
    const trimmed = raw.trim();

    // Number input → pick suggestion
    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= suggestions.length) {
      input = suggestions[num - 1];
    } else {
      input = trimmed;
    }
  }
}
