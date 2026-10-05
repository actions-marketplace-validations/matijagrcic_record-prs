// Webreel 0.1.4 enables manual frames without invoking beginFrame, which hangs
// Page.captureScreenshot on Linux. https://github.com/vercel-labs/webreel/issues/8
export function patchChromeSource(source) {
  const flags = ['--enable-begin-frame-control', '--run-all-compositor-stages-before-draw'];
  const counts = flags.map(flag => source.split(`"${flag}",`).length - 1);
  if (counts.every(count => count === 0)) return source;
  if (!counts.every(count => count === 1)) throw new Error('Unexpected Webreel Chrome source; compatibility patch refused.');
  return flags.reduce((result,flag) => result.replace(`"${flag}",`, ''), source);
}
