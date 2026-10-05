import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as core from '@actions/core';
import { identity, prefix, selectJourneys } from './lib.mjs';

const get = (name, fallback = '') => process.env[`INPUT_${name.toUpperCase().replaceAll('-', '_')}`] || fallback;
const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const out = path.join(process.env.RUNNER_TEMP || workspace, 'record-prs', process.env.GITHUB_RUN_ID || 'local', process.env.GITHUB_RUN_ATTEMPT || '1');
const root = path.resolve(workspace, get('working-directory', '.'));
const id = identity(JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), process.env.GITHUB_RUN_ATTEMPT || '1');
fs.mkdirSync(out, { recursive: true });
core.setOutput('media-directory', out);
const state = { ...id, skipped: false, journeys: [], success: false };
const markerPath = path.join(out, `${prefix(id)}-marker.json`);
const writeMarker = () => fs.writeFileSync(markerPath, JSON.stringify(state));
writeMarker();

function command(command, args, cwd = root, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
const shell = text => command('bash', ['-eo', 'pipefail', '-c', text]);
let server;
let log;
try {
  const configPath = path.resolve(root, get('config', 'webreel.config.json'));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.videos || typeof config.videos !== 'object') throw new Error('Webreel config must define videos.');
  const mapPath = get('journey-map');
  const mapping = mapPath ? JSON.parse(fs.readFileSync(path.resolve(root, mapPath), 'utf8')) : {};
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const diff = spawnSync('git', ['diff', '--name-only', '-z', `${event.pull_request.base.sha}...${id.sha}`], {cwd: workspace, encoding:'utf8'});
  const changed = diff.status === 0 ? diff.stdout.split('\0').filter(Boolean) : null;
  if (changed === null) core.warning('Could not read the PR diff; recording all journeys. Use fetch-depth: 0.');
  const selected = selectJourneys(config.videos, mapping, changed);
  state.journeys = selected;
  if (!selected.length) {
    state.skipped = true;
    state.success = true;
    core.notice('No journeys matched the PR changes.');
  } else {
    if (selected.length > 8) throw new Error('At most 8 journeys can be recorded per run.');
    await shell(get('install-command', 'npm ci'));
    const toolDir = path.join(process.env.RUNNER_TEMP || out, 'record-prs-webreel-0.1.4');
    await command('npm', ['install', '--prefix', toolDir, '--no-audit', '--no-fund', 'webreel@0.1.4'], workspace);
    const cli = path.join(toolDir, 'node_modules', '.bin', 'webreel');
    // Webreel 0.1.4 downloads Chrome and FFmpeg on first record; its CLI has no install subcommand.
    const baseUrl = get('base-url', 'http://127.0.0.1:3000');
    const env = { ...process.env, FEATURE_DEMO_BASE_URL: baseUrl, RECORD_PRS_BASE_URL: baseUrl };
    const start = get('start-command');
    if (start) {
      log = fs.openSync(path.join(out, 'app.log'), 'w');
      server = spawn('bash', ['-eo', 'pipefail', '-c', start], {cwd: root, env, detached:true, stdio:['ignore',log,log]});
      server.on('error', error => core.warning(error.message));
    }
    const deadline = Date.now() + Number(get('ready-timeout', '90')) * 1000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server && server.exitCode !== null) throw new Error('Application exited before becoming ready.');
      try { const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) }); ready = response.ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error(`Application was not ready at ${baseUrl}.`);
    const prepared = { ...config, baseUrl, outDir: out, videos: {} };
    let screenshot = 0;
    function expand(steps, includes = [], depth = 0) {
      if (depth > 10) throw new Error('Too many nested include files.');
      const extra = includes.flatMap(file => {
        const content = JSON.parse(fs.readFileSync(path.resolve(path.dirname(configPath), file), 'utf8'));
        if (!Array.isArray(content)) throw new Error('Include files must contain a steps array.');
        return content;
      });
      return [...extra, ...steps].map(step => step.action === 'screenshot' ? {...step, output: path.join(out, `${prefix(id)}-${String(++screenshot).padStart(2,'0')}-screenshot.png`)} : step);
    }
    delete prepared.include;
    for (const name of selected) {
      const video = config.videos[name];
      prepared.videos[name] = { ...video, baseUrl, output: `${prefix(id)}-${name}.mp4`, thumbnail: {enabled:false}, steps: expand(video.steps || [], [...(config.include || []), ...(video.include || [])]) };
      delete prepared.videos[name].include;
    }
    const generated = path.join(out, 'webreel.config.json');
    fs.writeFileSync(generated, JSON.stringify(prepared));
    await command(cli, ['validate', '-c', generated], root, env);
    await command(cli, ['record', '-c', generated], root, env);
    for (const name of selected) {
      if (!fs.existsSync(path.join(out, `${prefix(id)}-${name}.mp4`))) throw new Error(`Journey ${name} produced no video.`);
    }
    state.success = true;
  }
} catch (error) {
  core.setFailed(error.message);
  if (fs.existsSync(path.join(out, 'app.log'))) core.info(fs.readFileSync(path.join(out, 'app.log'), 'utf8').slice(-16000));
} finally {
  writeMarker();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  if (log !== undefined) fs.closeSync(log);
}
