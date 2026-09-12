// Live GitHub-styled preview server for the profile README.
// Renders README.md (or any .md passed as the first CLI arg) as GitHub-flavored
// markdown and serves it with GitHub's own stylesheet so it looks like the real
// profile page. The file is re-read on every request, so refreshing the browser
// shows the latest saved content.

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import MarkdownIt from "markdown-it";
import { full as emojiPlugin } from "markdown-it-emoji";
import taskLists from "markdown-it-task-lists";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const markdownFile = resolve(repoRoot, process.argv[2] ?? "README.md");

const githubCssPath = require.resolve("github-markdown-css/github-markdown.css");

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})
  .use(emojiPlugin)
  .use(taskLists, { enabled: true, label: true });

const app = express();

app.get("/github-markdown.css", (_req, res) => {
  res.type("text/css");
  res.sendFile(githubCssPath);
});

app.get("/", async (_req, res) => {
  let source;
  try {
    source = await readFile(markdownFile, "utf8");
  } catch (err) {
    res.status(404).type("text/plain").send(`Could not read ${markdownFile}: ${err.message}`);
    return;
  }

  const rendered = md.render(source);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>README preview</title>
    <link rel="stylesheet" href="/github-markdown.css" />
    <style>
      body { margin: 0; background: #ffffff; }
      .markdown-body {
        box-sizing: border-box;
        min-width: 200px;
        max-width: 980px;
        margin: 0 auto;
        padding: 45px;
      }
      @media (max-width: 767px) { .markdown-body { padding: 15px; } }
    </style>
  </head>
  <body>
    <article class="markdown-body">
${rendered}
    </article>
  </body>
</html>`;

  res.type("text/html").send(html);
});

app.listen(PORT, HOST, () => {
  console.log(`README preview for ${markdownFile}`);
  console.log(`Listening on http://${HOST}:${PORT}`);
});
