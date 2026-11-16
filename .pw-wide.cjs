const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 640, height: 900 } });
  await p.goto('http://localhost:5201' + process.argv[2]); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 641).filter(e=>!e.closest('.table-wrap')).slice(0, 10).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)));
  console.log(r.join('\n')); await b.close();
})();
