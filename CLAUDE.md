# sevanb.net frontend: working rules

## Fixed local addresses (do not change)
- Frontend: http://localhost:1000 (`npm run dev`; the port is strict, it never moves)
- Production preview of a build: http://localhost:4173 (`npm run preview`)
- Backend: http://localhost:8000 (see the backend repo); admin at http://localhost:8000/admin/

## Branches and deploys
- Railway deploys `dev` to the development site and `main` to www.sevanb.net, each only after CI passes.
- Work on `redesign` (or a feature branch), then move `dev` to it to preview. Never push `main` without Sevan's explicit go-ahead.
- Railway service settings live in `.railway/railway.ts`. Change them only with `railway config plan` first (it must say "0 to destroy"), then apply that pinned plan. Never pass `--confirm-destructive`. Applying settings triggers a deploy: wait for any running deploy to finish before pushing or applying again, so two deploys never run database migrations at the same time.

## Before committing
- Run `npm run check` and `RAILWAY_ENVIRONMENT_NAME=production npm run build`, and judge them by exit code, not by the last lines of output.
- Commit with an explicit pathspec (`git commit -m "..." -- <paths>`) so nothing staged by someone else slips in.

## Taste
- Sevan's aesthetic is in `../AESTHETICS.md`; read it before design work.
- Make small, targeted changes. Leave alone anything he has said he likes. No cute or meta microcopy.
