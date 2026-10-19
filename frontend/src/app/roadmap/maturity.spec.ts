import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons/catalog';
import { MATURITY, lessonsOfLevel } from './maturity.data';

describe('.NET maturity stack', () => {
  const ids = new Set(LESSONS.map(l => l.id));

  it('has the 7 levels in order', () => {
    expect(MATURITY.map(l => l.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('every topic is taught by at least one existing lesson', () => {
    for (const level of MATURITY)
      for (const topic of level.topics) {
        expect(topic.lessons.length, topic.label).toBeGreaterThan(0);
        for (const id of topic.lessons) expect(ids.has(id), `${topic.label} → unknown lesson "${id}"`).toBe(true);
      }
  });

  it('every .NET lesson belongs to the path', () => {
    const onPath = new Set(MATURITY.flatMap(lessonsOfLevel));
    const missing = LESSONS.filter(l => l.track === 'dotnet' && !onPath.has(l.id)).map(l => l.id);
    expect(missing, `dotnet lessons missing from the maturity stack: ${missing.join(', ')}`).toEqual([]);
  });
});
