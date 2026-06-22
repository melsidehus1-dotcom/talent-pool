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

  function looksLikeUrl(str) {
    const trimmed = str.trim();
    if (!trimmed) return false;
    if (/^(https?:\/\/[^\s]+)$/i.test(trimmed)) return true;
    if (/^(?:[a-zA-Z0-9.-]+\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(?:\/[^\s]*)?$/i.test(trimmed)) {
      if (!trimmed.includes(' ') && trimmed.length > 4) return true;
    }
    return false;
  }

  function getUrlType(url) {
    const lower = url.toLowerCase();
    if (lower.includes('glints.id') || lower.includes('glints.com')) return 'glints';
    if (lower.includes('linkedin.com')) return 'linkedin';
    if (lower.includes('drive.google.com') || lower.includes('dropbox.com') || lower.includes('box.com') || lower.includes('onedrive.live.com') || lower.includes('s3.amazonaws.com')) return 'drive';
    return 'generic';
  }

  function openUrlWarningModal(url) {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const type = getUrlType(cleanUrl);
    const modal = document.getElementById('urlWarningModal');
    const titleEl = document.getElementById('urlModalTitle');
    const bodyEl = document.getElementById('urlModalBody');

    if (type === 'glints' || type === 'linkedin') {
      const siteName = type === 'glints' ? 'Glints' : 'LinkedIn';
      titleEl.innerHTML = `<span style="color: var(--accent-amber);">⚠️</span> Direct Link Screening Not Supported`;
      bodyEl.innerHTML = `
        <p style="margin-bottom: 16px; line-height: 1.6; color: var(--text-secondary);">
          Because recruitment dashboards (like <strong>${siteName}</strong>) require you to be logged in to view candidate details, this tool cannot fetch profile information directly from a URL.
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px; margin: 20px 0;">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-blue);">1</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Open the candidate's page on <strong>${siteName}</strong>.
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-blue);">2</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Select all profile content: press <kbd class="kbd-key">Ctrl + A</kbd> (or <kbd class="kbd-key">Cmd + A</kbd>).
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-blue);">3</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Copy the selection: press <kbd class="kbd-key">Ctrl + C</kbd> (or <kbd class="kbd-key">Cmd + C</kbd>).
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-blue);">4</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Paste the text below (<kbd class="kbd-key">Ctrl + V</kbd>) and click <strong>Analyze Paste</strong>.
            </div>
          </div>
        </div>
        <div style="margin-top: 24px;">
          <textarea id="modalPasteText" placeholder="Paste the candidate profile text here..." style="width: 100%; height: 120px; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-glass); background: var(--bg-glass); color: var(--text-primary); font-family: inherit; font-size: 14px; resize: vertical; margin-bottom: 16px; outline: none; transition: border-color var(--transition-fast);"></textarea>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button class="btn" onclick="App.closeUrlWarningModal()">Cancel</button>
            <button class="btn btn--primary" onclick="App.analyzeModalText()">🔍 Analyze Paste</button>
          </div>
        </div>
      `;
    } else if (type === 'drive') {
      titleEl.innerHTML = `<span style="color: var(--accent-teal);">📁</span> Google Drive / Cloud Link Detected`;
      bodyEl.innerHTML = `
        <p style="margin-bottom: 16px; line-height: 1.6; color: var(--text-secondary);">
          Browsers block web apps from downloading files directly from cloud storage (Google Drive/Dropbox) due to security policies (CORS).
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px; margin: 20px 0;">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-teal);">1</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Open the link in a new tab: <a href="${escapeHtml(cleanUrl)}" target="_blank" style="color: var(--accent-blue); text-decoration: underline; word-break: break-all;">${escapeHtml(cleanUrl)}</a>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-teal);">2</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Download the PDF CV to your local device.
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-teal);">3</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Drag and drop the downloaded PDF file into the <strong>Drop CV here</strong> zone on the left of the screen.
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button class="btn btn--primary" onclick="window.open('${escapeHtml(cleanUrl)}', '_blank'); App.closeUrlWarningModal();">🌐 Open Link</button>
          <button class="btn" onclick="App.closeUrlWarningModal()">Close</button>
        </div>
      `;
    } else {
      titleEl.innerHTML = `<span style="color: var(--accent-purple);">🌐</span> Portfolio / Web Link Detected`;
      bodyEl.innerHTML = `
        <p style="margin-bottom: 16px; line-height: 1.6; color: var(--text-secondary);">
          Due to browser security regulations (CORS), this application cannot scrape content from personal websites or portfolio links directly.
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px; margin: 20px 0;">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-purple);">1</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Open the link in a new window: <a href="${escapeHtml(cleanUrl)}" target="_blank" style="color: var(--accent-blue); text-decoration: underline; word-break: break-all;">${escapeHtml(cleanUrl)}</a>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-purple);">2</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              If the page has a downloadable CV, download it and drag it into the **Drop CV** zone.
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div style="background: var(--bg-glass-hover); border: 1px solid var(--border-glass); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; font-size: 14px; color: var(--accent-purple);">3</div>
            <div style="line-height: 1.5; color: var(--text-primary);">
              Alternatively, copy the resume/about text from their site, paste it in the box below, and click <strong>Analyze Paste</strong>.
            </div>
          </div>
        </div>
        <div style="margin-top: 24px;">
          <textarea id="modalPasteText" placeholder="Paste the candidate portfolio/profile text here..." style="width: 100%; height: 120px; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-glass); background: var(--bg-glass); color: var(--text-primary); font-family: inherit; font-size: 14px; resize: vertical; margin-bottom: 16px; outline: none; transition: border-color var(--transition-fast);"></textarea>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button class="btn" onclick="App.closeUrlWarningModal()">Cancel</button>
            <button class="btn btn--primary" onclick="App.analyzeModalText()">🔍 Analyze Paste</button>
          </div>
        </div>
      `;
    }

    modal.classList.add('modal-overlay--active');
  }

  function closeUrlWarningModal() {
    document.getElementById('urlWarningModal').classList.remove('modal-overlay--active');
  }

  function analyzeModalText() {
    const text = document.getElementById('modalPasteText').value;
    if (!text || text.trim().length < 20) {
      toast('Please paste more profile text.', 'error');
      return;
    }
    closeUrlWarningModal();
    analyzeText(text);
  }

  function generateContactBadgesHtml(contact, experience) {
    const contactParts = [];
    if (contact.email) {
      contactParts.push(`<a href="mailto:${contact.email}" class="contact-link contact-link--email" title="Email: ${escapeHtml(contact.email)}">✉️ Email</a>`);
    }
    if (contact.phone) {
      contactParts.push(`<span class="contact-link contact-link--phone" title="Phone: ${escapeHtml(contact.phone)}">📞 ${escapeHtml(contact.phone)}</span>`);
    }
    if (contact.linkedin) {
      contactParts.push(`<a href="${contact.linkedin}" class="contact-link contact-link--linkedin" target="_blank">🔗 LinkedIn</a>`);
    }
    if (contact.github) {
      contactParts.push(`<a href="${contact.github}" class="contact-link contact-link--github" target="_blank">💻 GitHub</a>`);
    }
    if (contact.drive) {
      contactParts.push(`<a href="${contact.drive}" class="contact-link contact-link--drive" target="_blank">📁 Drive Portfolio</a>`);
    }
    if (contact.portfolio) {
      contactParts.push(`<a href="${contact.portfolio}" class="contact-link contact-link--portfolio" target="_blank">🌐 Portfolio</a>`);
    }
    if (experience > 0) {
      contactParts.push(`<span class="contact-link" style="cursor:default;">⏳ ${experience}+ yrs exp</span>`);
    }
    return contactParts.join(' ');
  }

  function analyzeText(text) {
    if (!text) return;

    if (looksLikeUrl(text)) {
      openUrlWarningModal(text);
      return;
    }

    if (text.trim().length < 20) {
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

  function analyzeTextFromBookmarklet(text, sourceUrl) {
    if (!text || text.trim().length < 20) {
      toast('Could not extract candidate details from the page.', 'error');
      return;
    }

    let platform = 'Glints';
    if (sourceUrl.includes('linkedin.com')) {
      platform = 'LinkedIn';
    } else if (sourceUrl.includes('google.com')) {
      platform = 'Google Drive';
    } else if (sourceUrl) {
      try {
        platform = new URL(sourceUrl).hostname;
      } catch (e) {}
    }

    const result = SkillAnalyzer.analyze(text);
    result.id = generateId();
    result.source = `${platform} (Bookmarklet)`;
    result.fileName = null;
    result.notes = `Screened directly via browser shortcut.\nSource URL: ${sourceUrl}`;
    
    if (sourceUrl) {
      if (platform === 'LinkedIn') {
        result.contact.linkedin = sourceUrl;
      } else if (platform === 'Google Drive') {
        result.contact.drive = sourceUrl;
      } else {
        result.contact.portfolio = sourceUrl;
      }
    }

    const existing = candidates.find(c => c.name === result.name && c.name !== 'Unknown Candidate');
    if (existing) {
      toast(`Candidate "${result.name}" already screened. Updating entry.`, 'info');
      candidates = candidates.filter(c => c.id !== existing.id);
    }

    candidates.push(result);
    save();
    
    // Refresh table and dashboard
    renderCandidateTable();
    
    // Switch to candidates tab to see results
    switchTab('candidates');
    
    // Auto-open detail modal
    showDetail(result.id);
    
    toast(`Successfully screened ${result.name}!`, 'success');
  }

  // ── Render Analysis Result ────────────────────────────────

  function renderAnalysisResult(result) {
    const container = document.getElementById('analysisResults');
    const initials = result.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const contactHtml = generateContactBadgesHtml(result.contact, result.experience);

    const html = `
      <div class="analysis-result" id="result-${result.id}">
        <div class="analysis-result__header">
          <div class="analysis-result__candidate">
            <div class="analysis-result__avatar">${initials}</div>
            <div>
              <div class="analysis-result__name">${escapeHtml(result.name)}</div>
              <div class="analysis-result__contact" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">${contactHtml || 'No contact info detected'}</div>
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
        case 'videoScore': 
          aVal = a.videoAnalysis ? a.videoAnalysis.overallScore : -1; 
          bVal = b.videoAnalysis ? b.videoAnalysis.overallScore : -1; 
          break;
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
          <td colspan="8" style="text-align:center;padding:48px;color:var(--text-muted);">
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

      const videoStageBadge = c.videoAnalysis && c.videoAnalysis.overallScore !== undefined
        ? `<span class="td-video-badge td-video-badge--screened" onclick="event.stopPropagation(); App.showDetail('${c.id}')">📹 ${c.videoAnalysis.overallScore}%</span>`
        : `<span class="td-video-badge td-video-badge--pending" onclick="event.stopPropagation(); App.showDetail('${c.id}')">➕ Add Video</span>`;

      return `
        <tr onclick="App.showDetail('${c.id}')">
          <td class="td-name">${escapeHtml(c.name)}</td>
          <td>${c.contact.email || '—'}</td>
          <td class="td-score td-score--${scoreClass}">${c.overallScore}%</td>
          <td><span class="td-verdict-badge td-verdict-badge--${c.verdictClass}">${c.verdict}</span></td>
          <td>${videoStageBadge}</td>
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

    const contactHtml = generateContactBadgesHtml(c.contact, c.experience);

    body.innerHTML = `
      <div class="analysis-result__header">
        <div class="analysis-result__candidate">
          <div class="analysis-result__avatar">${initials}</div>
          <div>
            <div class="analysis-result__name">${escapeHtml(c.name)}</div>
            <div class="analysis-result__contact" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; align-items:center;">
              ${contactHtml || 'No contact info'} <span style="font-size:12px; color:var(--text-muted); margin-left:4px;">· Source: ${escapeHtml(c.source)}</span>
            </div>
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

      <!-- Video Screening Stage -->
      ${(() => {
        if (!c.videoAnalysis) {
          return `
            <div class="video-stage-card">
              <div class="video-stage-card__title">📹 Video Screening Stage</div>
              <p style="font-size:12px; color:var(--text-secondary); margin-bottom:16px; line-height:1.5;">
                Analyze the candidate's video presentation against the 4 key job requirements (AWS, SES, Cold Email, Linux Servers) and communication quality.
              </p>
              <div style="margin-bottom:12px;">
                <label style="font-size:11px; font-weight:600; display:block; margin-bottom:6px; color:var(--text-secondary);">Video Presentation Link (Loom, Google Drive, etc.)</label>
                <input type="text" id="modalVideoUrl" placeholder="https://loom.com/share/..." style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-glass); background:var(--bg-glass); color:var(--text-primary); font-size:13px; outline:none;">
              </div>
              <div style="margin-bottom:16px;">
                <label style="font-size:11px; font-weight:600; display:block; margin-bottom:6px; color:var(--text-secondary);">Video Transcript (Copy from Loom's auto-transcript)</label>
                <textarea id="modalVideoTranscript" rows="4" placeholder="Paste the transcription text here to score their verbal explanation..." style="width:100%; padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-glass); background:var(--bg-glass); color:var(--text-primary); font-size:13px; font-family:inherit; resize:vertical; outline:none;"></textarea>
              </div>
              <div style="display:flex; justify-content:flex-end;">
                <button class="btn btn--primary" onclick="App.analyzeCandidateVideo('${c.id}')">🔍 Analyze Video</button>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="video-stage-card">
              <div class="video-stage-card__title" style="justify-content:space-between; display:flex; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span>📹 Video Stage:</span>
                  <span class="td-verdict-badge td-verdict-badge--${c.videoAnalysis.verdictClass}">${c.videoAnalysis.verdict} (${c.videoAnalysis.overallScore}%)</span>
                </div>
                ${c.videoAnalysis.url ? `<a href="${c.videoAnalysis.url}" target="_blank" class="contact-link contact-link--portfolio">🌐 Open Video Link</a>` : ''}
              </div>
              
              <div style="font-size:12px; color:var(--text-secondary); line-height:1.6; padding:12px; background:var(--bg-glass-hover); border-radius:var(--radius-sm); border:1px solid var(--border-glass); margin-bottom:20px; margin-top:12px;">
                <strong>Summary:</strong> ${escapeHtml(c.videoAnalysis.summary)}
              </div>

              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
                <span style="font-size:12px; font-weight:600; color:var(--text-secondary);">Conversational Tone:</span>
                <span class="tone-badge tone-badge--${c.videoAnalysis.toneClass || 'natural'}">${c.videoAnalysis.tone || 'Conversational'}</span>
              </div>
              <p style="font-size:11px; color:var(--text-muted); margin-bottom:16px;">
                ${escapeHtml(c.videoAnalysis.toneDesc || 'Candidate presentation delivery tone analysis.')}
              </p>

              <!-- Side-by-Side Comparison -->
              <div class="comparison-grid">
                <!-- CV Scorecard -->
                <div>
                  <div class="comparison-column-header">📄 Resume claims</div>
                  <div class="score-grid" style="display:flex; flex-direction:column; gap:8px; border:none; padding:0; background:transparent;">
                    ${c.categories.filter(cat => ['aws', 'email', 'server'].includes(cat.id)).map(cat => {
                      let label = cat.name;
                      if (cat.id === 'email') label = 'Email Infrastructure';
                      return `
                        <div style="font-size:12px;">
                          <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                            <span>${cat.icon} ${label}</span>
                            <strong>${cat.percentage}%</strong>
                          </div>
                          <div style="height:4px; background:var(--border-glass); border-radius:2px; overflow:hidden;">
                            <div style="width:${cat.percentage}%; height:100%; background:var(--accent-blue); border-radius:2px;"></div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
                
                <!-- Video Scorecard -->
                <div>
                  <div class="comparison-column-header">🗣️ Spoken presentation</div>
                  <div class="score-grid" style="display:flex; flex-direction:column; gap:8px; border:none; padding:0; background:transparent;">
                    ${c.videoAnalysis.categories.map(cat => `
                      <div style="font-size:12px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                          <span>${cat.icon} ${cat.name}</span>
                          <strong>${cat.percentage}%</strong>
                        </div>
                        <div style="height:4px; background:var(--border-glass); border-radius:2px; overflow:hidden;">
                          <div style="width:${cat.percentage}%; height:100%; background:var(--accent-purple); border-radius:2px;"></div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>

              <!-- Discrepancies / CV Padding Check -->
              ${c.videoAnalysis.discrepancies && c.videoAnalysis.discrepancies.length > 0 ? `
                <div class="discrepancy-card">
                  <div class="discrepancy-card__title">⚠️ CV Discrepancies / Gaps Detected</div>
                  <ul class="discrepancy-card__list">
                    ${c.videoAnalysis.discrepancies.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
                  </ul>
                </div>
              ` : `
                <div style="background:rgba(16, 185, 129, 0.05); border:1px dashed rgba(16, 185, 129, 0.2); border-radius:var(--radius-md); padding:12px; margin-top:20px; font-size:12px; color:var(--accent-teal); display:flex; align-items:center; gap:8px;">
                  ✅ Spoken presentation matches claimed resume skills!
                </div>
              `}

              <!-- Projects Mentioned -->
              <div style="margin-top:20px;">
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:6px; color:var(--text-secondary);">Projects Mentioned Verbally</label>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  ${c.videoAnalysis.projects && c.videoAnalysis.projects.length > 0
                    ? c.videoAnalysis.projects.map(p => `<span class="keyword-tag" style="background:rgba(139, 92, 246, 0.08); border-color:rgba(139, 92, 246, 0.15); color:var(--text-primary); font-size:11px; padding:3px 8px; border-radius:6px;">🛠️ ${escapeHtml(p)}</span>`).join('')
                    : '<span style="font-size:11px; color:var(--text-muted); font-style:italic;">No specific projects extracted</span>'
                  }
                </div>
              </div>

              <div style="display:flex; justify-content:flex-end; margin-top:20px; gap:8px;">
                <button class="btn btn--sm btn--danger" onclick="App.deleteVideoAnalysis('${c.id}')">🗑 Reset Video Screening</button>
              </div>
            </div>
          `;
        }
      })()}

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

  // ── Settings Modal & API Handlers ──────────────────────────

  function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const key = localStorage.getItem('gemini_api_key') || '';
    document.getElementById('geminiApiKeyInput').value = key;
    modal.classList.add('modal-overlay--active');
  }

  function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('modal-overlay--active');
  }

  function saveSettings() {
    const key = document.getElementById('geminiApiKeyInput').value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      toast('Gemini API Key saved successfully!', 'success');
    } else {
      localStorage.removeItem('gemini_api_key');
      toast('Gemini API Key removed. Using local rule-based analyzer.', 'info');
    }
    closeSettingsModal();
  }

  // ── Video Analysis Handlers ────────────────────────────────

  async function analyzeCandidateVideo(id) {
    const c = candidates.find(x => x.id === id);
    if (!c) return;

    const videoUrl = document.getElementById('modalVideoUrl').value.trim();
    const transcript = document.getElementById('modalVideoTranscript').value;

    if (!transcript || transcript.trim().length < 20) {
      toast('Please paste the candidate\'s video transcript (at least a few sentences).', 'error');
      return;
    }

    const btn = document.querySelector('.video-stage-card .btn--primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner"></div> Analyzing...`;
    btn.disabled = true;

    try {
      const apiKey = localStorage.getItem('gemini_api_key');
      let analysisResult;
      
      if (apiKey) {
        analysisResult = await VideoAnalyzer.analyzeWithGemini(apiKey, transcript, c);
      } else {
        analysisResult = VideoAnalyzer.analyze(transcript, c);
      }
      
      analysisResult.url = videoUrl;
      analysisResult.transcript = transcript;
      
      c.videoAnalysis = analysisResult;
      save();
      
      showDetail(c.id);
      renderCandidateTable();
      toast(`Video screening completed for ${c.name}!`, 'success');
    } catch (e) {
      toast(`Error: ${e.message}`, 'error');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  function deleteVideoAnalysis(id) {
    const c = candidates.find(x => x.id === id);
    if (!c) return;

    if (confirm(`Are you sure you want to reset the video screening analysis for ${c.name}?`)) {
      delete c.videoAnalysis;
      save();
      showDetail(c.id);
      renderCandidateTable();
      toast('Video screening analysis reset.', 'info');
    }
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
      'Video Score', 'Video Verdict', 'Video Tone', 'Video Link',
      ...categories.map(c => c.name), 'Strengths', 'Gaps', 'Notes', 'Analyzed At'];

    const rows = candidates.map(c => [
      c.name,
      c.contact.email || '',
      c.contact.phone || '',
      c.experience || '',
      c.source,
      c.overallScore + '%',
      c.verdict,
      c.videoAnalysis ? c.videoAnalysis.overallScore + '%' : 'N/A',
      c.videoAnalysis ? c.videoAnalysis.verdict : 'N/A',
      c.videoAnalysis ? c.videoAnalysis.tone : 'N/A',
      c.videoAnalysis ? c.videoAnalysis.url || '' : '',
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

    // Generate bookmarklet link
    const bookmarkletLink = document.getElementById('bookmarkletLink');
    if (bookmarkletLink) {
      const origin = window.location.origin;
      const code = `javascript:(function(){var t=document.body.innerText;var u=window.location.href;var w=window.open('${origin}');var timer=setInterval(function(){if(w.closed){clearInterval(timer);return;}w.postMessage({type:'SCREEN_CANDIDATE',text:t,source:u},'*');},500);window.addEventListener('message',function(e){if(e.data==='SCREEN_READY'){clearInterval(timer);}});})();`;
      bookmarkletLink.href = code;
      bookmarkletLink.addEventListener('click', (e) => {
        e.preventDefault();
        alert('👉 Please drag this "Screen Candidate" button into your browser\'s Bookmarks bar, then click it when viewing a candidate\'s profile page on Glints or LinkedIn!');
      });
    }

    // Listen for bookmarklet messages
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SCREEN_CANDIDATE') {
        const { text, source } = event.data;
        if (event.source) {
          event.source.postMessage('SCREEN_READY', event.origin);
        }
        analyzeTextFromBookmarklet(text, source);
      }
    });

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

    document.getElementById('detailModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) closeModal();
    });

    document.getElementById('urlWarningModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) closeUrlWarningModal();
    });

    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) closeSettingsModal();
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
    closeUrlWarningModal,
    analyzeModalText,
    openSettingsModal,
    closeSettingsModal,
    saveSettings,
    analyzeCandidateVideo,
    deleteVideoAnalysis,
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
