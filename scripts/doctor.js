const fs=require('fs'); const need=['src/main.js','src/preload.js','src/index.html','src/renderer.js','src/style.css','server/server.js','assets/icon.png','package.json'];
let ok=true; for(const f of need){if(!fs.existsSync(f)){console.log('missing',f); ok=false}else console.log('ok',f)}
console.log(ok?'NightVault doctor: OK':'NightVault doctor: problems found');
