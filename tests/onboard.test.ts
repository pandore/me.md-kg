import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Test the exported helpers directly
import { detectLanguage, getExistingFactsForArea, loadState } from '../src/commands/onboard.js';

const STATE_PATH = resolve(process.env.HOME || '~', '.memd', 'onboard-state.json');

function cleanupState() {
  try { if (existsSync(STATE_PATH)) unlinkSync(STATE_PATH); } catch { /* ok */ }
}

describe('detectLanguage', () => {
  it('detects Ukrainian from unique characters', () => {
    expect(detectLanguage('Привіт, мене звати Олексій')).toBe('uk');
    expect(detectLanguage('Я працюю в їдальні')).toBe('uk');
    expect(detectLanguage('Моє ім\'я Євген')).toBe('uk');
    expect(detectLanguage('Ґрунтовна відповідь')).toBe('uk');
  });

  it('defaults Cyrillic to Ukrainian', () => {
    expect(detectLanguage('Просто текст кирилицей')).toBe('uk');
  });

  it('detects Portuguese', () => {
    expect(detectLanguage('Eu trabalho como desenvolvedor')).toBe('pt');
    expect(detectLanguage('Não tenho certeza')).toBe('pt');
    expect(detectLanguage('Minhas paixões são música e arte')).toBe('pt');
  });

  it('detects Portuguese from diacritics', () => {
    expect(detectLanguage('Coração e paixão')).toBe('pt');
  });

  it('defaults to English', () => {
    expect(detectLanguage('I work as a software engineer')).toBe('en');
    expect(detectLanguage('Hello world')).toBe('en');
    expect(detectLanguage('')).toBe('en');
  });
});

describe('state migration v1 → v2', () => {
  beforeEach(cleanupState);
  afterEach(cleanupState);

  it('migrates v1 state to v2', () => {
    const v1State = {
      messageCount: 3,
      previousAnswers: ['I am Oleksii', 'I work at Podavach', 'I value freedom'],
      completedAreas: ['Who You Are', 'Work & Career', 'Values & Principles'],
      factsExtracted: 6,
      isComplete: false,
      startedAt: '2024-01-01T00:00:00.000Z',
      lastActiveAt: '2024-01-01T01:00:00.000Z',
    };

    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(v1State));

    const state = loadState();

    expect(state.version).toBe(2);
    expect(state.currentAreaIndex).toBe(3);
    expect(state.areas[0].answers).toEqual(['I am Oleksii']);
    expect(state.areas[0].isComplete).toBe(true);
    expect(state.areas[1].answers).toEqual(['I work at Podavach']);
    expect(state.areas[1].isComplete).toBe(true);
    expect(state.areas[2].answers).toEqual(['I value freedom']);
    expect(state.areas[2].isComplete).toBe(true);
    expect(state.areas[3].isComplete).toBe(false);
    expect(state.totalFactsExtracted).toBe(6);
    expect(state.isComplete).toBe(false);
  });

  it('loads v2 state as-is', () => {
    const v2State = {
      version: 2,
      language: 'uk',
      areas: [
        { area: 'Who You Are', answers: ['Олексій'], factsExtracted: 2, isComplete: true },
        { area: 'Work & Career', answers: [], factsExtracted: 0, isComplete: false },
        { area: 'Values & Principles', answers: [], factsExtracted: 0, isComplete: false },
        { area: 'How You Think', answers: [], factsExtracted: 0, isComplete: false },
        { area: 'Communication Style', answers: [], factsExtracted: 0, isComplete: false },
        { area: 'Relationships & Community', answers: [], factsExtracted: 0, isComplete: false },
        { area: 'Goals & Aspirations', answers: [], factsExtracted: 0, isComplete: false },
      ],
      currentAreaIndex: 1,
      totalFactsExtracted: 2,
      lastQuestion: 'What do you do?',
      lastSuggestedAnswers: ['Option A', 'Option B'],
      isComplete: false,
      startedAt: '2024-01-01T00:00:00.000Z',
      lastActiveAt: '2024-01-01T01:00:00.000Z',
    };

    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(v2State));

    const state = loadState();
    expect(state.version).toBe(2);
    expect(state.language).toBe('uk');
    expect(state.lastQuestion).toBe('What do you do?');
    expect(state.currentAreaIndex).toBe(1);
  });

  it('creates fresh state when no file exists', () => {
    const state = loadState();
    expect(state.version).toBe(2);
    expect(state.language).toBeNull();
    expect(state.areas).toHaveLength(7);
    expect(state.currentAreaIndex).toBe(0);
    expect(state.isComplete).toBe(false);
  });
});

describe('area transitions', () => {
  it('areas list has 7 entries', () => {
    const state = loadState();
    expect(state.areas).toHaveLength(7);
    expect(state.areas[0].area).toBe('Who You Are');
    expect(state.areas[6].area).toBe('Goals & Aspirations');
  });
});
