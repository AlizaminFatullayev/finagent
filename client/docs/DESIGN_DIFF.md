# Design verification log

Screenshots come from `node scripts/screenshots.ts` (1280x800 and 390x844, light and dark where the design
has a dark variant) and are compared with `finagent-design/screenshots/*.png`. The design screenshots were
rendered without web fonts, so glyph widths differ; spacing, structure, colors and copy are what is
compared. Automated checks in the same run: no horizontal overflow at 390px, interactive elements at least
44x44 on mobile, no critical/serious axe violations on key screens.

| Screen               | Difference                                                                                                                             | Status                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Design system (Main) | Color-token swatch grid, type-scale and spacing rows are not repeated on the dev page; tokens are guarded by `tokens.test.ts` instead. | Kept: documentation, not product UI.                                          |
| Design system (Main) | Hover/focus columns of the button matrix are shown live (hover, Tab) instead of as static copies.                                      | Kept: real states instead of pictures of states.                              |
| Dropzone, drag over  | "DROP TO UPLOAD" renders uppercase because `.drop.over` also matches the `.over` overline class.                                       | Kept: identical in the design screenshot.                                     |
| Dropzone             | Limits read "Up to 20 MB · 20 sheets · 200,000 rows" instead of 25 MB / 10 / 500,000.                                                  | Kept: design placeholders replaced with the server defaults (API_GAPS gap 4). |
