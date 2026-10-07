# Writing

Each essay is one Markdown file here. The file name is its address:
`the-direction-of-science.md` is www.sevanb.net/writing/the-direction-of-science. Push it and
the next deploy publishes it (the list, the page, the sitemap and llms.txt).

## Front matter

```yaml
---
title: The Direction of Science
date: 2023-12-18
description: How our choices shape the Universe we understand.
series: Science and Consciousness   # optional: parts of one essay (not shown yet)
slug: the-direction-of-science      # optional: use when the file name is a title
draft: true                         # optional: only shown by `npm run dev`
---
```

`title`, `date` (YYYY-MM-DD) and `description` are required. A description may have
several paragraphs (use `description: |-` and indent them); the list shows the first.

## Writing

- Markdown with GitHub's extras: tables, footnotes (`[^1]`), ~~strikethrough~~.
- Math: `$e^{i\pi} + 1 = 0$` inline, `$$ ... $$` on its own lines for a display.
  Write `\$` for a dollar sign.
- Images: put them next to the post, in a folder named like the post
  (`the-direction-of-science/figure.png`), or in `assets/`. Then `![Alt text](figure.png)`.
  An image alone in its paragraph becomes a figure; `![Alt](figure.png "Caption")` adds
  a caption. Videos (`.mp4`, `.webm`) work the same way and play muted on a loop.
- A quote whose last paragraph starts with `—` shows that paragraph as its attribution.
- Raw HTML works for small things (`<sup>`, `<br>`); scripts and styles are removed.

## From Obsidian

Notes can be copied in as they are:

- `![[figure.png]]` and `![[figure.png|400]]` (400 px wide) embed an image.
- `[[the-direction-of-science]]`, `[[The Direction of Science]]` or `[[Title|text]]`
  link to another essay; links to notes that are not essays become plain text.
- `%%comments%%` are dropped.

A missing image stops the build with the name of the file it looked for.
