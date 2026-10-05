import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import { DefaultArtifactClient } from '@actions/artifact';
import { mediaPattern } from './lib.mjs';
try {
  const dir = process.env.MEDIA_DIRECTORY;
  if (!dir || !fs.existsSync(dir)) throw new Error('No capture marker directory is available.');
  const retention = Number(process.env.RETENTION_DAYS || '14');
  if (!Number.isInteger(retention) || retention < 1 || retention > 90) throw new Error('retention-days must be 1–90.');
  const client = new DefaultArtifactClient();
  const files = fs.readdirSync(dir).filter(name => mediaPattern.test(name));
  if (files.length > 33) throw new Error('Too many capture artifacts.');
  for (const name of files) {
    const file = path.join(dir, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 25 * 1024 * 1024) { core.warning(`Skipping oversized or non-file media ${name}.`); continue; }
    await client.uploadArtifact(name, [file], dir, { skipArchive:true, retentionDays:retention });
  }
} catch (error) { core.setFailed(error.message); }
