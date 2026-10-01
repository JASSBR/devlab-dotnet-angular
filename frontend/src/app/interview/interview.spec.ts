import { describe, expect, it } from 'vitest';
import { detects, normalize } from './interview';
import { QUESTIONS } from './questions';

describe('interview key point detection', () => {
  it('is accent- and case-insensitive', () => {
    expect(normalize('Dépendance Mémoïsée')).toBe('dependance memoisee');
    expect(detects('Le computed est MÉMOÏSÉ et paresseux', { text: '', keywords: ['mémo', 'lazy'] })).toBe(true);
    expect(detects('rien à voir', { text: '', keywords: ['mémo', 'lazy'] })).toBe(false);
  });

  it('every question is well-formed', () => {
    const ids = new Set<string>();
    for (const q of QUESTIONS) {
      expect(ids.has(q.id), `duplicate id ${q.id}`).toBe(false); ids.add(q.id);
      if (q.type === 'mcq') { expect(q.answer).toBeLessThan(q.choices.length); expect(q.explanation).toBeTruthy(); }
      else { expect(q.keyPoints.length).toBeGreaterThanOrEqual(3); expect(q.model).toBeTruthy(); q.keyPoints.forEach(kp => expect(kp.keywords.length).toBeGreaterThan(0)); }
    }
  });

  it('a model answer detects most of its own key points (keywords are consistent)', () => {
    for (const q of QUESTIONS) {
      if (q.type !== 'open') continue;
      const hits = q.keyPoints.filter(kp => detects(q.model, kp)).length;
      expect(hits / q.keyPoints.length, `${q.id}: model answer only hits ${hits}/${q.keyPoints.length}`).toBeGreaterThanOrEqual(0.6);
    }
  });
});
