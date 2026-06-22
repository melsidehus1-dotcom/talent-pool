/* ============================================================
   Candidate Screening System — Main Application
   PDF upload, text paste, analysis, dashboard, comparison
   ============================================================ */

const App = (() => {
  // ── State ─────────────────────────────────────────────────
  const STORAGE_KEY = 'candidate_screening_data';
  let candidates = [];
  let currentTab = 'upload';
  let selectedForComparison = [];
  let sortColumn = 'overallScore';
  let sortDirection = 'desc';
  let searchQuery = '';

  // ── Persistence ───────────────────────────────────────────

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
    renderDashboard();
  }

  function load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) candidates = JSON.parse(data);
    } catch (e) {
      candidates = [];
    }
  }

  // ── Toast Notifications ───────────────────────────────────

  function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  // ── PDF Text Extraction (using PDF.js) ────────────────────

  async function extractPdfText(file) {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          // Group text items by Y-coordinate to reconstruct proper lines
          const lines = [];
          let currentLine = [];
          let lastY = null;
          for (const item of content.items) {
            const y = item.transform ? item.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
              // Different Y = new line
              lines.push(currentLine.join(' '));
              currentLine = [];
            }
            if (item.str.trim()) {
              currentLine.push(item.str);
            }
            lastY = y;
          }
          if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
          }
          fullText += lines.join('\n') + '\n';
        }
        resolve(fullText);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── Analyze & Add Candidate ───────────────────────────────

  async function analyzeFile(file) {
    const dropZone = document.getElementById('dropZone');
    
    // Show loading
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-overlay';
    loadingEl.innerHTML = `<div class="spinner"></div><div class="loading-overlay__text">Analyzing ${file.name}...</div>`;
    dropZone.style.position = 'relative';
    dropZone.appendChild(loadingEl);

    try {
      const text = await extractPdfText(file);
      if (!text || text.trim().length < 20) {
        throw new Error('Could not extract meaningful text from PDF. The file may be image-based.');
      }
      const result = SkillAnalyzer.analyze(text);
      result.id = generateId();
      result.source = 'PDF Upload';
      result.fileName = file.name;
      result.notes = '';

      // Check for duplicate
      const existing = candidates.find(c =>
        c.name === result.name && c.name !== 'Unknown Candidate'
      );
      if (existing) {
        toast(`"${result.name}" may already exist. Added as new entry.`, 'info');
      }

      candidates.push(result);
      save();
      renderAnalysisResult(result);
      renderCandidateTable();
      toast(`${result.name} analyzed — ${result.verdict}`, result.verdictClass === 'good' ? 'success' : 'info');
    } catch (err) {
      toast(`Error analyzing ${file.name}: ${err.message}`, 'error');
      console.error(err);
    } finally {
      loadingEl.remove();
    }
  }

  function analyzeText(text) {
    if (!text || text.trim().length < 20) {
      toast('Please paste more text (at least a few lines from the profile).', 'error');
      return;
    }

    const result = SkillAnalyzer.analyze(text);
    result.id = generateId();
    result.source = 'Paste (LinkedIn/Glints)';
    result.fileName = null;
    result.notes = '';

    candidates.push(result);
    save();
    renderAnalysisResult(result);
    renderCandidateTable();
    toast(`${result.name} analyzed — ${result.verdict}`, result.verdictClass === 'good' ? 'success' : 'info');

    // Clear textarea
    document.getElementById('pasteText').value = '';
  }

  // ── Render Analysis Result ────────────────────────────────

  function renderAnalysisResult(result) {
    const container = document.getElementById('analysisResults');
    const initials = result.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const contactParts = [];
    if (result.contact.email) contactParts.push(`<a href="mailto:${result.contact.email}">${result.contact.email}</a>`);
    if (result.contact.phone) contactParts.push(result.contact.phone);
    if (result.contact.linkedin) contactParts.push(`<a href="${result.contact.linkedin}" target="_blank">LinkedIn</a>`);
    if (result.experience > 0) contactParts.push(`${result.experience}+ years experience`);

    const html = `
      <div class="analysis-result" id="result-${result.id}">
        <div class="analysis-result__header">
          <div class="analysis-result__candidate">
            <div class="analysis-result__avatar">${initials}</div>
            <div>
              <div class="analysis-result__name">${escapeHtml(result.name)}</div>
              <div class="analysis-result__contact">${contactParts.join(' · ') || 'No contact info detected'}</div>
            </div>
          </div>
          <div class="verdict verdict--${result.verdictClass}">
            <div>
              <div class="verdict__score">${result.overallScore}%</div>
              <div class="verdict__label">${result.verdict}</div>
            </div>
          </div>
        </div>

        <div class="insights-grid">
          <div class="insight-card insight-card--strengths">
            <div class="insight-card__title">💪 Strengths</div>
            ${result.strengths.length > 0
              ? `<ul class="insight-card__list">${result.strengths.map(s => `<li>${s}</li>`).join('')}</ul>`
              : `<div class="insight-card__empty">No strong matches found</div>`
            }
          </div>
          <div class="insight-card insight-card--gaps">
            <div class="insight-card__title">⚠️ Missing (Required)</div>
            ${result.gaps.length > 0
              ? `<ul class="insight-card__list">${result.gaps.map(g => `<li>${g}</li>`).join('')}</ul>`
              : `<div class="insight-card__empty">All required skills covered!</div>`
            }
          </div>
          <div class="insight-card insight-card--warnings">
            <div class="insight-card__title">📝 Missing (Preferred)</div>
            ${result.warnings.length > 0
              ? `<ul class="insight-card__list">${result.warnings.map(w => `<li>${w}</li>`).join('')}</ul>`
              : `<div class="insight-card__empty">All preferred skills covered!</div>`
            }
          </div>
        </div>

        <button class="btn btn--sm detail-toggle" onclick="this.nextElementSibling.classList.toggle('score-grid--open');this.textContent=this.nextElementSibling.classList.contains('score-grid--open')?'▲ Hide Details':'▼ Show Details'">▼ Show Details</button>
        <div class="score-grid score-grid--collapsible">
          ${result.categories.map(cat => `
            <div class="score-item">
              <div class="score-item__header">
                <div class="score-item__name">
                  ${cat.icon} ${cat.name}
                  <span class="score-item__badge score-item__badge--${cat.isRequired ? 'required' : 'preferred'}">${cat.isRequired ? 'Required' : 'Preferred'}</span>
                </div>
                <div class="score-item__value ${cat.percentage >= 60 ? 'td-score--high' : cat.percentage >= 40 ? 'td-score--mid' : 'td-score--low'}">${cat.percentage}%</div>
              </div>
              <div class="score-item__bar">
                <div class="score-item__fill score-item__fill--${cat.percentage >= 60 ? 'high' : cat.percentage >= 40 ? 'mid' : 'low'}" style="width: 0" data-width="${cat.percentage}%"></div>
              </div>
              <div class="score-item__keywords">
                ${cat.matchedKeywords.length > 0
                  ? cat.matchedKeywords.map(kw => `<span class="keyword-tag">${escapeHtml(kw)}</span>`).join('')
                  : `<span style="font-size:11px;color:var(--text-muted);font-style:italic;">No keywords detected</span>`
                }
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn--sm btn--danger" onclick="App.removeCandidate('${result.id}')">🗑 Remove</button>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('afterbegin', html);

    // Animate score bars
    requestAnimationFrame(() => {
      const fills = container.querySelectorAll(`#result-${result.id} .score-item__fill`);
      fills.forEach(fill => {
        fill.style.width = fill.dataset.width;
      });
    });
  }

  // ── Dashboard Stats ───────────────────────────────────────

  function renderDashboard() {
    const total = candidates.length;
    const good = candidates.filter(c => c.verdictClass === 'good').length;
    const maybe = candidates.filter(c => c.verdictClass === 'maybe').length;
    const not = candidates.filter(c => c.verdictClass === 'not').length;
    const avgScore = total > 0 ? Math.round(candidates.reduce((sum, c) => sum + c.overallScore, 0) / total) : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statGood').textContent = good;
    document.getElementById('statMaybe').textContent = maybe;
    document.getElementById('statNot').textContent = not;
    document.getElementById('statAvg').textContent = total > 0 ? avgScore + '%' : '—';
  }

  // ── Candidate Table ───────────────────────────────────────

  function renderCandidateTable() {
    const tbody = document.getElementById('candidateTableBody');
    const countEl = document.getElementById('tableCount');

    let filtered = candidates.filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) ||
        (c.contact.email && c.contact.email.toLowerCase().includes(q)) ||
        c.verdict.toLowerCase().includes(q);
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal;
      switch (sortColumn) {
        case 'name': aVal = a.name; bVal = b.name; break;
        case 'overallScore': aVal = a.overallScore; bVal = b.overallScore; break;
        case 'verdict': aVal = a.verdict; bVal = b.verdict; break;
        case 'date': aVal = a.analyzedAt; bVal = b.analyzedAt; break;
        case 'source': aVal = a.source; bVal = b.source; break;
        default: aVal = a.overallScore; bVal = b.overallScore;
      }
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    countEl.textContent = `${filtered.length} candidate${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:48px;color:var(--text-muted);">
            ${candidates.length === 0 ? 'No candidates analyzed yet. Upload a CV or paste profile text to get started.' : 'No candidates match your search.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const scoreClass = c.overallScore >= 70 ? 'high' : c.overallScore >= 40 ? 'mid' : 'low';
      const date = new Date(c.analyzedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const topSkills = c.categories
        .filter(cat => cat.percentage >= 50)
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3)
        .map(cat => cat.icon)
        .join(' ');

      return `
        <tr onclick="App.showDetail('${c.id}')">
          <td class="td-name">${escapeHtml(c.name)}</td>
          <td>${c.contact.email || '—'}</td>
          <td class="td-score td-score--${scoreClass}">${c.overallScore}%</td>
          <td><span class="td-verdict-badge td-verdict-badge--${c.verdictClass}">${c.verdict}</span></td>
          <td>${topSkills || '—'}</td>
          <td>${c.source}</td>
          <td>${date}</td>
        </tr>
      `;
    }).join('');
  }

  // ── Detail Modal ──────────────────────────────────────────

  function showDetail(id) {
    const c = candidates.find(x => x.id === id);
    if (!c) return;

    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailBody');

    const initials = c.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const contactParts = [];
    if (c.contact.email) contactParts.push(`<a href="mailto:${c.contact.email}">${c.contact.email}</a>`);
    if (c.contact.phone) contactParts.push(c.contact.phone);
    if (c.contact.linkedin) contactParts.push(`<a href="${c.contact.linkedin}" target="_blank">LinkedIn</a>`);
    if (c.experience > 0) contactParts.push(`${c.experience}+ years`);

    body.innerHTML = `
      <div class="analysis-result__header">
        <div class="analysis-result__candidate">
          <div class="analysis-result__avatar">${initials}</div>
          <div>
            <div class="analysis-result__name">${escapeHtml(c.name)}</div>
            <div class="analysis-result__contact">${contactParts.join(' · ') || 'No contact info'} · ${c.source}</div>
          </div>
        </div>
        <div class="verdict verdict--${c.verdictClass}">
          <div>
            <div class="verdict__score">${c.overallScore}%</div>
            <div class="verdict__label">${c.verdict}</div>
          </div>
        </div>
      </div>

      <div class="insights-grid" style="margin-top:24px">
        <div class="insight-card insight-card--strengths">
          <div class="insight-card__title">💪 Strengths</div>
          ${c.strengths.length > 0
            ? `<ul class="insight-card__list">${c.strengths.map(s => `<li>${s}</li>`).join('')}</ul>`
            : `<div class="insight-card__empty">No strong matches</div>`}
        </div>
        <div class="insight-card insight-card--gaps">
          <div class="insight-card__title">⚠️ Missing Required</div>
          ${c.gaps.length > 0
            ? `<ul class="insight-card__list">${c.gaps.map(g => `<li>${g}</li>`).join('')}</ul>`
            : `<div class="insight-card__empty">All covered!</div>`}
        </div>
        <div class="insight-card insight-card--warnings">
          <div class="insight-card__title">📝 Missing Preferred</div>
          ${c.warnings.length > 0
            ? `<ul class="insight-card__list">${c.warnings.map(w => `<li>${w}</li>`).join('')}</ul>`
            : `<div class="insight-card__empty">All covered!</div>`}
        </div>
      </div>

      <button class="btn btn--sm detail-toggle" style="margin-top:16px" onclick="this.nextElementSibling.classList.toggle('score-grid--open');this.textContent=this.nextElementSibling.classList.contains('score-grid--open')?'▲ Hide Details':'▼ Show Details'">▼ Show Details</button>
      <div class="score-grid score-grid--collapsible" style="margin-top:12px">
        ${c.categories.map(cat => `
          <div class="score-item">
            <div class="score-item__header">
              <div class="score-item__name">
                ${cat.icon} ${cat.name}
                <span class="score-item__badge score-item__badge--${cat.isRequired ? 'required' : 'preferred'}">${cat.isRequired ? 'Required' : 'Preferred'}</span>
              </div>
              <div class="score-item__value ${cat.percentage >= 60 ? 'td-score--high' : cat.percentage >= 40 ? 'td-score--mid' : 'td-score--low'}">${cat.percentage}%</div>
            </div>
            <div class="score-item__bar">
              <div class="score-item__fill score-item__fill--${cat.percentage >= 60 ? 'high' : cat.percentage >= 40 ? 'mid' : 'low'}" style="width: ${cat.percentage}%"></div>
            </div>
            <div class="score-item__keywords">
              ${cat.matchedKeywords.length > 0
                ? cat.matchedKeywords.map(kw => `<span class="keyword-tag">${escapeHtml(kw)}</span>`).join('')
                : `<span style="font-size:11px;color:var(--text-muted);font-style:italic;">No keywords detected</span>`
              }
            </div>
          </div>
        `).join('')}
      </div>

      <div style="margin-top:24px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px;">📝 Your Notes</label>
        <textarea class="notes-area" rows="3" placeholder="Add your notes about this candidate..."
          onchange="App.updateNotes('${c.id}', this.value)">${escapeHtml(c.notes || '')}</textarea>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
        <button class="btn btn--sm btn--danger" onclick="App.removeCandidate('${c.id}');App.closeModal();">🗑 Remove Candidate</button>
      </div>
    `;

    modal.classList.add('modal-overlay--active');
  }

  function closeModal() {
    document.getElementById('detailModal').classList.remove('modal-overlay--active');
  }

  // ── Comparison / Radar Chart ──────────────────────────────

  const CHART_COLORS = [
    'rgba(59, 130, 246, 0.7)',
    'rgba(16, 185, 129, 0.7)',
    'rgba(245, 158, 11, 0.7)',
    'rgba(236, 72, 153, 0.7)',
    'rgba(139, 92, 246, 0.7)',
  ];

  function renderComparisonToggles() {
    const container = document.getElementById('comparisonToggles');
    container.innerHTML = candidates.map(c => {
      const isSelected = selectedForComparison.includes(c.id);
      return `<button class="comparison-toggle ${isSelected ? 'comparison-toggle--active' : ''}"
        onclick="App.toggleComparison('${c.id}')">${escapeHtml(c.name)} (${c.overallScore}%)</button>`;
    }).join('');
  }

  function toggleComparison(id) {
    const idx = selectedForComparison.indexOf(id);
    if (idx >= 0) {
      selectedForComparison.splice(idx, 1);
    } else {
      if (selectedForComparison.length >= 5) {
        toast('Maximum 5 candidates for comparison', 'error');
        return;
      }
      selectedForComparison.push(id);
    }
    renderComparisonToggles();
    renderRadarChart();
  }

  function renderRadarChart() {
    const canvas = document.getElementById('radarCanvas');
    const ctx = canvas.getContext('2d');
    const legendContainer = document.getElementById('comparisonLegend');

    // High-DPI support
    const size = 500;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, size, size);

    const categories = SkillAnalyzer.getCategories();
    const numAxes = categories.length;
    const cx = size / 2;
    const cy = size / 2;
    const maxRadius = 180;
    const angleStep = (2 * Math.PI) / numAxes;
    const startAngle = -Math.PI / 2;

    // Draw grid rings
    for (let ring = 1; ring <= 5; ring++) {
      const r = (ring / 5) * maxRadius;
      ctx.beginPath();
      for (let i = 0; i <= numAxes; i++) {
        const angle = startAngle + i * angleStep;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ring label
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText((ring * 20) + '%', cx + 4, cy - r + 12);
    }

    // Draw axes & labels
    for (let i = 0; i < numAxes; i++) {
      const angle = startAngle + i * angleStep;
      const xEnd = cx + maxRadius * Math.cos(angle);
      const yEnd = cy + maxRadius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(xEnd, yEnd);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      const labelRadius = maxRadius + 28;
      const lx = cx + labelRadius * Math.cos(angle);
      const ly = cy + labelRadius * Math.sin(angle);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const label = categories[i].name.length > 15
        ? categories[i].name.substring(0, 14) + '…'
        : categories[i].name;
      ctx.fillText(categories[i].icon + ' ' + label, lx, ly);
    }

    // Draw data polygons for selected candidates
    const selected = candidates.filter(c => selectedForComparison.includes(c.id));

    selected.forEach((candidate, ci) => {
      const color = CHART_COLORS[ci % CHART_COLORS.length];

      ctx.beginPath();
      for (let i = 0; i <= numAxes; i++) {
        const idx = i % numAxes;
        const angle = startAngle + idx * angleStep;
        const value = candidate.categories[idx].percentage / 100;
        const r = value * maxRadius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.fillStyle = color.replace('0.7', '0.12');
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw dots
      for (let i = 0; i < numAxes; i++) {
        const angle = startAngle + i * angleStep;
        const value = candidate.categories[i].percentage / 100;
        const r = value * maxRadius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    });

    // Legend
    legendContainer.innerHTML = selected.map((c, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length];
      return `<div class="legend-item">
        <span class="legend-dot" style="background:${color}"></span>
        ${escapeHtml(c.name)} (${c.overallScore}%)
      </div>`;
    }).join('');

    if (selected.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select candidates above to compare', cx, cy);
      legendContainer.innerHTML = '';
    }
  }

  // ── CSV Export ─────────────────────────────────────────────

  function exportCSV() {
    if (candidates.length === 0) {
      toast('No candidates to export', 'error');
      return;
    }

    const categories = SkillAnalyzer.getCategories();
    const headers = ['Name', 'Email', 'Phone', 'Experience (Years)', 'Source', 'Overall Score', 'Verdict',
      ...categories.map(c => c.name), 'Strengths', 'Gaps', 'Notes', 'Analyzed At'];

    const rows = candidates.map(c => [
      c.name,
      c.contact.email || '',
      c.contact.phone || '',
      c.experience || '',
      c.source,
      c.overallScore + '%',
      c.verdict,
      ...c.categories.map(cat => cat.percentage + '%'),
      c.strengths.join('; '),
      c.gaps.join('; '),
      c.notes || '',
      new Date(c.analyzedAt).toLocaleString(),
    ]);

    const csv = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate_screening_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported successfully', 'success');
  }

  // ── CRUD Helpers ──────────────────────────────────────────

  function removeCandidate(id) {
    candidates = candidates.filter(c => c.id !== id);
    selectedForComparison = selectedForComparison.filter(x => x !== id);
    save();
    const resultEl = document.getElementById(`result-${id}`);
    if (resultEl) resultEl.remove();
    renderCandidateTable();
    renderComparisonToggles();
    renderRadarChart();
    toast('Candidate removed', 'info');
  }

  function updateNotes(id, notes) {
    const c = candidates.find(x => x.id === id);
    if (c) {
      c.notes = notes;
      save();
    }
  }

  function clearAll() {
    if (!confirm('Remove all candidates? This cannot be undone.')) return;
    candidates = [];
    selectedForComparison = [];
    save();
    document.getElementById('analysisResults').innerHTML = '';
    renderCandidateTable();
    renderComparisonToggles();
    renderRadarChart();
    toast('All candidates cleared', 'info');
  }

  // ── Tab Navigation ────────────────────────────────────────

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('tab--active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('section--active'));
    document.getElementById(`section-${tab}`).classList.add('section--active');

    if (tab === 'compare') {
      renderComparisonToggles();
      renderRadarChart();
    }
    if (tab === 'candidates') {
      renderCandidateTable();
    }
  }

  // ── Table Sorting ─────────────────────────────────────────

  function handleSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = column === 'name' ? 'asc' : 'desc';
    }

    document.querySelectorAll('thead th').forEach(th => th.classList.remove('sorted'));
    document.querySelector(`th[data-sort="${column}"]`)?.classList.add('sorted');

    renderCandidateTable();
  }

  // ── Helpers ───────────────────────────────────────────────

  function generateId() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  }

  // ── Initialization ────────────────────────────────────────

  function init() {
    load();

    // Drop zone events
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drop-zone--active');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drop-zone--active');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drop-zone--active');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
      if (files.length === 0) {
        toast('Please drop PDF files only', 'error');
        return;
      }
      files.forEach(f => analyzeFile(f));
    });

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(f => analyzeFile(f));
      fileInput.value = '';
    });

    // Paste analyze button
    document.getElementById('analyzeTextBtn').addEventListener('click', () => {
      const text = document.getElementById('pasteText').value;
      analyzeText(text);
    });

    // Search
    document.getElementById('tableSearch').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderCandidateTable();
    });

    // Tab clicks
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Table sorting
    document.querySelectorAll('thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    // Modal close
    document.getElementById('detailModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) closeModal();
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    initTheme();

    // Render existing data
    renderDashboard();
    renderCandidateTable();

    // Restore analysis results
    candidates.forEach(c => renderAnalysisResult(c));
  }

  // ── Theme Toggle ──────────────────────────────────────────

  function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.getElementById('themeToggle').textContent = '🌙 Dark';
    }
  }

  function toggleTheme() {
    const html = document.documentElement;
    const btn = document.getElementById('themeToggle');
    if (html.getAttribute('data-theme') === 'light') {
      html.removeAttribute('data-theme');
      btn.textContent = '☀️ Light';
      localStorage.setItem('theme', 'dark');
    } else {
      html.setAttribute('data-theme', 'light');
      btn.textContent = '🌙 Dark';
      localStorage.setItem('theme', 'light');
    }
  }

  // ── Public API ────────────────────────────────────────────

  return {
    init,
    switchTab,
    showDetail,
    closeModal,
    removeCandidate,
    updateNotes,
    clearAll,
    exportCSV,
    toggleComparison,
    toggleTheme,
  };

})();

// ── Utility ───────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Boot ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', App.init);
