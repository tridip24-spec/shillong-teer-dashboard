# Shillong Teer Analysis Dashboard

Local Node app for:

- Fetching today's Shillong Teer result from a public source
- Keeping a one-year history cache
- Showing house, ending, and direct-number movement
- Generating heuristic prediction ideas from recent result trends

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

## Notes

- Data is fetched from `https://shillongteer.com/` and cached in the local `data/` folder.
- Predictions are trend-based heuristics only and should not be treated as guaranteed outcomes.
