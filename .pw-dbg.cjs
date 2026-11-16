const { chromium } = require('playwright'); const fs=require('fs');
const SP='/tmp/claude-0/-home-user-HappyWalkers/62baa3c4-ec4a-50f2-87d9-f63ab1a8e36d/scratchpad';
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage();
await p.goto('http://localhost:5201/anmelden');await p.getByLabel('Ihre E-Mail-Adresse').fill(`dbg${Date.now()}@example.org`);
await p.getByRole('button',{name:'Anmelde-Link senden'}).click();await p.waitForTimeout(1500);
console.log(await p.locator('.toast').allTextContents());
const link=[...fs.readFileSync(SP+'/server.log','utf8').matchAll(/https?:\/\/\S+/g)].map(m=>m[0]).filter(u=>u.includes('token')).at(-1);
const r=await p.goto(link);console.log(r.status(),p.url());await p.waitForTimeout(1500);console.log(p.url());await b.close();})();
