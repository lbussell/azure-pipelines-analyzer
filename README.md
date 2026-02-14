# Azure Pipelines Analyzer

Static web app for analyzing Azure DevOps build timeline JSON files.

## What it does

- Upload a pipeline timeline JSON (`_apis/build/builds/{buildId}/timeline?api-version=7.1`)
- Compute timing and structure metrics:
  - End-to-end/wall-clock duration
  - Stage/job/step/task/checkpoint counts
  - Inferred dependency graph metrics
  - Longest path (inferred critical path)
  - Build-agent wait time and machine running time
  - Theoretical no-agent-wait minimum duration
  - Parallelization heuristics and recommendations
- Explore Stage > Job > Step details interactively
- Categorize steps as useful/setup/teardown/infrastructure/unclassified using:
  - Ordered rules (first-match-wins)
  - Manual per-step overrides
  - Local persistence + JSON import/export of rules

## Run locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```
