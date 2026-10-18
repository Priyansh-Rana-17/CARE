// Usage: node bundle.js   (needs server.js, index.html, app.js and the feature files in this folder)
// Produces care-single.js: backend + frontend + feature modules in ONE file. Run it with: node care-single.js
// (mcp-stdio.js is a separate small helper for desktop MCP apps and is not part of the bundle.)
const fs=require('fs'),path=require('path'),r=n=>fs.readFileSync(path.join(__dirname,n),'utf8'),M='const EMBED=null;//EMBED';
const s=r('server.js');if(!s.includes(M))throw new Error('Use the original server.js (marker not found).');
const files={};['index.html','app.js','ui-studio.js','ui-ops.js','ui-hub.js','ui-chat.js','ui-care.js','ui-home.js','ui-sos.js','ui-redesign.js','home.js','whatsapp.js','reports.js','google.js','ops.js','mcp.js','mcp-ui.js','tidy.js'].forEach(n=>files[n]=r(n));
fs.writeFileSync(path.join(__dirname,'care-single.js'),s.replace(M,()=>'const EMBED='+JSON.stringify(files)+';'));
console.log('Created care-single.js. Run it with: node care-single.js');
