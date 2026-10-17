import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../public/kids-title/index.html?raw";
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const key = 'aippo_title_opening_v1';
function boot() { document.body.innerHTML = '<div id="app"></div>'; window.eval(script); }
const click = (s: string) => { const b = document.querySelector<HTMLButtonElement>(s); expect(b, s).not.toBeNull(); b!.click(); };
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: false }) }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { document.querySelector<HTMLButtonElement>('[data-opening-skip]')?.click(); document.body.innerHTML = ''; vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
describe('Approved standalone title opening without adult Welcome changes', () => {
  it('settles onto the approved title before ending and restores entry without replay', () => {
    boot();
    const video = document.querySelector('video')!;
    const landing = document.querySelector<HTMLImageElement>('.openingLanding')!;
    Object.defineProperties(landing, { complete: { value: true }, naturalWidth: { value: 864 } });
    video.currentTime = 3.2; video.dispatchEvent(new Event('timeupdate'));
    expect(document.querySelector('.openingLayer.is-landing')).toBeNull();
    video.currentTime = 3.4; video.dispatchEvent(new Event('timeupdate'));
    expect(document.querySelector('.openingLayer.is-landing')).not.toBeNull();
    expect(landing.getAttribute('src')).toBe(document.querySelector('.posterArtwork')!.getAttribute('src'));
    video.dispatchEvent(new Event('ended'));
    expect(document.querySelector('.openingLayer')).toBeNull();
    expect(video.ontimeupdate).toBeNull();
    expect(document.querySelector('#app')!.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('#poster-start-hint')!.textContent).toContain('登録なし');
  });
  it('does not treat an existing learning device as a first visit after this feature is introduced', () => {
    localStorage.setItem('aippo_kids_settings_v1', JSON.stringify({ guardianAccepted: true }));
    boot(); expect(document.querySelector('video')).toBeNull(); expect(document.querySelector('[data-opening-replay]')).toBeNull();
  });
  it('shows skip immediately, marks first visit, keeps one video through session rerender, and never replays on return', async () => {
    boot(); const video = document.querySelector('video')!;
    expect(video.muted).toBe(true); expect(video.playsInline).toBe(true); expect(localStorage.getItem(key)).toBe('seen');
    expect(document.querySelector('[data-opening-skip]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('video')).toBe(video);
    click('[data-opening-skip]');
    const api = (window as unknown as { AIPPO_TEST: { go: (view: string) => void } }).AIPPO_TEST;
    api.go('settings'); api.go('home'); expect(document.querySelector('video')).toBeNull();
    boot(); expect(document.querySelector('video')).toBeNull();
    expect(document.querySelector('[data-opening-replay]')).toBeNull();
  });
  it.each(['reduced', 'saveData', 'readFailure', 'writeFailure'])('skips automatic loading with %s and keeps entry available', reason => {
    if (reason === 'reduced') vi.stubGlobal('matchMedia', () => ({ matches: true }));
    if (reason === 'saveData') vi.stubGlobal('navigator', { connection: { saveData: true } });
    if (reason === 'readFailure') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
    if (reason === 'writeFailure') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
    boot(); expect(document.querySelector('video')).toBeNull(); expect(document.querySelector('.posterArtwork')).not.toBeNull();
    expect(document.querySelector('[data-opening-replay]')).toBeNull();
  });
  it.each(['ended', 'error', 'timeout', 'rejected'])('falls back safely on %s without auth or guest navigation', async reason => {
    if (reason === 'rejected') vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(Error('NotAllowed'));
    boot();
    if (reason === 'ended' || reason === 'error') document.querySelector('video')!.dispatchEvent(new Event(reason));
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(1201);
    if (reason === 'rejected') await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.openingLayer')).toBeNull(); expect(document.querySelector('.posterTitle')).not.toBeNull();
    expect(document.querySelector('[data-action="poster-login"]')).not.toBeNull();
  });
  it('bounds playback even if playing fires repeatedly and does not loop', async () => {
    boot(); const video = document.querySelector('video')!;
    video.dispatchEvent(new Event('playing')); await vi.advanceTimersByTimeAsync(4000);
    video.dispatchEvent(new Event('playing')); await vi.advanceTimersByTimeAsync(1501);
    expect(document.querySelector('.openingLayer')).toBeNull(); expect(video.loop).toBe(false);
  });
});
