# record-prs

Record your pull requests as MP4 browser walkthroughs and PNG screenshots. A
trusted publisher keeps one comment up to date and applies `proof: 🎥 video`
and `proof: 📸 screenshot` labels for valid captures of the current PR head.

Built on [Vercel Labs Webreel](https://github.com/vercel-labs/webreel). No AI API
key is needed. Webreel follows your configured journey; it does not infer a new
feature's interactions from arbitrary source-code changes.

## Install in another repository

1. Copy [examples/record-prs.yml](examples/record-prs.yml) to
   `.github/workflows/record-prs.yml`.
2. Copy [examples/record-prs-publish.yml](examples/record-prs-publish.yml) to
   `.github/workflows/record-prs-publish.yml`.
3. Copy [examples/webreel.config.json](examples/webreel.config.json) to the
   application directory. Replace the URL, selectors, and steps with your feature.
4. Customize the capture workflow's install/start commands and application URL.
5. Merge both workflows into the default branch. Publishing is triggered by
   `workflow_run` and only operates once its workflow exists on that branch.

```yaml
jobs:
  record:
    if: '!github.event.pull_request.draft'
    uses: matijagrcic/record-prs/.github/workflows/capture.yml@v1.0.2
    with:
      install-command: npm ci
      start-command: npm run dev -- --host 127.0.0.1
      base-url: http://127.0.0.1:3000
```

That is the whole capture job. The reusable workflow sets up Node 24 and Bun,
checks out the exact PR head with read-only permissions, starts the application,
runs the matching journeys, and uploads each video/screenshot directly without
a ZIP wrapper. The action also works as `uses: matijagrcic/record-prs@v1.0.2` inside
your own job; set up Node 24 and check out the PR first.

For Bun use `install-command: bun install --frozen-lockfile`. For pnpm, enable
Corepack in the install command and use a frozen install. For a monorepo, set
`working-directory: apps/web`; config paths are relative to that directory.
Leave `start-command: ''` and provide a ready preview URL to record an existing
deployment instead of starting the app on the runner.

## Select journeys using changed files

Without a map, every configured journey runs. An optional JSON map selects
journeys using repository-relative changed-file globs:

```json
{
  "navigation": ["src/navigation/**", "src/App.tsx"],
  "account": ["src/auth/**"]
}
```

Pass its filename with `journey-map: journeys.json`. The keys must match video
names in your Webreel config. Unmapped journeys always run. A missing Git diff
records all journeys; zero matching journeys produces an explicit skip comment
and removes stale proof labels. Update a journey in the feature PR when the
new feature requires new interactions. This records the PR version of the app;
screenshots are milestones in that journey, rather than comparisons against
the base branch.

## PR comments and inline attachments

The default needs only `GITHUB_TOKEN` and links to direct Actions artifacts.
Artifacts require GitHub sign-in and expire after 14 days by default.

To embed videos and screenshots in the comment, optionally add a
`PR_MEDIA_TOKEN` Actions secret from a dedicated bot with push access to that
repository. It is passed only to the trusted publisher. The
`uploads.github.com/user-attachments/assets` endpoint is undocumented; failures
fall back to artifact links. Attachment behavior and access controls are
controlled by GitHub; do not use it for sensitive captures without independently
checking your repository's access behavior.

Create the labels once (or set `proof-labels: 'false'` on the publisher action):

```sh
gh label create 'app: web-ui' --color 1D76DB --description 'Web UI changes'
gh label create 'proof: 🎥 video' --color 0E8A16 --description 'Current PR head has recorded video evidence'
gh label create 'proof: 📸 screenshot' --color 0E8A16 --description 'Current PR head has screenshot evidence'
```

By default every non-draft PR is eligible. To require `app: web-ui`, add
`contains(github.event.pull_request.labels.*.name, 'app: web-ui')` to the capture
job condition. The examples ignore unrelated label events so adding proof
labels does not trigger another recording.

## Inputs

| Capture input | Default | Meaning |
| --- | --- | --- |
| `working-directory` | `.` | App path in the caller's checkout |
| `install-command` | `npm ci` | Dependency installation command |
| `start-command` | `npm run dev -- --host 127.0.0.1` | App command, or empty for an existing preview |
| `base-url` | `http://127.0.0.1:3000` | Readiness URL and relative journey URL base |
| `config` | `webreel.config.json` | Webreel config relative to the app directory |
| `journey-map` | empty | Optional changed-file selection map |
| `ready-timeout` | `90` | Readiness timeout in seconds (composite action) |
| `retention-days` | `14` | Artifact retention, 1–90 days |

The reusable workflow also accepts `node-version` (24+) and `bun-version`.
Use the composite action if you need custom tooling or `ready-timeout`.

The publisher takes `github-token`, optional `media-token`, and `proof-labels`.
It downloads at most 32 media files, each at most 10 MiB, validates SHA256
digests and PNG/MP4 signatures, and never extracts archives or executes captured
content. Captures above that size are omitted from proof publishing; shorten
the journey or lower the viewport. Capture uploads are limited to 25 MiB per
file and at most 8 journeys per run. One capture action per workflow run is
supported.

## Security and forks

Capture uses `pull_request`, `contents: read`, no secrets, and no persisted
checkout credentials. Do not use `pull_request_target` to execute PR code. Use
mock/seeded app state for fork PRs; private-service secrets are unavailable.

Publishing runs from the default branch without checking out the PR. It checks
the run attempt, PR number, current head SHA, run head SHA, head repository,
branch, and PR association before writing. Old/cancelled runs are ignored. An
older run for the same commit cannot overwrite a newer run. Proof labels
describe successful media capture, not a guarantee of feature correctness.

The publisher workflow must listen only to your recording workflow name.
Dependencies are pinned and the release includes bundled JavaScript, so caller
repositories don't install the action's dependencies. Pin a release commit SHA
instead of the release tag if your policy requires immutable references.
GitHub.com and Linux runners are supported; GHES is not supported by this version.
Ubuntu runners install system FFmpeg through apt if it is absent. Other Linux
runners should provide FFmpeg before calling the action.

## shadcn demo

`demo/` is a Vite/React/Bun app initialized with
`bunx --bun shadcn@latest init`, followed by
`bunx --bun shadcn@latest add --all`, and the official `sidebar-07`, `login-01`,
and `signup-01` blocks. Account forms are local demo screens, not real auth.

```sh
cd demo
bun install --frozen-lockfile
bun run dev -- --host 127.0.0.1 --port 3000
# In another terminal, from the repository root:
npx webreel@0.1.4 record -c demo/webreel.config.json
```

## Develop the action

```sh
npm ci
npm test
npm run check
npm run build
```

Commit `dist/` after changing action scripts. CI verifies that bundled files
match the sources and builds the complete shadcn demo.

## References

- [Webreel source and configuration](https://github.com/vercel-labs/webreel)
- [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- [GitHub artifact toolkit](https://github.com/actions/toolkit/tree/main/packages/artifact)
- [shadcn sidebar blocks](https://ui.shadcn.com/blocks/sidebar), [login](https://ui.shadcn.com/blocks/login), [signup](https://ui.shadcn.com/blocks/signup)
