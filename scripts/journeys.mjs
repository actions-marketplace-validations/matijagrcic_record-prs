import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectUpdatedJourneys } from './lib.mjs';

export function expandJourneySteps(config, video, configPath, read = file => fs.readFileSync(file, 'utf8')) {
  function expand(steps, includes, file, ancestors) {
    if (ancestors.length > 10) throw new Error('Too many nested journey include files.');
    const extra = includes.flatMap(include => {
      const includedPath = path.resolve(path.dirname(file), include);
      if (ancestors.includes(includedPath)) throw new Error(`Circular journey include: ${includedPath}`);
      const content = JSON.parse(read(includedPath));
      // Retain support for the action's original bare-array includes.
      const definition = Array.isArray(content) ? { steps: content } : content;
      if (!Array.isArray(definition?.steps)) throw new Error(`Journey include must contain a steps array: ${includedPath}`);
      return expand(definition.steps, definition.include || [], includedPath, [...ancestors, includedPath]);
    });
    return [...extra, ...steps];
  }
  return expand(video.steps || [], [...(config.include || []), ...(video.include || [])], configPath, [configPath]);
}

export function selectPullRequestJourneys(config, configPath, workspace, baseSha, headSha) {
  const git = args => {
    const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Could not read journey definitions from the PR base. Check out the PR with fetch-depth: 0.');
    return result.stdout;
  };
  const relative = file => {
    const name = path.relative(workspace, file).split(path.sep).join('/');
    if (name === '..' || name.startsWith('../') || path.isAbsolute(name)) throw new Error('Journey files must be inside the repository.');
    return name;
  };
  const mergeBase = git(['merge-base', baseSha, headSha]).trim();
  const configName = relative(configPath);
  const exists = git(['ls-tree', '--name-only', mergeBase, '--', configName]).trim();
  const previous = exists ? JSON.parse(git(['show', `${mergeBase}:${configName}`])) : { videos: {} };
  if (!previous.videos || typeof previous.videos !== 'object' || Array.isArray(previous.videos)) throw new Error('The base Webreel config must define a videos object.');
  const definitions = (source, read) => Object.fromEntries(Object.entries(source.videos).map(([name, video]) =>
    [name, { ...video, steps: expandJourneySteps(source, video, configPath, read) }]));
  // Compare only journey definitions, including referenced steps. App source files
  // and unrelated config defaults do not select additional journeys.
  return selectUpdatedJourneys(definitions(config), definitions(previous, file => git(['show', `${mergeBase}:${relative(file)}`])));
}
