# Knowledge Library

A GitHub Pages site for organizing and searching PDF documents with category filters, metadata, and an upload workflow.

## Features

- Search by title, description, tags, category, and keywords
- Category and subject filtering
- Sorting by relevance, title, and date
- Modern static site UI optimized for GitHub Pages
- Repository-based PDF upload workflow using the `pdfs/` folder and metadata files

## Repository structure

- `index.html` – page structure and site layout
- `styles.css` – theme, cards, grid, filters, and responsive styling
- `app.js` – search, category filtering, sorting, and rendering logic
- `pdfs.json` – library metadata used by the site
- `documents/` – individual metadata files for each PDF entry
- `pdfs/` – uploaded PDFs live here
- `.github/workflows/validate-pdfs.yml` – validation workflow for PDF and metadata integrity
- `scripts/build-library.mjs` – optional metadata build script (helpful if you want to generate the catalog from per-document files)

## Upload workflow

1. Put the PDF inside `pdfs/`.
2. Commit the file to the repository. The workflow automatically creates a metadata JSON file in `documents/` when one does not already exist. PDF and JPG files are supported.
3. The validation workflow checks for valid metadata and confirms the referenced file exists.
4. Once merged, the site loads the updated `pdfs.json` and reflects the new document.

## Template structure

```json
{
  "id": "sample-document",
  "title": "Sample Document",
  "description": "A short summary of the document.",
  "category": "Clinical Guidance",
  "date": "2024-01-15",
  "author": "Clinical Team",
  "tags": ["training", "safety", "internal"],
  "keywords": ["guidance", "clinical", "patient"],
  "file": "pdfs/sample-document.pdf"
}
