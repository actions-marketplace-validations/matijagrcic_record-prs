import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectUpdatedJourneys } from '../scripts/lib.mjs';
import { expandJourneySteps, selectPullRequestJourneys } from '../scripts/journeys.mjs';

const navigation = { url: '/', steps: [{ action: 'click', selector: '#projects' }] };
const account = { url: '/login', steps: [{ action: 'screenshot' }] };

test('only new and updated journey definitions are selected', () => {
  const previous = { navigation, account };
  assert.deepEqual(selectUpdatedJourneys({ ...previous, signature: { url: '/sign', steps: [] } }, previous), ['signature']);
  assert.deepEqual(selectUpdatedJourneys({ navigation: { ...navigation, url: '/projects' }, account }, previous), ['navigation']);
  assert.deepEqual(selectUpdatedJourneys({ navigation: { ...navigation, url: '/projects' }, account: { ...account, steps: [] } }, previous), ['navigation', 'account']);
  assert.deepEqual(selectUpdatedJourneys(previous, previous), []);
  assert.deepEqual(selectUpdatedJourneys({ account }, previous), []);
  assert.deepEqual(selectUpdatedJourneys(previous, {}), ['navigation', 'account']);
  assert.throws(() => selectUpdatedJourneys({ '../unsafe': {} }, {}));
});

test('JSON formatting, key order and journey order do not select unchanged journeys', () => {
  const current = JSON.parse('{ "account": { "steps": [{ "action": "screenshot" }], "url": "/login" }, "navigation": { "steps": [{ "selector": "#projects", "action": "click" }], "url": "/" } }');
  assert.deepEqual(selectUpdatedJourneys(current, { navigation, account }), []);
});

function repository(t, initialFiles) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'record-prs-journeys-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8' }).trim();
  const write = (name, content) => {
    const file = path.join(workspace, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  };
  git('init', '-q');
  git('config', 'user.name', 'Journey test');
  git('config', 'user.email', 'journey-test@example.com');
  for (const [file, content] of Object.entries(initialFiles)) write(file, content);
  const commit = () => {
    git('add', '.');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Test journey definitions');
    return git('rev-parse', 'HEAD');
  };
  const base = commit();
  const configPath = path.join(workspace, 'demo/webreel.config.json');
  const select = (baseSha = base, headSha = git('rev-parse', 'HEAD')) => selectPullRequestJourneys(JSON.parse(fs.readFileSync(configPath, 'utf8')), configPath, workspace, baseSha, headSha);
  return { workspace, write, git, commit, base, configPath, select };
}

test('application source changes alone select no journeys', t => {
  const repo = repository(t, { 'demo/webreel.config.json': { videos: { navigation, account } }, 'demo/src/App.tsx': 'old UI' });
  repo.write('demo/src/App.tsx', 'new UI');
  repo.commit();
  assert.deepEqual(repo.select(), []);
  repo.write('demo/webreel.config.json', { viewport: { width: 1280, height: 720 }, videos: { navigation, account, signature: { url: '/sign', steps: [] } } });
  repo.commit();
  assert.deepEqual(repo.select(), ['signature']);
});

test('capture with no changed journeys succeeds without installing or starting the app', t => {
  const repo = repository(t, { 'demo/webreel.config.json': { videos: { navigation, account } } });
  const eventPath = path.join(repo.workspace, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 12, head: { sha: repo.base }, base: { sha: repo.base } } }));
  const capturePath = fileURLToPath(new URL('../scripts/capture.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [capturePath], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_WORKSPACE: repo.workspace, GITHUB_EVENT_PATH: eventPath,
      GITHUB_RUN_ID: 'skip-test', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: repo.workspace,
      INPUT_WORKING_DIRECTORY: 'demo', INPUT_CONFIG: 'webreel.config.json', INPUT_JOURNEY_MAP: '',
      INPUT_INSTALL_COMMAND: 'exit 97', INPUT_START_COMMAND: 'exit 98' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const markerPath = path.join(repo.workspace, 'record-prs/skip-test/1', `record-prs-pr-12-${repo.base}-attempt-1-marker.json`);
  assert.deepEqual(JSON.parse(fs.readFileSync(markerPath, 'utf8')), { number: 12, sha: repo.base, attempt: 1, skipped: true, journeys: [], success: true });
});

test('a new config selects its journeys, while deleted journeys are ignored', t => {
  const repo = repository(t, { 'README.md': 'App without journeys' });
  repo.write('demo/webreel.config.json', { videos: { navigation, account } });
  const head = repo.commit();
  assert.deepEqual(repo.select(), ['navigation', 'account']);
  repo.write('demo/webreel.config.json', { videos: { account } });
  repo.commit();
  assert.deepEqual(repo.select(head), []);
});

test('comparison uses the PR merge base, not later changes on the target branch', t => {
  const repo = repository(t, { 'demo/webreel.config.json': { videos: { navigation, account } } });
  repo.write('demo/webreel.config.json', { videos: { navigation: { ...navigation, url: '/new-projects' }, account } });
  const target = repo.commit();
  repo.git('checkout', '--detach', repo.base);
  repo.write('demo/webreel.config.json', { videos: { navigation, account, signature: { url: '/sign', steps: [] } } });
  repo.commit();
  assert.deepEqual(repo.select(target), ['signature']);
});

test('only journeys that reference updated include steps are selected', t => {
  const signing = { url: '/sign', include: ['journeys/signature.json'], steps: [] };
  const repo = repository(t, {
    'demo/webreel.config.json': { videos: { navigation, signing } },
    'demo/journeys/signature.json': { include: ['shared/open.json'], steps: [{ action: 'click', selector: '#sign' }] },
    'demo/journeys/shared/open.json': { steps: [{ action: 'wait', selector: '#document' }] },
  });
  repo.write('demo/journeys/shared/open.json', { steps: [{ action: 'wait', selector: '#new-document' }] });
  repo.commit();
  assert.deepEqual(repo.select(), ['signing']);
});

test('unavailable comparison history fails instead of recording unrelated journeys', t => {
  const repo = repository(t, { 'demo/webreel.config.json': { videos: { navigation } } });
  assert.throws(() => repo.select('f'.repeat(40)), /fetch-depth: 0/);
});

test('include cycles fail and original bare-array includes still work', () => {
  const configPath = '/repo/webreel.config.json';
  const video = { include: ['steps.json'], steps: [{ action: 'screenshot' }] };
  assert.deepEqual(expandJourneySteps({}, video, configPath, () => '[{"action":"pause","ms":100}]'), [{ action: 'pause', ms: 100 }, { action: 'screenshot' }]);
  assert.throws(() => expandJourneySteps({}, video, configPath, () => '{"include":["steps.json"],"steps":[]}'), /Circular journey include/);
});
