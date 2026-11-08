import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import html from '../public/kids-title/index.html?raw';
type Api={state:{view:string;quest:number;five:{level:number}},saved:{done:Record<string,unknown>;latestAttempts:Record<string,{five:{rounds:unknown[];independentTransfer:boolean}} >},quests:{id:string}[],startQuest(n:number):void,go(v:string):void};
const api=()=> (window as unknown as {AIPPO_TEST:Api}).AIPPO_TEST;
function click(s:string){const b=document.querySelector<HTMLButtonElement>(s);expect(b).not.toBeNull();b!.click()}
async function boot(age:string){
 localStorage.setItem('aippo_kids_settings_v1',JSON.stringify({guardianAccepted:true,ageBand:age,challengeMode:age==='5-6'?'guided':['7-8','7-9'].includes(age)?'standard':'advanced'}));
 document.body.innerHTML='<div id="app"></div>';
 window.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
 await vi.advanceTimersByTimeAsync(0);
}
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({authenticated:false})}))});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();document.body.innerHTML=''});
it.each([['5-6',0],['7-8',1],['9-10',2],['7-9',1],['10-12',2]])('starts %s at level %s and completes five stages without duplicate stamps',async(age,level)=>{
 await boot(String(age));
 for(let n=0;n<5;n++){
  api().startQuest(n);expect(api().state.five.level).toBe(level);
  for(let round=0;round<3;round++){click('[data-five-choice="0"]');click('[data-five-next]')}
  expect(api().state.view).toBe('win');
  const id=api().quests[n].id;
  expect(api().saved.latestAttempts[id].five.rounds).toHaveLength(3);
  expect(api().saved.latestAttempts[id].five.independentTransfer).toBe(true);
 }
 expect(Object.keys(api().saved.done)).toHaveLength(5);
 api().startQuest(0);
 for(let round=0;round<3;round++){click('[data-five-choice="0"]');click('[data-five-next]')}
 expect(Object.keys(api().saved.done)).toHaveLength(5);
});
it('records help and wrong answers without granting completion early',async()=>{
 await boot('5-6');api().startQuest(0);
 click('[data-five-choice="1"]');expect(Object.keys(api().saved.done)).toHaveLength(0);
 for(let r=0;r<3;r++){click('[data-five-hint]');click('[data-five-choice="0"]');click('[data-five-next]')}
 expect(api().saved.latestAttempts['w1-q1'].five.independentTransfer).toBe(false);
});
it('restarts evidence when changing difficulty',async()=>{
 await boot('5-6');api().startQuest(0);
 click('[data-five-choice="0"]');click('[data-five-next]');
 click('[data-five-level="1"]');expect(api().state.five.level).toBe(1);
 expect(document.body.textContent).toContain('1/3');
 expect(Object.keys(api().saved.done)).toHaveLength(0);
});
