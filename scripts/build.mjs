import { build } from 'esbuild';
for (const name of ['capture', 'upload', 'publish']) {
  await build({entryPoints:[`scripts/${name}.mjs`], bundle:true, minify:true, platform:'node', target:'node24', format:'esm', outfile:`dist/${name}.mjs`, banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'}, legalComments:'eof'});
}
