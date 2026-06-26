const {contextBridge, ipcRenderer} = require('electron');
const fs = require('fs');
const path = require('path');
function mimeByExt(file){
  const e = path.extname(file).toLowerCase();
  const map = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.pdf':'application/pdf','.zip':'application/zip','.txt':'text/plain'};
  return map[e] || 'application/octet-stream';
}
contextBridge.exposeInMainWorld('nv', {
  close:()=>ipcRenderer.invoke('app-close'), minimize:()=>ipcRenderer.invoke('app-minimize'), toggleFull:()=>ipcRenderer.invoke('app-toggle-fullscreen'),
  pickFiles:()=>ipcRenderer.invoke('pick-files'), notify:(d)=>ipcRenderer.invoke('notify',d),
  getVersion:()=>ipcRenderer.invoke('app-version'),
  checkUpdates:()=>ipcRenderer.invoke('updates-check'),
  downloadUpdate:()=>ipcRenderer.invoke('updates-download'),
  installUpdate:()=>ipcRenderer.invoke('updates-install'),
  readFileBase64:(p)=>fs.promises.readFile(p).then(b=>b.toString('base64')),
  fileInfo:(p)=>{const s=fs.statSync(p); return {path:p,name:path.basename(p),size:s.size,type:mimeByExt(p)};},
  onWindowState:(cb)=>ipcRenderer.on('window-state', (_e, data)=>cb(data)),
  onUpdateAvailable:(cb)=>ipcRenderer.on('update-available', (_e, data)=>cb(data)),
  onUpdateProgress:(cb)=>ipcRenderer.on('update-progress', (_e, data)=>cb(data)),
  onUpdateDownloaded:(cb)=>ipcRenderer.on('update-downloaded', (_e, data)=>cb(data)),
  onUpdateError:(cb)=>ipcRenderer.on('update-error', (_e, data)=>cb(data)),
  onUpdateStatus:(cb)=>ipcRenderer.on('update-status', (_e, data)=>cb(data)),
  onChangelog:(cb)=>ipcRenderer.on('show-changelog', (_e, data)=>cb(data))
});
