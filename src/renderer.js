const DEFAULT_SERVER='http://localhost:3000';
function normServerUrl(v){
  v=String(v||'').trim();
  if(!v) v=DEFAULT_SERVER;
  if(!/^https?:\/\//i.test(v)) v='http://'+v;
  return v.replace(/\/+$/,'');
}
function getServerHttp(){return normServerUrl(localStorage.nvServerUrl||DEFAULT_SERVER)}
function getServerApi(){return getServerHttp()+'/api'}
function getServerWs(){return getServerHttp().replace(/^http/i,'ws')}
function setServerUrl(v){localStorage.nvServerUrl=normServerUrl(v);return localStorage.nvServerUrl}

const app=document.querySelector('#app');
const nv = window.nv || {
  close:()=>window.close(), minimize:()=>{}, toggleFull:()=>{},
  pickFiles:async()=>[], notify:async()=>{},
  getVersion:async()=> '0.9.9', checkUpdates:async()=>({dev:true}), downloadUpdate:async()=>({ok:false}), installUpdate:async()=>({ok:false}),
  onUpdateAvailable:()=>{}, onUpdateProgress:()=>{}, onUpdateDownloaded:()=>{}, onUpdateError:()=>{}, onUpdateStatus:()=>{}, onChangelog:()=>{},
  readFileBase64:async()=>{throw new Error('preload недоступен')},
  fileInfo:()=>({name:'file',size:0,type:'application/octet-stream'}),
  onWindowState:()=>{}
};
window.nv = nv;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const defaultState=()=>({
  token:localStorage.nvToken||'', user:null, settings:{}, chats:[], messages:{}, active:null,
  tab:'chats', q:'', searchInChat:false, chatSearch:'', replyTo:null, typing:{}, folder:'all',
  fullscreen:true, recording:null, mediaFilter:'all', dateFilter:'', locked:false, fake:false,
  appVersion:localStorage.nvAppVersion||'0.9.9', theme:localStorage.nvTheme||'crimson', accent:localStorage.nvAccent||'#e11b2f', blur:localStorage.nvBlur==='1',
  selected:new Set(), editId:null, micId:localStorage.nvMicId||'', accounts:JSON.parse(localStorage.nvAccounts||'[]'), chatBg:localStorage.nvChatBg||'particles', fontSize:Number(localStorage.nvFontSize||15), fontFamily:localStorage.nvFontFamily||'system', notes:localStorage.nvNotes||'', appVersion:localStorage.nvAppVersion||'0.9.9'
});
let S=defaultState();
let sock=null;
let lastActivity=Date.now();
let voiceTimer=null;

function h(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function time(t){return t?new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):''}
function date(t){return t?new Date(t).toLocaleDateString('ru-RU'):''}
function fmt(n=0){return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B'}
function fileUrl(u){
  u=String(u||'');
  if(!u)return '';
  if(u.startsWith('/uploads/'))return getServerHttp()+u;
  try{let x=new URL(u); if((x.hostname==='localhost'||x.hostname==='127.0.0.1') && getServerHttp().includes('://')){let base=new URL(getServerHttp()); x.protocol=base.protocol; x.host=base.host;} return x.toString();}
  catch{return u}
}
function isImageAtt(a){return String(a?.type||'').startsWith('image/')}
function isVideoAtt(a){return String(a?.type||'').startsWith('video/')}
function isAudioAtt(a){return String(a?.type||'').startsWith('audio/')}
function currentChat(){return S.chats.find(x=>x.id===S.active)}
function av(u,cls='avatar'){
  const name=(u?.displayName||u?.username||'?');
  if(u?.avatar) return `<img class="${cls}" src="${h(fileUrl(u.avatar))}" onerror="this.outerHTML='<div class=&quot;${cls}&quot;>${h(name[0]).toUpperCase()}</div>'">`;
  return `<div class="${cls}">${h(name[0]).toUpperCase()}</div>`;
}
async function api(path,opt={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(), Number(opt.timeout||18000));
  try{
    const r=await fetch(getServerApi()+path,{...opt,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+S.token,...(opt.headers||{})}});
    if(!r.ok){let e=await r.json().catch(()=>({error:'Ошибка сервера'})); throw new Error(e.error||'Ошибка сервера');}
    return r.json();
  }catch(e){
    if(e.name==='AbortError') throw new Error('сервер не отвечает');
    if(String(e.message||'').includes('Failed to fetch')) throw new Error('нет подключения к серверу '+getServerHttp());
    throw e;
  }finally{clearTimeout(timeout)}
}
function toast(t){let d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),3600)}
function beep(freq=520,dur=.12,vol=.045){try{const A=window.AudioContext||window.webkitAudioContext; const a=new A(),o=a.createOscillator(),g=a.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(a.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+dur); setTimeout(()=>a.close(),dur*1000+80)}catch{}}
function playLoginSound(){beep(140,.09,.035);setTimeout(()=>beep(360,.10,.04),90);setTimeout(()=>beep(720,.13,.04),200)}
function notifyNew(title,body){toast('🔔 '+title+': '+String(body).slice(0,80));beep(620,.08,.035);try{if(window.Notification&&Notification.permission==='default')Notification.requestPermission(); if(window.Notification&&Notification.permission==='granted')new Notification(title,{body:String(body).slice(0,120)})}catch{} try{nv.notify({title,body})}catch{}}

const themeAccents={crimson:'#e11b2f',obsidian:'#8aa4ff',blood:'#ff1835',matrix:'#ff0033',black:'#e8e8e8',purple:'#9b5cff',telegram:'#6b7b8c',gold:'#d4af37',ocean:'#16b7d9'};
function applyVisualPrefs(){document.body.className='theme-'+(S.theme||'crimson')+(S.blur?' blur-on':'')+' chatbg-'+(S.chatBg||'particles');document.documentElement.style.setProperty('--red',S.accent||themeAccents[S.theme]||'#e11b2f');document.documentElement.style.setProperty('--chatFontSize',(S.fontSize||15)+'px');document.documentElement.style.setProperty('--chatFontFamily',fontCss(S.fontFamily))}
function fontCss(v){return v==='mono'?'Consolas, monospace':v==='serif'?'Georgia, serif':v==='telegram'?'Segoe UI, Arial, sans-serif':'Segoe UI, Arial, sans-serif'}
function ensureAccentForTheme(theme){ if(!localStorage.nvAccentCustom){S.accent=themeAccents[theme]||S.accent; localStorage.nvAccent=S.accent;} }

function titlebar(){return S.fullscreen?'':`<div class="titlebar nvTitlebar"><div class="titleLeft"><span class="titleDot"></span><b>Night<span>Vault</span></b></div><div class="winBtns"><button id="winMin" title="Свернуть">—</button><button id="winFull" title="Во весь экран">▢</button><button id="winClose" title="Закрыть">×</button></div></div>`}

let lastRenderAt=0;
function rememberUiScroll(){return {list:document.querySelector('.chatList')?.scrollTop||0,msgs:document.querySelector('#msgs')?.scrollTop||0,active:S.active};}
function restoreUiScroll(pos,{messages=false}={}){requestAnimationFrame(()=>{let list=document.querySelector('.chatList');if(list)list.scrollTop=pos.list||0;let msgs=document.querySelector('#msgs');if(msgs&&messages&&pos.active===S.active)msgs.scrollTop=pos.msgs||0;});}
function stableRender({keepMessages=false}={}){const pos=rememberUiScroll();render();restoreUiScroll(pos,{messages:keepMessages});}

async function loadAppVersion(){
  try{
    const v=await nv.getVersion();
    if(v&&v!=='dev'){S.appVersion=v;localStorage.nvAppVersion=v;} else {S.appVersion=localStorage.nvAppVersion||S.appVersion||'0.9.9';}
  }catch{S.appVersion=S.appVersion||localStorage.nvAppVersion||'0.9.9'}
}
function startupUpdateCheck(delay=2500){
  setTimeout(async()=>{
    try{
      const r=await nv.checkUpdates();
      if(r?.error) toast('Проверка обновлений: '+r.error);
    }catch(e){toast('Проверка обновлений: '+(e.message||e))}
  },delay);
}
async function init(){
  await loadAppVersion();
  applyVisualPrefs();
  try{await loadAudioDevices()}catch{}; try{ if(window.Notification && Notification.permission==='default') Notification.requestPermission(); }catch{}
  if(S.token){try{let r=await api('/me');S.user=r.user;S.settings=r.settings||{};connect();await loadChats(false);render();setTimeout(()=>scrollChatBottom(false),0);startupUpdateCheck(1800);return}catch{localStorage.removeItem('nvToken');S.token=''}}
  renderAuth();
  startupUpdateCheck(1800);
}
function renderAuth(){
  app.innerHTML=`<div class="auth"><div class="authBox panelIn"><div class="logo">Night<span>Vault</span></div><div class="small">private crimson messenger</div>
    <details class="connectDetails" open><summary>Подключение к серверу</summary>
      <input id="serverUrl" class="field" placeholder="http://26.4.1.76:3000" value="${h(getServerHttp())}">
      <div class="small">Для Radmin VPN укажи адрес ПК, где запущен сервер. Например: <b>http://26.4.1.76:3000</b></div>
      <button class="btn ghost" id="saveServer" type="button" style="width:100%;margin-top:8px">Сохранить адрес</button>
    </details>
    ${accountSwitcher()}<input id="u" class="field" placeholder="ник" value="${h(localStorage.nvLastUser||'')}"><input id="p" class="field" type="password" placeholder="пароль"><input id="two" class="field" placeholder="2FA код, если включен"><button class="btn" id="login">Войти</button><button class="btn ghost" id="swap">Регистрация</button><button class="btn ghost" id="authCheckUpdates" type="button">Проверить обновления</button><div class="appVersionLine">Установлена версия: <b>${h(S.appVersion||'...')}</b></div><div class="small" style="margin-top:12px">Ник запоминается, пароль вводится заново.</div></div></div>`;
  let reg=false;
  $('#saveServer').onclick=()=>{setServerUrl($('#serverUrl').value); toast('Адрес сервера сохранён: '+getServerHttp())};
  $('#swap').onclick=()=>{reg=!reg;$('#login').textContent=reg?'Создать аккаунт':'Войти';$('#swap').textContent=reg?'У меня уже есть аккаунт':'Регистрация'};
  $('#authCheckUpdates').onclick=()=>checkUpdates();
  $('#login').onclick=async()=>{try{setServerUrl($('#serverUrl')?.value||getServerHttp());let body={username:$('#u').value,password:$('#p').value,displayName:$('#u').value,twofa:$('#two').value};let r=await api(reg?'/register':'/login',{method:'POST',body:JSON.stringify(body)});S.token=r.token;S.user=r.user;S.settings=r.settings||{};localStorage.nvToken=S.token;localStorage.nvLastUser=S.user.username;rememberAccount(S.user.username,S.token);playLoginSound();connect();await loadChats(false);render()}catch(e){toast('Ошибка входа/регистрации: '+e.message)}};
}
let reconnectTimer=null;
function connect(){
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  if(sock)try{sock.close()}catch{}
  sock=new WebSocket(getServerWs()+'?token='+encodeURIComponent(S.token));
  sock.onopen=()=>{try{toast('Сервер подключен')}catch{}};
  sock.onerror=()=>{try{toast('WebSocket: нет соединения с сервером')}catch{}};
  sock.onclose=()=>{ if(S.token&&S.user&&!reconnectTimer) reconnectTimer=setTimeout(()=>connect(),3500); };
  sock.onmessage=async ev=>{try{let p=JSON.parse(ev.data);
    if(p.type==='message'){
      S.messages[p.message.chatId]=S.messages[p.message.chatId]||[];
      if(!S.messages[p.message.chatId].some(m=>m.id===p.message.id))S.messages[p.message.chatId].push(p.message);
      await loadChats(false);
      if(S.active!==p.message.chatId&&p.message.from!==S.user.username){let c=S.chats.find(x=>x.id===p.message.chatId);if(S.settings.notify!==false&&!c?.muted?.[S.user.username])notifyNew(c?.title||c?.other?.displayName||'NightVault',p.message.text||p.message.attachment?.name||'Новое сообщение')}
      if(S.active===p.message.chatId){ renderMessagesOnly(false); } else { render(); }
    }
    if(p.type==='message_update'){replaceMsg(p.message);renderMessagesOnly(false)}
    if(p.type==='message_delete'){for(const k in S.messages)S.messages[k]=S.messages[k].filter(m=>m.id!==p.id);S.selected.delete(p.id);renderMessagesOnly(false)}
    if(p.type==='chat_update'){await loadChats(false);render()}
    if(p.type==='typing'){S.typing[p.chatId]=p.active?p.user:null;renderTyping();setTimeout(()=>{if(S.typing[p.chatId]===p.user){delete S.typing[p.chatId];renderTyping()}},2600)}
    if(p.type==='read'){await loadChats(false);renderMessagesOnly(false)}
  }catch(e){toast('Ошибка WS: '+e.message)}};
}
function replaceMsg(message){for(const k in S.messages){let i=S.messages[k].findIndex(m=>m.id===message.id);if(i>=0)S.messages[k][i]=message}}
async function loadChats(draw=true){let r=await api('/chats');S.chats=r.chats||[];if(draw)render()}
async function openChat(id){try{S.active=id;S.selected.clear();S.editId=null;let c=S.chats.find(x=>x.id===id);if(c?.other){try{let u=await api('/user/'+c.other.username);c.other=u.user}catch{}}let r=await api('/chats/'+id+'/messages');S.messages[id]=r.messages||[];api('/chats/'+id+'/read',{method:'POST',body:'{}'}).catch(()=>{});S.mediaFilter='all';S.dateFilter='';S.chatSearch='';render();setTimeout(()=>scrollChatBottom(false),0)}catch(e){toast('Не удалось открыть чат: '+e.message)}}
function filteredChats(){let q=S.q.toLowerCase();return S.chats.filter(c=>{if(isHidden(c.id)&&S.folder!=='hidden')return false; if(isArchived(c.id)&&S.folder!=='archive')return false;let name=(c.type==='private'?c.other?.displayName:c.title)||'';let ok=!q||name.toLowerCase().includes(q)||(c.last?.text||'').toLowerCase().includes(q)||(c.last?.attachment?.name||'').toLowerCase().includes(q);if(S.folder==='unread')ok=ok&&c.unread>0;if(S.folder==='groups')ok=ok&&(c.type==='group'||c.type==='channel');if(S.folder==='saved')ok=ok&&c.type==='saved';if(S.folder==='archive')ok=ok&&isArchived(c.id);if(S.folder==='hidden')ok=ok&&isHidden(c.id);return ok}).sort((a,b)=>(isPinnedChat(b.id)-isPinnedChat(a.id))||((b.last?.createdAt||b.createdAt)-(a.last?.createdAt||a.createdAt)))}
function render(){if(!S.user)return renderAuth();applyVisualPrefs();app.innerHTML=titlebar()+`<div class="shell ${S.fullscreen?'fullscreen':'windowed'}"><div class="tabs"><button class="tab ${S.tab==='chats'?'active':''}" onclick="S.tab='chats';render()">💬<small>Чаты</small>${S.chats.reduce((a,c)=>a+(c.unread||0),0)?'<span class=count>'+S.chats.reduce((a,c)=>a+(c.unread||0),0)+'</span>':''}</button><button class="tab ${S.tab==='contacts'?'active':''}" onclick="S.tab='contacts';render()">👥<small>Люди</small></button><button class="tab ${S.tab==='profile'?'active':''}" onclick="S.tab='profile';render()">👤<small>Профиль</small></button><button class="tab ${S.tab==='notes'?'active':''}" onclick="S.tab='notes';render()">📝<small>Заметки</small></button><button class="tab ${S.tab==='links'?'active':''}" onclick="S.tab='links';render()">🔗<small>Ссылки</small></button><button class="tab ${S.tab==='downloads'?'active':''}" onclick="S.tab='downloads';render()">📁<small>Файлы</small></button><button class="tab ${S.tab==='settings'?'active':''}" onclick="S.tab='settings';render()">⚙<small>Опции</small></button>${S.fullscreen?`<button class="tab bottom" id="minAppBtn">—<small>Свернуть</small></button><button class="tab" id="closeAppBtn">⏻<small>Закрыть</small></button>`:`<span class="tabSpacer"></span>`}<button class="tab" onclick="logout()">⇥<small>Аккаунт</small></button></div>${renderLeft()}<main class="main">${renderCenter()}</main><aside class="side">${renderSide()}</aside></div>`;bind();}
function renderChatListOnly(){let el=document.querySelector('.chatList');if(el)el.innerHTML=filteredChats().map(c=>chatRow(c)).join('')||'<div class=empty>Пусто</div>'}
function renderLeft(){if(['profile','settings','notes','links','downloads'].includes(S.tab))return `<section class=list><div class=sidePad><h2>${pageTitle()}</h2><p class=muted>Раздел приложения</p><button class=btn onclick="accountManager()">Аккаунты</button></div></section>`;return `<section class="list"><div class="search"><input id="q" placeholder="Поиск" value="${h(S.q)}"><button class="iconBtn" onclick="newGroup()">✚</button></div><div class="folders"><button class="chip ${S.folder==='all'?'active':''}" onclick="S.folder='all';render()">Все</button><button class="chip ${S.folder==='unread'?'active':''}" onclick="S.folder='unread';render()">Непроч.</button><button class="chip ${S.folder==='groups'?'active':''}" onclick="S.folder='groups';render()">Группы</button><button class="chip ${S.folder==='saved'?'active':''}" onclick="S.folder='saved';render()">Избранное</button><button class="chip ${S.folder==='archive'?'active':''}" onclick="S.folder='archive';render()">Архив</button><button class="chip ${S.folder==='hidden'?'active':''}" onclick="openHiddenFolder()">Скрытые</button></div><div class="chatList">${filteredChats().map(c=>chatRow(c)).join('')||'<div class=empty>Пусто</div>'}</div></section>`}
function chatRow(c){let isSaved=c.type==='saved';let u=c.type==='private'?c.other:{displayName:c.title||'Избранное',username:isSaved?'saved':c.type,avatar:c.avatar,isSaved};let last=c.last?(c.last.attachment?'📎 '+c.last.attachment.name:c.last.text):getDraft(c.id)?'Черновик: '+getDraft(c.id):'Нет сообщений';return `<div class="row ${S.active===c.id?'active':''}" onclick="openChat('${c.id}')">${isPinnedChat(c.id)?'<span class=pinBadge>📌</span>':''}${av(u)}<div class=rowMain><div class=rowTop><b class=ellipsis>${h(u.displayName)}</b><span class=muted>${time(c.last?.createdAt)}</span></div><div class="small ellipsis">${h(last||'')}</div></div>${c.unread?`<span class=count>${c.unread}</span>`:''}</div>`}
function renderCenter(){
  if(S.locked)return lockPage(); if(S.fake)return fakePage(); if(S.tab==='profile')return profilePage(); if(S.tab==='settings')return settingsPage(); if(S.tab==='contacts')return contactsPage(); if(S.tab==='notes')return notesPage(); if(S.tab==='links')return linksPage(); if(S.tab==='downloads')return downloadsPage();
  let c=currentChat(); if(!c)return '<div class=empty>Выбери чат или найди человека по нику</div>'; let u=c.type==='private'?c.other:{displayName:c.title,username:c.type,avatar:c.avatar};
  let list=visibleMessages(c.id);
  return `<div class=chatHead onclick="showProfile('${c.id}')">${av(u)}<div><b>${h(u.displayName)}</b><div class=small>${c.type==='private'?(u.status==='online'?'в сети':'был '+date(u.lastSeen)+' '+time(u.lastSeen)):c.type}</div></div><div class=headActions onclick="event.stopPropagation()"><button class=iconBtn onclick="S.searchInChat=!S.searchInChat;render()">🔎</button><button class=iconBtn onclick="togglePinnedChat('${c.id}')">📌</button><button class=iconBtn onclick="toggleArchiveChat('${c.id}')">🗄</button><button class=iconBtn onclick="showChatMenu(event)">⋮</button></div></div>${S.searchInChat?`<div class=search><input id=chatSearch placeholder="Поиск в этом чате" value="${h(S.chatSearch||'')}"><input id=dateSearch type=date value="${h(S.dateFilter||'')}"><select id=mediaFilter><option value=all>Все</option><option value=photo>Фото</option><option value=video>Видео</option><option value=document>Документы</option><option value=audio>Аудио</option><option value=link>Ссылки</option></select><button class=iconBtn onclick="S.searchInChat=false;S.chatSearch='';S.dateFilter='';S.mediaFilter='all';render()">×</button></div>`:''}${S.selected.size?selectionBar():''}${c.pinned?.length?`<div class=pinned>📌 Закреплено: ${c.pinned.length}</div>`:''}<div class=messages id=msgs onscroll="toggleBottomBtn()">${list.map(m=>msgHtml(m)).join('')}<button id=bottomBtn class=bottomBtn onclick="scrollChatBottom(false)">↓</button></div><div class=typing id=typing></div><div class="composer" ondragover="event.preventDefault()" ondrop="dropFiles(event)">${S.replyTo?`<div class=reply>Ответ на сообщение <button onclick="S.replyTo=null;render()">×</button></div>`:''}${S.editId?`<div class=reply>Редактирование <button onclick="cancelEdit()">×</button></div>`:''}<button class=iconBtn onclick="attachFiles()">📎</button><textarea id=txt placeholder="Напишите сообщение..."></textarea><button class=iconBtn onclick="toggleEmojiPicker()" title="Эмодзи">😊</button><button class="iconBtn voiceBtn" id=recBtn title="Зажми для записи" onmousedown="startVoice()" onmouseup="stopVoice(true)"  ontouchstart="event.preventDefault();startVoice()" ontouchend="event.preventDefault();stopVoice(true)">🎤</button><div id=voiceState class=voiceState></div><button class=btn onclick="sendMsg()">➤</button></div>`
}
function selectionBar(){return `<div class=selectedBar><button class=iconBtn onclick="clearSelection()">×</button><b>${S.selected.size} выбрано</b><span class=spacer></span><button class=iconBtn onclick="deleteSelected(0)">🗑 у себя</button><button class=iconBtn onclick="deleteSelected(1)">🗑 у всех</button></div>`}
function msgHtml(m){
  const mine=m.from===S.user.username; const q=(S.chatSearch||'').trim(); let text=h(m.text||''); if(q){const re=new RegExp('('+escapeReg(q)+')','ig'); text=text.replace(re,'<mark class="highlight">$1</mark>')}
  const reply=m.replyTo?findMsg(m.replyTo):null;
  let reactions=Object.entries(m.reactions||{}).filter(([,v])=>v?.length).map(([e,v])=>`<button class=reaction onclick="react('${m.id}','${h(e)}')">${h(e)} ${v.length}</button>`).join('');
  const voiceOnly=!!(m.attachment&&m.attachment.voice&&!text&&!reply);
  let au=authorFor(m);return `<div class="msgWrap ${mine?'mineWrap':''}"><label class=selectBox><input type=checkbox ${S.selected.has(m.id)?'checked':''} onchange="toggleSelect('${m.id}')"></label>${!mine?av(au,'msgAvatar'):''}<div class="msg ${mine?'mine':''} ${voiceOnly?'voiceMsg':''} ${m.attachment&&String(m.attachment.type||'').startsWith('image/')?'photoMsg':''}" oncontextmenu="ctx(event,'${m.id}')" ondblclick="toggleSelect('${m.id}')">${reply?`<div class=reply>↩ ${h(reply.text||reply.attachment?.name||'сообщение')}</div>`:''}${text?`<div class=msgText>${text}</div>`:''}${m.attachment?attHtml(m.attachment):''}${reactions}<div class=msgMeta>${m.editedAt?'изменено · ':''}${time(m.createdAt)} ${mine?status(m):''}</div></div>${mine?av(au,'msgAvatar mineMsgAvatar'):''}</div>`
}
function escapeReg(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function findMsg(id){for(const arr of Object.values(S.messages)){let m=arr.find(x=>x.id===id);if(m)return m}return null}
function status(m){let c=S.chats.find(x=>x.id===m.chatId);let others=(c?.members||[]).filter(x=>x!==S.user.username);if(!others.length)return '<span class=read>✓</span>';if(others.every(x=>(m.readBy||[]).includes(x)))return '<span class=read>✓✓</span>';if(others.some(x=>(m.deliveredTo||[]).includes(x)))return '<span class=sent>✓</span>';return '<span class=sending>•</span>'}
function attHtml(a){
  if(!a)return '';
  const url=fileUrl(a.url);
  let t=a.type||'';
  if(t.startsWith('image/'))return `<div class=photoBubble><img class=photoPreview src="${h(url)}"><div class=photoOverlay><span>${h(a.name)}</span><span>${fmt(a.size)}</span></div></div>`;
  if(t.startsWith('video/'))return `<div class=photoBubble><video class=photoPreview controls src="${h(url)}"></video><div class=photoOverlay><span>${h(a.name)}</span><span>${fmt(a.size)}</span></div></div>`;
  if(t.startsWith('audio/')){
    if(a.voice) return `<div class=voiceBubble><button class=voicePlay onclick="playVoice(event,'${h(url)}')">▶</button><div class=voiceWave>${Array.from({length:34},(_,i)=>'<i style="height:'+((i*7)%22+6)+'px"></i>').join('')}</div><span class=voiceDur>${Math.floor((a.duration||0)/60)}:${String((a.duration||0)%60).padStart(2,'0')}</span></div>`;
    return `<audio controls src="${h(url)}"></audio><div class=small>${h(a.name)} · ${fmt(a.size)}</div>`
  }
  return `<a class=fileCard href="${h(url)}" target="_blank">📄 <span>${h(a.name)}<br><span class=small>${fmt(a.size)}</span></span></a>`
}
function playVoice(e,url){e.stopPropagation();url=fileUrl(url);let b=e.currentTarget;if(b.audio&& !b.audio.paused){b.audio.pause();b.textContent='▶';return}let a=new Audio(url);a.preload='auto';b.audio=a;b.textContent='⏸';a.onerror=()=>{b.textContent='▶';toast('Не удалось открыть файл голосового. Проверь адрес сервера и /uploads')};a.onended=()=>b.textContent='▶';a.play().catch(err=>{b.textContent='▶';toast('Не удалось проиграть: '+(err.message||err))})}

function renderSide(){let c=currentChat(); if(!c)return `<div class=sidePad><h2>NightVault</h2><div class=securityCard>🔐 Шифрование: включено<br>🧬 Ключ подтвержден<br>📅 Последняя проверка: сегодня</div><p class=muted>Crimson private messenger</p></div>`; let u=c.type==='private'?c.other:{displayName:c.title,username:c.type,avatar:c.avatar,bio:c.description,banner:c.banner}; let files=(S.messages[c.id]||[]).filter(m=>m.attachment).slice(-8).reverse();return `<div class=sidePad><div class=profileHero style="${u.banner?'background-image:url('+h(fileUrl(u.banner))+')':''}">${av(u,'bigAvatar '+(u.avatarFrame||''))}</div><h2>${h(u.displayName)} ${u.verification==='verified'?'🟢':u.verification==='suspicious'?'🤖':''}</h2><div class=muted>@${h(u.username)}</div><p>${h(u.bio||'Нет описания')}</p><div class=securityCard>🔐 Шифрование: включено<br>🧬 Ключ подтвержден<br>📅 Последняя проверка: сегодня</div><button class=btn onclick="showProfile('${c.id}')">Открыть профиль</button>${c.type==='private'?`<button class='btn ghost' onclick="repMenu('${u.username}','praise')">Похвалить</button><button class='btn danger' onclick="repMenu('${u.username}','report')">Пожаловаться</button>`:''}<button class="btn ghost" onclick="hideActiveChat()">Скрыть чат</button><button class="btn ghost" onclick="muteChat()">Уведомления</button><h3>Файлы</h3>${files.map(m=>`<div class=fileCard>📎 <span class=ellipsis>${h(m.attachment.name)}</span></div>`).join('')||'<div class=muted>Пока нет файлов</div>'}</div>`}
function profilePage(){return `<div class=sidePad style="max-width:760px"><h1>Мой профиль</h1><div class=profileHero style="${S.user.banner?'background-image:url('+h(fileUrl(S.user.banner))+')':''}">${av(S.user,'bigAvatar '+(S.user.avatarFrame||''))}</div><input id=pd class=field value="${h(S.user.displayName)}"><textarea id=pb class=field>${h(S.user.bio||'')}</textarea><label>Цвет профиля<input id=profileColor class=field type=color value="${h(S.user.profileColor||S.accent||'#e11b2f')}"></label><label>Рамка аватарки<select id=avatarFrame class=field><option value="">Без рамки</option><option value="frame-red">Crimson Ring</option><option value="frame-gold">Golden Ring</option><option value="frame-purple">Purple Neon</option><option value="frame-ocean">Ocean Glow</option><option value="frame-halo">Halo Ring</option><option value="frame-orbit">Orbit Ring</option><option value="frame-shadow">Shadow Ring</option><option value="frame-neon">Neon Ring</option></select></label><button class=btn onclick="saveProfile()">Сохранить</button><button class="btn ghost" onclick="changeAvatar()">Сменить аватар</button><button class="btn ghost" onclick="changeBanner()">Загрузить баннер</button><button class="btn danger" onclick="logout()">Выйти из аккаунта</button><div id=statsBox></div></div>`}
function settingsPage(){return `<div class=sidePad style="max-width:920px"><h1>Настройки</h1><div class=settingsNav><h2>О приложении</h2><div class=securityCard>🌙 NightVault<br>📦 Установленная версия: <b>${h(S.appVersion||'...')}</b><br>🔄 Обновления: GitHub Releases</div><button class="btn updateBig" onclick="checkUpdates()">Проверить обновления</button><label>Адрес сервера<input id=serverSettings class=field value="${h(getServerHttp())}" placeholder="http://localhost:3000 или http://26.x.x.x:3000"></label><button class="btn ghost" onclick="saveServerConnection()">Сохранить подключение</button><h2>Оформление</h2><label>Тема<select id=theme class=field><option value=crimson>Crimson</option><option value=obsidian>Obsidian</option><option value=blood>Blood Moon</option><option value=matrix>Matrix Red</option><option value=black>Pure Black</option><option value=purple>Purple Signal</option><option value=telegram>Telegram Gray</option><option value=gold>Gold Vault</option><option value=ocean>Ocean Deep</option></select></label><label>Акцентный цвет<input id=accent class=field type=color value="${h(S.accent||'#e11b2f')}"></label><label><input id=blur type=checkbox ${S.blur?'checked':''}> Размытие фона / glass blur</label><h2>Настройки чатов</h2><label>Анимация поверх приложения<select id=chatBg class=field><option value=none>Без анимации</option><option value=rain>Дождь</option><option value=snow>Снег</option><option value=matrix>Матрица</option><option value=particles>Красные частицы</option><option value=space>Космос</option><option value=waves>Море</option></select></label><div class=small>Фон чата теперь выбирается автоматически под тему, а этот пункт включает эффект поверх всего окна.</div><label>Размер шрифта<input id=fontSize class=field type=range min=12 max=22 value="${S.fontSize||15}"></label><label>Шрифт<select id=fontFamily class=field><option value=system>System</option><option value=telegram>Telegram-like</option><option value=mono>Mono</option><option value=serif>Serif</option></select></label><h2>Микрофон</h2><label>Микрофон<select id=mic class=field>${(S.audioDevices||[]).map(d=>`<option value="${h(d.deviceId)}">${h(d.label||'Микрофон')}</option>`).join('')||'<option value="">Системный микрофон</option>'}</select></label><button class="btn ghost" onclick="testMicList()">Обновить список микрофонов</button><h2>Безопасность</h2><div class=securityCard>🔐 Шифрование: включено<br>🧬 Ключ подтвержден<br>📅 Последняя проверка: сегодня</div><label>PIN приложения<input id=pin class=field value="${h(S.settings.pin||'')}"></label><label>Пароль на запуск<input id=startPass class=field type=password value="${h(S.settings.startPass||'')}"></label><label>2FA код<input id=twofa class=field value="${h(S.settings.twofa||'')}"></label><label><input id=notify type=checkbox ${S.settings.notify!==false?'checked':''}> Уведомления</label><label>Автоблокировка, минут<input id=lock class=field type=number value="${S.settings.autoLock||0}"></label><button class=btn onclick="saveSettings()">Сохранить настройки</button><button class="btn ghost" onclick="lockApp()">Заблокировать сейчас</button><button class="btn ghost" onclick="exportBackup()">Экспорт encrypted backup</button><button class="btn ghost" onclick="devices()">Устройства</button><button class="btn danger" onclick="logoutAll()">Завершить другие сессии</button><div class=small>Горячая клавиша Panic: Ctrl + Shift + X. Скрытые чаты: Ctrl + H</div></div></div>`}

function pageTitle(){return ({profile:'Профиль',settings:'Настройки',notes:'Заметки',links:'Ссылки',downloads:'Загрузки'}[S.tab]||'Раздел')}
function accountSwitcher(){let a=JSON.parse(localStorage.nvAccounts||'[]'); if(!a.length)return ''; return `<div class="accountStrip">${a.map(x=>`<button class="chip" type="button" onclick="switchAccount('${h(x.username)}')">👤 ${h(x.username)}</button>`).join('')}</div>`}
function rememberAccount(username,token){let a=JSON.parse(localStorage.nvAccounts||'[]').filter(x=>x.username!==username);a.unshift({username,token,last:Date.now()});localStorage.nvAccounts=JSON.stringify(a.slice(0,5));}
function switchAccount(username){let a=JSON.parse(localStorage.nvAccounts||'[]').find(x=>x.username===username);if(a){localStorage.nvToken=a.token;localStorage.nvLastUser=a.username;location.reload()}}
function accountManager(){let a=JSON.parse(localStorage.nvAccounts||'[]');modal(`<h2>Аккаунты</h2>${a.map(x=>`<div class=fileCard>👤 ${h(x.username)}<span class=spacer></span><button class=btn onclick="switchAccount('${h(x.username)}')">Открыть</button><button class='btn danger' onclick="removeAccount('${h(x.username)}')">Удалить</button></div>`).join('')||'<div class=muted>Нет сохранённых аккаунтов</div>'}<button class=btn onclick="logout()">Добавить/войти в другой</button>`)}
function removeAccount(username){let a=JSON.parse(localStorage.nvAccounts||'[]').filter(x=>x.username!==username);localStorage.nvAccounts=JSON.stringify(a);toast('Аккаунт убран из списка');closeModal();accountManager()}
function isHidden(id){return JSON.parse(localStorage.nvHiddenChats||'[]').includes(id)}
function hideActiveChat(){if(!S.active)return;saveSet('nvHiddenChats',S.active,true);toast('Чат скрыт. Открыть: Ctrl+H');S.active=null;render()}
function openHiddenFolder(){let pin=prompt('PIN для скрытых чатов'); if(!S.settings.pin||pin===S.settings.pin){S.folder='hidden';render()}else toast('Неверный PIN')}
function notesPage(){return `<div class=sidePad><h1>📝 Локальные заметки</h1><div class=small>Не синхронизируются с сервером.</div><textarea id=notesBox class=field style="min-height:55vh">${h(S.notes||'')}</textarea><button class=btn onclick="saveNotes()">Сохранить локально</button></div>`}
function saveNotes(){S.notes=$('#notesBox')?.value||'';localStorage.nvNotes=S.notes;toast('Заметки сохранены локально')}
function allMessages(){return Object.values(S.messages).flat()}
function linksPage(){let links=[];for(const m of allMessages()){let found=(m.text||'').match(/https?:\/\/\S+|www\.\S+/ig)||[];found.forEach(x=>links.push({url:x,from:m.from,time:m.createdAt}))}return `<div class=sidePad><h1>🔗 Все ссылки</h1>${links.map(x=>`<a class=fileCard href="${h(x.url)}" target="_blank">🔗 <span class=ellipsis>${h(x.url)}</span><small>${h(x.from)} · ${date(x.time)}</small></a>`).join('')||'<div class=empty>Ссылок пока нет</div>'}</div>`}
function downloadsPage(){let files=allMessages().filter(m=>m.attachment).map(m=>m.attachment);return `<div class=sidePad><h1>📁 Загрузки</h1><div class=folders><button class=chip onclick="filterDownloadType('all')">Все</button><button class=chip onclick="filterDownloadType('image')">Фото</button><button class=chip onclick="filterDownloadType('video')">Видео</button><button class=chip onclick="filterDownloadType('audio')">Музыка</button><button class=chip onclick="filterDownloadType('doc')">Документы</button></div><div id=downloadList>${renderDownloads(files)}</div></div>`}
function renderDownloads(files){let f=localStorage.nvDownloadFilter||'all';let list=files.filter(a=>f==='all'||(f==='image'&&String(a.type).startsWith('image/'))||(f==='video'&&String(a.type).startsWith('video/'))||(f==='audio'&&String(a.type).startsWith('audio/'))||(f==='doc'&&!String(a.type).startsWith('image/')&&!String(a.type).startsWith('video/')&&!String(a.type).startsWith('audio/')));return list.map(a=>{let safeUrl=fileUrl(a.url||a.href||a.path||'');return `<a class=fileCard href="${h(safeUrl||'#')}" target="_blank">📎 <span class=ellipsis>${h(a.name||'file')}</span><small>${fmt(a.size||0)}</small></a>`}).join('')||'<div class=empty>Файлов нет</div>'}
function filterDownloadType(t){localStorage.nvDownloadFilter=t;render()}
async function loadStatsBox(){let box=$('#statsBox');if(!box||!S.user)return;try{let r=await api('/stats/'+S.user.username);box.innerHTML=`<h2>Статистика</h2><div class=statsGrid><div>✉️ ${r.sent}<small>сообщений</small></div><div>🖼 ${r.photos}<small>фото</small></div><div>📅 ${r.days}<small>дней</small></div><div>📎 ${r.files}<small>файлов</small></div></div><h2>Достижения</h2>${(r.achievements||[]).map(x=>`<div class=fileCard>${h(x)}</div>`).join('')||'<div class=muted>Пока нет достижений</div>'}`}catch{}}
async function changeBanner(){try{const files=await pickDomFiles({accept:'image/*',multiple:false});const f=files[0];if(!f)return;const data=await fileToBase64(f);const r=await api('/file-data',{method:'POST',body:JSON.stringify({name:f.name,type:f.type,size:f.size,data})});S.user.banner=r.url;await api('/me',{method:'PUT',body:JSON.stringify({banner:r.url})});toast('Баннер обновлён');render()}catch(e){toast('Баннер не загружен: '+e.message)}}
async function checkUpdates(){
  try{
    toast('Проверяю обновления...');
    const r=await nv.checkUpdates();
    if(r?.dev)return modal(`<h2>Автообновление</h2><div class=fileCard>Текущая версия: ${h(r.current||S.appVersion||'dev')}</div><div class=muted>${h(r.message||'Автообновления работают только в установленной версии.')}</div><button class=btn onclick='closeModal()'>Понятно</button>`);
    if(r?.error)return modal(`<h2>Проверка обновлений</h2><div class=fileCard>Версия: <b>${h(r.current||S.appVersion||'')}</b></div><div class=muted>${h(r.error)}</div><button class=btn onclick='closeModal()'>Понятно</button>`);
    setTimeout(()=>toast('Если обновление есть, окно появится автоматически.'),600);
  }catch(e){modal(`<h2>Проверка обновлений</h2><div class=muted>${h(e.message||e)}</div><button class=btn onclick='closeModal()'>Понятно</button>`)}
}
function showUpdateModal(data={}){
  closeModal();
  modal(`<div class=updateHero><div class=updateGlow>↻</div><h2>Доступно обновление NightVault ${h(data.version||'')}</h2><div class=fileCard>Установлена версия: <b>${h(data.current||S.appVersion||'')}</b><br>Новая версия: <b>${h(data.version||'')}</b></div><div class=muted>Чтобы продолжить безопасно пользоваться NightVault, установи свежую версию. Приложение скачает обновление, закроется и откроется уже обновлённым.</div><div id=updateProgress class=updateProgress><div></div></div><button class=btn onclick="downloadNightVaultUpdate()">Обновить сейчас</button></div>`,{lock:true})
}
async function downloadNightVaultUpdate(){
  try{let p=$('#updateProgress'); if(p)p.style.display='block'; let r=await nv.downloadUpdate(); if(r?.error)toast('Ошибка обновления: '+r.error); else toast('Загрузка обновления...')}catch(e){toast('Ошибка обновления: '+e.message)}
}
async function installNightVaultUpdate(){
  try{await nv.installUpdate()}catch(e){toast('Установка обновления: '+e.message)}
}
function showUpdateReadyModal(data={}){
  closeModal();
  modal(`<div class=updateHero><div class=updateGlow>✓</div><h2>Обновление скачано</h2><div class=fileCard>Версия ${h(data.version||'новая')} готова к установке.</div><div class=muted>NightVault закроется и через несколько секунд откроется уже обновлённым.</div><button class=btn onclick="installNightVaultUpdate()">Перезапустить и установить</button></div>`,{lock:true})
}
function showChangelogModal(data={}){
  const changes=(data.changes||[]).map(x=>`<li>${h(x)}</li>`).join('');
  setTimeout(()=>modal(`<div class=updateHero><div class=updateGlow>✦</div><h2>${h(data.title||('Что нового в NightVault '+(data.version||'')))}</h2><div class=fileCard><b>Версия ${h(data.version||S.appVersion||'')}</b></div><ul class=changeList>${changes||'<li>Улучшена стабильность приложения.</li>'}</ul><button class=btn onclick='closeModal()'>Понятно</button></div>`),700);
}
function bindUpdaterEvents(){
  try{nv.onUpdateAvailable(showUpdateModal);nv.onUpdateStatus?.(d=>{if(d?.status==='not-available')toast('Установлена последняя версия '+(d.version||S.appVersion||''));});nv.onUpdateProgress(p=>{let bar=$('#updateProgress div');if(bar)bar.style.width=(p.percent||0)+'%'});nv.onUpdateDownloaded(showUpdateReadyModal);nv.onUpdateError(e=>modal(`<h2>Ошибка обновления</h2><div class=muted>${h(e.message||e)}</div><button class=btn onclick='closeModal()'>Понятно</button>`));nv.onUpdateStatus(s=>{if(s?.status==='not-available')toast('Установлена последняя версия: '+(s.version||S.appVersion||''))});nv.onChangelog(showChangelogModal)}catch{}
}

function p2pNotice(file){ if(file&&file.size>50*1024*1024) toast('P2P режим: большой файл будет помечен как direct-transfer. Для реального P2P нужен WebRTC/STUN сервер.'); }

function contactsPage(){return `<div class=sidePad><h1>Люди</h1><input id=person class=field placeholder="Ник пользователя"><button class=btn onclick="findPerson()">Найти</button><div id=people></div><h2>Глобальный поиск</h2><input id=global class=field placeholder="Сообщения, файлы"><button class=btn onclick="globalSearch()">Искать</button><div id=globalOut></div></div>`}
function bind(){
  $('#winClose')?.addEventListener('click',()=>nv.close()); $('#winMin')?.addEventListener('click',()=>nv.minimize()); $('#winFull')?.addEventListener('click',()=>nv.toggleFull()); $('#closeAppBtn')?.addEventListener('click',()=>nv.close()); $('#minAppBtn')?.addEventListener('click',()=>nv.minimize());
  let q=$('#q'); if(q)q.oninput=e=>{S.q=e.target.value;renderChatListOnly()};
  let txt=$('#txt'); if(txt){txt.value=S.editId?(findMsg(S.editId)?.text||''):getDraft(S.active); txt.focus(); txt.oninput=e=>{if(!S.editId)setDraft(S.active,e.target.value);touchActivity()}; txt.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}else if(sock&&S.active){sock.send(JSON.stringify({type:'typing',chatId:S.active,active:true}))}}; setTimeout(()=>scrollChatBottom(false),0)}
  let cs=$('#chatSearch'); if(cs)cs.oninput=e=>{S.chatSearch=e.target.value;renderMessagesOnly(false)}; let ds=$('#dateSearch'); if(ds)ds.oninput=e=>{S.dateFilter=e.target.value;renderMessagesOnly(false)}; let mf=$('#mediaFilter'); if(mf){mf.value=S.mediaFilter||'all';mf.onchange=e=>{S.mediaFilter=e.target.value;renderMessagesOnly(false)}};
  let th=$('#theme'); if(th){th.value=S.theme;th.onchange=e=>{S.theme=e.target.value;ensureAccentForTheme(S.theme);saveVisualOnly();render()}}; let cb=$('#chatBg'); if(cb){cb.value=S.chatBg;cb.onchange=e=>{S.chatBg=e.target.value;saveVisualOnly();render()}}; let fs=$('#fontSize'); if(fs){fs.value=S.fontSize;fs.oninput=e=>{S.fontSize=Number(e.target.value);saveVisualOnly()}}; let ff=$('#fontFamily'); if(ff){ff.value=S.fontFamily;ff.onchange=e=>{S.fontFamily=e.target.value;saveVisualOnly()}}; let fr=$('#avatarFrame'); if(fr){fr.value=S.user.avatarFrame||''} loadStatsBox(); let ac=$('#accent'); if(ac)ac.oninput=e=>{S.accent=e.target.value;localStorage.nvAccentCustom='1';saveVisualOnly()}; let mic=$('#mic'); if(mic){mic.value=S.micId||''; mic.onchange=e=>{S.micId=e.target.value;localStorage.nvMicId=S.micId}};
  renderTyping(); updateVoiceUI();
}
function saveVisualOnly(){localStorage.nvTheme=S.theme;localStorage.nvAccent=S.accent;localStorage.nvChatBg=S.chatBg;localStorage.nvFontSize=S.fontSize;localStorage.nvFontFamily=S.fontFamily;applyVisualPrefs()}
function scrollChatBottom(smooth=true){let m=$('#msgs'); if(m)m.scrollTo({top:m.scrollHeight,behavior:smooth?'smooth':'auto'});toggleBottomBtn()}
function toggleBottomBtn(){let m=$('#msgs'),b=$('#bottomBtn'); if(!m||!b)return; b.style.display=(m.scrollHeight-m.scrollTop-m.clientHeight>260)?'grid':'none'}
function renderMessagesOnly(keepScroll=true){let m=$('#msgs'); if(!m||!S.active)return;let near=m.scrollHeight-m.scrollTop-m.clientHeight<120;m.innerHTML=visibleMessages(S.active).map(x=>msgHtml(x)).join('');if(!keepScroll||near)scrollChatBottom(false);renderTyping();toggleBottomBtn()}
function renderTyping(){let t=$('#typing'); if(t&&S.active)t.textContent=S.typing[S.active]?S.typing[S.active]+' печатает...':''}
async function sendMsg(att=null){if(!S.active)return toast('Сначала открой чат');let txt=$('#txt')?.value||'';try{if(S.editId&&!att){await editMsgSave(S.editId,txt);return} if(!txt.trim()&&!att)return;let r=await api('/chats/'+S.active+'/messages',{method:'POST',body:JSON.stringify({text:txt,attachment:att,replyTo:S.replyTo,ttl:0})});S.replyTo=null;if($('#txt'))$('#txt').value='';setDraft(S.active,'');S.messages[S.active]=S.messages[S.active]||[];if(!S.messages[S.active].some(m=>m.id===r.message.id))S.messages[S.active].push(r.message);await loadChats(false);renderChatListOnly();renderMessagesOnly(false)}catch(e){toast('Ошибка отправки: '+e.message)}}
function pickDomFiles({accept='',multiple=true}={}){
  return new Promise(resolve=>{
    const input=document.createElement('input');
    input.type='file';
    input.accept=accept;
    input.multiple=multiple;
    input.style.position='fixed';
    input.style.left='-9999px';
    document.body.appendChild(input);
    input.addEventListener('change',()=>{const files=[...input.files]; input.remove(); resolve(files)});
    input.click();
  });
}
function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(String(r.result).split(',').pop());
    r.onerror=()=>rej(r.error||new Error('read failed'));
    r.readAsDataURL(file);
  });
}
async function uploadBrowserFile(file){
  p2pNotice(file);
  const data=await fileToBase64(file);
  return api('/file-data',{method:'POST',body:JSON.stringify({name:file.name,type:file.type||'application/octet-stream',size:file.size,data})});
}
async function attachFiles(){
  try{
    if(!S.active)return toast('Сначала открой чат');
    const files=await pickDomFiles({multiple:true});
    if(!files.length)return;
    toast('Загрузка файлов: '+files.length);
    for(const f of files){
      const r=await uploadBrowserFile(f);
      await sendMsg(r);
    }
  }catch(e){toast('Файл не отправлен: '+(e.message||e))}
}
async function changeAvatar(){
  try{
    const files=await pickDomFiles({accept:'image/*',multiple:false});
    const f=files[0];
    if(!f)return;
    if(!String(f.type||'').startsWith('image/'))return toast('Выбери изображение для аватарки');
    if(f.size>8*1024*1024)return toast('Аватар слишком большой, максимум 8 MB');
    const data=await fileToBase64(f);
    const r=await api('/avatar-data',{method:'POST',body:JSON.stringify({name:f.name,type:f.type,size:f.size,data})});
    S.user.avatar=r.avatar;
    try{await api('/me',{method:'PUT',body:JSON.stringify({avatar:r.avatar})})}catch{}
    await loadChats(false);
    toast('Аватар обновлён');
    render();
  }catch(e){toast('Аватар не загружен: '+(e.message||e))}
}
async function saveProfile(){try{let r=await api('/me',{method:'PUT',body:JSON.stringify({displayName:$('#pd').value,bio:$('#pb').value,profileColor:$('#profileColor')?.value||S.user.profileColor,avatarFrame:$('#avatarFrame')?.value||''})});S.user=r.user;toast('Профиль сохранён');render()}catch(e){toast(e.message)}}

async function checkServerConnection(){
  try{
    const r=await fetch(getServerHttp()+'/api/health',{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    toast('Сервер OK: v'+(data.version||'?')+', пользователей: '+(data.users||0));
  }catch(e){toast('Сервер недоступен: '+(e.message||e))}
}
function saveServerConnection(){
  const old=getServerHttp();
  const next=setServerUrl($('#serverSettings')?.value||old);
  toast('Адрес сервера сохранён: '+next);
  if(next!==old){
    try{ if(sock) sock.close(); }catch{}
    connect();
    loadChats(true).catch(e=>toast('Не удалось подключиться: '+e.message));
  }
}
async function saveSettings(){try{S.theme=$('#theme')?.value||S.theme;S.accent=$('#accent')?.value||S.accent;S.micId=$('#mic')?.value||'';S.blur=!!$('#blur')?.checked;S.chatBg=$('#chatBg')?.value||S.chatBg;S.fontSize=Number($('#fontSize')?.value||S.fontSize);S.fontFamily=$('#fontFamily')?.value||S.fontFamily;localStorage.nvTheme=S.theme;localStorage.nvAccent=S.accent;localStorage.nvBlur=S.blur?'1':'0';localStorage.nvMicId=S.micId;localStorage.nvChatBg=S.chatBg;localStorage.nvFontSize=S.fontSize;localStorage.nvFontFamily=S.fontFamily;applyVisualPrefs();let r=await api('/me',{method:'PUT',body:JSON.stringify({settings:{pin:$('#pin').value,startPass:$('#startPass').value,twofa:$('#twofa').value,notify:$('#notify').checked,autoLock:Number($('#lock').value),chatBg:S.chatBg,fontSize:S.fontSize,fontFamily:S.fontFamily}})});S.settings=r.settings;toast('Настройки сохранены');render()}catch(e){toast(e.message)}}
async function findPerson(){try{let q=$('#person').value;let r=await api('/search?q='+encodeURIComponent(q));$('#people').innerHTML=(r.users||[]).map(u=>`<div class=row>${av(u)}<div class=rowMain><b>${h(u.displayName)}</b><div class=small>@${h(u.username)}</div></div><button class=btn onclick="startPrivate('${u.username}')">Написать</button></div>`).join('')||'<p class=muted>Не найдено</p>'}catch(e){toast(e.message)}}
async function startPrivate(u){let r=await api('/chats/private/'+u,{method:'POST',body:'{}'});await loadChats(false);S.tab='chats';await openChat(r.chat.id)}
function newGroup(){modal(`<h2>Новая группа</h2><input id=grpTitle class=field placeholder="Название группы"><textarea id=grpMembers class=field placeholder="Участники через запятую: user1,user2"></textarea><label class=fileCard><input id=grpChannel type=checkbox> Создать как канал</label><h3>Права</h3><label class=fileCard><input id=permWrite type=checkbox checked> Участники могут писать</label><label class=fileCard><input id=permInvite type=checkbox checked> Участники могут приглашать</label><label class=fileCard><input id=permAvatar type=checkbox> Участники могут менять аватар/описание</label><button class=btn onclick="createGroupFromModal()">Создать</button>`)}
async function createGroupFromModal(){try{let title=$('#grpTitle').value.trim();if(!title)return toast('Введите название');let members=($('#grpMembers').value||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);let channel=!!$('#grpChannel').checked;let permissions={write:!!$('#permWrite').checked,invite:!!$('#permInvite').checked,avatar:!!$('#permAvatar').checked};let r=await api('/chats/group',{method:'POST',body:JSON.stringify({title,members,channel,permissions})});closeModal();await loadChats(false);S.tab='chats';await openChat(r.chat.id)}catch(e){toast('Группа не создана: '+e.message)}}
async function globalSearch(){try{let r=await api('/search-global?q='+encodeURIComponent($('#global').value));$('#globalOut').innerHTML=(r.results||[]).map(x=>`<div class=row onclick="S.tab='chats';openChat('${x.chat.id}')"><b>${h(x.chat.title||x.chat.other?.displayName||'чат')}</b><div class=small>${h(x.message.text||x.message.attachment?.name||'')}</div></div>`).join('')||'<p class=muted>Нет результатов</p>'}catch(e){toast(e.message)}}
function showProfile(id){let c=S.chats.find(x=>x.id===id);if(!c)return;let u=c.type==='private'?c.other:{displayName:c.title,username:c.type,avatar:c.avatar,bio:c.description};modal(`<div class=profileHero>${av(u,'bigAvatar')}</div><h2>${h(u.displayName)}</h2><div class=muted>@${h(u.username)}</div><p>${h(u.bio||'Нет описания')}</p>${c.type==='private'?`<div class=fileCard onclick="viewRep('${u.username}')">⭐ Репутация: <b id='rep_${u.username}'>загрузка...</b></div><button class='btn ghost' onclick="repMenu('${u.username}','praise')">Похвалить</button><button class='btn danger' onclick="repMenu('${u.username}','report')">Пожаловаться</button>`:''}<button class=btn onclick="closeModal()">Закрыть</button>${c.type==='private'?`<button class='btn danger' onclick="blockUser('${u.username}')">Заблокировать</button>`:''}`)}

const repPraise=['Помог в общении','Приятный собеседник','Надёжный пользователь','Не спамит','Полезная информация'];
const repReport=['Спам','Оскорбления','Подозрительное поведение','Обман','Вредоносные файлы'];
function repStatus(score){if(score>=8)return 'отличная'; if(score>=3)return 'хорошая'; if(score>=-2)return 'нейтральная'; if(score>=-7)return 'плохая'; return 'опасная'}
async function loadRepLabel(u){try{let r=await api('/reputation/'+u);let el=document.getElementById('rep_'+u);if(el)el.textContent=repStatus(r.score)+' ('+r.score+')'}catch{}}
function repMenu(u,type){let arr=type==='praise'?repPraise:repReport;modal(`<h2>${type==='praise'?'Похвалить':'Пожаловаться'} @${h(u)}</h2>${arr.map((x,i)=>`<label class=fileCard><input type=checkbox value="${h(x)}" class=repReason> ${h(x)}</label>`).join('')}<button class=btn onclick="sendRep('${u}','${type}')">Отправить</button>`)}
async function sendRep(u,type){let reasons=$$('.repReason:checked').map(x=>x.value);if(!reasons.length)return toast('Выбери причину');try{await api('/reputation/'+u,{method:'POST',body:JSON.stringify({type,reasons})});toast('Репутация обновлена');closeModal()}catch(e){toast(e.message)}}
async function viewRep(u){try{let r=await api('/reputation/'+u);modal(`<h2>Репутация @${h(u)}</h2><div class=fileCard>Статус: <b>${repStatus(r.score)}</b> · баллы: ${r.score}</div>`+(r.items||[]).map(x=>`<div class=fileCard>${x.type==='praise'?'✅':'⚠️'} <b>${h(x.from)}</b><br>${(x.reasons||[]).map(h).join(', ')}<br><span class=small>${date(x.createdAt)} ${time(x.createdAt)}</span></div>`).join('')||'<p class=muted>Записей нет</p>')}catch(e){toast(e.message)}}

function modal(x,opts={}){const locked=!!opts.lock;document.body.insertAdjacentHTML('beforeend',`<div class="modalWrap ${locked?'modalLocked':''}" ${locked?'':'onclick="closeModal()"'}><div class=modal onclick="event.stopPropagation()">${x}</div></div>`); $$('.modal [id^=rep_]').forEach(el=>loadRepLabel(el.id.replace('rep_','')))}function closeModal(){$('.modalWrap')?.remove()}
function ctx(e,id){e.preventDefault();document.querySelector('.ctx')?.remove();let mine=findMsg(id)?.from===S.user.username;let d=document.createElement('div');d.className='ctx';d.style.left=e.clientX+'px';d.style.top=e.clientY+'px';d.innerHTML=`<button onclick="S.replyTo='${id}';document.querySelector('.ctx').remove();render()">Ответить</button><button onclick="react('${id}','🔥')">🔥 Реакция</button><button onclick="toggleSelect('${id}');document.querySelector('.ctx').remove();renderMessagesOnly(false)">Выделить</button>${mine?`<button onclick="startEdit('${id}')">Редактировать</button><button onclick="delMsg('${id}',1)">Удалить у всех</button>`:''}<button onclick="pinMsg('${id}')">Закрепить</button><button onclick="delMsg('${id}',0)">Удалить у себя</button>`;document.body.appendChild(d)}
function showChatMenu(e){e.preventDefault();document.querySelector('.ctx')?.remove();let d=document.createElement('div');d.className='ctx';d.style.left=e.clientX+'px';d.style.top=e.clientY+'px';d.innerHTML=`<button onclick="S.searchInChat=true;document.querySelector('.ctx').remove();render()">Поиск</button><button onclick="togglePinnedChat('${S.active}')">Закрепить чат</button><button onclick="toggleArchiveChat('${S.active}')">Архив</button><button onclick="muteChat()">Уведомления</button><button onclick="groupSettings()">Настройки группы</button><button onclick="deleteChat()">Удалить чат</button><button onclick="blockActiveContact()">Заблокировать контакт</button>`;document.body.appendChild(d)}
async function react(id,e){try{let r=await api('/messages/'+id+'/react',{method:'POST',body:JSON.stringify({emoji:e})});replaceMsg(r.message);renderMessagesOnly(false)}catch(err){toast(err.message)}document.querySelector('.ctx')?.remove()}
function startEdit(id){S.editId=id;document.querySelector('.ctx')?.remove();render()}
function cancelEdit(){S.editId=null;render()}
async function editMsgSave(id,text){try{let r=await api('/messages/'+id,{method:'PUT',body:JSON.stringify({text})});replaceMsg(r.message);S.editId=null;toast('Сообщение изменено');render()}catch(e){toast('Не изменено: '+e.message)}}
async function pinMsg(id){try{await api('/messages/'+id+'/pin',{method:'POST',body:'{}'});await loadChats(false);render()}catch(e){toast(e.message)}document.querySelector('.ctx')?.remove()}
async function delMsg(id,all){try{await api('/messages/'+id+'?all='+all,{method:'DELETE'});for(const k in S.messages)S.messages[k]=S.messages[k].filter(m=>m.id!==id);S.selected.delete(id);renderMessagesOnly(false)}catch(e){toast(e.message)}document.querySelector('.ctx')?.remove()}
function toggleSelect(id){S.selected.has(id)?S.selected.delete(id):S.selected.add(id);render()}
function clearSelection(){S.selected.clear();render()}
async function deleteSelected(all){let ids=[...S.selected];for(const id of ids){try{await api('/messages/'+id+'?all='+all,{method:'DELETE'});for(const k in S.messages)S.messages[k]=S.messages[k].filter(m=>m.id!==id)}catch(e){toast(e.message)}}S.selected.clear();await loadChats(false);render()}
async function muteChat(){let c=currentChat(); if(!c)return; modal(`<h2>Уведомления чата</h2><label class=fileCard><input id=mutedToggle type=checkbox ${c.muted?.[S.user.username]?'checked':''}> Отключить уведомления для этого чата</label><button class=btn onclick="saveChatNotify()">Сохранить</button>`) }
async function saveChatNotify(){try{let muted=!!$('#mutedToggle')?.checked;await api('/chats/'+S.active+'/mute',{method:'POST',body:JSON.stringify({muted})});await loadChats(false);toast('Настройка уведомлений сохранена');closeModal();render()}catch(e){toast(e.message)}}
async function blockUser(u){await api('/block/'+u,{method:'POST',body:'{}'});toast('Пользователь заблокирован');closeModal()}

const emojiList=['😀','😁','😂','🤣','😊','😍','😘','😎','😈','💀','👻','👍','👎','❤️','🔥','✨','🎉','🤝','🙏','😡','😱','🥶','🤔','😴','📎','🔒','🩸','🌙'];
function toggleEmojiPicker(){let old=document.querySelector('.emojiPanel'); if(old){old.remove();return} let box=document.createElement('div');box.className='emojiPanel';box.innerHTML=emojiList.map(e=>`<button onclick="insertEmoji('${e}')">${e}</button>`).join('');document.body.appendChild(box);let b=document.querySelector('.composer button[title=\"Эмодзи\"]')||document.querySelector('.composer .iconBtn:nth-child(2)');let r=b?.getBoundingClientRect(); if(r){box.style.left=r.left+'px';box.style.bottom=(window.innerHeight-r.top+8)+'px'}}
function insertEmoji(e){let t=$('#txt');if(!t)return;let a=t.selectionStart||0,b=t.selectionEnd||a;t.value=t.value.slice(0,a)+e+t.value.slice(b);t.focus();t.selectionStart=t.selectionEnd=a+e.length;saveDraft();document.querySelector('.emojiPanel')?.remove()}
async function groupSettings(){document.querySelector('.ctx')?.remove();let c=currentChat();if(!c||c.type==='private'||c.type==='saved')return toast('Это не группа');modal(`<h2>Настройки группы</h2><input id=gsTitle class=field value="${h(c.title||'')}"><textarea id=gsDesc class=field placeholder="Описание">${h(c.description||'')}</textarea><label class=fileCard><input id=gsWrite type=checkbox ${(c.permissions?.write!==false)?'checked':''}> Участники могут писать</label><label class=fileCard><input id=gsInvite type=checkbox ${(c.permissions?.invite!==false)?'checked':''}> Участники могут приглашать</label><label class=fileCard><input id=gsAvatar type=checkbox ${(c.permissions?.avatar)?'checked':''}> Участники могут менять аватар/описание</label><button class=btn onclick="saveGroupSettings()">Сохранить</button>`)}
async function saveGroupSettings(){try{let permissions={write:!!$('#gsWrite').checked,invite:!!$('#gsInvite').checked,avatar:!!$('#gsAvatar').checked};await api('/chats/'+S.active,{method:'PUT',body:JSON.stringify({title:$('#gsTitle').value,description:$('#gsDesc').value,permissions})});closeModal();await loadChats(false);render()}catch(e){toast(e.message)}}
async function deleteChat(){document.querySelector('.ctx')?.remove();if(!S.active)return;let c=currentChat();if(c?.type==='saved')return toast('Избранное удалить нельзя');if(!confirm('Удалить чат из списка?'))return;try{await api('/chats/'+S.active+'/delete',{method:'POST',body:'{}'});S.active=null;await loadChats(false);render()}catch(e){toast('Чат не удалён: '+e.message)}}
async function blockActiveContact(){let c=currentChat();document.querySelector('.ctx')?.remove();if(!c||c.type!=='private')return toast('Блокировка доступна только в личном чате');await blockUser(c.other.username);}
async function devices(){let r=await api('/devices');modal('<h2>Устройства</h2>'+r.devices.map(d=>`<div class=fileCard>💻 ${h(d.device)} ${d.current?'· текущее':''}<br>${date(d.createdAt)} ${time(d.createdAt)}</div>`).join(''))}
async function logoutAll(){await api('/devices/logout-all',{method:'POST',body:'{}'});toast('Другие сессии закрыты')}
async function logout(){try{await api('/logout',{method:'POST',body:'{}'})}catch{} localStorage.removeItem('nvToken');S=defaultState();S.token='';S.user=null;renderAuth()}
function isPinnedChat(id){return JSON.parse(localStorage.nvPinnedChats||'[]').includes(id)}
function isArchived(id){return JSON.parse(localStorage.nvArchivedChats||'[]').includes(id)}
function saveSet(key,id,on){let a=JSON.parse(localStorage[key]||'[]');a=a.filter(x=>x!==id);if(on)a.push(id);localStorage[key]=JSON.stringify(a)}
function togglePinnedChat(id){saveSet('nvPinnedChats',id,!isPinnedChat(id));toast(isPinnedChat(id)?'Чат закреплён':'Чат откреплён');render()}
function toggleArchiveChat(id){saveSet('nvArchivedChats',id,!isArchived(id));toast(isArchived(id)?'Чат в архиве':'Чат возвращён из архива');render()}
function getDraft(id){return id?localStorage['nvDraft_'+id]||'':''}
function setDraft(id,v){if(!id)return; if(v)localStorage['nvDraft_'+id]=v; else localStorage.removeItem('nvDraft_'+id)}
function saveDraft(){try{ if(S.active) setDraft(S.active,$('#txt')?.value||''); }catch{}}
function authorFor(m){
  if(!m)return {username:'?',displayName:'?'};
  if(m.from===S.user?.username)return S.user;
  const c=currentChat();
  if(c?.other && c.other.username===m.from)return c.other;
  return {username:m.from,displayName:m.from,avatar:''};
}
function visibleMessages(id){let arr=[...(S.messages[id]||[])];if(S.dateFilter)arr=arr.filter(m=>new Date(m.createdAt).toISOString().slice(0,10)===S.dateFilter);let q=(S.chatSearch||'').toLowerCase();if(q)arr=arr.filter(m=>(m.text||'').toLowerCase().includes(q)||(m.attachment?.name||'').toLowerCase().includes(q));let f=S.mediaFilter||'all';if(f!=='all')arr=arr.filter(m=>{let a=m.attachment,t=(a?.type||'');if(f==='photo')return t.startsWith('image/');if(f==='video')return t.startsWith('video/');if(f==='audio')return t.startsWith('audio/');if(f==='document')return a&&!t.startsWith('image/')&&!t.startsWith('video/')&&!t.startsWith('audio/');if(f==='link')return /(https?:\/\/|www\.)/i.test(m.text||'');return true});return arr.slice(-700)}
async function loadAudioDevices(){try{let devices=await navigator.mediaDevices.enumerateDevices();S.audioDevices=devices.filter(d=>d.kind==='audioinput')}catch{S.audioDevices=[]}}
async function testMicList(){try{let s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());await loadAudioDevices();toast('Микрофоны обновлены');render()}catch(e){toast('Нет доступа к микрофону: '+e.message)}}
async function startVoice(){
  if(S.recording)return;
  if(!S.active)return toast('Сначала открой чат');
  try{
    let audio=S.micId?{deviceId:{exact:S.micId}}:true;
    let stream=await navigator.mediaDevices.getUserMedia({audio});
    let mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':(MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'');
    let media=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    let chunks=[],started=Date.now(),done=false;
    media.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
    media.onstop=async()=>{
      if(done)return; done=true;
      try{
        recCleanup(stream);
        if(!chunks.length)return toast('Голосовое не записалось: пустой файл');
        let type=mime||chunks[0].type||'audio/webm';
        let blob=new Blob(chunks,{type});
        if(blob.size<300)return toast('Голосовое слишком короткое');
        let data=await blobToBase64(blob);
        let dur=Math.max(1,Math.round((Date.now()-started)/1000));
        let r=await api('/file-data',{method:'POST',body:JSON.stringify({name:'voice-'+Date.now()+'.webm',type:'audio/webm',data})});
        r.voice=true; r.duration=dur; r.url=fileUrl(r.url);
        await sendMsg(r);
      }catch(e){toast('Голосовое не отправлено: '+(e.message||e))}
    };
    media.start(250);
    S.recording={media,stream,started};
    voiceTimer=setInterval(updateVoiceUI,120);updateVoiceUI();
  }catch(e){toast('Нет доступа к микрофону: '+(e.message||e))}
}
function recCleanup(stream){try{stream.getTracks().forEach(t=>t.stop())}catch{}}
function stopVoice(send=true){
  if(!S.recording)return;let rec=S.recording;clearInterval(voiceTimer);voiceTimer=null;S.recording=null;updateVoiceUI();
  try{ if(!send){rec.media.onstop=null;recCleanup(rec.stream);rec.media.stop();return;} rec.media.requestData?.(); setTimeout(()=>{try{if(rec.media.state!=='inactive')rec.media.stop()}catch{}},60); }catch(e){recCleanup(rec.stream);toast('Ошибка записи: '+(e.message||e))}
}
async function toggleVoice(){ if(S.recording)stopVoice(true); else startVoice(); }
function updateVoiceUI(){let b=$('#recBtn'),v=$('#voiceState');if(!b)return;if(S.recording){b.textContent='●';b.classList.add('recording');if(v)v.innerHTML='<span class=recDot></span> '+Math.round((Date.now()-S.recording.started)/1000)+' сек'}else{b.textContent='🎙';b.classList.remove('recording');if(v)v.textContent=''}}
function blobToBase64(blob){return new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(blob)})}
async function dropFiles(e){
  e.preventDefault();
  try{
    if(!S.active)return toast('Сначала открой чат');
    let files=[...e.dataTransfer.files];
    if(!files.length)return;
    toast('Загрузка файлов: '+files.length);
    for(const f of files){
      let r=await uploadBrowserFile(f);
      await sendMsg(r);
    }
  }catch(err){toast('Файл не отправлен: '+(err.message||err))}
}
function lockPage(){return `<div class=lockScreen><div class=authBox><h1>NightVault locked</h1><input id=unlockPin class=field type=password placeholder="PIN или пароль запуска"><button class=btn onclick="unlockApp()">Разблокировать</button></div></div>`}
function fakePage(){return `<div class=fakeNote><h2>Untitled - Notepad</h2><textarea>Заметки...</textarea><button onclick="S.fake=false;S.locked=true;render()">Закрыть заметки</button></div>`}
function lockApp(){S.locked=true;render()} function unlockApp(){let v=$('#unlockPin').value;if(v&&(v===S.settings.pin||v===S.settings.startPass)){S.locked=false;render()}else toast('Неверный PIN/пароль')}
function touchActivity(){lastActivity=Date.now()}setInterval(()=>{let m=Number(S.settings?.autoLock||0);if(S.user&&m>0&&!S.locked&&Date.now()-lastActivity>m*60000)lockApp()},30000);['mousemove','keydown','click'].forEach(e=>window.addEventListener(e,touchActivity));
window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='x'){S.fake=true;S.locked=true;try{nv.minimize()}catch{}render()} if(e.ctrlKey&&e.key.toLowerCase()==='h'){e.preventDefault();openHiddenFolder()}});
function simpleEncrypt(str,key){let out='';key=key||'nightvault';for(let i=0;i<str.length;i++)out+=String.fromCharCode(str.charCodeAt(i)^key.charCodeAt(i%key.length));return btoa(unescape(encodeURIComponent(out)))}
function exportBackup(){let data={user:S.user,chats:S.chats,messages:S.messages,settings:S.settings,createdAt:Date.now()};let enc=simpleEncrypt(JSON.stringify(data),S.settings.pin||S.settings.startPass||'nightvault');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([enc],{type:'application/octet-stream'}));a.download='nightvault-backup.nvb';a.click();toast('Backup экспортирован')}
window.addEventListener('click',e=>{if(!e.target.closest('.ctx'))document.querySelector('.ctx')?.remove()});
try{nv.onWindowState?.(data=>{S.fullscreen=!!data.fullscreen;if(S.user)stableRender({keepMessages:true})})}catch{}
window.addEventListener('error',e=>toast('Ошибка интерфейса: '+(e.message||'unknown')));
bindUpdaterEvents();
init();
