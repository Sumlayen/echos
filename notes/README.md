# PR Notes

One Markdown file **per pull request**, committed on the PR branch so the notes
travel inside the PR diff and can be read from the merge commit later.

## Naming

```
notes/<YYYY-MM-DD>-<branch-slug>.md
```

The date is the day the branch was opened. The slug is the branch name with its
`fix/`, `feat/`, `chore/` prefix stripped. Example:

```
branch  fix/overlay-gear-tab-cycle   ->   notes/2026-10-13-overlay-gear-tab-cycle.md
```

## Required sections

Every notes file has the same shape, so they can be skimmed and grepped:

| Section | What goes in it |
| --- | --- |
| **Header** | Branch, base branch, commit SHA(s), date, PR link (fill in once opened) |
| **Summary** | Two or three sentences: what changed and why anyone should care |
| **Symptom** | What the player/user actually sees when it is broken, and how to reproduce it |
| **Root cause** | The specific code that caused it, quoted, with file and function names |
| **Change** | What the fix does, one bullet per behaviour change |
| **Verification** | Exact commands run and their real output. Include proof the new test fails without the fix |
| **Files touched** | Path plus one line on why |
| **Known limitations** | What is deliberately *not* fixed, and the follow-up it implies |
| **PR body** | The text to paste into the PR description |

## Rules

1. Write the notes **on the branch**, in the same PR as the code. Never in a
   separate docs-only PR — a notes file that lands apart from its diff is useless
   at `git blame` time.
2. Verification must be reproducible: paste the command, then the actual output.
   "Tested locally, works" is not a note.
3. Always record the **before** trace as well as the **after** trace for bug
   fixes. The before trace is what proves the regression check has teeth.
4. Keep numbers honest. If a check count goes from 38 to 43, say so.
