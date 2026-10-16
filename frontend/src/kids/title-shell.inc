const OPENING_SEEN='aippo_title_opening_v1';
let openingAttempted=false,openingLayer=null,openingCleanup=null;
function endOpening(){if(openingCleanup){openingCleanup();openingCleanup=null}if(openingLayer){openingLayer.remove();openingLayer=null}app.inert=false;app.querySelector('[data-opening-replay]')?.focus({preventScroll:true})}
function playOpening(){
 if(openingLayer||!app.querySelector('.posterTitle'))return;
 const layer=document.createElement('div');openingLayer=layer;layer.className='openingLayer';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','4秒のオープニング');
 layer.innerHTML='<video muted playsinline autoplay preload="auto" aria-hidden="true"></video><button type="button" class="openingSkip" data-opening-skip>スキップ</button>';
 const video=layer.querySelector('video');video.muted=true;video.playsInline=true;video.src='media/aippo-opening-v1.mp4';
 let loadTimer=setTimeout(endOpening,1200),maximumTimer=setTimeout(endOpening,5500),stallTimer;
 const visibility=()=>{if(document.hidden)endOpening()};document.addEventListener('visibilitychange',visibility);
 const observer=new MutationObserver(()=>{if(!app.querySelector('.posterTitle'))endOpening()});observer.observe(app,{childList:true,subtree:true});
 openingCleanup=()=>{clearTimeout(loadTimer);clearTimeout(maximumTimer);clearTimeout(stallTimer);observer.disconnect();document.removeEventListener('visibilitychange',visibility);video.onplaying=null;video.onwaiting=null;video.onended=null;video.onerror=null;video.pause();video.removeAttribute('src');video.load()};
 video.onplaying=()=>{clearTimeout(loadTimer);clearTimeout(stallTimer)};
 video.onwaiting=()=>{clearTimeout(stallTimer);stallTimer=setTimeout(endOpening,1200)};
 video.onended=endOpening;video.onerror=endOpening;layer.querySelector('[data-opening-skip]').onclick=endOpening;
 layer.addEventListener('keydown',event=>{if(event.key==='Escape')endOpening();if(event.key==='Tab'){event.preventDefault();layer.querySelector('button').focus()}});
 document.body.append(layer);app.inert=true;layer.querySelector('button').focus();
 try{const result=video.play();if(result&&typeof result.catch==='function')result.catch(()=>{if(openingLayer===layer)endOpening()})}catch{endOpening()}
}
function setupOpening(){
 const title=app.querySelector('.posterTitle');if(!title)return;
 const replay=document.createElement('button');replay.type='button';replay.className='posterReplay';replay.dataset.openingReplay='';replay.textContent='オープニング';replay.setAttribute('aria-label','オープニングをもう一度見る');replay.onclick=playOpening;title.append(replay);
 if(openingAttempted)return;openingAttempted=true;
 try{if(localStorage.getItem(OPENING_SEEN))return;localStorage.setItem(OPENING_SEEN,'seen')}catch{return}
 if(settings.guardianAccepted||auth.user||Object.keys(saved.done||{}).length)return;
 const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduced||navigator.connection?.saveData)return;
 playOpening();
}
function home(){
 const account=auth.user;
 layout(`<main class="view posterTitle" aria-label="AIPPO Kids タイトル画面">
   <div class="posterArtboard">
     <img class="posterArtwork" src="assets/title/approved-cover.jpeg" alt="AIPPO Kids。ポーちゃんとAIぼうけんへ。空に浮かぶ島と、Poちゃんが走る冒険ゲームのタイトル画面。" fetchpriority="high" decoding="async" draggable="false"/>
     <button type="button" class="posterTouch settings" data-action="poster-settings" aria-label="保護者設定を開く" title="設定"></button>
     <button type="button" class="posterTouch start" data-action="poster-start" aria-label="ぼうけんを はじめる" title="ぼうけんを はじめる"></button>
     <button type="button" class="posterTouch guest" data-action="poster-guest" aria-label="ゲストではじめる" title="ゲストではじめる"></button>
     <button type="button" class="posterTouch login" data-action="poster-login" aria-label="${account?'ログイン中の設定':'ログイン'}" title="ログイン"></button>
   </div>
   <nav class="posterLandscapeControls" aria-label="横向きの始め方"><p>横向きでは、こちらから操作できます。</p><button type="button" data-action="poster-start">ぼうけんを はじめる</button><button type="button" data-action="poster-guest">ゲストではじめる</button><button type="button" data-action="poster-login">${account?'ログイン中の設定':'ログイン'}</button><button type="button" data-action="poster-settings">保護者設定</button></nav>
 </main>`);
 app.querySelectorAll('[data-action=poster-start]').forEach(b=>b.onclick=()=>launchAdventure());
 app.querySelectorAll('[data-action=poster-guest]').forEach(b=>b.onclick=()=>account?logout():selectGuest());
 app.querySelectorAll('[data-action=poster-login]').forEach(b=>b.onclick=()=>{if(account){go('settings');return}auth.mode='signin';auth.error='';go('auth')});
 app.querySelectorAll('[data-action=poster-settings]').forEach(b=>b.onclick=()=>go('settings'));
 setupOpening();
}


const API='/api/v1/accounts';
function csrfCookie(){try{const m=document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);return m?decodeURIComponent(m[1]):''}catch{return ''}}
async function csrf(){if(csrfCookie())return csrfCookie();const r=await fetch(API+'/csrf/',{credentials:'same-origin'});if(!r.ok)throw Error('認証サービスに接続できません。');return csrfCookie()}
async function apiCall(path,payload=null){const headers={'Accept':'application/json'};if(payload!==null){const token=await csrf();if(token)headers['X-CSRFToken']=token;headers['Content-Type']='application/json'}const r=await fetch(API+path,{method:payload===null?'GET':'POST',headers,credentials:'same-origin',body:payload===null?undefined:JSON.stringify(payload)});let body={};try{body=await r.json()}catch{}if(!r.ok){const msgs=body?.errors&&typeof body.errors==='object'?Object.values(body.errors).flat().filter(x=>typeof x==='string'):[];const err=new Error(msgs[0]||body?.detail||body?.message||(r.status===403?'認証の確認に失敗しました。':'接続に失敗しました。もう一度お試しください。'));err.status=r.status;throw err}return body}
__SESSION_CHECK__
async function logout(){try{await apiCall('/signout/',{})}catch{toast('ログアウトできませんでした。通信を確認してください');return}sessionEpoch++;auth.user=null;auth.status='guest';reloadAccountProgress();state.view='home';render()}
function authView(){
 const mode=auth.mode;const isSignIn=mode==='signin',isSignUp=mode==='signup',isReset=mode==='reset',isConfirm=mode==='confirm',isVerify=mode==='verify',isMfa=mode==='mfa';
 const heading=isSignIn?'おかえりなさい':isSignUp?'アカウントをつくる':isReset?'パスワードを再設定':isConfirm?'新しいパスワード':isVerify?'メールアドレスの確認':'確認コードを入力';
 const info=isSignIn?'保護者のメールアドレスでログイン':isSignUp?'保護者の方が登録してください':isReset?'再設定用のメールをお送りします':isConfirm?'新しいパスワードを設定します':isVerify?'メールアドレスを確認します':'認証アプリのコードを入力してください';
 const emailInput=!isMfa&&!isConfirm&&!isVerify?`<label class="accountField">メールアドレス<input name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required value="${escape(auth.email)}"/></label>`:'';
 const pwInput=isSignIn||isSignUp||isConfirm?`<label class="accountField">${isConfirm?'新しいパスワード':'パスワード'}<input name="password" type="password" autocomplete="${isSignIn?'current-password':'new-password'}" minlength="8" maxlength="128" required/></label>`:'';
 const pwAgain=isSignUp||isConfirm?`<label class="accountField">パスワード（確認）<input name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required/></label>`:'';
 const mfaInput=isMfa?`<label class="accountField">確認コード<input name="mfa" autocomplete="one-time-code" inputmode="text" required maxlength="40" /></label>`:'';
 const consent=isSignUp?`<label class="accountCheck"><input type="checkbox" name="consent" required/> <span>保護者として、利用案内とプライバシー説明を確認し、同意します。</span></label>`:'';
 const button=isSignIn?'ログイン':isSignUp?'無料でアカウント作成':isReset?'再設定メールを送る':isConfirm?'新しいパスワードを保存':isVerify?'メールを確認':'コードを確認';
 layout(`<main class="view accountView"><div class="accountBack"><button class="back" data-action="auth-back" aria-label="タイトルにもどる">${ico('back')}</button><img src="${BRAND}" alt="AIPPO"/><span class="brandLabel">KIDS</span></div><div class="accountScroll"><div class="accountHero">${po('talking')}<div><h1>${heading}</h1><p>${info}</p></div></div>
 ${auth.error?`<div class="accountAlert" role="alert">${escape(auth.error)}</div>`:''}${auth.success?`<div class="accountAlert accountSuccess" role="status">${escape(auth.success)}</div>`:''}
 <form class="accountForm" id="account-form">${emailInput}${pwInput}${pwAgain}${mfaInput}${consent}<button class="primary accountSubmit" type="submit" ${auth.busy?'disabled':''}>${auth.busy?'確認しています…':button} ${ico('arrow')}</button></form>
 <div class="accountLinks">${isSignIn?'<button data-authmode="signup">はじめての方：新規登録</button><button data-authmode="reset">パスワードを忘れた</button>':isSignUp||isReset?'<button data-authmode="signin">ログインにもどる</button>':''}<button data-action="auth-guest">ゲストではじめる</button></div>
 <p class="accountInfo">ログインは保護者向けです。<br>Kidsの学習記録は現在この端末にのみ保存され、別の端末とは同期されません。</p><div class="accountPolicy"><button data-authpolicy="terms">利用案内</button><button data-authpolicy="privacy">プライバシー</button></div></div></main>`);
 app.querySelector('[data-action=auth-back]').onclick=()=>go('home');
 app.querySelector('[data-action=auth-guest]').onclick=()=>selectGuest();
 app.querySelectorAll('[data-authmode]').forEach(b=>b.onclick=()=>{auth.mode=b.dataset.authmode;auth.error='';auth.success='';render()});
 app.querySelectorAll('[data-authpolicy]').forEach(b=>b.onclick=()=>policyModal(b.dataset.authpolicy));
 app.querySelector('#account-form').onsubmit=handleAuth;
}
async function handleAuth(e){e.preventDefault();if(auth.busy)return;const form=e.currentTarget;const fd=new FormData(form);const email=String(fd.get('email')||auth.email||'').trim(),password=String(fd.get('password')||''),confirm=String(fd.get('confirm')||'');if(email)auth.email=email;auth.error='';auth.success='';if((auth.mode==='signup'||auth.mode==='confirm')&&password!==confirm){auth.error='パスワードが一致していません。';render();return}auth.busy=true;const submit=app.querySelector('.accountSubmit');if(submit){submit.disabled=true;submit.textContent='確認しています…'};
 try{
  if(auth.mode==='signin'){
   const r=await apiCall('/signin/',{email,password});
   if(r.mfa_required){auth.mode='mfa';auth.busy=false;render();return}
   const me=await apiCall('/me/');if(!me.authenticated||!me.user?.email)throw Error('ログイン状態を確認できませんでした。');sessionEpoch++;auth.user=me.user;auth.status='authenticated';reloadAccountProgress();go('home');return;
  }
  if(auth.mode==='mfa'){
   await apiCall('/mfa/verify/',{code:String(fd.get('mfa')||'')});const me=await apiCall('/me/');if(!me.authenticated||!me.user?.email)throw Error('ログイン状態を確認できませんでした。');sessionEpoch++;auth.user=me.user;auth.status='authenticated';reloadAccountProgress();go('home');return;
  }
  if(auth.mode==='signup'){
   if(fd.get('consent')!=='on')throw Error('保護者の同意を確認してください。');
   await apiCall('/signup/',{email,password,display_name:'',accept_terms:true,accept_privacy:true});const me=await apiCall('/me/');if(!me.authenticated||!me.user?.email)throw Error('登録後の状態を確認できませんでした。');sessionEpoch++;auth.user=me.user;auth.status='authenticated';reloadAccountProgress();go('home');return;
  }
  if(auth.mode==='reset'){await apiCall('/password/reset/',{email});auth.success='登録がある場合、再設定メールを送信しました。';auth.busy=false;render();return}
  if(auth.mode==='confirm'){await apiCall('/password/reset/confirm/',{uid:auth.uid,token:auth.token,new_password:password});auth.mode='signin';auth.success='パスワードを変更しました。ログインしてください。';auth.busy=false;render();return}
  if(auth.mode==='verify'){await apiCall('/email/verify/',{uid:auth.uid,token:auth.token});auth.mode='signin';auth.success='メールを確認しました。';auth.busy=false;render();return}
 }catch(err){auth.error=err.message||'通信に失敗しました。もう一度お試しください。'}finally{auth.busy=false;if(state.view==='auth')render()}
}
function checkIncomingLink(){let path=location.pathname;const params=new URLSearchParams(location.search);const uid=params.get('uid'),token=params.get('token');if(uid&&token&&(path==='/verify-email'||path==='/reset-password')){auth.uid=uid;auth.token=token;auth.mode=path==='/verify-email'?'verify':'confirm';state.view='auth';history.replaceState({},'', '/');}}
