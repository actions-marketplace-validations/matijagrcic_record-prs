import test from 'node:test';
import assert from 'node:assert/strict';
import { identity, prefix, selectJourneys, selectArtifacts, matchesPull, validMedia, renderComment } from '../scripts/lib.mjs';

const sha = 'a'.repeat(40);
const run = {head_sha:sha, run_attempt:2, head_branch:'feature', head_repository:{full_name:'owner/repo'}, pull_requests:[{number:12}]};
const pull = {number:12,state:'open',head:{sha,ref:'feature',repo:{full_name:'owner/repo'}}};
const artifact = (file, attempt=2, number=12) => ({id:1,name:`record-prs-pr-${number}-${sha}-attempt-${attempt}-${file}`,expired:false});

test('changed-file mapping selects navigation and leaves unmapped journeys enabled', () => {
  assert.deepEqual(selectJourneys({navigation:{},auth:{},always:{}},{navigation:['src/**'],auth:['auth/**']},['src/App.tsx']),['navigation','always']);
  assert.deepEqual(selectJourneys({navigation:{}},{navigation:['src/**']},['README.md']),[]);
  assert.deepEqual(selectJourneys({navigation:{}},{navigation:['src/**']},null),['navigation']);
  assert.throws(() => selectJourneys({'../../x':{}},{},[]));
  assert.throws(() => selectJourneys({x:{}},{unknown:['**']},[]));
});
test('identity comes from the event, not the walkthrough', () => {
  const id = identity({pull_request:{number:12,head:{sha}}},2);
  assert.equal(prefix(id),`record-prs-pr-12-${sha}-attempt-2`);
  assert.throws(() => identity({},1));
});
test('publisher rejects unrelated heads, forks, branches, closed PRs and associations', () => {
  assert.equal(matchesPull(pull,run,{sha}),true);
  assert.equal(matchesPull(pull,{...run,head_sha:'b'.repeat(40)},{sha}),false);
  assert.equal(matchesPull(pull,{...run,head_branch:'other'},{sha}),false);
  assert.equal(matchesPull(pull,{...run,head_repository:{full_name:'attacker/repo'}},{sha}),false);
  assert.equal(matchesPull({...pull,state:'closed'},run,{sha}),false);
  assert.equal(matchesPull(pull,{...run,pull_requests:[{number:99}]},{sha}),false);
});
test('artifacts must have one current-attempt marker and an unambiguous PR identity', () => {
  const result = selectArtifacts([artifact('marker.json'),artifact('navigation.mp4'),artifact('navigation.mp4',1)],run);
  assert.equal(result.entries.length,1);
  assert.equal(selectArtifacts([artifact('navigation.mp4')],run),null);
  assert.equal(selectArtifacts([artifact('marker.json',1)],run),null);
  assert.throws(() => selectArtifacts([artifact('marker.json'),artifact('navigation.mp4',2,13)],run));
  assert.throws(() => selectArtifacts([artifact('marker.json'),artifact('navigation.mp4'),artifact('navigation.mp4')],run));
  assert.equal(selectArtifacts([{...artifact('marker.json'),expired:true}],run),null);
});
test('opaque media must have the expected signature', () => {
  assert.equal(validMedia(Buffer.from([137,80,78,71,13,10,26,10,1]),'png'),true);
  assert.equal(validMedia(Buffer.from('0000ftypisom0000'),'mp4'),true);
  assert.equal(validMedia(Buffer.from('PK archive'),'mp4'),false);
  assert.equal(validMedia(Buffer.from('#!/bin/bash'),'png'),false);
});
test('comment reports artifact fallback and escapes filenames', () => {
  const comment = renderComment({sha,conclusion:'success',runUrl:'https://github.com/run',files:[{filename:'<img> [bad](url)\ntext',additions:1,deletions:0}],media:[{kind:'mp4',title:'Navigation',artifactUrl:'https://github.com/artifact'}]});
  assert.match(comment,/Download MP4/);
  assert.match(comment,/require GitHub sign-in/);
  assert.ok(!comment.includes('<img>'));
  assert.ok(!comment.includes('[bad](url)'));
});
