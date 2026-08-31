# Third-Party Notices

Attune is licensed under Apache-2.0. Dependencies retain their own licenses.

## Current foundation dependencies

| Dependency        | Version | License      | Source                                                     | Modified |
| ----------------- | ------: | ------------ | ---------------------------------------------------------- | -------- |
| Next.js           |  16.3.3 | MIT          | https://github.com/vercel/next.js                          | No       |
| React / React DOM |  19.2.8 | MIT          | https://github.com/facebook/react                          | No       |
| CanvasKit WASM    |  0.42.0 | BSD-3-Clause | https://github.com/google/skia/tree/main/modules/canvaskit | No       |
| Vite+             |   0.2.7 | MIT          | https://github.com/voidzero-dev/vite-plus                  | No       |

The unmodified CanvasKit browser runtime and WASM binary are served from
`apps/web/public/canvaskit` so the default Turbopack browser bundle does not need Node.js shims.

## Planned P0 solver dependency

`@salusoft89/planegcs` version 1.2.0 is planned but is not installed during the
external-connectivity foundation. It is licensed under LGPL-2.0-or-later.

- Exact source/tag: https://github.com/Salusoft89/planegcs/tree/v1.2.0
- Package: https://www.npmjs.com/package/@salusoft89/planegcs/v/1.2.0
- Modification status: none planned
- Distribution policy: retain the unmodified WASM/library as a separately replaceable
  dependency and preserve its license and notices.

This notice must be updated if PlaneGCS is installed, modified, vendored, or copied.
