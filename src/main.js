const {app, BrowserWindow, Menu, ipcMain, Notification, dialog, session} = require('electron');
const path = require('path');
const fs = require('fs');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}

Menu.setApplicationMenu(null);
if (process.platform === 'win32') app.setAppUserModelId('com.nightvault.messenger');

let mainWindow;
let updateInfo = null;
let updateDownloaded = false;

const changelogPath = path.join(__dirname, '../assets/changelog.json');
const updateStatePath = () => path.join(app.getPath('userData'), 'update-state.json');

function readJsonSafe(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonSafe(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}
function getChangelog(version = app.getVersion()) {
  const data = readJsonSafe(changelogPath, {});
  return data[version] || data.latest || {
    title: `NightVault ${version}`,
    changes: ['Обновление установлено.', 'Улучшена стабильность клиента.']
  };
}
function send(channel, payload) {
  try { mainWindow?.webContents?.send(channel, payload); } catch {}
}

function createWindow(){
  mainWindow = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1050, minHeight: 680,
    fullscreen: true, frame: false, title: 'NightVault',
    backgroundColor: '#050000', icon: path.join(__dirname,'../assets/icon.png'),
    webPreferences: {preload: path.join(__dirname,'preload.js'), contextIsolation: true, nodeIntegration: false}
  });
  mainWindow.loadFile(path.join(__dirname,'index.html'));
  mainWindow.webContents.on('before-input-event',(event,input)=>{
    if(input.key==='F11' && input.type==='keyDown'){
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });
  const sendState = () => send('window-state', { fullscreen: mainWindow.isFullScreen() });
  mainWindow.on('enter-full-screen', sendState);
  mainWindow.on('leave-full-screen', sendState);
  mainWindow.webContents.once('did-finish-load', () => {
    sendState();
    maybeShowChangelog();
    setTimeout(checkForUpdatesSilent, 1400);
  });
}

function setupUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => send('update-status', { status: 'checking' }));
  autoUpdater.on('update-available', info => {
    updateInfo = info;
    send('update-available', { version: info.version, current: app.getVersion(), notes: info.releaseNotes || '' });
  });
  autoUpdater.on('update-not-available', info => send('update-status', { status: 'not-available', version: info?.version || app.getVersion() }));
  autoUpdater.on('download-progress', p => send('update-progress', { percent: Math.round(p.percent || 0), transferred: p.transferred, total: p.total }));
  autoUpdater.on('update-downloaded', info => {
    updateDownloaded = true;
    send('update-downloaded', { version: info.version });
  });
  autoUpdater.on('error', err => send('update-error', { message: err?.message || String(err) }));
}

function checkForUpdatesSilent() {
  if (!autoUpdater || !app.isPackaged) {
    send('update-status', { status: 'dev-mode', message: 'Автообновление работает только в установленной версии.' });
    return;
  }
  try { autoUpdater.checkForUpdates(); } catch (e) { send('update-error', { message: e.message }); }
}

function maybeShowChangelog() {
  const currentVersion = app.getVersion();
  const state = readJsonSafe(updateStatePath(), {});
  if (state.lastChangelogVersion === currentVersion) return;
  const data = getChangelog(currentVersion);
  send('show-changelog', { version: currentVersion, ...data });
  state.lastChangelogVersion = currentVersion;
  writeJsonSafe(updateStatePath(), state);
}

app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback)=>{
    if(['media','microphone','notifications'].includes(permission)) return callback(true);
    callback(false);
  });
  setupUpdater();
  createWindow();
});
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });

ipcMain.handle('app-close',()=>{
  try { mainWindow?.close(); } catch {}
  setTimeout(()=>app.exit(0), 80);
});
ipcMain.handle('app-minimize',()=> mainWindow?.minimize());
ipcMain.handle('app-toggle-fullscreen',()=> mainWindow?.setFullScreen(!mainWindow.isFullScreen()));
ipcMain.handle('pick-files', async()=>{
  const r = await dialog.showOpenDialog(mainWindow,{properties:['openFile','multiSelections'], filters:[{name:'Файлы', extensions:['*']} ]});
  if(r.canceled) return [];
  return r.filePaths;
});
ipcMain.handle('notify', async(_, data)=>{
  if(Notification.isSupported()) {
    const n = new Notification({title:data.title||'NightVault', body:String(data.body||'').slice(0,160), icon:path.join(__dirname,'../assets/icon.png')});
    n.show();
  }
});

ipcMain.handle('updates-check', async()=>{
  if (!autoUpdater || !app.isPackaged) return { ok:false, dev:true, current: app.getVersion(), message:'Автообновления работают только в установленном приложении.' };
  try { await autoUpdater.checkForUpdates(); return { ok:true, current: app.getVersion() }; }
  catch(e){ return { ok:false, current: app.getVersion(), error:e.message }; }
});
ipcMain.handle('updates-download', async()=>{
  if (!autoUpdater || !updateInfo) return { ok:false, error:'Обновление не найдено.' };
  try { await autoUpdater.downloadUpdate(); return { ok:true }; }
  catch(e){ return { ok:false, error:e.message }; }
});
ipcMain.handle('updates-install', async()=>{
  if (!autoUpdater || !updateDownloaded) return { ok:false, error:'Обновление ещё не скачано.' };
  try { autoUpdater.quitAndInstall(false, true); return { ok:true }; }
  catch(e){ return { ok:false, error:e.message }; }
});
ipcMain.handle('app-version', ()=> app.getVersion());
