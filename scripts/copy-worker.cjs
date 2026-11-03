// Serves the pdf.js worker from this site, so the page never loads code from elsewhere.
const fs = require("fs");
const path = require("path");
const src = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
fs.copyFileSync(src, path.join(__dirname, "..", "public", "pdf.worker.min.mjs"));
