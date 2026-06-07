# Learning Workflow (Project Artha)

The builder is a Data Science manager learning web/AI development. Every meaningful code
change should be accompanied by an explicit learning artifact. After any non-trivial change,
**automatically run all three prompts below and append the result to `docs/LEARNING-LOG.md`**
under a new dated entry. Do not wait to be asked.

## Walkthrough prompt (run after any code change)
"Walk me through what you just changed. List every file touched and why. Trace the data flow
end-to-end: where does the data start, what transforms it, where does it end up rendered? What
would break if I removed each piece? Explain it as if I'm a Python developer who's never seen
React. Use Python analogies where helpful (e.g. 'useState is like a class instance variable that
triggers a re-render when assigned')."

## Mermaid diagram prompt (run for any feature involving 2+ files)
"Generate a Mermaid sequence diagram showing the data flow for [feature]. Include every file,
function call, state change, and external API call. Mark each node with its file path. Use
participant boxes for: Browser, React component, hook/state, utility module, external API. Show
timing where relevant (e.g. async fetches, useEffect triggers)."

## Test-first reading prompt (run when exploring an unfamiliar module)
"Before showing me the implementation of [module], summarise what its tests in [test file] tell
us it's supposed to do. List each tested behaviour as a one-line contract. Then show the
implementation, and for each function point out which test contract it satisfies. If any function
lacks test coverage, flag it."

## Predict-before-running prompt (use when handing back to the builder for testing)
"Before I run npm run dev to test this, write down 3-5 specific predictions about what I should
observe. Format: 'When I do X, I expect Y to happen, because Z.' Cover: UI changes, console logs,
network requests, localStorage state, error cases. After I test, I'll tell you which predictions
held and which didn't — wrong predictions are the highest-value learning signal."

## Learning log entry format (for docs/LEARNING-LOG.md appends)
Always preserve previous entries — only append new ones at the bottom.

```
## [YYYY-MM-DD] [Backlog ID or change description]

### What changed
One-paragraph summary of the change.

### Files touched
- path/to/file.ext — what changed and why

### Walkthrough (Python-developer framing)
End-to-end explanation of how the change works in the running app.

### Data flow diagram
​```mermaid
[diagram]
​```

### Mental models reinforced
- One-line bullets on what concepts this change reinforced or introduced.

### Open questions
- Things the builder should investigate further to deepen understanding.
```
