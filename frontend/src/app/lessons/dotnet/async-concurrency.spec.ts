import { describe, expect, it } from 'vitest';
import { JsonArrayStream } from './async-concurrency';

describe('JsonArrayStream (incremental parser for a streamed JSON array)', () => {
  it('emits each element as soon as it is complete, across arbitrary chunk boundaries', () => {
    const s = new JsonArrayStream<{ index: number }>();
    expect(s.push('[{"ind')).toEqual([]);
    expect(s.push('ex":1}')).toEqual([{ index: 1 }]);
    expect(s.push(',{"index":2},{"index"')).toEqual([{ index: 2 }]);
    expect(s.push(':3}]')).toEqual([{ index: 3 }]);
  });

  it('ignores braces and brackets inside strings', () => {
    const s = new JsonArrayStream<{ text: string }>();
    expect(s.push('[{"text":"a } ] { \\" ["},{"text":"b"}]')).toEqual([{ text: 'a } ] { " [' }, { text: 'b' }]);
  });

  it('handles an empty array', () => {
    expect(new JsonArrayStream().push('[]')).toEqual([]);
  });
});
