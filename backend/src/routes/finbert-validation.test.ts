import { describe, it, expect } from 'vitest';
import { analyzeSentiment } from '../services/finbert.js';

describe('NLP validation', () => {
  it('rejects empty input', async () => {
    await expect(analyzeSentiment('')).rejects.toThrow('empty');
  });
  it('rejects whitespace-only', async () => {
    await expect(analyzeSentiment('   ')).rejects.toThrow('empty');
  });
  it('rejects single char h', async () => {
    await expect(analyzeSentiment('h')).rejects.toThrow('short');
  });
  it('rejects hi', async () => {
    await expect(analyzeSentiment('hi')).rejects.toThrow('short');
  });
  it('rejects punctuation-only', async () => {
    await expect(analyzeSentiment('!!! ?')).rejects.toThrow('meaningful');
  });
  it('rejects repetitive junk', async () => {
    await expect(analyzeSentiment('good good good good good')).rejects.toThrow('repetitive');
  });
  it('accepts legitimate short headline', async () => {
    // May reach service; if unavailable throws, that's okay — it must NOT throw validation
    try { await analyzeSentiment('RBI raises interest rates'); } catch (e: any) { expect(e.message).not.toContain('short'); expect(e.message).not.toContain('repetitive'); }
  });
});
