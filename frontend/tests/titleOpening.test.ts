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
  it('limits full-frame fitting to a five-percent aspect difference for both image and video', () => {
    const query = '@media(max-width:600px) and (orientation:portrait) and (min-aspect-ratio:171/320) and (max-aspect-ratio:189/320)';
    expect(html.split(query)).toHaveLength(3);
    const fits = (w: number, h: number) => w / h >= 171 / 320 && w / h <= 189 / 320;
    expect(fits(390, 664)).toBe(true); expect(fits(320, 568)).toBe(true);
    expect(fits(390, 844)).toBe(false); expect(fits(430, 932)).toBe(false);
    expect(html).toContain('.openingLayer video{width:100%;height:100%;object-fit:contain;');
  });
  it('does not treat an existing learning device as a first visit after this feature is introduced', () => {
    localStorage.setItem('aippo_kids_settings_v1', JSON.stringify({ guardianAccepted: true }));
    boot(); expect(document.querySelector('video')).toBeNull(); expect(document.querySelector('[data-opening-replay]')).not.toBeNull();
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
    click('[data-opening-replay]'); expect(document.querySelector('video')).not.toBeNull();
  });
  it.each(['reduced', 'saveData', 'readFailure', 'writeFailure'])('skips automatic loading with %s and keeps a manual replay', reason => {
    if (reason === 'reduced') vi.stubGlobal('matchMedia', () => ({ matches: true }));
    if (reason === 'saveData') vi.stubGlobal('navigator', { connection: { saveData: true } });
    if (reason === 'readFailure') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
    if (reason === 'writeFailure') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
    boot(); expect(document.querySelector('video')).toBeNull(); expect(document.querySelector('.posterArtwork')).not.toBeNull();
    click('[data-opening-replay]'); expect(document.querySelector('video')).not.toBeNull();
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
