import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import source from '../src/kids/learning.html?raw';
import title from '../public/kids-title/index.html?raw';
const inline = (html: string) => html.match(/<script>([\s\S]*?)<\/script>/)![1];
const store = 'aippo_kids_journey_v1';
type Api = { state: { view: string }; quests: { id: string; kind: string }[]; worlds: unknown[]; saved: { done: Record<string, unknown> }; go: (view: string) => void };
const api = () => (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
const click = (s: string) => { const button = document.querySelector<HTMLButtonElement>(s); expect(button, s).not.toBeNull(); button!.click(); };
function boot(html = title) { document.body.innerHTML = '<div id="app"></div>'; window.eval(inline(html)); }
function accountStore(email: string) { let n = 2166136261; for (const c of email.trim().toLowerCase()) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return `${store}:account:${(n >>> 0).toString(16)}`; }
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('aippo_title_opening_v1', 'seen');
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: false }) }));
});
afterEach(() => { document.querySelector<HTMLButtonElement>('[data-opening-skip]')?.click(); document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
describe('One curriculum source behind the approved title and existing account API', () => {
  it('ships the exact canonical quest IDs, kinds and world count, not the old eight-quest fork', async () => {
    boot(source); const expected = api().quests.map(q => [q.id, q.kind]); const worlds = api().worlds.length;
    boot(); await vi.advanceTimersByTimeAsync(0);
    expect(api().quests.map(q => [q.id, q.kind])).toEqual(expected); expect(api().worlds).toHaveLength(worlds);
    expect(api().quests.length).toBeGreaterThan(8);
    expect(document.querySelector('.posterTitle')).not.toBeNull();
  });
  it('keeps original start, guardian choice, learning hub, growth record, and settings reachable', async () => {
    localStorage.setItem('aippo_kids_settings_v1', JSON.stringify({ guardianAccepted: true, challengeMode: 'guided' }));
    boot(); await vi.advanceTimersByTimeAsync(0); click('[data-action="poster-start"]');
    expect(api().state.view).toBe('learning'); expect(document.querySelector('.homeView')).not.toBeNull();
    api().go('parent'); expect(document.querySelector('.parentView')).not.toBeNull();
    api().go('settings'); expect(document.querySelector('#child-reading')).not.toBeNull(); expect(document.querySelector('[data-action="account-toggle"]')).not.toBeNull();
    click('[data-action="learning-home"]'); expect(document.querySelector('.homeView')).not.toBeNull();
    api().go('home'); click('[data-action="poster-login"]'); expect(document.querySelector('#account-form')).not.toBeNull();
    click('[data-authmode="reset"]'); expect(document.querySelector('.accountHero h1')!.textContent).toContain('再設定');
  });
  it('waits for a delayed session on start, but a deliberate guest action invalidates that response', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r; })));
    localStorage.setItem('aippo_kids_settings_v1', JSON.stringify({ guardianAccepted: true, challengeMode: 'guided' }));
    boot(); click('[data-action="poster-start"]'); expect(api().state.view).toBe('home');
    click('[data-action="poster-guest"]'); expect(api().state.view).toBe('learning');
    resolve({ ok: true, json: async () => ({ authenticated: true, user: { email: 'late@example.test' } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(api().state.view).toBe('learning'); api().go('settings');
    expect(document.querySelector('.settingsScroll')!.textContent).toContain('ゲストで利用中');
    expect(localStorage.getItem(accountStore('late@example.test'))).toBeNull();
  });
  it('tells a signed-in guardian the account record is separate and confirms before switching to guest', async () => {
    const email = 'parent@example.test';
    localStorage.setItem(store, JSON.stringify({ schema: 4, done: { 'w1-q1': { at: '2026-10-01' } } }));
    localStorage.setItem('aippo_kids_settings_v1', JSON.stringify({ guardianAccepted: true, challengeMode: 'guided' }));
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes('/me/') ? { authenticated: true, user: { email } } : {}) }));
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'csrftoken=test';
    boot(); await vi.advanceTimersByTimeAsync(0);
    const hint = document.querySelector('#poster-start-hint')!.textContent!;
    expect(hint).toContain('ゲストとは別'); expect(hint).not.toContain('つづけられます');
    click('[data-action="poster-guest"]');
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('ログアウト');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/signout/'))).toBe(false);
    click('[data-confirm="guest-cancel"]');
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(api().state.view).toBe('home');
    click('[data-action="poster-guest"]'); click('[data-confirm="guest-switch"]');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/signout/'))).toBe(true);
    expect(api().state.view).toBe('learning');
    expect(Object.keys(api().saved.done)).toContain('w1-q1'); // now playing the guest record
    api().go('settings'); expect(document.querySelector('.settingsScroll')!.textContent).toContain('ゲストで利用中');
  });
  it('explains on the sign-in screen that guest progress is not carried into the account record', async () => {
    boot(); await vi.advanceTimersByTimeAsync(0); click('[data-action="poster-login"]');
    expect(document.querySelector('.accountInfo')!.textContent).toContain('ゲストの記録は引き継がれません');
  });
  it('migrates legacy guest and authenticated records separately without merging either owner', async () => {
    const email = 'parent@example.test', key = accountStore(email);
    localStorage.setItem(store, JSON.stringify({ done: { 0: { at: '2026-10-01' } } }));
    localStorage.setItem(key, JSON.stringify({ done: { 1: { at: '2026-10-02' } } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true, user: { email } }) }));
    boot(); await vi.advanceTimersByTimeAsync(0);
    const guest = localStorage.getItem(store)!, account = localStorage.getItem(key)!;
    expect(guest).toContain('2026-10-01'); expect(guest).not.toContain('2026-10-02');
    expect(account).toContain('2026-10-02'); expect(account).not.toContain('2026-10-01');
    api().go('settings'); expect(document.querySelector('.settingsScroll')!.textContent).toContain(email);
  });
  it('does not overwrite unreadable authenticated progress during a scope switch', async () => {
    const email = 'safe@example.test', key = accountStore(email), raw = '{broken';
    localStorage.setItem(key, raw);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true, user: { email } }) }));
    boot(); await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(key)).toBe(raw); expect(document.querySelector('.storageNotice')).not.toBeNull();
  });
  it('keeps session loading bounded and permits start after safe guest fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    localStorage.setItem('aippo_kids_settings_v1', JSON.stringify({ guardianAccepted: true, challengeMode: 'guided' }));
    boot(); click('[data-action="poster-start"]'); await vi.advanceTimersByTimeAsync(2501);
    expect(api().state.view).toBe('learning');
  });
  it('keeps record operations unavailable until settings refreshes into the resolved owner scope', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r; })));
    boot(); click('[data-action="poster-settings"]');
    for (const action of ['export', 'reset', 'account-toggle', 'learning-home']) expect(document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled).toBe(true);
    resolve({ ok: true, json: async () => ({ authenticated: true, user: { email: 'resolved@example.test' } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.settingsScroll')!.textContent).toContain('resolved@example.test');
    for (const action of ['export', 'reset', 'account-toggle', 'learning-home']) expect(document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled).toBe(false);
  });
  it.each(['signin', 'signup', 'mfa'])('retains the existing %s API payload and completes only after authenticated /me', async mode => {
    const requests: { url: string; body: Record<string, unknown> }[] = []; let meCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const result = url.endsWith('/me/') ? (++meCount === 1 ? { authenticated: false } : { authenticated: true, user: { email: 'signed@example.test' } }) : url.endsWith('/signin/') && mode === 'mfa' ? { mfa_required: true } : {};
      return { ok: true, json: async () => result };
    }));
    boot(); await vi.advanceTimersByTimeAsync(0); click('[data-action="poster-login"]');
    if (mode === 'signup') click('[data-authmode="signup"]');
    document.querySelector<HTMLInputElement>('[name="email"]')!.value = 'signed@example.test';
    document.querySelector<HTMLInputElement>('[name="password"]')!.value = 'test-password';
    if (mode === 'signup') { document.querySelector<HTMLInputElement>('[name="confirm"]')!.value = 'test-password'; document.querySelector<HTMLInputElement>('[name="consent"]')!.checked = true; }
    document.querySelector('#account-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    if (mode === 'mfa') { expect(api().state.view).toBe('auth'); document.querySelector<HTMLInputElement>('[name="mfa"]')!.value = '123456'; document.querySelector('#account-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await vi.advanceTimersByTimeAsync(0); }
    expect(api().state.view).toBe('home');
    const sent = requests.find(r => r.url.endsWith(mode === 'signup' ? '/signup/' : '/signin/'))!;
    expect(sent.body.email).toBe('signed@example.test'); expect(sent.body.password).toBe('test-password');
    if (mode === 'signup') expect(sent.body).toMatchObject({ accept_terms: true, accept_privacy: true, display_name: '' });
    if (mode === 'mfa') expect(requests.find(r => r.url.endsWith('/mfa/verify/'))!.body).toEqual({ code: '123456' });
    api().go('settings'); expect(document.querySelector('.settingsScroll')!.textContent).toContain('signed@example.test');
  });
  it.each(['verify-email', 'reset-password'])('preserves %s token handling and the original API field names', async path => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} }); return { ok: true, json: async () => ({ authenticated: false }) }; }));
    window.history.replaceState({}, '', `/${path}?uid=test-uid&token=test-token`);
    boot(); await vi.advanceTimersByTimeAsync(0);
    expect(api().state.view).toBe('auth');
    if (path === 'reset-password') for (const name of ['password', 'confirm']) document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = 'new-test-password';
    document.querySelector('#account-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    const request = requests.find(r => r.url.endsWith(path === 'verify-email' ? '/email/verify/' : '/password/reset/confirm/'))!;
    expect(request.body).toMatchObject({ uid: 'test-uid', token: 'test-token' });
    if (path === 'reset-password') expect(request.body.new_password).toBe('new-test-password');
    expect(document.querySelector('[name="email"]')).not.toBeNull();
  });
});
