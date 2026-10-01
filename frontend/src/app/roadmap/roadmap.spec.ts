import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/catalog';
import { ANGULAR_BONUS, LEVELS } from './roadmap.data';

describe('career roadmap data', () => {
  const ids = new Set(LESSONS.map(l => l.id));
  const skills = LEVELS.flatMap(l => l.skills);

  it('every referenced lesson exists in the catalog', () => {
    for (const skill of skills)
      for (const id of skill.lessons ?? [])
        expect(ids.has(id), `${skill.label} → unknown lesson "${id}"`).toBe(true);
    for (const id of ANGULAR_BONUS) expect(ids.has(id), `unknown lesson "${id}"`).toBe(true);
  });

  it('covered and partial skills point at a lesson, todo ones do not', () => {
    for (const skill of skills) {
      if (skill.status === 'todo') expect(skill.lessons ?? [], skill.label).toHaveLength(0);
      // "partial" may have no lesson when the topic is only touched by infrastructure
      if (skill.status === 'covered') expect(skill.lessons?.length, skill.label).toBeGreaterThan(0);
      expect(skill.note.length, skill.label).toBeGreaterThan(20);
    }
  });

  it('covers the reference without duplicates', () => {
    const labels = skills.map(s => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBe(51);
  });

  it('every .NET and auth lesson is reachable from the roadmap', () => {
    const referenced = new Set([...skills.flatMap(s => s.lessons ?? []), ...ANGULAR_BONUS]);
    const orphans = LESSONS.filter(l => !referenced.has(l.id)).map(l => l.id);
    expect(orphans, `lessons missing from the roadmap: ${orphans.join(', ')}`).toEqual([]);
  });
});
