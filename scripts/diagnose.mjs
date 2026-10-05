import { spawn } from 'node:child_process';
import { launchChrome, connectCDP } from '@webreel/core';
const app = spawn('bash',['-c','cd demo && bun run preview -- --host 127.0.0.1 --port 3000'],{stdio:'inherit',detached:true});
let chrome;
let client;
try {
  await new Promise(resolve => setTimeout(resolve,2000));
  console.log('APP HTTP', (await fetch('http://127.0.0.1:3000')).status);
  console.log('LAUNCH'); chrome = await launchChrome({headless:true});
  console.log('CONNECT',chrome.port); client = await connectCDP(chrome.port);
  console.log('PAGE ENABLE'); await client.Page.enable();
  console.log('RUNTIME ENABLE'); await client.Runtime.enable();
  console.log('METRICS'); await client.Emulation.setDeviceMetricsOverride({width:1440,height:900,deviceScaleFactor:1,mobile:false});
  console.log('NAVIGATE'); const loaded = client.Page.loadEventFired();
  console.log('NAV RESULT',await client.Page.navigate({url:'http://127.0.0.1:3000/'}));
  await Promise.race([loaded, new Promise((_,reject) => setTimeout(() => reject(new Error('Load event timeout')),15000))]);
  console.log('LOADED');
  console.log('DOM',await client.Runtime.evaluate({expression:'document.body.innerText',returnByValue:true}));
  console.log('SCREENSHOT'); console.log((await client.Page.captureScreenshot({format:'png'})).data.length);
  console.log('DONE');
} finally {
  await client?.close(); chrome?.kill();
  try {process.kill(-app.pid,'SIGTERM')} catch {}
}
