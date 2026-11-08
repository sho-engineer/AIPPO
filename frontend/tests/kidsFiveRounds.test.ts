import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import html from '../public/kids-title/index.html?raw';
type Api={state:{view:string;quest:number;five:{level:number}},saved:{done:Record<string,unknown>;latestAttempts:Record<string,{five:{rounds:unknown[];independentTransfer:boolean}} >},quests:{id:string}[],startQuest(n:number):void,go(v:string):void};
const api=()=> (window as unknown as {AIPPO_TEST:Api}).AIPPO_TEST;
function click(s:string){const b=document.querySelector<HTMLButtonElement>(s);expect(b).not.toBeNull();b!.click()}
function answer(correct=true){
 if(document.querySelector('[data-five-choice]')){click('[data-five-choice="'+(correct?0:1)+'"]');return}
 const request=document.querySelector('.fiveGoal')!.textContent!;
 const fields=[...new Set(Array.from(document.querySelectorAll<HTMLElement>('[data-five-field]')).map(b=>b.dataset.fiveField!))];
 fields.forEach((field,index)=>{
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-five-field="'+field+'"]'));
  const target=buttons.find(b=>(!correct&&index===0)?!request.includes(b.textContent!):request.includes(b.textContent!));
  expect(target).toBeDefined();target!.click();
 });click('[data-five-submit]');
}
async function boot(age:string){
 localStorage.setItem('aippo_kids_settings_v1',JSON.stringify({guardianAccepted:true,ageBand:age,challengeMode:age==='5-6'?'guided':['7-8','7-9'].includes(age)?'standard':'advanced'}));
 document.body.innerHTML='<div id="app"></div>';
 window.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
 await vi.advanceTimersByTimeAsync(0);
 api().startQuest(0);
 for(let i=0;i<4;i++)click('[data-s1-next]');
 const rounds=[{subject:'rocket',output:'plan'},{part:'window',size:'large'},{part:'box',place:'inside',...(['9-10','10-12'].includes(age)?{purpose:'stone',scope:'keep'}:{})}];
 for(const picks of rounds){for(const [key,value] of Object.entries(picks))click(`[data-s1-key="${key}"][data-s1-value="${value}"]`);click('[data-s1-send]');click('[data-s1-confirm]')}
 for(let i=0;i<3;i++)click('[data-s1-next]');
}
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({authenticated:false})}))});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();document.body.innerHTML=''});
it.each([['5-6',0],['7-8',1],['9-10',2],['7-9',1],['10-12',2]])('starts %s at level %s and completes five stages without duplicate stamps',async(age,level)=>{
 await boot(String(age));
 for(let n=1;n<5;n++){
  api().startQuest(n);expect(api().state.five.level).toBe(level);
  for(let round=0;round<3;round++){answer();click('[data-five-next]')}
  expect(api().state.view).toBe('win');
  const id=api().quests[n].id;
  expect(api().saved.latestAttempts[id].five.rounds).toHaveLength(3);
  expect(api().saved.latestAttempts[id].five.independentTransfer).toBe(true);
 }
 expect(Object.keys(api().saved.done)).toHaveLength(5);
 api().startQuest(1);
 for(let round=0;round<3;round++){answer();click('[data-five-next]')}
 expect(Object.keys(api().saved.done)).toHaveLength(5);
});
it('records help and wrong answers without granting completion early',async()=>{
 await boot('5-6');api().startQuest(1);
 answer(false);expect(Object.keys(api().saved.done)).toHaveLength(1);
 for(let r=0;r<3;r++){click('[data-five-hint]');answer();click('[data-five-next]')}
 expect(api().saved.latestAttempts['w1-q2'].five.independentTransfer).toBe(false);
});
it('restarts evidence when changing difficulty',async()=>{
 await boot('5-6');api().startQuest(1);
 answer();click('[data-five-next]');
 click('[data-five-level="1"]');expect(api().state.five.level).toBe(1);
 expect(document.body.textContent).toContain('1/3');
 expect(Object.keys(api().saved.done)).toHaveLength(1);
});

it('keeps independent selections and waits for every condition before submitting',async()=>{
 await boot('9-10');api().startQuest(1);
 expect(document.querySelector<HTMLButtonElement>('[data-five-submit]')!.disabled).toBe(true);
 click('[data-five-field="color"][data-five-value="blue"]');
 click('[data-five-field="shape"][data-five-value="round"]');
 expect(document.querySelector('[data-five-field="color"][aria-pressed="true"]')!.getAttribute('data-five-value')).toBe('blue');
 expect(document.querySelector<HTMLButtonElement>('[data-five-submit]')!.disabled).toBe(true);
 click('[data-five-field="place"][data-five-value="sea"]');
 expect(document.querySelector<HTMLButtonElement>('[data-five-submit]')!.disabled).toBe(false);
 expect(Object.keys(api().saved.done)).toHaveLength(1);
});
