import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const marker = '<!-- record-prs -->';
export const mediaPattern = /^record-prs-pr-(\d+)-([a-f0-9]{40})-attempt-(\d+)-(marker\.json|([a-zA-Z0-9_-]+)\.(mp4|png))$/;

export function identity(event, attempt) {
  const pr = event.pull_request;
  if (!pr || !Number.isSafeInteger(pr.number) || !/^[a-f0-9]{40}$/.test(pr.head.sha)) {
    throw new Error('Capture must run on a pull_request event.');
  }
  if (!Number.isSafeInteger(Number(attempt)) || Number(attempt) < 1) throw new Error('Invalid run attempt.');
  return { number: pr.number, sha: pr.head.sha, attempt: Number(attempt) };
}

export function prefix(id) {
  return `record-prs-pr-${id.number}-${id.sha}-attempt-${id.attempt}`;
}

export function selectJourneys(videos, mapping, changed) {
  const names = Object.keys(videos);
  for (const name of names) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error(`Unsafe journey name: ${name}`);
  }
  for (const [name, patterns] of Object.entries(mapping)) {
    if (!names.includes(name) || !Array.isArray(patterns) || patterns.some(p => typeof p !== 'string')) {
      throw new Error(`Invalid journey mapping: ${name}`);
    }
  }
  return names.filter(name => !mapping[name] || changed === null || changed.some(file => mapping[name].some(glob => path.matchesGlob(file, glob))));
}

export function selectUpdatedJourneys(videos, previousVideos) {
  return selectJourneys(videos, {}, []).filter(name =>
    !Object.hasOwn(previousVideos, name) || !isDeepStrictEqual(videos[name], previousVideos[name]));
}

export function selectArtifacts(artifacts, run) {
  const entries = artifacts.flatMap(artifact => {
    const match = artifact.name.match(mediaPattern);
    if (!match || artifact.expired || Number(match[3]) !== Number(run.run_attempt)) return [];
    return [{ artifact, number: Number(match[1]), sha: match[2], attempt: Number(match[3]), file: match[4], kind: match[6] || 'marker' }];
  });
  if (new Set(entries.map(e => `${e.number}:${e.sha}`)).size > 1) throw new Error('Ambiguous PR artifact identities.');
  const markers = entries.filter(e => e.kind === 'marker');
  if (markers.length !== 1) return null;
  if (new Set(entries.map(e => e.artifact.name)).size !== entries.length) throw new Error('Duplicate media artifacts.');
  if (entries.length > 33) throw new Error('Too many media artifacts.');
  return { id: markers[0], entries: entries.filter(e => e.kind !== 'marker') };
}

export function matchesPull(pull, run, id) {
  return pull.state === 'open' && pull.head.sha === id.sha && run.head_sha === id.sha &&
    pull.head.ref === run.head_branch && pull.head.repo?.full_name === run.head_repository?.full_name &&
    (!(run.pull_requests?.length) || run.pull_requests.some(p => p.number === pull.number));
}

export function hasNewerRecordingRun(runs, current) {
  return runs.some(other => other.id > current.id &&
    !['cancelled', 'skipped'].includes(other.conclusion) &&
    other.head_branch === current.head_branch &&
    other.head_repository?.full_name === current.head_repository?.full_name);
}

export function validMedia(bytes, kind) {
  if (kind === 'png') return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (kind === 'mp4') return bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  return false;
}

export function markdown(value) {
  return String(value).replace(/[\\`*_{}\[\]<>()|!#\r\n]/g, c => c === '\n' || c === '\r' ? ' ' : `\\${c}`);
}

export function renderComment({sha, conclusion, runUrl, files, media, skipped = false}) {
  const status = skipped ? 'No journeys selected for this PR.' : conclusion === 'success' ? '✅ Capture succeeded' : `❌ Capture ${markdown(conclusion)}`;
  const lines = [marker, '### PR recording', '', `${status} for commit \`${sha.slice(0, 7)}\`.`, '', `[Workflow run](${runUrl})`];
  for (const entry of media) {
    lines.push('', `**${markdown(entry.title)}**`, '', entry.url ? (entry.kind === 'png' ? `![${markdown(entry.title)}](${entry.url})` : entry.url) : `[Download ${entry.kind.toUpperCase()}](${entry.artifactUrl})`);
  }
  if (media.some(e => !e.url)) lines.push('', 'Media downloads require GitHub sign-in. Actions artifacts expire according to the configured retention period.');
  if (!media.length && !skipped) lines.push('', 'No valid media was produced. See the workflow logs.');
  lines.push('', '<details>', '<summary>Changed files</summary>', '');
  for (const file of files.slice(0, 40)) lines.push(`- ${markdown(file.filename)} (+${file.additions}/−${file.deletions})`);
  if (files.length > 40) lines.push(`- …and ${files.length - 40} more files.`);
  lines.push('', '</details>');
  return lines.join('\n');
}
