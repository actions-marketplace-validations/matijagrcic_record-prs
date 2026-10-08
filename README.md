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
6. For videos and screenshots embedded in the PR comment, complete the
   [inline attachment setup](#pr-comments-and-inline-attachments) in that repository.

```yaml
jobs:
  record:
    if: '!github.event.pull_request.draft'
    uses: matijagrcic/record-prs/.github/workflows/capture.yml@v1.1.0
    with:
      install-command: npm ci
      start-command: npm run dev -- --host 127.0.0.1
      base-url: http://127.0.0.1:3000
```

That is the whole capture job. The reusable workflow sets up Node 24 and Bun,
checks out the exact PR head with read-only permissions, starts the application,
runs the matching journeys, and uploads each video/screenshot directly without
a ZIP wrapper. The action also works as `uses: matijagrcic/record-prs@v1.1.0` inside
your own job; set up Node 24 and check out the PR first.

For Bun use `install-command: bun install --frozen-lockfile`. For pnpm, enable
Corepack in the install command and use a frozen install. For a monorepo, set
`working-directory: apps/web`; config paths are relative to that directory.
Leave `start-command: ''` and provide a ready preview URL to record an existing
deployment instead of starting the app on the runner.

## Select journeys for a PR

Version `v1.1.0` records only journeys added or updated in the PR. It compares
each entry in the Webreel config's `videos` object with the same entry at the PR's
merge base. Referenced JSON include steps are part of that comparison. Changes
to application source files, JSON formatting, or shared recording defaults do
not select unchanged journeys. Deleted journeys do not run.

Have the agent create or update a journey in the same PR as the UI change. One
changed journey records one video; several record several. If no journeys
change, capture skips application installation and recording. The publisher
updates the PR comment and removes stale proof labels.

Webreel needs the journey's URL, selectors, and browser steps. A file named
`journeys.json` with source-file patterns is a record-prs option, not a Webreel
requirement. The demo does not use one. A separate JSON steps file can be
referenced with `include`; merely adding an unreferenced file does not run it.

When upgrading from `v1.0.5`, add or update a journey in the same PR as each
frontend change. Release `v1.0.5` records every configured journey when no map
is supplied; `v1.1.0` records only new or updated journeys by default. Custom
capture jobs must check out the PR with `fetch-depth: 0`; missing comparison
history fails capture. The reusable capture workflow includes this setting.
The demo workflow uses the action from its checkout to test the current source.

For compatibility, an explicit `journey-map` still overrides this default and
selects journeys using repository-relative changed-file globs:

```json
{
  "navigation": ["src/navigation/**", "src/App.tsx"],
  "account": ["src/auth/**"]
}
```

Pass its filename with `journey-map: journeys.json`. The keys must match video
names in your Webreel config. Unmapped journeys always run in this legacy mode.
Do not pass this input if you want selection based only on changed journeys.
Screenshots show milestones in the PR version of the journey; they are not
image comparisons against the base branch.

## PR comments and inline attachments

The default needs only `GITHUB_TOKEN` and links to direct Actions artifacts.
Artifacts require GitHub sign-in and expire after 14 days by default.

### Enable inline videos and screenshots

`PR_MEDIA_TOKEN` must contain a **GitHub-issued personal access token**.

1. Open [GitHub's fine-grained token creation page](https://github.com/settings/personal-access-tokens/new).
   GitHub may ask you to verify your login first.
2. Set **Token name**, for example `record-prs inline media`, and choose an
   **Expiration**, such as 30 days.
3. Set **Resource owner** to the account or organization that owns the repository
   where you want PR recordings.
4. Under **Repository access**, choose **Only select repositories** and select
   that repository.
5. Under **Repository permissions**, add **Contents** and set it to
   **Read and write**. GitHub includes **Metadata: read-only** automatically.
   No account permissions are needed for this upload token.
6. Click **Generate token**, confirm the scope, and copy the generated value.
   If the repository's organization requires approval, obtain that approval
   before testing uploads.
7. In the repository where you want recordings, open **Settings → Secrets and
   variables → Actions → New repository secret**. Enter **Name**:
   `PR_MEDIA_TOKEN`, paste the token into **Secret**, and click **Add secret**.
8. Use the example publisher workflow, which already passes the secret:

```yaml
- uses: matijagrcic/record-prs/publish@v1.1.0
  with:
    github-token: ${{ github.token }}
    media-token: ${{ secrets.PR_MEDIA_TOKEN }}
```

Repeat this setup for each repository where you install the action: select that
repository when creating its token and save the secret in that same repository.
The secret configured in `matijagrcic/record-prs` is only available to workflows
in `matijagrcic/record-prs`.

The token's owner must have write/push access to the target repository. GitHub
requires a personal access or OAuth token for attachment uploads;
`GITHUB_TOKEN` and GitHub App installation tokens cannot upload them. The normal
`GITHUB_TOKEN` still writes the bot comment. `PR_MEDIA_TOKEN` is passed only to
the trusted publisher, never to the PR capture job. Keep the token out of source
files, PR comments, and logs. Before it expires, generate a replacement with the
same repository scope and update the secret's value.

### Check that it works

Open a non-draft PR with a UI change, or push another commit to an existing PR.
To update an existing completed recording after adding the secret, open its
**Record PRs** run under **Actions** and choose **Re-run all jobs**.

After **Record PRs** and **Publish PR recordings** complete, open the PR's
**Conversation** tab and find the **PR recording** comment from
`github-actions[bot]`. Screenshots appear as images in numeric capture order,
followed by videos sorted by journey name. Videos appear as players under names
such as **navigation** or **account**; press **▶** to watch. Later commits and
reruns update the same comment.

If you still see **Download MP4** / **Download PNG**, open the **Publish PR
recordings** logs and look for `Attachment upload unavailable`. Check that the
secret exists in the caller repository, has not expired, selects that repository,
and has **Contents: read and write**. A missing token also produces artifact
links. Keep the publisher workflow on the default branch and preserve its
`actions: read` and `pull-requests: write` permissions from the example.

The uploader follows the protocol used by the official GitHub CLI attachment
support. See [GitHub's attachment guide](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli).
For public repositories, attachments are public; private attachments follow
repository access. Inline attachments do not share the Actions artifact
retention window.

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
| `journey-map` | empty | Legacy override for selection by changed source files |
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
The pinned Webreel 0.1.4 Linux package receives a small compatibility patch that
removes the two manual-frame Chrome flags described in
[upstream issue #8](https://github.com/vercel-labs/webreel/issues/8). Commands have
bounded timeouts; recording has a five-minute limit.

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
