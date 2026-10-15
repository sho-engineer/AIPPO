import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const click = (s: string) => { const b = document.querySelector<HTMLButtonElement>(s); expect(b, s).not.toBeNull(); b!.click(); };
function boot() {
  localStorage.clear();
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: "advanced" }));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(`(function(){${script}\n})()`);
  click('[data-action="start"]');
}
function context(values: string[]) {
  const block = document.querySelector('.challengeContext')!;
  expect(block.parentElement).toBe(document.querySelector('.challengeModal'));
  expect(block.getAttribute('role')).toBe('group');
  expect(block.getAttribute('aria-label')).toBe('選んだ条件');
  expect(block.closest('.dailyScroll')).toBeNull();
  for (const value of values) expect(block.textContent).toContain(value);
  const close = document.querySelector('[data-ch-close]')!;
  expect(close.closest('.dailyScroll')).toBeNull();
}
afterEach(() => { document.body.innerHTML = ""; localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Challenge keeps the selected conditions outside its reading area', () => {
  it.each(['sources', 'outing'])('%s preserves all labels and values through comparison, judgment, reasoning, checks and support', task => {
    boot();
    expect(document.querySelector('.challengeContext')).toBeNull();
    expect(document.querySelectorAll('.challengeModal details')).toHaveLength(1);
    click(`[data-ch-task="${task}"]`);
    for (let i = 0; i < 2; i++) { click('[data-ch-condition="0"]'); expect(document.querySelector('.challengeContext')).toBeNull(); }
    click('[data-ch-condition="0"]');
    const values = task === 'sources' ? ['対象：', '教材の地域A', '知りたい日時：', '教材の明日', '優先する発信元：', '公的な情報'] : ['予算上限：', '0円', '使える時間：', '60分', '場所：', '屋内'];
    context(values);
    if (task === 'sources') {
      expect(document.querySelector('.dailyScroll h3')!.textContent).toContain('資料B');
      const cards = document.querySelectorAll('.dailyScroll .dailyRecord'); expect(cards).toHaveLength(2);
      for (const card of cards) for (const label of ['対象：', '対象日時：', '発信元：', '更新日時：']) expect(card.textContent).toContain(label);
    }
    for (const issue of task === 'sources' ? ['when'] : ['budget', 'time']) click(`[data-ch-issue="${issue}"]`);
    click('[data-ch-compare]'); context(values);
    expect(document.querySelector('.dailyScroll p')!.textContent).toContain('情報不足や情報源の違い');
    click(`[data-ch-decision="${task === 'sources' ? 'hold' : 'revise'}"]`);
    if (task === 'outing') { context(values); click('[data-ch-fix="correct"]'); }
    context(values); click('[data-ch-reason="correct"]'); context(values);
    const notes = document.querySelector('.challengeGuardianNotes')!;
    expect(notes.tagName).toBe('DETAILS'); expect(notes.hasAttribute('open')).toBe(false);
    click('[data-ch-verify="correct"]'); context(values);
    expect(document.querySelector('.dailyScroll p')!.textContent).toContain('答えを考える手助け');
    click('[data-ch-support="self"]'); expect(document.querySelector('.challengeContext')).toBeNull();
    click('[data-ch-close]'); click('[data-action="start"]'); click('[data-ch-history="0"]');
    expect(document.querySelector('.challengeContext')).toBeNull();
  });
  it('shows the simulation and unsaved-work warning outside the reading area when saving fails', () => {
    boot();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('full'); });
    click('[data-ch-task="sources"]'); for (let n = 0; n < 3; n++) click('[data-ch-condition="0"]');
    click('[data-ch-issue="when"]'); click('[data-ch-compare]'); click('[data-ch-decision="hold"]');
    click('[data-ch-reason="correct"]'); click('[data-ch-verify="correct"]'); click('[data-ch-support="self"]');
    const note = document.querySelector('.challengeNotice')!;
    expect(note.closest('.dailyScroll')).toBeNull();
    expect(note.textContent).toContain('実AI送信なし'); expect(note.textContent).toContain('未完了の練習は初めから');
    expect(note.textContent).toContain('保存できません'); expect(note.textContent).not.toContain('完了記録は端末に残ります');
  });
});
