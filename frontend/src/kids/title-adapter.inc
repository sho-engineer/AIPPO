// Title/auth adapter only. Curriculum, persistence validation, migration,
// grading and learning views remain in learning.html.
let sessionPromise=null,sessionEpoch=0;
function reloadAccountProgress(){Object.assign(saved,load());migrateProgress();save()}
function checkSession(){
 if(sessionPromise)return sessionPromise;
 const epoch=sessionEpoch;let timeout;
 sessionPromise=(async()=>{
  try{const me=await Promise.race([apiCall('/me/'),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('session timeout')),2500)})]);if(epoch!==sessionEpoch)return;if(me.authenticated&&me.user?.email){auth.user=me.user;auth.status='authenticated'}else{auth.user=null;auth.status='guest'}}catch{if(epoch!==sessionEpoch)return;auth.user=null;auth.status='guest'}finally{clearTimeout(timeout)}
  if(epoch!==sessionEpoch)return;reloadAccountProgress();if(state.view==='home'||state.view==='settings')render();
 })();return sessionPromise;
}
function launchAdventure(){
 if(auth.status==='loading'){const from=state.view;toast('ログイン状態を確認しています…');void checkSession().then(()=>{if(state.view===from)launchAdventure()});return}
 if(!settings.guardianAccepted){showGuardianSetup();return}go('learning');
}
function selectGuest(){sessionEpoch++;auth.user=null;auth.status='guest';reloadAccountProgress();launchAdventure()}
function layout(body,options={}){app.classList.toggle('titleMode',state.view==='home'||state.view==='auth');learningLayout(body,options)}
function settingsView(){
 learningSettingsView();const section=document.createElement('section');section.className='settingsSection';
 section.innerHTML=`<h2>アカウント</h2><p class="settingsHelp">${auth.user?`保護者：${escape(auth.user.display_name||auth.user.email)}（ログイン中）`:'ゲストで利用中'}。学習記録はこの端末に保存され、端末間同期はまだありません。ゲストとアカウントの学習記録は別です。</p><button class="settingAction" data-action="account-toggle">${auth.user?'ログアウトする':'ログイン・新規登録'}</button><button class="settingAction" data-action="learning-home">学習ホームを開く</button>`;
 app.querySelector('.settingsScroll').prepend(section);
 if(auth.status==='loading'){const note=document.createElement('p');note.className='settingsHelp';note.setAttribute('role','status');note.textContent='ログイン状態を確認しています。学習記録の操作は確認後に使えます。';section.prepend(note);app.querySelectorAll('[data-action="export"],[data-action="reset"],[data-action="account-toggle"],[data-action="learning-home"],[data-nav="parent"]').forEach(button=>button.disabled=true)}
 section.querySelector('[data-action=account-toggle]').onclick=()=>{if(auth.user)void logout();else{auth.mode='signin';auth.error='';go('auth')}};
 section.querySelector('[data-action=learning-home]').onclick=()=>launchAdventure();
}
function policyModal(type){learningPolicyModal(type);if(type==='privacy'){const note=document.createElement('p');note.textContent='保護者の認証にはセッションCookieと不正アクセス防止Cookieを使います。ログインしても、Kids学習記録の端末間同期はありません。';app.querySelector('.policyText')?.append(note)}}
