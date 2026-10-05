# Recording acceptance checks

A UI change should create current-head video and screenshot evidence in one bot
comment. Pushing a new commit should update that comment with the new SHA.
With PR_MEDIA_TOKEN configured, videos should play inside the comment and
screenshots should appear inline.

A documentation-only change outside the configured journey globs should create
a skip comment, upload no media, and carry neither proof label. This file is a
small test fixture for that behavior.
