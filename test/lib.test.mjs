import test from 'node:test';
import assert from 'node:assert/strict';
import { identity, prefix, selectJourneys, selectArtifacts, matchesPull, validMedia, renderComment, hasNewerRecordingRun } from '../scripts/lib.mjs';
import { patchChromeSource } from '../scripts/webreel-compat.mjs';

const sha = 'a'.repeat(40);
const run = {head_sha:sha, run_attempt:2, head_branch:'feature', head_repository:{full_name:'owner/repo'}, pull_requests:[{number:12}]};
const pull = {number:12,state:'open',head:{sha,ref:'feature',repo:{full_name:'owner/repo'}}};
const artifact = (file, attempt=2, number=12) => ({id:1,name:`record-prs-pr-${number}-${sha}-attempt-${attempt}-${file}`,expired:false});

test('Linux frame compatibility removes only the two manual-frame flags', () => {
  const source = 'const args = ["--no-sandbox", "--enable-begin-frame-control", "--run-all-compositor-stages-before-draw", "about:blank"]';
  const patched = patchChromeSource(source);
  assert.ok(patched.includes('"--no-sandbox"'));
  assert.ok(!patched.includes('begin-frame-control'));
  assert.ok(!patched.includes('compositor-stages-before-draw'));
  assert.equal(patchChromeSource(patched),patched);
  assert.throws(() => patchChromeSource('"--enable-begin-frame-control",'));
});

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

test('inline MP4s use standalone player URLs and PNGs render as images', () => {
  const video='https://github.com/user-attachments/assets/11111111-1111-1111-1111-111111111111';
  const image='https://github.com/user-attachments/assets/22222222-2222-2222-2222-222222222222';
  const comment=renderComment({sha,conclusion:'success',runUrl:'https://github.com/run',files:[],media:[{kind:'mp4',title:'Navigation',url:video},{kind:'png',title:'Projects',url:image}]});
  assert.ok(comment.includes(`\n\n${video}\n\n`));
  assert.ok(comment.includes(`![Projects](${image})`));
  assert.ok(!comment.includes('Download MP4'));
  assert.ok(!comment.includes('expire'));
});

test('comments order screenshots numerically before videos regardless of artifact order', () => {
  for (const inline of [true, false]) {
    const media = [
      ['png', '04 screenshot'], ['png', '03 screenshot'], ['png', '01 screenshot'],
      ['png', '02 screenshot'], ['mp4', 'recording_reviews'], ['png', '05 screenshot'],
      ['png', '10 screenshot'], ['mp4', 'account'],
    ].map(([kind, title], index) => ({
      kind, title,
      ...(inline ? {url:`https://github.com/user-attachments/assets/${index}`} : {artifactUrl:`https://github.com/artifact/${index}`}),
    }));
    const original = structuredClone(media);
    const comment = renderComment({sha,conclusion:'success',runUrl:'https://github.com/run',files:[],media});
    assert.deepEqual([...comment.matchAll(/^\*\*(.+)\*\*$/gm)].map(match => match[1]), [
      '01 screenshot', '02 screenshot', '03 screenshot', '04 screenshot',
      '05 screenshot', '10 screenshot', 'account', 'recording\\_reviews',
    ]);
    assert.deepEqual(media, original);
  }
});


test('skipped label events and cancelled runs cannot block publishing a rerun', () => {
  const current={...run,id:100,conclusion:'success'};
  assert.equal(hasNewerRecordingRun([{...current,id:101,conclusion:'skipped'}],current),false);
  assert.equal(hasNewerRecordingRun([{...current,id:101,conclusion:'cancelled'}],current),false);
  assert.equal(hasNewerRecordingRun([{...current,id:101,conclusion:'success'}],current),true);
  assert.equal(hasNewerRecordingRun([{...current,id:101,conclusion:null}],current),true);
  assert.equal(hasNewerRecordingRun([{...current,id:101,head_branch:'another-pr'}],current),false);
});
