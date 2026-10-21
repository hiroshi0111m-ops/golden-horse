# EmDash integration

The user supplied the official Astro + EmDash Node/SQLite configuration and requested installation despite the absence of an existing Astro project. Deliver an independent Astro application under `apps/emdash-cms` on a GitHub branch in the accessible `hiroshi0111m-ops/golden-horse` repository. Preserve all existing source and checkpoints. This app is a content management application, with no quantum or racing plugin integration implied.

Use Node.js 24, Astro server output, the standalone Node adapter, React for the EmDash admin, SQLite at `data.db`, and media in `uploads`. Do not commit secrets, database files, uploads, generated output or dependencies. Include the official live collection loader, Japanese landing page, `/emdash-test` published-post list, setup/admin link and reproducible npm lockfile.

Success: dependencies installed, production build passes, HTTP tests confirm landing page, published-post query, initial admin setup, and protected management API. Verify published/draft visibility with a temporary local fixture if supported. The user registers their own administrator passkey; do not invent credentials. Keep setup unclaimed in the delivered app. GitHub contains the tested files on an isolated branch and reviewable draft PR. Report clearly that Node hosting and owner registration are separate from source installation.
