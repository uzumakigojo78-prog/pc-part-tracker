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
  it('concurrent same-host calls end up >= 2000ms apart', async () => {
    let t = 0; const fired: number[] = [];
    const f = (async () => { fired.push(t); return new Response('{}'); }) as typeof fetch;
    const deps = { fetch: f, now: () => t, sleep: async (ms: number) => { t += ms; } };
    await Promise.all([politeFetch('https://d.test/1', undefined, deps), politeFetch('https://d.test/2', undefined, deps)]);
    expect(fired).toHaveLength(2);
    expect(Math.abs(fired[1] - fired[0])).toBeGreaterThanOrEqual(2000);
  });
});
