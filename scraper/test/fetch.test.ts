import { describe, it, expect } from 'vitest';
import { politeFetch } from '../src/fetch';

const ok = async () => new Response('{}');

describe('politeFetch', () => {
  it('waits so same-host calls are >= 2000ms apart; other hosts do not wait', async () => {
    let t = 1000; const sleeps: number[] = [];
    const deps = { fetch: ok as typeof fetch, now: () => t, sleep: async (ms: number) => { sleeps.push(ms); t += ms; } };
    await politeFetch('https://a.test/1', undefined, deps);
    t += 500;
    await politeFetch('https://a.test/2', undefined, deps);
    expect(sleeps).toEqual([1500]);
    await politeFetch('https://b.test/1', undefined, deps);
    expect(sleeps).toEqual([1500]);
  });
  it('sends the identified User-Agent', async () => {
    let ua: string | null = null;
    const f = (async (_u: string, init?: RequestInit) => { ua = new Headers(init?.headers).get('user-agent'); return new Response('{}'); }) as typeof fetch;
    await politeFetch('https://c.test/', undefined, { fetch: f, now: () => 0, sleep: async () => {} });
    expect(ua).toMatch(/^PCPartTrackerBot\/1\.0/);
  });
});
