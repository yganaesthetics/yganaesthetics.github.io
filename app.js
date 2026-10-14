const pdfGrid = document.getElementById('pdfGrid');
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const tagSelect = document.getElementById('tagSelect');
const sortSelect = document.getElementById('sortSelect');
const categoryFilters = document.getElementById('categoryFilters');
const clearFiltersBtn = document.getElementById('clearFilters');
const totalCount = document.getElementById('totalCount');
const filteredCount = document.getElementById('filteredCount');
const categoryCount = document.getElementById('categoryCount');
const tagCount = document.getElementById('tagCount');
const resultSummary = document.getElementById('resultSummary');
const template = document.getElementById('pdfCardTemplate');

const state = {
  documents: [],
  filters: {
    query: '',
    category: 'all',
    tag: 'all',
    sort: 'relevance'
  }
};

const normalize = (value = '') => String(value).trim().toLowerCase();

const toDateValue = (value) => {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
};

const formatMetadataDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  return match ? `${match[2]}/${match[1]}` : value || 'NA';
};

const compareDateField = (first, second, field, direction) => {
  const firstValue = toDateValue(first[field]);
  const secondValue = toDateValue(second[field]);
  if (!firstValue && secondValue) return 1;
  if (firstValue && !secondValue) return -1;
  return direction * (firstValue - secondValue);
};

const scoreDocument = (doc, query) => {
  const normalized = normalize(query);
  if (!normalized) return 1;

  const haystack = [
    doc.title,
    doc.description,
    doc.category,
    ...(doc.tags || []),
    ...(doc.keywords || []),
    ...(doc.author ? [doc.author] : [])
  ]
    .join(' ')
    .toLowerCase();

  if (!haystack) return 0;

  if (haystack.includes(normalized)) return 100;

  const queryTokens = normalized.split(/\s+/).filter(Boolean);
  if (!queryTokens.length) return 0;

  const tokenMatches = queryTokens.filter((token) => haystack.includes(token)).length;
  return tokenMatches ? tokenMatches * 18 : 0;
};

const renderTags = (tags = []) =>
  tags
    .slice(0, 5)
    .map((tag) => `<span>${tag}</span>`)
    .join('');

const renderCards = (items) => {
  pdfGrid.innerHTML = '';

  if (!items.length) {
    pdfGrid.innerHTML = `
      <article class="empty-state">
        <h4>No matching PDFs found</h4>
        <p>Try a different keyword or clear your active filters.</p>
      </article>
    `;
    filteredCount.textContent = '0';
    resultSummary.textContent = '0 documents';
    return;
  }

  items.forEach((item) => {
    const clone = template.content.cloneNode(true);
    const title = clone.querySelector('.pdf-title');
    const description = clone.querySelector('.pdf-description');
    const category = clone.querySelector('.document-category');
    const tags = clone.querySelector('.tag-list');
    const link = clone.querySelector('.pdf-link');
    const metaReviewDate = clone.querySelector('.meta-review-date');
    const metaApprovalDate = clone.querySelector('.meta-approval-date');
    const metaAuthor = clone.querySelector('.meta-author');

    title.textContent = item.title || 'Untitled PDF';
    description.textContent = item.description || 'No description provided yet.';
    category.textContent = item.category || 'General';
    tags.innerHTML = renderTags(item.tags || []);

    metaReviewDate.textContent = `Review: ${formatMetadataDate(item.reviewDate)}`;
    metaApprovalDate.textContent = `Approval: ${formatMetadataDate(item.approvalDate)}`;
    metaAuthor.textContent = item.author || 'Unknown author';

    if (item.file && item.file.trim()) {
      link.href = item.file;
      link.setAttribute('aria-disabled', 'false');
      link.textContent = 'Open PDF';
    } else {
      link.href = '#';
      link.setAttribute('aria-disabled', 'true');
      link.textContent = 'Upload pending';
    }

    pdfGrid.appendChild(clone);
  });

  filteredCount.textContent = String(items.length);
  resultSummary.textContent = `${items.length} document${items.length === 1 ? '' : 's'}`;
};

const getFilteredDocuments = () => {
  const { query, category, tag, sort } = state.filters;

  const filtered = state.documents.filter((doc) => {
    const matchesCategory = category === 'all' || (doc.category || '').toLowerCase() === category.toLowerCase();
    const matchesTag = tag === 'all' || (doc.tags || []).map((item) => item.toLowerCase()).includes(tag.toLowerCase());
    const matchesQuery = scoreDocument(doc, query) > 0;
    return matchesCategory && matchesTag && matchesQuery;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    }

    if (sort === 'date-desc') {
      return toDateValue(b.date) - toDateValue(a.date);
    }

    if (sort === 'date-asc') {
      return toDateValue(a.date) - toDateValue(b.date);
    }

    if (sort === 'review-desc') {
      return compareDateField(a, b, 'reviewDate', -1);
    }

    if (sort === 'review-asc') {
      return compareDateField(a, b, 'reviewDate', 1);
    }

    if (sort === 'approval-desc') {
      return compareDateField(a, b, 'approvalDate', -1);
    }

    if (sort === 'approval-asc') {
      return compareDateField(a, b, 'approvalDate', 1);
    }

    return scoreDocument(b, query) - scoreDocument(a, query);
  });

  return sorted;
};

const renderFilters = () => {
  const categories = [...new Set(state.documents.map((doc) => doc.category).filter(Boolean))].sort();
  const tags = [...new Set(state.documents.flatMap((doc) => doc.tags || []))].sort();

  categorySelect.innerHTML = '<option value="all">All categories</option>' +
    categories.map((category) => `<option value="${category}">${category}</option>`).join('');

  tagSelect.innerHTML = '<option value="all">All tags</option>' +
    tags.map((tag) => `<option value="${tag}">${tag}</option>`).join('');

  categorySelect.value = state.filters.category;
  tagSelect.value = state.filters.tag;
  sortSelect.value = state.filters.sort;

  categoryFilters.innerHTML = categories
    .map(
      (category) => `
        <button class="filter-chip ${state.filters.category === category ? 'is-active' : ''}" data-category="${category}" type="button">
          ${category}
        </button>
      `
    )
    .join('');

  categoryCount.textContent = String(categories.length);
  tagCount.textContent = String(tags.length);
};

const applyFilters = () => {
  renderCards(getFilteredDocuments());
};

searchInput.addEventListener('input', (event) => {
  state.filters.query = event.target.value;
  applyFilters();
});

categorySelect.addEventListener('change', (event) => {
  state.filters.category = event.target.value;
  applyFilters();
  renderFilters();
});

tagSelect.addEventListener('change', (event) => {
  state.filters.tag = event.target.value;
  applyFilters();
});

sortSelect.addEventListener('change', (event) => {
  state.filters.sort = event.target.value;
  applyFilters();
});

categoryFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;

  const category = button.dataset.category;
  state.filters.category = state.filters.category === category ? 'all' : category;
  categorySelect.value = state.filters.category;
  renderFilters();
  applyFilters();
});

clearFiltersBtn.addEventListener('click', () => {
  state.filters = {
    query: '',
    category: 'all',
    tag: 'all',
    sort: 'relevance'
  };

  searchInput.value = '';
  renderFilters();
  applyFilters();
});

fetch('pdfs.json')
  .then((response) => {
    if (!response.ok) {
      throw new Error('Unable to load pdfs.json');
    }
    return response.json();
  })
  .then((documents) => {
    state.documents = Array.isArray(documents) ? documents : [];
    totalCount.textContent = String(state.documents.length);
    renderFilters();
    applyFilters();
  })
  .catch((error) => {
    console.error(error);
    pdfGrid.innerHTML = `
      <article class="empty-state">
        <h4>Unable to load the library</h4>
        <p>Check the metadata file and make sure the JSON is valid.</p>
      </article>
    `;
    filteredCount.textContent = '0';
    resultSummary.textContent = '0 documents';
  });
