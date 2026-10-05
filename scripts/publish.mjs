import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { DefaultArtifactClient } from '@actions/artifact';
import { marker, matchesPull, selectArtifacts, validMedia, renderComment, hasNewerRecordingRun } from './lib.mjs';

async function main() {
  if (context.eventName !== 'workflow_run') throw new Error('Publisher must run in a trusted workflow_run workflow.');
  const run = context.payload.workflow_run;
  if (run.event !== 'pull_request' || ['cancelled','skipped'].includes(run.conclusion)) return;
  if (context.serverUrl !== 'https://github.com') throw new Error('This version supports GitHub.com only.');
  const token = core.getInput('github-token', {required:true});
  const github = getOctokit(token);
  const {owner, repo} = context.repo;
  const repoArgs = {owner, repo};
  // Refresh server-owned run data. Never derive the publishing target from file contents.
  const {data: freshRun} = await github.rest.actions.getWorkflowRun({...repoArgs, run_id:run.id});
  if (freshRun.run_attempt !== run.run_attempt || freshRun.status !== 'completed') return;
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {...repoArgs, run_id:run.id, per_page:100});
  const selected = selectArtifacts(artifacts, freshRun);
  if (!selected) { core.notice('No current-attempt recording marker.'); return; }
  const id = selected.id;
  const pullArgs = {...repoArgs, pull_number:id.number};
  const {data: pull} = await github.rest.pulls.get(pullArgs);
  if (!matchesPull(pull, freshRun, id)) { core.notice('Ignoring stale or unrelated recording.'); return; }
  // Do not let an older run overwrite a later run for the same PR commit.
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {...repoArgs, workflow_id:run.workflow_id, event:'pull_request', head_sha:id.sha, per_page:100});
  if (hasNewerRecordingRun(runs, freshRun)) {
    core.notice('A newer recording run exists for this commit.'); return;
  }
  const client = new DefaultArtifactClient();
  const temp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || '/tmp', 'record-prs-publish-'));
  const download = async (entry, maxBytes) => {
    const artifact = entry.artifact;
    if (artifact.size_in_bytes <= 0 || artifact.size_in_bytes > maxBytes) throw new Error('Artifact exceeds publishing size limit.');
    if (!/^sha256:[a-f0-9]{64}$/i.test(artifact.digest || '')) throw new Error('Missing artifact SHA256 digest.');
    const dest = path.join(temp, String(artifact.id));
    await client.downloadArtifact(artifact.id, {path:dest, skipDecompress:true, expectedHash:artifact.digest.slice(7), findBy:{token, workflowRunId:run.id, repositoryOwner:owner, repositoryName:repo}});
    const files = fs.readdirSync(dest);
    if (files.length !== 1) throw new Error('Artifact must contain exactly one opaque file.');
    const file = path.join(dest, files[0]);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid downloaded media size or type.');
    const bytes = fs.readFileSync(file);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (`sha256:${hash}` !== artifact.digest) throw new Error('Artifact digest mismatch.');
    return bytes;
  };
  const markerBytes = await download(id, 65536);
  const status = JSON.parse(markerBytes.toString('utf8'));
  if (status.number !== id.number || status.sha !== id.sha || status.attempt !== id.attempt || typeof status.skipped !== 'boolean') throw new Error('Invalid marker contents.');
  const uploadToken = core.getInput('media-token');
  const media = [];
  for (const entry of selected.entries) {
    try {
      const bytes = await download(entry, 10 * 1024 * 1024);
      if (!validMedia(bytes, entry.kind)) throw new Error('Invalid media signature.');
      let url;
      if (uploadToken) {
        try {
          const mime = entry.kind === 'mp4' ? 'video/mp4' : 'image/png';
          const endpoint = new URL('https://uploads.github.com/user-attachments/assets');
          endpoint.search = new URLSearchParams({name:entry.artifact.name, content_type:mime, repository_id:String(context.payload.repository.id)}).toString();
          const response = await fetch(endpoint, {method:'POST', redirect:'error', signal:AbortSignal.timeout(180000), headers:{Authorization:`Bearer ${uploadToken}`, Accept:'application/vnd.github+json', 'Content-Type':'application/octet-stream', 'User-Agent':'record-prs'}, body:bytes});
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = await response.json();
          if (!/^https:\/\/github\.com\/user-attachments\/assets\/[a-f0-9-]+$/i.test(result.url || '')) throw new Error('Invalid attachment URL.');
          url = result.url;
        } catch (error) { core.warning(`Attachment upload unavailable (${error.message}); using artifact link.`); }
      }
      media.push({kind:entry.kind, title:entry.file.replace(/\.(mp4|png)$/,'').replaceAll('-',' '), url, artifactUrl:`https://github.com/${owner}/${repo}/actions/runs/${run.id}/artifacts/${entry.artifact.id}`});
    } catch (error) { core.warning(`Skipping artifact ${entry.artifact.id}: ${error.message}`); }
  }
  const files = await github.paginate(github.rest.pulls.listFiles, {...pullArgs, per_page:100});
  // A PR may receive another commit while media is being downloaded or uploaded.
  const {data: current} = await github.rest.pulls.get(pullArgs);
  if (!matchesPull(current, freshRun, id)) return;
  const body = renderComment({sha:id.sha, conclusion:freshRun.conclusion, runUrl:freshRun.html_url, files, media, skipped:status.skipped});
  const comments = await github.paginate(github.rest.issues.listComments, {...repoArgs, issue_number:id.number, per_page:100});
  const previous = comments.find(c => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(marker));
  if (previous) await github.rest.issues.updateComment({...repoArgs, comment_id:previous.id, body});
  else await github.rest.issues.createComment({...repoArgs, issue_number:id.number, body});
  if (core.getInput('proof-labels') !== 'false') {
    for (const [name, kind] of [['proof: 🎥 video','mp4'], ['proof: 📸 screenshot','png']]) {
      const present = freshRun.conclusion === 'success' && !status.skipped && media.some(m => m.kind === kind);
      try {
        if (present) await github.rest.issues.addLabels({...repoArgs, issue_number:id.number, labels:[name]});
        else await github.rest.issues.removeLabel({...repoArgs, issue_number:id.number, name});
      } catch (error) { if (error.status === 404 || error.status === 422) core.warning(`Create the repository label ${name} to enable proof labels.`); else throw error; }
    }
  }
  core.setOutput('pr-number', String(id.number));
  core.setOutput('media-count', String(media.length));
}
main().catch(error => core.setFailed(error.message));
