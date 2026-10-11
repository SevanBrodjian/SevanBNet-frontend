# Writing

Each essay is one Markdown file here, named after its slug:
`the-direction-of-science.md` is www.sevanb.net/writing/the-direction-of-science.

Its title, date, description and visibility are set in the control panel (Writing), under
the same slug. An essay is published only while the control panel has a visible post with
its slug: then the next deploy (or "Rebuild site") adds it to the list, its page, the
sitemap and llms.txt. Hiding the post takes it off the site at once and out of those
files on the next deploy. A file the control panel doesn't list is not published.

## Front matter

Optional. Only these count for a published essay:

```yaml
---
slug: the-direction-of-science      # when the file name isn't the slug
series: Science and Consciousness   # parts of one essay (not shown yet)
---
```

`npm run dev` also shows files the control panel doesn't list yet, as drafts, so an essay
can be previewed before its post exists; for those it reads `title`, `date`
(YYYY-MM-DD) and `description` from the front matter if they are there.

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
