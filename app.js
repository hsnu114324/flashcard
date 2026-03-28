
// ==================== 產生答案卡片 ====================
let answerChips = [];
questions.forEach(q => {
  q.options.forEach((opt, i) => {
    answerChips.push({
      chipId: `ans-q${q.id}-${i}`, type: 'answer',
      questionId: q.id, label: q.labels[i], text: opt,
      isCorrect: i === q.correctIndex
    });
  });
});

// ==================== 產生詳解卡片 ====================
let expChips = [];
function buildExpChips() {
  expChips = [];
  questions.forEach(q => {
    q.expParts.forEach((part, i) => {
      expChips.push({
        chipId: `exp-q${q.id}-${i}`, type: 'explanation',
        questionId: q.id, partIndex: i, text: part
      });
    });
  });
  shuffle(expChips);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
shuffle(answerChips);
buildExpChips();

// ⚡ 按 questionId 分組的快速查詢表（避免每次 filter 全部 13,000+ chips）
let _answerChipsByQid = new Map();
let _expChipsByQid = new Map();
function rebuildChipIndex() {
  _answerChipsByQid = new Map();
  answerChips.forEach(c => {
    if (!_answerChipsByQid.has(c.questionId)) _answerChipsByQid.set(c.questionId, []);
    _answerChipsByQid.get(c.questionId).push(c);
  });
  _expChipsByQid = new Map();
  expChips.forEach(c => {
    if (!_expChipsByQid.has(c.questionId)) _expChipsByQid.set(c.questionId, []);
    _expChipsByQid.get(c.questionId).push(c);
  });
}
rebuildChipIndex();

function getChipsForQids(chipMap, qids) {
  const result = [];
  for (const qid of qids) {
    const arr = chipMap.get(qid);
    if (arr) result.push(...arr);
  }
  return result;
}

// ==================== 狀態 ====================
let currentPage = 0;
let solvedSet = new Set();
let expPlacedMap = new Map();
let expCompletedSet = new Set();
let orderCheckResults = new Map();

// 導航歷史（返回 / 前進功能）
let navHistory = [];
let navForwardHistory = [];

function buildNavState() {
  const state = { type: viewMode, page: currentPage };
  if (viewMode === 'single' && document.getElementById('cardArea').querySelector('.full-index')) {
    state.type = 'fullIndex';
    state.fullIndexType = fullIndexType;
  } else if (viewMode === 'single' && document.getElementById('cardArea').querySelector('.mastery-dashboard')) {
    state.type = 'dashboard';
    state.tab = dashboardTab;
    // 記錄 Dashboard 內的展開狀態
    if (inlineTraceWord) state.inlineTraceWord = inlineTraceWord;
    // 記錄展開的 chip groups
    const expandedGroups = [];
    document.querySelectorAll('.chip-mastery-group.expanded').forEach(el => {
      const header = el.querySelector('.chip-mastery-group-header');
      if (header) expandedGroups.push(header.textContent.trim());
    });
    if (expandedGroups.length) state.expandedGroups = expandedGroups;
  }
  if (activeAnswerKey) state.backlink = { kind: 'answer', key: activeAnswerKey };
  else if (activeOptionKey) state.backlink = { kind: 'option', key: activeOptionKey };
  else if (activeExpKey) state.backlink = { kind: 'exp', key: activeExpKey };
  else if (activeWordKey) state.backlink = { kind: 'word', key: activeWordKey };
  // 記錄反向連結中展開的題目詳情
  const expandedDetails = [];
  document.querySelectorAll('.backlink-question.bq-expanded').forEach(el => {
    const qidx = el.getAttribute('data-qidx');
    if (qidx != null) expandedDetails.push(Number(qidx));
  });
  if (expandedDetails.length) state.expandedDetails = expandedDetails;
  // 記錄捲動位置，返回時可恢復
  const scroller = document.getElementById('mainContent');
  if (scroller) state.scrollTop = scroller.scrollTop;
  return state;
}

function pushNavState() {
  navHistory.push(buildNavState());
  navForwardHistory = []; // 新導航清除前進歷史
  if (navHistory.length > 50) navHistory.shift();
}

function restoreNavState(state) {
  if (state.type === 'fullIndex') {
    showFullIndex(state.fullIndexType);
    return;
  }
  if (state.type === 'dashboard') {
    dashboardTab = state.tab || 'questions';
    showDashboard(null, true);
    // 恢復 Dashboard 內的展開狀態
    setTimeout(() => {
      // 恢復展開的 chip groups
      if (state.expandedGroups && state.expandedGroups.length) {
        document.querySelectorAll('.chip-mastery-group').forEach(el => {
          const header = el.querySelector('.chip-mastery-group-header');
          if (header && state.expandedGroups.includes(header.textContent.trim())) {
            el.classList.add('expanded');
          }
        });
      }
      // 恢復 inline trace
      if (state.inlineTraceWord) {
        inlineTraceWord = null; // 先重設，讓 toggleInlineTrace 重新觸發
        const targetWord = state.inlineTraceWord;
        // 找到匹配的可點擊文字並觸發
        const wordEls = document.querySelectorAll('.clickable-word');
        for (const el of wordEls) {
          if (el.textContent.toLowerCase() === targetWord) {
            toggleInlineTrace(el.textContent, el);
            break;
          }
        }
      }
      // 恢復捲動位置
      if (state.scrollTop != null) {
        const mc = document.getElementById('mainContent');
        if (mc) mc.scrollTop = state.scrollTop;
      }
    }, 0);
  } else if (state.type === 'quiz') {
    startQuiz(true);
  } else {
    viewMode = 'single';
    currentPage = state.page || 0;
    activeAnswerKey = null; activeOptionKey = null; activeExpKey = null; activeWordKey = null;
    if (state.backlink) {
      const bk = state.backlink;
      if (bk.kind === 'answer') activeAnswerKey = bk.key;
      else if (bk.kind === 'option') activeOptionKey = bk.key;
      else if (bk.kind === 'exp') activeExpKey = bk.key;
      else if (bk.kind === 'word') activeWordKey = bk.key;
    }
    jtExpandedSpans.clear(); jtDetailTabMap.clear(); jtDetailKey = null;
    renderAll();
    // 恢復反向連結中展開的題目詳情 + 捲動位置
    setTimeout(() => {
      if (state.expandedDetails && state.expandedDetails.length) {
        state.expandedDetails.forEach(qidx => {
          const row = document.querySelector(`.backlink-question[data-qidx="${qidx}"]`);
          if (row) toggleBacklinkDetail(qidx, row);
        });
      }
      if (state.scrollTop != null) {
        const mc = document.getElementById('mainContent');
        if (mc) mc.scrollTop = state.scrollTop;
      } else {
        document.getElementById('mainContent').scrollTo(0, 0);
      }
    }, 0);
  }
}

function navBack() {
  if (navHistory.length === 0) return;
  navForwardHistory.push(buildNavState());
  const prev = navHistory.pop();
  restoreNavState(prev);
  updateNavButtons();
}

function navForward() {
  if (navForwardHistory.length === 0) return;
  navHistory.push(buildNavState());
  const next = navForwardHistory.pop();
  restoreNavState(next);
  updateNavButtons();
}

function updateNavButtons() {
  const backBtn = document.getElementById('navBackBtn');
  const fwdBtn = document.getElementById('navForwardBtn');
  if (backBtn) backBtn.classList.toggle('visible', navHistory.length > 0);
  if (fwdBtn) fwdBtn.classList.toggle('visible', navForwardHistory.length > 0);
}
// 相容舊名
function updateBackButton() { updateNavButtons(); }

// Quiz 模式
let viewMode = 'quiz'; // 'quiz' | 'single'
let quizIndices = []; // quiz 模式顯示的 4 個題目的 questions 陣列索引
let quizAttempts = new Map(); // qid → 答錯次數（用於統計正確率）

// ===== Facemash 掌握度追蹤 =====
// questionStats: qid → { rounds: N, firstTry: N, totalWrong: N }
//   rounds = 曾經答對幾輪, firstTry = 其中幾輪一次就對, totalWrong = 累計錯誤次數
let questionStats = new Map();

// ===== 選項 & 詳解小卡追蹤 =====
// optionAttempts: chipId → { correct: N, wrong: N, wrongTargets: [qid...] }
let optionAttempts = new Map();
// expPartAttempts: chipId → { correct: N, wrong: N }
let expPartAttempts = new Map();

function getOptAttempt(chipId) {
  if (!optionAttempts.has(chipId)) optionAttempts.set(chipId, { correct: 0, wrong: 0, wrongTargets: [] });
  return optionAttempts.get(chipId);
}
function getExpPartAttempt(chipId) {
  if (!expPartAttempts.has(chipId)) expPartAttempts.set(chipId, { correct: 0, wrong: 0 });
  return expPartAttempts.get(chipId);
}

function getQStats(qid) {
  if (!questionStats.has(qid)) questionStats.set(qid, { rounds: 0, firstTry: 0, totalWrong: 0 });
  return questionStats.get(qid);
}
function recordCorrect(qid, wrongCount) {
  const s = getQStats(qid);
  s.rounds++;
  if (wrongCount === 0) s.firstTry++;
  s.totalWrong += wrongCount;
}
function getMasteryScore(qid) {
  const s = getQStats(qid);
  if (s.rounds === 0) return 0; // 從未答過
  // 掌握度 = 一次正確率 × 100，有少量衰減讓多次作答的更穩定
  const accuracy = s.firstTry / s.rounds;
  // 給予經驗加成：答越多輪，信心越高
  const confidence = Math.min(1, s.rounds / 3); // 3 輪以上才算穩定
  return Math.round(accuracy * confidence * 100);
}
// 取得按掌握度排序的索引陣列（低→高）
function getMasterySortedIndices() {
  return questions.map((_, i) => i).sort((a, b) => {
    const sa = getMasteryScore(questions[a].id);
    const sb = getMasteryScore(questions[b].id);
    if (sa !== sb) return sa - sb; // 低掌握度在前（左）
    return a - b; // 同分按原始順序
  });
}

function getExpPlaced(qid) {
  if (!expPlacedMap.has(qid)) expPlacedMap.set(qid, []);
  return expPlacedMap.get(qid);
}

// ==================== Sidebar ====================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}
function toggleFolder(el) {
  el.classList.toggle('expanded');
  const children = el.nextElementSibling;
  if (children) children.classList.toggle('open');
}
function filterSidebar(val) {
  const v = val.toLowerCase();
  document.querySelectorAll('#categoryFolders .file-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(v) ? '' : 'none';
  });
  // 搜尋時也匹配 category 名稱
  if (v) {
    document.querySelectorAll('#categoryFolders .folder-children').forEach(fc => {
      const hasVisible = [...fc.querySelectorAll('.file-item')].some(i => i.style.display !== 'none');
      fc.classList.toggle('open', hasVisible);
      const folder = fc.previousElementSibling;
      if (folder) folder.classList.toggle('expanded', hasVisible);
    });
  }
}

// ── 快取分類索引（只在題目變動時重建） ──
let _catMapCache = null;
let _catMapQLen = -1;
function getCatMap() {
  if (_catMapCache && _catMapQLen === questions.length) return _catMapCache;
  _catMapCache = new Map();
  questions.forEach((q, idx) => {
    const cat = String(q.category || '') || '未分類';
    if (!_catMapCache.has(cat)) _catMapCache.set(cat, []);
    _catMapCache.get(cat).push({ q, idx });
  });
  _catMapQLen = questions.length;
  return _catMapCache;
}

function renderSidebar() {
  const container = document.getElementById('categoryFolders');
  const catMap = getCatMap();
  const getCatIcon = (cat) => {
    const s = String(cat || '');
    if (s.includes('導遊')) return '🏛️';
    if (s.includes('領隊')) return '✈️';
    return '📂';
  };
  const currentCat = (viewMode === 'single' && questions.length > 0) ? (questions[currentPage]?.category || '未分類') : '';
  const quizQidSet = viewMode === 'quiz' ? new Set(quizIndices.map(i => questions[i]?.id)) : new Set();
  container.innerHTML = [...catMap.entries()].map(([cat, items]) => {
    const isExpanded = cat === currentCat || (viewMode === 'quiz' && items.some(it => quizQidSet.has(it.q.id)));
    const solvedCount = items.filter(it => solvedSet.has(it.q.id)).length;
    // ⚡ 只渲染展開分類的子項，未展開的不產生 DOM
    const itemsHtml = isExpanded ? items.map(({ q, idx }) => {
      const isSolved = solvedSet.has(q.id);
      const expDone = expCompletedSet.has(q.id);
      let statusClass = '';
      if (expDone) statusClass = 'exp-done';
      else if (isSolved) statusClass = 'solved';
      const isActive = (viewMode === 'single' && idx === currentPage) || (viewMode === 'quiz' && quizQidSet.has(q.id));
      const preview = q.question.length > 26 ? q.question.slice(0, 26) + '…' : q.question;
      return `<div class="file-item ${isActive ? 'active' : ''}" onclick="goToPage(${idx})">
        <span class="file-icon">📄</span>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">第${q.id}題 ${preview}</span>
        <span class="file-status ${statusClass}"></span>
      </div>`;
    }).join('') : '';
    return `
      <div class="folder-item ${isExpanded ? 'expanded' : ''}" onclick="toggleFolder(this)">
        <span class="folder-icon">${getCatIcon(cat)}</span>
        <span class="folder-name">${cat}</span>
        <span style="margin-left:auto;font-size:0.65rem;color:#aaa;padding-right:4px;">${solvedCount}/${items.length}</span>
        <span class="folder-arrow">▶</span>
      </div>
      <div class="folder-children ${isExpanded ? 'open' : ''}">${itemsHtml}</div>
    `;
  }).join('');

  // 統計
  const stats = document.getElementById('sidebarStats');
  stats.innerHTML = `
    ✅ 答對：${solvedSet.size} / ${questions.length}<br>
    📖 詳解完成：${expCompletedSet.size} / ${questions.length}<br>
    📊 進度：${Math.round((solvedSet.size + expCompletedSet.size) / (questions.length * 2) * 100)}%
  `;

}

function goToPage(idx) {
  pushNavState();
  switchToSingle(idx);
  updateBackButton();
  if (window.innerWidth <= 768) toggleSidebar();
}

// ==================== 答案索引（反向連結）====================
let activeAnswerKey = null; // 當前選中的答案文字

// ── 快取答案索引 ──
let _answerIndexCache = null;
let _answerIndexQLen = -1;
function buildAnswerIndex() {
  if (_answerIndexCache && _answerIndexQLen === questions.length) return _answerIndexCache;
  const map = new Map();
  questions.forEach(q => {
    const correctText = q.options[q.correctIndex];
    if (!map.has(correctText)) map.set(correctText, []);
    map.get(correctText).push(q);
  });
  _answerIndexCache = map;
  _answerIndexQLen = questions.length;
  return map;
}

function renderAnswerIndex() {
  const folder = document.getElementById('answerIndexFolder');
  if (!folder) return;
  const indexMap = buildAnswerIndex();
  // 依反向連結數由大到小排序，同數量再按字母排序
  const entries = [...indexMap.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0], 'de');
  });
  const MAX_SHOW = 200;
  const limited = entries.slice(0, MAX_SHOW);
  folder.innerHTML = limited.map(([ansText, qs]) => {
    const isActive = activeAnswerKey === ansText;
    return `<div class="answer-index-item ${isActive ? 'active-answer' : ''}" onclick="selectAnswerIndex('${ansText.replace(/'/g, "\\'")}')">
      <span class="ai-icon">💡</span>
      <span class="ai-text">${ansText}</span>
      <span class="ai-badge">${qs.length}</span>
    </div>`;
  }).join('');
}

// 判斷目前是否正在顯示 Dashboard
function isDashboardVisible() {
  const ca = document.getElementById('cardArea');
  return ca && ca.querySelector('.mastery-dashboard');
}

function selectAnswerIndex(ansText) {
  const wasDashboard = isDashboardVisible();
  if (wasDashboard) pushNavState();
  if (activeAnswerKey === ansText) {
    activeAnswerKey = null;
  } else {
    activeAnswerKey = ansText;
    activeOptionKey = null; activeExpKey = null; activeWordKey = null;
  }
  if (wasDashboard) { renderAll(); updateNavButtons(); } else { rerenderBacklinkOnly(); }
  if (window.innerWidth <= 768) toggleSidebar();
}

function renderBacklinkPanel() {
  const area = document.getElementById('backlinkArea');
  if (!area) return;

  // 答案索引模式
  if (activeAnswerKey) {
    const indexMap = buildAnswerIndex();
    const matchedQuestions = indexMap.get(activeAnswerKey) || [];
    if (matchedQuestions.length === 0) {
      area.innerHTML = ''; activeAnswerKey = null; return;
    }
    const questionsHtml = matchedQuestions.map(q => {
      const idx = questions.indexOf(q);
      const catTag = q.category ? `<span style="font-size:0.65rem;color:#999;background:#f0f4f1;padding:1px 5px;border-radius:4px;margin-left:4px;">${q.category}</span>` : '';
      return `<div class="backlink-question" data-qidx="${idx}" onclick="toggleBacklinkDetail(${idx}, this)">
        <span class="bq-num" title="點擊跳轉到此題" onclick="event.stopPropagation();goToPageFromBacklink(${idx})">第${q.id}題</span>
        <span class="bq-text">${q.question}${catTag}</span>
      </div>`;
    }).join('');
    area.innerHTML = `
      <div class="backlink-panel">
        <div class="backlink-header">
          <div class="backlink-title">🔗 正確答案為「${activeAnswerKey}」的題目 (${matchedQuestions.length})</div>
          <button class="backlink-close" onclick="clearBacklink()">✕</button>
        </div>
        ${questionsHtml}
      </div>`;
    return;
  }

  // 選項索引模式
  if (activeOptionKey) {
    const indexMap = buildOptionIndex();
    const items = indexMap.get(activeOptionKey) || [];
    if (items.length === 0) {
      area.innerHTML = ''; activeOptionKey = null; return;
    }
    const questionsHtml = items.map(item => {
      const q = item.question;
      const idx = questions.indexOf(q);
      const label = q.labels[q.options.indexOf(activeOptionKey)] || '?';
      const catTag = q.category ? `<span style="font-size:0.65rem;color:#999;background:#f0f4f1;padding:1px 5px;border-radius:4px;margin-left:4px;">${q.category}</span>` : '';
      return `<div class="backlink-question" data-qidx="${idx}" onclick="toggleBacklinkDetail(${idx}, this)">
        <span class="bq-num" title="點擊跳轉到此題" onclick="event.stopPropagation();goToPageFromBacklink(${idx})">第${q.id}題</span>
        <span class="bq-text">(${label}) ${q.question}${catTag}</span>
      </div>`;
    }).join('');
    area.innerHTML = `
      <div class="backlink-panel option-panel">
        <div class="backlink-header">
          <div class="backlink-title">📋 包含選項「${activeOptionKey}」的題目 (${items.length})</div>
          <button class="backlink-close" onclick="clearBacklink()">✕</button>
        </div>
        ${questionsHtml}
      </div>`;
    return;
  }

  // 詳解索引模式
  if (activeExpKey) {
    const [qid, partIdx] = activeExpKey.split('-').map(Number);
    const q = questions.find(qq => qq.id === qid);
    if (!q || partIdx >= q.expParts.length) {
      area.innerHTML = ''; activeExpKey = null; return;
    }
    const fullText = q.expParts[partIdx];
    // 同時找出其他題目是否也有相同的詳解文字
    const sameExpQuestions = questions.filter(qq => qq.id !== qid && qq.expParts.includes(fullText));
    let relatedHtml = '';
    if (sameExpQuestions.length > 0) {
      relatedHtml = `<div style="margin-top:8px;font-size:0.8rem;color:#7c3aed;font-weight:600;">⚡ 其他題目也有相同詳解 (${sameExpQuestions.length})</div>` +
        sameExpQuestions.map(sq => {
          const si = questions.indexOf(sq);
          return `<div class="backlink-question" data-qidx="${si}" onclick="toggleBacklinkDetail(${si}, this)">
            <span class="bq-num" title="點擊跳轉到此題" onclick="event.stopPropagation();goToPageFromBacklink(${si})">第${sq.id}題</span>
            <span class="bq-text">${sq.question}</span>
          </div>`;
        }).join('');
    }
    const qIdx = questions.indexOf(q);
    area.innerHTML = `
      <div class="backlink-panel exp-panel">
        <div class="backlink-header">
          <div class="backlink-title">📖 詳解卡片 — 第${qid}題 (第${partIdx + 1}張)</div>
          <button class="backlink-close" onclick="clearBacklink()">✕</button>
        </div>
        <div class="backlink-question" data-qidx="${qIdx}" onclick="toggleBacklinkDetail(${qIdx}, this)">
          <span class="bq-num" title="點擊跳轉到此題" onclick="event.stopPropagation();goToPageFromBacklink(${qIdx})">第${q.id}題</span>
          <span class="bq-text">${q.question}</span>
        </div>
        <div class="backlink-exp-full">${fullText}</div>
        ${relatedHtml}
      </div>`;
    return;
  }

  // 德文單字 Trace 模式
  if (activeWordKey) {
    area.innerHTML = renderWordTrace(activeWordKey);
    return;
  }

  area.innerHTML = '';
}

function goToPageFromBacklink(idx) {
  pushNavState();
  switchToSingle(idx);
  updateBackButton();
}

// 反向連結面板中，點擊題目在原位展開詳情（不離開頁面）
function toggleBacklinkDetail(idx, el) {
  const q = questions[idx];
  if (!q) return;
  const parentRow = el.closest('.backlink-question');
  if (!parentRow) return;

  // 如果已展開，收合
  const existing = parentRow.nextElementSibling;
  if (existing && existing.classList.contains('backlink-inline-detail')) {
    existing.remove();
    parentRow.classList.remove('bq-expanded');
    return;
  }

  parentRow.classList.add('bq-expanded');

  // 構建詳情 HTML
  const optionsHtml = q.options.map((opt, i) => {
    const label = q.labels[i] || String.fromCharCode(65 + i);
    const isCorrect = i === q.correctIndex;
    return `<span class="bkd-opt${isCorrect ? ' correct' : ''}">(${label}) ${opt}</span>`;
  }).join('');

  const expHtml = q.expParts.length > 0
    ? `<div class="bkd-exp"><div class="bkd-exp-title">📖 詳解</div>${q.expParts.map(p => `<div style="margin-bottom:4px;">• ${p}</div>`).join('')}</div>`
    : '';

  const detailDiv = document.createElement('div');
  detailDiv.className = 'backlink-inline-detail';
  detailDiv.setAttribute('data-qidx', idx);
  detailDiv.innerHTML = `
    <div class="bkd-q">${q.question}</div>
    <div class="bkd-options">${optionsHtml}</div>
    ${expHtml}
  `;
  parentRow.after(detailDiv);
}

function clearBacklink() {
  activeAnswerKey = null;
  activeOptionKey = null;
  activeExpKey = null;
  activeWordKey = null;
  jtExpandedSpans.clear();
  jtDetailTabMap.clear();
  jtDetailKey = null;
  rerenderBacklinkOnly();
}

// ==================== Jaeger-style Word Trace ====================
let jtExpandedSpans = new Set(); // 同時展開多個 span key
let jtDetailKey = null; // 當前顯示 detail 的 span key
let jtDetailTabMap = new Map(); // spanKey → 'tags' | 'context'（per-span tab 狀態）

// 色盤 — 每個題目(service)分配不同顏色，類似 Jaeger
const JT_COLORS = [
  '#4299e1','#ed8936','#48bb78','#ed64a6','#9f7aea',
  '#38b2ac','#e53e3e','#ecc94b','#667eea','#f56565',
  '#4fd1c5','#fc8181'
];
function jtColor(idx) { return JT_COLORS[idx % JT_COLORS.length]; }

function toggleJtSpan(key) {
  if (jtExpandedSpans.has(key)) {
    // 收合：移除自己、子 key、以及對應的 :detail key（不影響其他 span）
    const qidPrefix = key.split('-')[0] + '-';
    const isDepth0 = key.endsWith('-all');
    [...jtExpandedSpans].forEach(k => {
      if (isDepth0) {
        if (k.startsWith(qidPrefix)) jtExpandedSpans.delete(k);
      } else {
        if (k === key || k === key + ':detail' || k.startsWith(key + '-')) jtExpandedSpans.delete(k);
      }
    });
  } else {
    // 展開 — 只新增自己，不影響其他已展開的 span
    jtExpandedSpans.add(key);
    // 同時顯示 detail
    jtExpandedSpans.add(key + ':detail');
  }
  rerenderWordTraceOnly();
}
function showJtDetail(key) {
  // 切換 detail 面板（獨立控制，不影響其他 span）
  const detailKey = key + ':detail';
  if (jtExpandedSpans.has(detailKey)) {
    jtExpandedSpans.delete(detailKey);
  } else {
    jtExpandedSpans.add(detailKey);
  }
  rerenderWordTraceOnly();
}
function switchJtTab(spanKey, tab) {
  jtDetailTabMap.set(spanKey, tab);
  // 嘗試只更新目標 detail panel 的 body + tab 狀態（不重建所有 span rows）
  const panel = document.querySelector(`.jt-detail[data-spankey="${spanKey}"]`);
  if (panel) {
    // 更新 tab active 狀態
    panel.querySelectorAll('.jt-detail-tab').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase() === tab);
    });
    // 重建 body 內容
    const bodyEl = panel.querySelector('.jt-detail-body');
    if (bodyEl) {
      const data = collectWordTraceData(activeWordKey);
      if (data) {
        // 找到對應的 question 與 contexts
        const keyParts = spanKey.split('-');
        const qid = Number(keyParts[0]);
        const qEntry = data.qEntries.find(e => e.question.id === qid);
        if (qEntry) {
          const q = qEntry.question;
          const idx = questions.indexOf(q);
          let contexts = qEntry.contexts;
          // 如果是 child key（如 "1-題幹"），取對應 source 的 contexts
          if (keyParts.length >= 2 && keyParts[1] !== 'all') {
            const src = keyParts.slice(1).join('-');
            contexts = qEntry.contexts.filter(c => c.source === src);
          }
          const posInfo = contexts.map(c => {
            const p = findWordPos(c.context, activeWordKey);
            return { source: c.source, left: Math.round(p.left), context: c.context };
          });
          const posRange = findSpanRange(contexts, activeWordKey);
          if (tab === 'tags') {
            bodyEl.innerHTML = `<table class="jt-tag-table">
              <tr><td class="jt-tag-key">question.id</td><td class="jt-tag-val"><a onclick="goToPageFromBacklink(${idx})">Q${q.id} (點擊跳轉)</a></td></tr>
              <tr><td class="jt-tag-key">category</td><td class="jt-tag-val">${q.category || '—'}</td></tr>
              <tr><td class="jt-tag-key">word</td><td class="jt-tag-val" style="font-weight:700;color:#c05621;">${activeWordKey}</td></tr>
              <tr><td class="jt-tag-key">position</td><td class="jt-tag-val">${Math.round(posRange.left)}% ~ ${Math.round(posRange.left + posRange.width)}%（句中相對位置）</td></tr>
              <tr><td class="jt-tag-key">spans</td><td class="jt-tag-val">${contexts.length}</td></tr>
              <tr><td class="jt-tag-key">sources</td><td class="jt-tag-val">${[...new Set(contexts.map(c => c.source))].join(', ')}</td></tr>
              <tr><td class="jt-tag-key">correct_answer</td><td class="jt-tag-val">${q.options[q.correctIndex]}</td></tr>
              <tr><td class="jt-tag-key">question</td><td class="jt-tag-val">${data.hlWord(q.question)}</td></tr>
              ${posInfo.map(p => `<tr><td class="jt-tag-key">${p.source} pos</td><td class="jt-tag-val">${p.left}%</td></tr>`).join('')}
            </table>`;
          } else {
            bodyEl.innerHTML = contexts.map(c => `
              <div class="jt-context-block">
                <div style="font-size:0.65rem;color:#a0aec0;margin-bottom:4px;">source: ${c.source}</div>
                ${data.hlWord(c.context)}
              </div>
            `).join('');
          }
          return; // 成功，不需要重建所有 span rows
        }
      }
    }
  }
  // fallback：找不到 panel 時整體重建
  rerenderWordTraceOnly();
}

// 只重新渲染 word trace 的 span rows，避免整頁閃爍
function rerenderWordTraceOnly() {
  if (!activeWordKey) { rerenderBacklinkOnly(); return; }
  // 嘗試只更新 span rows 區域（不動 header/stats/legend/minimap/co-words）
  const spanContainer = document.getElementById('jtSpanRows');
  if (spanContainer) {
    const data = collectWordTraceData(activeWordKey);
    if (data) {
      const scroller = document.getElementById('quizPoolScroller') || document.getElementById('mainContent');
      const scrollTop = scroller ? scroller.scrollTop : 0;
      // 鎖定高度 + 禁用動畫，防止閃爍
      const prevH = spanContainer.offsetHeight;
      spanContainer.style.minHeight = prevH + 'px';
      spanContainer.classList.add('updating');
      spanContainer.innerHTML = buildJtSpanRowsHtml(data.qEntries, activeWordKey, data.hlWord, data.srcColors);
      if (scroller) scroller.scrollTop = scrollTop;
      // 下一幀解鎖
      requestAnimationFrame(() => {
        spanContainer.classList.remove('updating');
        spanContainer.style.minHeight = '';
      });
      return;
    }
  }
  // fallback：整個 trace 重建（首次開啟或容器不存在時）
  const area = document.getElementById('backlinkArea');
  if (!area) { renderAll(); return; }
  const scroller = document.getElementById('quizPoolScroller') || document.getElementById('mainContent');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  area.innerHTML = renderWordTrace(activeWordKey);
  if (scroller) scroller.scrollTop = scrollTop;
}

// 只重新渲染 backlinkArea + sidebar 索引高亮，避免整頁閃爍
function rerenderBacklinkOnly() {
  const area = document.getElementById('backlinkArea');
  if (!area) { renderAll(); return; }
  const scroller = document.getElementById('quizPoolScroller') || document.getElementById('mainContent');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  renderBacklinkPanel();
  renderWordIndex();
  renderAnswerIndex();
  renderOptionIndex();
  renderExpIndex();
  if (scroller) scroller.scrollTop = scrollTop;
}

// 計算單字在文本中的相對位置（百分比）
function findWordPos(text, wordKey) {
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(wordKey);
  if (idx === -1) return { left: 0, width: 5 }; // fallback
  const totalLen = Math.max(text.length, 1);
  const left = (idx / totalLen) * 100;
  const width = Math.max(3, (wordKey.length / totalLen) * 100);
  return { left, width };
}

// 計算多個 contexts 的位置範圍（包含所有出現點的最小~最大）
function findSpanRange(contexts, wordKey) {
  let minLeft = 100, maxRight = 0;
  contexts.forEach(c => {
    const p = findWordPos(c.context, wordKey);
    minLeft = Math.min(minLeft, p.left);
    maxRight = Math.max(maxRight, p.left + p.width);
  });
  if (minLeft >= maxRight) return { left: 0, width: 5 };
  return { left: minLeft, width: Math.max(3, maxRight - minLeft) };
}

// 產生 span rows HTML（獨立函式，可局部更新）
function buildJtSpanRowsHtml(qEntries, wordKey, hlWord, srcColors) {
  let html = '';
  qEntries.forEach((qEntry, qi) => {
    const q = qEntry.question;
    const idx = questions.indexOf(q);
    const color = jtColor(qi);
    const cat = String(q.category || '');

    const sourceGroups = {};
    qEntry.contexts.forEach(c => {
      if (!sourceGroups[c.source]) sourceGroups[c.source] = [];
      sourceGroups[c.source].push(c);
    });

    const parentKey = `${q.id}-all`;
    const isParentExpanded = jtExpandedSpans.has(parentKey);
    const parentRange = findSpanRange(qEntry.contexts, wordKey);
    const preview = q.question.length > 25 ? q.question.slice(0, 25) + '…' : q.question;

    html += `
      <div class="jt-span-row jt-depth-0 ${isParentExpanded ? 'jt-expanded' : ''}" onclick="toggleJtSpan('${parentKey}')">
        <div class="jt-span-service">
          <span class="jt-span-toggle ${isParentExpanded ? 'open' : ''}">▶</span>
          <span class="jt-span-svc-dot" style="background:${color}"></span>
          <span class="jt-span-svc-name">Q${q.id} ${cat}</span>
          <span class="jt-span-op-name">${qEntry.contexts.length} spans</span>
        </div>
        <div class="jt-span-timeline">
          <div class="jt-span-bar" style="left:${parentRange.left}%;width:${parentRange.width}%;background:${color};">
            <span class="jt-span-bar-label">${preview}</span>
          </div>
        </div>
      </div>`;

    if (jtExpandedSpans.has(parentKey + ':detail')) {
      html += renderJtDetail(q, idx, qEntry.contexts, wordKey, hlWord, color, cat, parentKey);
    }

    if (isParentExpanded) {
      Object.entries(sourceGroups).forEach(([src, ctxs]) => {
        const childKey = `${q.id}-${src}`;
        const isChildExpanded = jtExpandedSpans.has(childKey);
        const srcColor = srcColors[src] || color;
        const childRange = findSpanRange(ctxs, wordKey);

        html += `
          <div class="jt-span-row jt-depth-1 ${isChildExpanded ? 'jt-expanded' : ''}" onclick="event.stopPropagation();toggleJtSpan('${childKey}')">
            <div class="jt-span-service">
              <span class="jt-span-toggle ${isChildExpanded ? 'open' : ''}">▶</span>
              <span class="jt-span-svc-dot" style="background:${srcColor}"></span>
              <span class="jt-span-svc-name">${src}</span>
              <span class="jt-span-op-name">×${ctxs.length}</span>
            </div>
            <div class="jt-span-timeline">
              <div class="jt-span-bar" style="left:${childRange.left}%;width:${childRange.width}%;background:${srcColor};opacity:0.75;">
                <span class="jt-span-bar-label">${src} (${ctxs.length})</span>
              </div>
            </div>
          </div>`;

        if (jtExpandedSpans.has(childKey + ':detail')) {
          html += renderJtDetail(q, idx, ctxs, wordKey, hlWord, srcColor, src, childKey);
        }

        if (isChildExpanded) {
          ctxs.forEach((c, ci) => {
            const leafKey = `${q.id}-${src}-${ci}`;
            const isLeafExpanded = jtExpandedSpans.has(leafKey) || jtExpandedSpans.has(leafKey + ':detail');
            const leafPos = findWordPos(c.context, wordKey);
            const ctxPreview = c.context.length > 30 ? c.context.slice(0, 30) + '…' : c.context;

            html += `
              <div class="jt-span-row jt-depth-2 ${isLeafExpanded ? 'jt-expanded' : ''}" onclick="event.stopPropagation();toggleJtSpan('${leafKey}')">
                <div class="jt-span-service">
                  <span class="jt-span-svc-dot" style="background:${srcColor};opacity:0.6"></span>
                  <span class="jt-span-op-name" style="color:#718096;">${ctxPreview}</span>
                </div>
                <div class="jt-span-timeline">
                  <div class="jt-span-bar" style="left:${leafPos.left}%;width:${leafPos.width}%;background:${srcColor};opacity:0.5;">
                  </div>
                </div>
              </div>`;

            if (isLeafExpanded) {
              html += renderJtLeafDetail(q, idx, c, wordKey, hlWord, srcColor);
            }
          });
        }
      });
    }
  });
  return html;
}

// 收集 word trace 的共用資料
function collectWordTraceData(wordKey) {
  const wordIndex = buildWordIndex();
  const entry = wordIndex.get(wordKey);
  if (!entry || entry.sources.length === 0) return null;

  const qMap = new Map();
  entry.sources.forEach(s => {
    if (!qMap.has(s.question.id)) qMap.set(s.question.id, { question: s.question, contexts: [] });
    qMap.get(s.question.id).contexts.push(s);
  });
  questions.forEach(q => {
    q.expParts.forEach((part) => {
      if (part.toLowerCase().includes(wordKey)) {
        if (!qMap.has(q.id)) qMap.set(q.id, { question: q, contexts: [] });
        qMap.get(q.id).contexts.push({
          question: q,
          context: part.length > 80 ? part.slice(0, 80) + '…' : part,
          source: '詳解'
        });
      }
    });
  });
  const qEntries = [...qMap.values()].sort((a, b) => a.question.id - b.question.id);
  const hlWord = (text) => {
    const re = new RegExp(`(${wordKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<span class="word-highlight">$1</span>');
  };
  const srcColors = { '題目': '#4299e1', '選項': '#9f7aea', '詳解': '#48bb78' };
  return { entry, qEntries, hlWord, srcColors, wordIndex };
}

function renderWordTrace(wordKey) {
  const data = collectWordTraceData(wordKey);
  if (!data) return '';
  const { entry, qEntries, hlWord, srcColors, wordIndex } = data;

  // 統計
  const totalSpans = qEntries.reduce((sum, e) => sum + e.contexts.length, 0);
  const srcCounts = { '題目': 0, '選項': 0, '詳解': 0 };
  qEntries.forEach(e => e.contexts.forEach(c => { srcCounts[c.source] = (srcCounts[c.source] || 0) + 1; }));

  // 每題分配色彩索引
  const qColorMap = new Map();
  qEntries.forEach((e, i) => qColorMap.set(e.question.id, i));

  // 計算所有 contexts 的平均位置（用於排序顯示）
  const avgPositions = new Map();
  qEntries.forEach(e => {
    const positions = e.contexts.map(c => findWordPos(c.context, wordKey).left);
    avgPositions.set(e.question.id, positions.reduce((a, b) => a + b, 0) / positions.length);
  });

  // ── 2. Header ──
  const headerHtml = `
    <div class="jt-header">
      <div class="jt-header-left">
        <span class="jt-header-word">${entry.original}</span>
        <span class="jt-header-badge">${qEntries.length} Questions · ${totalSpans} Spans</span>
      </div>
      <button class="jt-header-close" onclick="clearBacklink()">✕</button>
    </div>`;

  // ── 3. Stats ──
  const statsHtml = `
    <div class="jt-stats">
      <div class="jt-stat">Services: <span class="jt-stat-val">${qEntries.length}</span></div>
      <div class="jt-stat">Depth: <span class="jt-stat-val">3</span></div>
      <div class="jt-stat">Total Spans: <span class="jt-stat-val">${totalSpans}</span></div>
      <div class="jt-stat">題目: <span class="jt-stat-val">${srcCounts['題目']}</span></div>
      <div class="jt-stat">選項: <span class="jt-stat-val">${srcCounts['選項']}</span></div>
      <div class="jt-stat">詳解: <span class="jt-stat-val">${srcCounts['詳解']}</span></div>
    </div>`;

  // ── 4. Legend ──
  const legendHtml = `
    <div class="jt-legend">
      ${qEntries.map((e, i) => `
        <div class="jt-legend-item">
          <div class="jt-legend-dot" style="background:${jtColor(i)}"></div>
          Q${e.question.id}
        </div>`).join('')}
      <div style="flex:1"></div>
      <div class="jt-legend-item"><div class="jt-legend-dot" style="background:${srcColors['題目']}"></div>題目</div>
      <div class="jt-legend-item"><div class="jt-legend-dot" style="background:${srcColors['選項']}"></div>選項</div>
      <div class="jt-legend-item"><div class="jt-legend-dot" style="background:${srcColors['詳解']}"></div>詳解</div>
    </div>`;

  // ── 5. Minimap (用句中相對位置) ──
  let minimapHtml = '<div class="jt-minimap">';
  qEntries.forEach((e, i) => {
    const range = findSpanRange(e.contexts, wordKey);
    minimapHtml += `<div class="jt-minimap-bar" style="left:${range.left}%;width:${Math.max(2, range.width)}%;background:${jtColor(i)};"></div>`;
  });
  minimapHtml += '</div>';

  // ── 6. Timeline Header (句中位置刻度) ──
  const posLabels = [
    { pct: 0, label: '句首 0%' },
    { pct: 25, label: '25%' },
    { pct: 50, label: '句中 50%' },
    { pct: 75, label: '75%' },
    { pct: 100, label: '句尾 100%' }
  ];
  let timelineHeaderHtml = `
    <div class="jt-timeline-header">
      <div class="jt-th-service">Service · Operation</div>
      <div class="jt-th-timeline">
        ${posLabels.map(t => `<div class="jt-th-tick" style="left:${t.pct}%">${t.label}</div>`).join('')}
      </div>
    </div>`;

  // ── 7. Span Rows ──
  const spanRowsHtml = buildJtSpanRowsHtml(qEntries, wordKey, hlWord, srcColors);

  // ── 8. Co-occurring Words (也用句中相對位置) ──
  const coWordMap = new Map();
  qEntries.forEach(({ question: q }) => {
    const allWords = new Set();
    extractGermanWords(q.question).forEach(w => allWords.add(w.toLowerCase()));
    q.options.forEach(opt => extractGermanWords(opt).forEach(w => allWords.add(w.toLowerCase())));
    allWords.forEach(w => {
      if (w === wordKey || w.length < 2) return;
      if (!coWordMap.has(w)) coWordMap.set(w, new Set());
      coWordMap.get(w).add(q.id);
    });
  });
  const coWords = [...coWordMap.entries()]
    .filter(([, qids]) => qids.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 15);

  let coWordsHtml = '';
  if (coWords.length > 0) {
    const coColors = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#10b981','#3b82f6','#ef4444','#84cc16','#06b6d4','#e879f9','#22d3ee','#fb923c','#a3e635','#2dd4bf'];
    const coWordRows = coWords.map(([cw, qids], ci) => {
      const cwColor = coColors[ci % coColors.length];
      const cwEntry = wordIndex.get(cw);
      const displayName = cwEntry ? cwEntry.original : cw;
      const sortedQids = [...qids].sort((a, b) => a - b);

      // 每個共現單字，用其在各題句子中的位置畫 span
      let trackHtml = '';
      const positions = [];
      sortedQids.forEach(qid => {
        const q = questions.find(qq => qq.id === qid);
        if (!q) return;
        const pos = findWordPos(q.question, cw);
        positions.push(pos);
        trackHtml += `<div class="jt-cw-span" style="left:${pos.left}%;width:${Math.max(2, pos.width)}%;background:${cwColor};"
          title="Q${qid}: 位置 ${Math.round(pos.left)}%" onclick="event.stopPropagation();clickWord('${displayName.replace(/'/g, "\\'")}')"></div>`;
      });
      // 連線
      if (positions.length >= 2) {
        const minL = Math.min(...positions.map(p => p.left));
        const maxR = Math.max(...positions.map(p => p.left + p.width));
        trackHtml += `<div class="jt-cw-connector" style="left:${minL}%;width:${maxR - minL}%;background:${cwColor};"></div>`;
      }

      return `<div class="jt-cw-row">
        <div class="jt-cw-label">
          <span class="jt-cw-name" onclick="clickWord('${displayName.replace(/'/g, "\\'")}')">${displayName}</span>
          <span class="jt-cw-cnt">${qids.size}</span>
        </div>
        <div class="jt-cw-track">${trackHtml}</div>
      </div>`;
    }).join('');

    coWordsHtml = `
      <div class="jt-cowords-section">
        <div class="jt-cowords-header">🔗 Co-occurring Words <span>同時出現在含有「${entry.original}」的題目中的其他單字</span></div>
        ${coWordRows}
      </div>`;
  }

  return `
    <div class="jaeger-trace">
      ${headerHtml}
      ${statsHtml}
      ${legendHtml}
      ${minimapHtml}
      ${timelineHeaderHtml}
      <div id="jtSpanRows">${spanRowsHtml}</div>
      ${coWordsHtml}
    </div>`;
}

// ── Jaeger Span Detail Panel (parent/source level) ──
function renderJtDetail(q, idx, contexts, wordKey, hlWord, color, label, spanKey) {
  const curTab = jtDetailTabMap.get(spanKey) || 'tags';
  const tagsActive = curTab === 'tags' ? 'active' : '';
  const ctxActive = curTab === 'context' ? 'active' : '';

  // 計算位置資訊
  const posInfo = contexts.map(c => {
    const p = findWordPos(c.context, wordKey);
    return { source: c.source, left: Math.round(p.left), context: c.context };
  });
  const posRange = findSpanRange(contexts, wordKey);

  let bodyHtml = '';
  if (curTab === 'tags') {
    bodyHtml = `<table class="jt-tag-table">
      <tr><td class="jt-tag-key">question.id</td><td class="jt-tag-val"><a onclick="goToPageFromBacklink(${idx})">Q${q.id} (點擊跳轉)</a></td></tr>
      <tr><td class="jt-tag-key">category</td><td class="jt-tag-val">${q.category || '—'}</td></tr>
      <tr><td class="jt-tag-key">word</td><td class="jt-tag-val" style="font-weight:700;color:#c05621;">${wordKey}</td></tr>
      <tr><td class="jt-tag-key">position</td><td class="jt-tag-val">${Math.round(posRange.left)}% ~ ${Math.round(posRange.left + posRange.width)}%（句中相對位置）</td></tr>
      <tr><td class="jt-tag-key">spans</td><td class="jt-tag-val">${contexts.length}</td></tr>
      <tr><td class="jt-tag-key">sources</td><td class="jt-tag-val">${[...new Set(contexts.map(c => c.source))].join(', ')}</td></tr>
      <tr><td class="jt-tag-key">correct_answer</td><td class="jt-tag-val">${q.options[q.correctIndex]}</td></tr>
      <tr><td class="jt-tag-key">question</td><td class="jt-tag-val">${hlWord(q.question)}</td></tr>
      ${posInfo.map(p => `<tr><td class="jt-tag-key">${p.source} pos</td><td class="jt-tag-val">${p.left}%</td></tr>`).join('')}
    </table>`;
  } else {
    bodyHtml = contexts.map(c => `
      <div class="jt-context-block">
        <div style="font-size:0.65rem;color:#a0aec0;margin-bottom:4px;">source: ${c.source}</div>
        ${hlWord(c.context)}
      </div>
    `).join('');
  }

  return `<div class="jt-detail" data-spankey="${spanKey}" onclick="event.stopPropagation()">
    <div class="jt-detail-inner">
      <div class="jt-detail-sidebar">
        <div style="font-size:0.7rem;color:#276749;font-weight:600;margin-bottom:6px;">Process</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <div style="width:10px;height:10px;border-radius:2px;background:${color};"></div>
          <span style="font-size:0.78rem;font-weight:600;color:#2d3748;">Q${q.id}</span>
        </div>
        <div style="font-size:0.68rem;color:#718096;line-height:1.5;">
          ${q.category ? q.category + '<br>' : ''}
          ${q.options.length} options<br>
          ${q.expParts.length} explanation parts
        </div>
      </div>
      <div class="jt-detail-main">
        <div class="jt-detail-tabs">
          <button class="jt-detail-tab ${tagsActive}" onclick="event.stopPropagation();switchJtTab('${spanKey}','tags')">Tags</button>
          <button class="jt-detail-tab ${ctxActive}" onclick="event.stopPropagation();switchJtTab('${spanKey}','context')">Context</button>
        </div>
        <div class="jt-detail-body">${bodyHtml}</div>
      </div>
    </div>
  </div>`;
}

// ── Jaeger Leaf Span Detail (individual context) ──
function renderJtLeafDetail(q, idx, ctx, wordKey, hlWord, color) {
  const leafPos = findWordPos(ctx.context, wordKey);
  return `<div class="jt-detail" onclick="event.stopPropagation()">
    <div class="jt-detail-inner">
      <div class="jt-detail-sidebar">
        <div style="font-size:0.7rem;color:#276749;font-weight:600;margin-bottom:4px;">Span Info</div>
        <div style="font-size:0.68rem;color:#718096;line-height:1.5;">
          Q${q.id} · ${ctx.source}<br>
          位置: ${Math.round(leafPos.left)}%<br>
          <a style="color:#3182ce;cursor:pointer;text-decoration:underline;" onclick="goToPageFromBacklink(${idx})">跳到此題 →</a>
        </div>
      </div>
      <div class="jt-detail-main">
        <table class="jt-tag-table">
          <tr><td class="jt-tag-key">source</td><td class="jt-tag-val">${ctx.source}</td></tr>
          <tr><td class="jt-tag-key">word</td><td class="jt-tag-val" style="font-weight:700;color:#c05621;">${wordKey}</td></tr>
          <tr><td class="jt-tag-key">position</td><td class="jt-tag-val">${Math.round(leafPos.left)}%（第 ${Math.round(leafPos.left / 100 * ctx.context.length)} 字 / 共 ${ctx.context.length} 字）</td></tr>
          <tr><td class="jt-tag-key">context</td><td class="jt-tag-val">${hlWord(ctx.context)}</td></tr>
        </table>
      </div>
    </div>
  </div>`;
}

// ==================== 選項索引（全選項反向連結）====================
let activeOptionKey = null;

// ── 快取選項索引 ──
let _optionIndexCache = null;
let _optionIndexQLen = -1;
function buildOptionIndex() {
  if (_optionIndexCache && _optionIndexQLen === questions.length) return _optionIndexCache;
  const map = new Map();
  questions.forEach(q => {
    q.options.forEach((opt, i) => {
      if (!map.has(opt)) map.set(opt, []);
      map.get(opt).push({ question: q, isCorrect: i === q.correctIndex });
    });
  });
  _optionIndexCache = map;
  _optionIndexQLen = questions.length;
  return map;
}

function renderOptionIndex() {
  const folder = document.getElementById('optionIndexFolder');
  if (!folder) return;
  const indexMap = buildOptionIndex();
  // 依反向連結數由大到小排序，同數量再按字母排序
  const entries = [...indexMap.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0], 'de');
  });
  const MAX_SHOW = 200;
  const limited = entries.slice(0, MAX_SHOW);
  folder.innerHTML = limited.map(([optText, items]) => {
    const isActive = activeOptionKey === optText;
    return `<div class="option-index-item ${isActive ? 'active-option' : ''}" onclick="selectOptionIndex('${optText.replace(/'/g, "\\'")}')">
      <span class="oi-icon">📌</span>
      <span class="oi-text">${optText}</span>
      <span class="oi-badge">${items.length}</span>
    </div>`;
  }).join('');
}

function selectOptionIndex(optText) {
  const wasDashboard = isDashboardVisible();
  if (wasDashboard) pushNavState();
  if (activeOptionKey === optText) {
    activeOptionKey = null;
  } else {
    activeOptionKey = optText;
    activeAnswerKey = null; activeExpKey = null; activeWordKey = null;
  }
  if (wasDashboard) { renderAll(); updateNavButtons(); } else { rerenderBacklinkOnly(); }
  if (window.innerWidth <= 768) toggleSidebar();
}

// ==================== 詳解索引（反向連結）====================
let activeExpKey = null; // 格式: "qid-partIndex"

// ── 快取詳解索引 ──
let _expIndexCache = null;
let _expIndexQLen = -1;
function buildExpIndex() {
  if (_expIndexCache && _expIndexQLen === questions.length) return _expIndexCache;
  const items = [];
  questions.forEach(q => {
    q.expParts.forEach((part, i) => {
      items.push({ key: `${q.id}-${i}`, text: part, questionId: q.id, question: q });
    });
  });
  _expIndexCache = items;
  _expIndexQLen = questions.length;
  return items;
}

function renderExpIndex() {
  const folder = document.getElementById('expIndexFolder');
  if (!folder) return;
  // ⚡ 只渲染當前分類的詳解，而非全部（原本會產生 ~27,000 個 DOM 節點）
  const currentCat = (viewMode === 'single' && questions.length > 0) ? (questions[currentPage]?.category || '') : '';
  const items = buildExpIndex();
  const filtered = currentCat ? items.filter(it => it.question.category === currentCat) : items.slice(0, 200);
  folder.innerHTML = filtered.map(item => {
    const isActive = activeExpKey === item.key;
    const preview = item.text.length > 40 ? item.text.slice(0, 40) + '…' : item.text;
    return `<div class="exp-index-item ${isActive ? 'active-exp' : ''}" onclick="selectExpIndex('${item.key}')">
      <span class="ei-icon">📝</span>
      <span class="ei-text">${preview}</span>
      <span class="ei-qnum">Q${item.questionId}</span>
    </div>`;
  }).join('');
}

function selectExpIndex(key) {
  if (activeExpKey === key) {
    activeExpKey = null;
  } else {
    activeExpKey = key;
    activeAnswerKey = null; activeOptionKey = null; activeWordKey = null;
    // 自動跳到對應題目
    const [qid] = key.split('-').map(Number);
    const idx = questions.findIndex(q => q.id === qid);
    if (idx >= 0) currentPage = idx;
  }
  renderAll();
  if (window.innerWidth <= 768) toggleSidebar();
}

// ==================== 德文單字索引（反向連結）====================
let activeWordKey = null;

// 提取拉丁字母單字（含 ä ö ü ß），至少 2 字元
const GERMAN_WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿß]+/g;
// 常見停用詞：極基本功能詞（不會成為考點的）
const STOP_WORDS = new Set([]);

function extractGermanWords(text) {
  const matches = text.match(GERMAN_WORD_RE) || [];
  return matches.filter(w => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
}

// ── 快取單字索引（最耗效能的運算） ──
let _wordIndexCache = null;
let _wordIndexQLen = -1;
let _wordIndexSorted = null;
function buildWordIndex() {
  if (_wordIndexCache && _wordIndexQLen === questions.length) return _wordIndexCache;
  const map = new Map();
  questions.forEach(q => {
    const qWords = extractGermanWords(q.question);
    const seenInQ = new Set();
    qWords.forEach(w => {
      const key = w.toLowerCase();
      if (seenInQ.has(key)) return;
      seenInQ.add(key);
      if (!map.has(key)) map.set(key, { original: w, sources: [] });
      const entry = map.get(key);
      if (w[0] === w[0].toUpperCase() && w.length >= entry.original.length) entry.original = w;
      entry.sources.push({ question: q, context: q.question, source: '題目' });
    });
    q.options.forEach((opt, oi) => {
      const oWords = extractGermanWords(opt);
      const seenInOpt = new Set();
      oWords.forEach(w => {
        const key = w.toLowerCase();
        if (seenInOpt.has(key)) return;
        seenInOpt.add(key);
        if (!map.has(key)) map.set(key, { original: w, sources: [] });
        const entry = map.get(key);
        if (w.length > entry.original.length || (w[0] === w[0].toUpperCase() && w.length >= entry.original.length)) entry.original = w;
        entry.sources.push({ question: q, context: `(${q.labels[oi]}) ${opt}`, source: '選項' });
      });
    });
  });
  _wordIndexCache = map;
  _wordIndexQLen = questions.length;
  _wordIndexSorted = null; // 清除排序快取
  return map;
}

function getSortedWordEntries() {
  if (_wordIndexSorted) return _wordIndexSorted;
  const indexMap = buildWordIndex();
  _wordIndexSorted = [...indexMap.entries()].sort((a, b) => {
    const aQids = new Set(a[1].sources.map(s => s.question.id));
    const bQids = new Set(b[1].sources.map(s => s.question.id));
    if (bQids.size !== aQids.size) return bQids.size - aQids.size;
    return a[0].localeCompare(b[0], 'de');
  });
  return _wordIndexSorted;
}

function renderWordIndex() {
  const folder = document.getElementById('wordIndexFolder');
  if (!folder) return;
  const entries = getSortedWordEntries();

  // ⚡ 限制 DOM 數量，只顯示前 300 個
  const MAX_SHOW = 300;
  const multi = entries.filter(([,v]) => new Set(v.sources.map(s => s.question.id)).size > 1);
  const single = entries.filter(([,v]) => new Set(v.sources.map(s => s.question.id)).size === 1);
  const multiLimited = multi.slice(0, MAX_SHOW);
  const singleLimited = single.slice(0, Math.max(0, MAX_SHOW - multiLimited.length));

  let html = '';
  if (multi.length > 0) {
    html += `<div class="word-index-section-label">🔥 跨題共用 (${multi.length}${multi.length > MAX_SHOW ? '，顯示前'+MAX_SHOW : ''})</div>`;
    html += multiLimited.map(([key, val]) => {
      const qCount = new Set(val.sources.map(s => s.question.id)).size;
      const isActive = activeWordKey === key;
      return `<div class="word-index-item ${isActive ? 'active-word' : ''}" onclick="selectWordIndex('${key.replace(/'/g, "\\'")}')">
        <span class="wi-icon">🔤</span>
        <span class="wi-text">${val.original}</span>
        <span class="wi-badge">${qCount}題</span>
      </div>`;
    }).join('');
  }
  if (single.length > 0) {
    html += `<div class="word-index-section-label">📝 單題出現 (${single.length}${single.length > singleLimited.length ? '，顯示前'+singleLimited.length : ''})</div>`;
    html += singleLimited.map(([key, val]) => {
      const isActive = activeWordKey === key;
      return `<div class="word-index-item ${isActive ? 'active-word' : ''}" onclick="selectWordIndex('${key.replace(/'/g, "\\'")}')">
        <span class="wi-icon" style="opacity:0.4">·</span>
        <span class="wi-text">${val.original}</span>
        <span class="wi-badge">1</span>
      </div>`;
    }).join('');
  }
  folder.innerHTML = html;
}

function selectWordIndex(key) {
  const wasDashboard = isDashboardVisible();
  if (wasDashboard) pushNavState();
  if (activeWordKey === key) {
    activeWordKey = null;
  } else {
    activeWordKey = key;
    activeAnswerKey = null; activeOptionKey = null; activeExpKey = null;
  }
  if (wasDashboard) { renderAll(); updateNavButtons(); } else { rerenderBacklinkOnly(); }
  if (window.innerWidth <= 768) toggleSidebar();
}

// 點擊卡片中的單字觸發反向連結
function clickWord(word) {
  const key = word.toLowerCase();
  if (key.length < 1) return;
  const wasDashboard = isDashboardVisible();
  if (wasDashboard) pushNavState(); // 離開 Dashboard 前記錄狀態
  if (activeWordKey === key) {
    activeWordKey = null;
  } else {
    activeWordKey = key;
    activeAnswerKey = null; activeOptionKey = null; activeExpKey = null;
  }
  if (wasDashboard) { renderAll(); updateNavButtons(); } else { rerenderBacklinkOnly(); }
}

// 把文字中的德文單字變成可點擊連結（用於 Dashboard 等處）
// 在 Dashboard 中使用 inline trace（不離開頁面）
function makeClickableText(text) {
  return text.replace(GERMAN_WORD_RE, (match) => {
    if (match.length < 2 || STOP_WORDS.has(match.toLowerCase()) || match === '______') return match;
    const isActive = activeWordKey === match.toLowerCase();
    return `<span class="clickable-word${isActive ? ' word-active' : ''}" onclick="event.stopPropagation();toggleInlineTrace('${match.replace(/'/g, "\\'")}', this)">${match}</span>`;
  });
}

// 在 Dashboard 中內嵌 Word Trace（出現在被點擊文字的父容器下方）
let inlineTraceWord = null; // 當前展開的 inline trace word key

function toggleInlineTrace(word, el) {
  const key = word.toLowerCase();
  if (key.length < 1) return;

  // 移除任何已有的 inline trace
  document.querySelectorAll('.inline-word-trace').forEach(e => e.remove());

  // 如果點擊的是同一個字，就收合
  if (inlineTraceWord === key) {
    inlineTraceWord = null;
    // 清除 active 狀態
    document.querySelectorAll('.clickable-word.word-active').forEach(e => e.classList.remove('word-active'));
    return;
  }

  inlineTraceWord = key;

  // 更新所有同單字的 active 狀態
  document.querySelectorAll('.clickable-word.word-active').forEach(e => e.classList.remove('word-active'));
  document.querySelectorAll('.clickable-word').forEach(e => {
    if (e.textContent.toLowerCase() === key) e.classList.add('word-active');
  });

  // 找到最近的容器行（option row / part row / rank row / group header）
  const parentRow = el.closest('.iwt-row') || el.closest('.mastery-rank-row') || el.closest('.chip-mastery-group-header') || el.parentElement;
  if (!parentRow) return;

  // 建立 inline trace HTML
  const html = renderInlineWordTrace(key);
  if (!html) return;

  const traceDiv = document.createElement('div');
  traceDiv.className = 'inline-word-trace';
  traceDiv.innerHTML = html;
  traceDiv.onclick = (e) => e.stopPropagation(); // 防止冒泡

  // 插入到父容器之後
  parentRow.insertAdjacentElement('afterend', traceDiv);

  // 滾動到可見區域
  setTimeout(() => traceDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function renderInlineWordTrace(wordKey) {
  const wordIndex = buildWordIndex();
  const entry = wordIndex.get(wordKey);
  if (!entry || entry.sources.length === 0) return '';

  // 收集所有出處
  const qMap = new Map();
  entry.sources.forEach(s => {
    if (!qMap.has(s.question.id)) qMap.set(s.question.id, { question: s.question, contexts: [] });
    qMap.get(s.question.id).contexts.push(s);
  });
  // 也搜尋詳解
  questions.forEach(q => {
    q.expParts.forEach(part => {
      if (part.toLowerCase().includes(wordKey)) {
        if (!qMap.has(q.id)) qMap.set(q.id, { question: q, contexts: [] });
        qMap.get(q.id).contexts.push({
          question: q,
          context: part.length > 60 ? part.slice(0, 60) + '…' : part,
          source: '詳解'
        });
      }
    });
  });

  const qEntries = [...qMap.values()].sort((a, b) => a.question.id - b.question.id);
  if (qEntries.length === 0) return '';

  // 高亮
  const hlWord = (text) => {
    const re = new RegExp(`(${wordKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<span class="word-highlight">$1</span>');
  };

  const totalSpans = qEntries.reduce((sum, e) => sum + e.contexts.length, 0);

  // 只顯示前 8 筆，多餘的可展開完整 trace
  const MAX_ITEMS = 8;
  let allItems = [];
  qEntries.forEach(e => {
    const idx = questions.indexOf(e.question);
    e.contexts.forEach(c => {
      const srcCls = c.source === '題目' ? 'src-q' : c.source === '選項' ? 'src-o' : 'src-e';
      const srcLabel = c.source === '題目' ? '題' : c.source === '選項' ? '選' : '解';
      const ctxText = c.context.length > 55 ? c.context.slice(0, 55) + '…' : c.context;
      allItems.push(`<div class="iwt-item">
        <span class="iwt-qid" onclick="goToPageFromBacklink(${idx})">Q${e.question.id}</span>
        <span class="iwt-src ${srcCls}">${srcLabel}</span>
        <span class="iwt-ctx">${hlWord(ctxText)}</span>
      </div>`);
    });
  });

  const visibleItems = allItems.slice(0, MAX_ITEMS).join('');
  const hasMore = allItems.length > MAX_ITEMS;

  const expandBtn = hasMore
    ? `<div class="iwt-expand" onclick="event.stopPropagation();clickWord('${entry.original.replace(/'/g, "\\'")}')">🔍 查看完整 Trace（共 ${totalSpans} 筆出處）→</div>`
    : `<div class="iwt-expand" onclick="event.stopPropagation();clickWord('${entry.original.replace(/'/g, "\\'")}')">🔍 開啟完整 Word Trace →</div>`;

  return `
    <div class="iwt-header">
      <div class="iwt-header-left">
        <span class="iwt-word">${entry.original}</span>
        <span class="iwt-badge">${qEntries.length} 題 · ${totalSpans} 出處</span>
      </div>
      <button class="iwt-close" onclick="event.stopPropagation();toggleInlineTrace('${entry.original.replace(/'/g, "\\'")}', this)">✕</button>
    </div>
    <div class="iwt-body">${visibleItems}</div>
    ${expandBtn}`;
}

// ==================== Quiz 模式 ====================
function startQuiz(suppressPush) {
  if (questions.length === 0) return;
  if (!suppressPush) pushNavState();
  viewMode = 'quiz';
  quizAttempts.clear();
  // 隨機選 4 題（或全部，若不足 4 題）
  const indices = questions.map((_, i) => i);
  shuffle(indices);
  quizIndices = indices.slice(0, Math.min(4, questions.length));
  // 清除 quiz 題目相關的已放入詳解（重新開始）
  quizIndices.forEach(i => {
    const q = questions[i];
    if (q) {
      expPlacedMap.delete(q.id);
      expCompletedSet.delete(q.id);
      orderCheckResults.delete(q.id);
      solvedSet.delete(q.id);
    }
  });
  // 清除反向連結狀態
  activeAnswerKey = null; activeOptionKey = null; activeExpKey = null; activeWordKey = null;
  jtExpandedSpans.clear(); jtDetailTabMap.clear(); jtDetailKey = null;
  document.getElementById('completionArea').innerHTML = '';
  renderAll();
  // 捲到頂部
  const poolScroller = document.getElementById('quizPoolScroller');
  if (poolScroller) poolScroller.scrollTo(0, 0);
  updateBackButton();
  if (window.innerWidth <= 768) toggleSidebar();
}

function switchToSingle(idx) {
  viewMode = 'single';
  currentPage = idx;
  activeAnswerKey = null; activeOptionKey = null; activeExpKey = null; activeWordKey = null;
  jtExpandedSpans.clear(); jtDetailTabMap.clear(); jtDetailKey = null;
  renderAll();
  document.getElementById('mainContent').scrollTo(0, 0);
}

// ==================== 分頁導航（Facemash 掌握度排序）====================
function goPage(delta) {
  viewMode = 'single';
  if (questions.length === 0) return;
  // 按掌握度排序：左（◀）→ 較不熟 / 右（▶）→ 較熟
  const sorted = getMasterySortedIndices();
  const curSortedPos = sorted.indexOf(currentPage);
  const newSortedPos = Math.max(0, Math.min(sorted.length - 1, curSortedPos + delta));
  currentPage = sorted[newSortedPos];
  renderAll();
  document.getElementById('mainContent').scrollTo(0, 0);
}

function updateNav() {
  const navRow = document.querySelector('.nav-row');
  if (viewMode === 'quiz') {
    navRow.classList.add('quiz-hidden');
    return;
  }
  navRow.classList.remove('quiz-hidden');
  if (questions.length === 0) {
    document.getElementById('navIndicator').textContent = '0 / 0';
    document.getElementById('prevBtn').classList.add('disabled');
    document.getElementById('nextBtn').classList.add('disabled');
    return;
  }

  const sorted = getMasterySortedIndices();
  const curSortedPos = sorted.indexOf(currentPage);
  const q = questions[currentPage];
  const score = getMasteryScore(q.id);
  const stats = getQStats(q.id);

  // 導航指示：顯示排名 + 掌握度
  let masteryLabel = '';
  if (stats.rounds === 0) masteryLabel = '🆕 未作答';
  else if (score >= 80) masteryLabel = `🟢 ${score}%`;
  else if (score >= 40) masteryLabel = `🟡 ${score}%`;
  else masteryLabel = `🔴 ${score}%`;

  document.getElementById('navIndicator').innerHTML =
    `<div style="line-height:1.3">
      <div>${curSortedPos + 1} / ${questions.length}</div>
      <div style="font-size:0.68rem;color:#999;">◀ 較不熟 ┃ ${masteryLabel} ┃ 較熟 ▶</div>
    </div>`;
  document.getElementById('prevBtn').classList.toggle('disabled', curSortedPos === 0);
  document.getElementById('nextBtn').classList.toggle('disabled', curSortedPos === sorted.length - 1);
}

// ==================== 渲染：大卡片 ====================

// 產生單張題目卡片 HTML
function buildCardHtml(q) {
  const isSolved = solvedSet.has(q.id);
  const placedArr = getExpPlaced(q.id);
  const expDone = expCompletedSet.has(q.id);
  const totalParts = q.expParts.length;
  const filledCount = placedArr.length;
  const emptyCount = totalParts - filledCount;

  let expZoneHtml = '';
  if (isSolved) {
    const checkResult = orderCheckResults.get(q.id);
    const filledHtml = placedArr.map((chipId, arrIdx) => {
      const chip = expChips.find(c => c.chipId === chipId);
      if (!chip) return '';
      const displayText = chip.text;
      let orderClass = '';
      if (checkResult) orderClass = checkResult.wrongIndices.includes(arrIdx) ? 'order-wrong' : 'order-right';
      return `<div class="exp-slot filled ${orderClass}" data-chip-id="${chipId}" data-reorder-qid="${q.id}" data-arr-idx="${arrIdx}">${displayText}<button class="exp-slot-remove" onclick="event.stopPropagation();removeExpChip(${q.id},'${chipId}')" title="退回詳解池">✕</button></div>`;
    }).join('');
    let emptyHtml = '';
    for (let i = 0; i < emptyCount; i++) {
      emptyHtml += `<div class="exp-slot"><span style="opacity:0.3">⬜ 拖入詳解</span></div>`;
    }
    let orderHtml = '';
    if (expDone) {
      orderHtml = `<button class="check-order-btn" onclick="checkExpOrder(${q.id})">🔍 檢查排序是否正確</button>`;
      if (checkResult) {
        if (checkResult.correct) {
          orderHtml += `<div class="order-result correct">🏆 排序完全正確！與原始詳解順序一致</div>`;
        } else {
          const wrongCount = checkResult.wrongIndices.length;
          orderHtml += `<div class="order-result incorrect">🔄 有 ${wrongCount}/${placedArr.length} 張位置不同，紅色邊線代表位置不對，可嘗試重新排序</div>`;
        }
      }
    }
    const isOrderPerfect = checkResult && checkResult.correct;
    expZoneHtml = `
      <div class="exp-zone ${expDone ? 'completed' : ''} ${isOrderPerfect ? 'order-perfect' : ''}" data-qid="${q.id}">
        <div class="exp-zone-label">📖 詳解區 (${filledCount}/${totalParts})</div>
        ${filledHtml}${emptyHtml}
        ${orderHtml}
      </div>`;
  }

  const clickableQuestion = q.question.replace(GERMAN_WORD_RE, (match) => {
    if (match.length < 2 || STOP_WORDS.has(match.toLowerCase()) || match === '______') return match;
    const isActive = activeWordKey === match.toLowerCase();
    return `<span class="clickable-word${isActive ? ' word-active' : ''}" onclick="clickWord('${match.replace(/'/g, "\\'")}')">${match}</span>`;
  });

  // 掌握度指標（單卡模式顯示）
  const stats = getQStats(q.id);
  const score = getMasteryScore(q.id);
  let masteryBadge = '';
  if (stats.rounds > 0) {
    const mCls = score >= 80 ? 'mastery-badge-high' : score >= 40 ? 'mastery-badge-mid' : 'mastery-badge-low';
    const mDetail = `作答 ${stats.rounds} 輪・一次正確 ${stats.firstTry} 次`;
    masteryBadge = `<span class="mastery-badge ${mCls}" title="${mDetail}">掌握 ${score}%</span>`;
  } else {
    masteryBadge = `<span class="mastery-badge mastery-badge-new" title="尚未作答過">🆕 新題</span>`;
  }

  return `
    <div class="question-card ${isSolved ? 'solved' : ''}" data-qid="${q.id}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;flex-wrap:wrap;">
        <span class="q-number">第 ${q.id} 題</span>
        ${q.category ? `<span style="font-size:0.7rem;color:#999;background:#f0f4f1;padding:2px 8px;border-radius:6px;">${q.category}</span>` : ''}
        ${masteryBadge}
      </div>
      <div class="q-text">${clickableQuestion}</div>
      <div class="q-chinese-toggle" onclick="toggleCh(this, ${q.id})">
        <span class="arrow">▶</span> 中文翻譯
      </div>
      <div class="q-chinese" id="ch-${q.id}">${q.chinese}</div>
      <div class="q-drop-zone" id="dz-${q.id}">
        ${isSolved ? `✅ (${q.labels[q.correctIndex]}) ${q.options[q.correctIndex]}` : '將答案拖到這裡'}
      </div>
      ${expZoneHtml}
    </div>`;
}

function buildQuizCardHtml(q) {
  const isSolved = solvedSet.has(q.id);
  const placedArr = getExpPlaced(q.id);
  const totalParts = q.expParts.length;
  const filledCount = placedArr.length;
  const isExpDone = expCompletedSet.has(q.id);

  // Quiz 模式的精簡詳解區：不需要先答對就能放入詳解
  const lastChipId = placedArr.length > 0 ? placedArr[placedArr.length - 1] : null;
  const lastChip = lastChipId ? expChips.find(c => c.chipId === lastChipId) : null;
  const cls = isExpDone ? 'quiz-exp-mini exp-done' : (filledCount > 0 ? 'quiz-exp-mini has-items' : 'quiz-exp-mini');
  const expMiniHtml = `
    <div class="${cls}" data-qid="${q.id}" data-accept-exp="true">
      <div class="quiz-exp-mini-label">${isExpDone ? '✅' : '📖'} 詳解 ${filledCount}/${totalParts}</div>
      ${lastChip ? `<div class="quiz-exp-mini-latest">${lastChip.text}</div>` : `<div class="quiz-exp-mini-latest" style="opacity:0.4">拖入詳解卡片</div>`}
    </div>`;

  const clickableQuestion = q.question.replace(GERMAN_WORD_RE, (match) => {
    if (match.length < 2 || STOP_WORDS.has(match.toLowerCase()) || match === '______') return match;
    const isActive = activeWordKey === match.toLowerCase();
    return `<span class="clickable-word${isActive ? ' word-active' : ''}" onclick="clickWord('${match.replace(/'/g, "\\'")}')">${match}</span>`;
  });

  return `
    <div class="question-card ${isSolved ? 'solved' : ''}" data-qid="${q.id}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
        <span class="q-number">第 ${q.id} 題</span>
        ${q.category ? `<span style="font-size:0.65rem;color:#999;background:#f0f4f1;padding:1px 6px;border-radius:5px;">${q.category}</span>` : ''}
      </div>
      <div class="q-text">${clickableQuestion}</div>
      <div class="q-chinese-toggle" onclick="toggleCh(this, ${q.id})">
        <span class="arrow">▶</span> 中文
      </div>
      <div class="q-chinese" id="ch-${q.id}">${q.chinese}</div>
      <div class="q-drop-zone" id="dz-${q.id}">
        ${isSolved ? `✅ (${q.labels[q.correctIndex]}) ${q.options[q.correctIndex]}` : '將答案拖到這裡'}
      </div>
      ${expMiniHtml}
    </div>`;
}

function renderCard() {
  if (questions.length === 0) {
    document.getElementById('cardArea').innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:#bbb;">
        <div style="font-size:3rem; margin-bottom:12px;">📭</div>
        <div style="font-size:1rem;">題庫是空的</div>
        <div style="font-size:0.85rem; margin-top:6px;">請從 Google Sheet 同步題目</div>
      </div>`;
    return;
  }

  if (viewMode === 'quiz') {
    // Quiz 模式：橫排
    const quizQs = quizIndices.map(i => questions[i]).filter(Boolean);
    if (quizQs.length === 0) { startQuiz(); return; }
    const cardsHtml = quizQs.map(q => buildQuizCardHtml(q)).join('');
    document.getElementById('cardArea').innerHTML = `<div class="quiz-row">${cardsHtml}</div>`;
  } else {
    // Single 模式：單張卡片 + 導航
    document.getElementById('cardArea').innerHTML = buildCardHtml(questions[currentPage]);
  }
}

function bindReorderEvents() {
  document.querySelectorAll('.exp-slot.filled[data-chip-id]').forEach(el => {
    el.addEventListener('pointerdown', onReorderStart);
  });
}

// ==================== 渲染：答案池 ====================
function getActiveQuestions() {
  if (viewMode === 'quiz') return quizIndices.map(i => questions[i]).filter(Boolean);
  return questions.length > 0 ? [questions[currentPage]] : [];
}

function renderAnswerPool() {
  const pool = document.getElementById('answerPool');
  const divider = document.getElementById('answerDivider');
  if (questions.length === 0) {
    pool.innerHTML = ''; divider.classList.add('section-hidden');
    return;
  }
  const activeQs = getActiveQuestions();
  const activeQids = new Set(activeQs.map(q => q.id));
  const allSolved = activeQs.every(q => solvedSet.has(q.id));

  if (allSolved) {
    divider.classList.add('section-hidden');
    pool.classList.add('section-hidden');
    return;
  }

  divider.classList.remove('section-hidden');
  pool.classList.remove('section-hidden');

  if (viewMode === 'quiz') {
    divider.textContent = '⬇ 選項卡池 · 拖動到題目卡 ⬇';
  } else {
    divider.textContent = '⬇ 拖動答案到題目 · 點擊可反向查詢 ⬇';
  }

  const currentChips = getChipsForQids(_answerChipsByQid, activeQids);
  pool.innerHTML = currentChips.map(chip => {
    // quiz 模式：已解答的題目的所有選項都標為 placed
    const isPlaced = viewMode === 'quiz'
      ? solvedSet.has(chip.questionId)
      : (solvedSet.has(chip.questionId) && chip.isCorrect);
    return `<div class="answer-chip ${isPlaced ? 'placed' : ''}"
                 data-chip-id="${chip.chipId}" data-drag-type="answer">
              (${chip.label}) ${chip.text}
            </div>`;
  }).join('');
  pool.querySelectorAll('.answer-chip:not(.placed)').forEach(el => {
    el.addEventListener('pointerdown', onDragStart);
  });
}

// ==================== 渲染：詳解池 ====================
function renderExpPool() {
  const divider = document.getElementById('expDivider');
  const pool = document.getElementById('expPool');
  if (questions.length === 0) {
    pool.innerHTML = ''; divider.classList.add('section-hidden');
    return;
  }
  const activeQs = getActiveQuestions();
  const activeQids = new Set(activeQs.map(q => q.id));

  if (viewMode === 'quiz') {
    // Quiz 模式：所有題的詳解都同時顯示（不需先答對）
    divider.classList.remove('section-hidden');
    pool.classList.remove('section-hidden');
    divider.textContent = '⬇ 詳解卡池 · 拖入已答對的題目卡 ⬇';

    const currentExpChips = getChipsForQids(_expChipsByQid, activeQids);
    // 隱藏已放入的
    pool.innerHTML = currentExpChips.map(chip => {
      const placedArr = getExpPlaced(chip.questionId);
      const isPlaced = placedArr.includes(chip.chipId);
      return `<div class="exp-chip ${isPlaced ? 'placed' : ''}"
                   data-chip-id="${chip.chipId}" data-drag-type="explanation">
                ${chip.text}
              </div>`;
    }).join('');

    // 如果全部都放完了就隱藏
    const allExpDone = activeQs.every(q => expCompletedSet.has(q.id));
    if (allExpDone) {
      divider.classList.add('section-hidden');
      pool.classList.add('section-hidden');
    }

    pool.querySelectorAll('.exp-chip:not(.placed)').forEach(el => {
      el.addEventListener('pointerdown', onDragStart);
    });
    return;
  }

  // Single 模式：只顯示已答對但詳解未完成的題目
  const needExpQids = activeQs.filter(q => solvedSet.has(q.id) && !expCompletedSet.has(q.id)).map(q => q.id);

  if (needExpQids.length === 0) {
    divider.classList.add('section-hidden');
    pool.classList.add('section-hidden');
    return;
  }

  divider.classList.remove('section-hidden');
  pool.classList.remove('section-hidden');
  divider.textContent = '⬇ 拖動詳解到已答對的題目 ⬇';

  const currentExpChips = getChipsForQids(_expChipsByQid, new Set(needExpQids));
  pool.innerHTML = currentExpChips.map(chip => {
    const placedArr = getExpPlaced(chip.questionId);
    const isPlaced = placedArr.includes(chip.chipId);
    return `<div class="exp-chip ${isPlaced ? 'placed' : ''}"
                 data-chip-id="${chip.chipId}" data-drag-type="explanation">
              ${chip.text}
            </div>`;
  }).join('');

  pool.querySelectorAll('.exp-chip:not(.placed)').forEach(el => {
    el.addEventListener('pointerdown', onDragStart);
  });
}

// ==================== 中文翻譯 ====================
function toggleCh(btn, qid) {
  btn.classList.toggle('open');
  document.getElementById(`ch-${qid}`).classList.toggle('show');
}

// ==================== 拖放輔助 ====================
function showDragToast(msg) {
  const old = document.querySelector('.drag-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'drag-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

function removeExpChip(qid, chipId) {
  const placedArr = getExpPlaced(qid);
  const idx = placedArr.indexOf(chipId);
  if (idx >= 0) {
    placedArr.splice(idx, 1);
    expCompletedSet.delete(qid);
    orderCheckResults.delete(qid);
    renderAll();
    if (navigator.vibrate) navigator.vibrate(30);
    showDragToast('↩️ 已退回詳解池');
  }
}

function checkExpOrder(qid) {
  const placedArr = getExpPlaced(qid);
  const q = questions.find(qq => qq.id === qid);
  if (!q) return;
  const wrongIndices = [];
  placedArr.forEach((chipId, idx) => {
    const chip = expChips.find(c => c.chipId === chipId);
    if (!chip || chip.partIndex !== idx) wrongIndices.push(idx);
  });
  orderCheckResults.set(qid, { correct: wrongIndices.length === 0, wrongIndices });
  scheduleSaveLocal();
  renderAll();
  if (wrongIndices.length === 0) {
    if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
    showDragToast('🏆 排序完全正確！');
  } else {
    showDragToast(`🔄 有 ${wrongIndices.length} 張位置不對`);
  }
}

// ==================== 統一拖放 ====================
let dragState = null;

function onDragStart(e) {
  e.preventDefault();
  const el = e.currentTarget;
  const chipId = el.dataset.chipId;
  const dragType = el.dataset.dragType;
  let chipData = dragType === 'answer'
    ? answerChips.find(c => c.chipId === chipId)
    : expChips.find(c => c.chipId === chipId);
  if (!chipData) return;

  const ghost = document.createElement('div');
  ghost.className = `drag-ghost ${dragType === 'answer' ? 'ghost-answer' : 'ghost-exp'}`;
  ghost.textContent = dragType === 'answer' ? `(${chipData.label}) ${chipData.text}` : chipData.text;
  document.body.appendChild(ghost);

  const x = e.clientX, y = e.clientY;
  ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
  el.classList.add('dragging-source');
  dragState = { chipEl: el, ghost, chipData, dragType, startX: x, startY: y };

  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
  document.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!dragState) return;
  e.preventDefault();
  const x = e.clientX, y = e.clientY;
  dragState.ghost.style.left = x + 'px'; dragState.ghost.style.top = y + 'px';

  // ③ 自動捲動：在 quiz 模式捲動 pool scroller，否則捲動 mainContent
  const scrollTarget = viewMode === 'quiz'
    ? document.getElementById('quizPoolScroller')
    : document.getElementById('mainContent');
  if (scrollTarget) {
    const scRect = scrollTarget.getBoundingClientRect();
    const edgeThreshold = 50;
    if (y < scRect.top + edgeThreshold && y > scRect.top) {
      scrollTarget.scrollBy(0, -10);
    } else if (y > scRect.bottom - edgeThreshold && y < scRect.bottom) {
      scrollTarget.scrollBy(0, 10);
    }
  }

  // ④ 視覺回饋
  const hoverClass = dragState.dragType === 'answer' ? 'drag-over-answer' : 'drag-over-exp';
  document.querySelectorAll('.exp-slot.drop-ready').forEach(s => s.classList.remove('drop-ready'));
  document.querySelectorAll('.question-card').forEach(card => {
    const r = card.getBoundingClientRect();
    const isOver = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (isOver) {
      const qid = parseInt(card.dataset.qid);
      if (dragState.dragType === 'answer' && !solvedSet.has(qid)) {
        card.classList.add(hoverClass);
      } else if (dragState.dragType === 'explanation') {
        if (viewMode === 'quiz') {
          // Quiz 模式：不需先答對，未完成詳解的題都可 hover
          if (!expCompletedSet.has(qid)) {
            card.classList.add(hoverClass);
          }
        } else {
          if (solvedSet.has(qid) && !expCompletedSet.has(qid)) {
            card.classList.add(hoverClass);
            card.querySelectorAll('.exp-slot:not(.filled)').forEach(slot => {
              slot.classList.add('drop-ready');
            });
          }
        }
      }
    } else {
      card.classList.remove('drag-over-answer', 'drag-over-exp');
    }
  });
}

function onDragEnd(e) {
  if (!dragState) return;
  const x = e.clientX, y = e.clientY;
  const { chipEl, ghost, chipData, dragType, startX, startY } = dragState;
  ghost.remove();
  chipEl.classList.remove('dragging-source');
  document.querySelectorAll('.question-card').forEach(c => c.classList.remove('drag-over-answer', 'drag-over-exp'));
  document.querySelectorAll('.exp-slot.drop-ready').forEach(s => s.classList.remove('drop-ready'));

  const dist = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2);
  if (dist < 10 && dragType === 'answer') {
    reverseLookup(chipData, chipEl);
  } else if (dist >= 10) {
    let targetCard = null;
    document.querySelectorAll('.question-card').forEach(card => {
      const r = card.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) targetCard = card;
    });
    if (targetCard) {
      const targetQid = parseInt(targetCard.dataset.qid);
      if (dragType === 'answer') {
        if (!solvedSet.has(targetQid)) {
          const tq = questions.find(q => q.id === targetQid);
          if (chipData.text === tq.options[tq.correctIndex]) {
            getOptAttempt(chipData.chipId).correct++;
            const wrongBefore = quizAttempts.get(targetQid) || 0;
            recordCorrect(targetQid, wrongBefore);
            solvedSet.add(targetQid);
            clearReverseLookup();
            if (navigator.vibrate) navigator.vibrate(50);
            renderAll();
            checkCompletion();
          } else {
            const oa = getOptAttempt(chipData.chipId);
            oa.wrong++;
            oa.wrongTargets.push(targetQid);
            quizAttempts.set(targetQid, (quizAttempts.get(targetQid) || 0) + 1);
            targetCard.classList.add('shake');
            setTimeout(() => targetCard.classList.remove('shake'), 500);
            showDragToast('❌ 答案不正確，再試試！');
            if (viewMode === 'quiz') renderAll();
          }
        } else {
          showDragToast('✅ 此題已經答對了');
        }
      } else {
        // 詳解拖放
        if (viewMode === 'quiz') {
          // ======= Quiz 模式：不需先答對，只驗 questionId =======
          if (expCompletedSet.has(targetQid)) {
            showDragToast('✅ 此題詳解已全部放入');
          } else if (chipData.questionId === targetQid) {
            getExpPartAttempt(chipData.chipId).correct++;
            // 正確配對：放入 + 消失
            const placedArr = getExpPlaced(targetQid);
            if (!placedArr.includes(chipData.chipId)) {
              placedArr.push(chipData.chipId);
              const tq = questions.find(q => q.id === targetQid);
              if (placedArr.length === tq.expParts.length) {
                expCompletedSet.add(targetQid);
                if (navigator.vibrate) navigator.vibrate([30, 30, 60]);
                showDragToast('🎉 詳解全部正確放入！');
              } else {
                if (navigator.vibrate) navigator.vibrate(30);
              }
              renderAll();
              checkCompletion();
            }
          } else {
            // 詳解配對錯誤
            getExpPartAttempt(chipData.chipId).wrong++;
            targetCard.classList.add('shake');
            setTimeout(() => targetCard.classList.remove('shake'), 500);
            showDragToast('❌ 這張詳解不屬於此題，換一張試試！');
          }
        } else {
          // ======= Single 模式：原本邏輯 =======
          if (solvedSet.has(targetQid) && !expCompletedSet.has(targetQid)) {
            if (chipData.questionId === targetQid) {
              getExpPartAttempt(chipData.chipId).correct++;
              const placedArr = getExpPlaced(targetQid);
              if (!placedArr.includes(chipData.chipId)) {
                placedArr.push(chipData.chipId);
                orderCheckResults.delete(targetQid);
                const tq = questions.find(q => q.id === targetQid);
                if (placedArr.length === tq.expParts.length) {
                  expCompletedSet.add(targetQid);
                  if (navigator.vibrate) navigator.vibrate([30, 30, 60]);
                  showDragToast('🎉 詳解全部放入！可檢查排序');
                } else {
                  if (navigator.vibrate) navigator.vibrate(30);
                }
                renderAll();
                checkCompletion();
              }
            } else {
              getExpPartAttempt(chipData.chipId).wrong++;
            }
          } else if (solvedSet.has(targetQid) && expCompletedSet.has(targetQid)) {
            showDragToast('✅ 此題詳解已全部放入');
          } else if (!solvedSet.has(targetQid)) {
            targetCard.classList.add('shake');
            setTimeout(() => targetCard.classList.remove('shake'), 500);
            showDragToast('⚠️ 請先答對此題再放入詳解');
          }
        }
      }
    }
  }
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  document.removeEventListener('pointercancel', onDragEnd);
  dragState = null;
  scheduleSaveLocal(); // ⚡ 每次拖放後自動儲存進度
}

// ==================== 詳解排序 ====================
let reorderState = null;

function onReorderStart(e) {
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget;
  const chipId = el.dataset.chipId;
  const qid = parseInt(el.dataset.reorderQid);
  const arrIdx = parseInt(el.dataset.arrIdx);
  const chip = expChips.find(c => c.chipId === chipId);
  if (!chip) return;

  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost ghost-exp';
  ghost.textContent = chip.text;
  document.body.appendChild(ghost);

  const x = e.clientX, y = e.clientY;
  ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
  el.classList.add('reorder-source');
  reorderState = { sourceEl: el, ghost, chipId, qid, sourceIdx: arrIdx, startX: x, startY: y };

  document.addEventListener('pointermove', onReorderMove);
  document.addEventListener('pointerup', onReorderEnd);
  document.addEventListener('pointercancel', onReorderEnd);
}

function onReorderMove(e) {
  if (!reorderState) return;
  e.preventDefault();
  const x = e.clientX, y = e.clientY;
  reorderState.ghost.style.left = x + 'px'; reorderState.ghost.style.top = y + 'px';

  // ③ 排序時也自動捲動
  const scrollTarget = viewMode === 'quiz'
    ? document.getElementById('quizPoolScroller')
    : document.getElementById('mainContent');
  if (scrollTarget) {
    const mcRect = scrollTarget.getBoundingClientRect();
    if (y < mcRect.top + 50 && y > mcRect.top) scrollTarget.scrollBy(0, -10);
    else if (y > mcRect.bottom - 50 && y < mcRect.bottom) scrollTarget.scrollBy(0, 10);
  }

  document.querySelectorAll('.exp-slot.insert-above, .exp-slot.insert-below').forEach(s => {
    s.classList.remove('insert-above', 'insert-below');
  });
  const expZone = document.querySelector(`.exp-zone[data-qid="${reorderState.qid}"]`);
  if (!expZone) return;
  const slots = [...expZone.querySelectorAll('.exp-slot.filled')];
  let closestSlot = null, insertPos = 'below', minDist = Infinity;
  slots.forEach(slot => {
    if (slot === reorderState.sourceEl) return;
    const r = slot.getBoundingClientRect();
    const centerY = r.top + r.height / 2;
    const d = Math.abs(y - centerY);
    if (d < minDist) { minDist = d; closestSlot = slot; insertPos = y < centerY ? 'above' : 'below'; }
  });
  if (closestSlot) closestSlot.classList.add(insertPos === 'above' ? 'insert-above' : 'insert-below');
}

function onReorderEnd(e) {
  if (!reorderState) return;
  const x = e.clientX, y = e.clientY;
  const { sourceEl, ghost, chipId, qid, sourceIdx, startX, startY } = reorderState;
  ghost.remove();
  sourceEl.classList.remove('reorder-source');
  document.querySelectorAll('.exp-slot.insert-above, .exp-slot.insert-below').forEach(s => {
    s.classList.remove('insert-above', 'insert-below');
  });
  const dist = Math.sqrt((x - startX) ** 2 + (y - startY) ** 2);
  if (dist >= 10) {
    const expZone = document.querySelector(`.exp-zone[data-qid="${qid}"]`);
    // ① 拖出 exp-zone 範圍 → 退回詳解池
    if (expZone) {
      const ezRect = expZone.getBoundingClientRect();
      const isOutside = x < ezRect.left - 40 || x > ezRect.right + 40 || y < ezRect.top - 40 || y > ezRect.bottom + 40;
      if (isOutside) {
        const placedArr = getExpPlaced(qid);
        placedArr.splice(sourceIdx, 1);
        expCompletedSet.delete(qid);
        orderCheckResults.delete(qid);
        if (navigator.vibrate) navigator.vibrate(30);
        showDragToast('↩️ 已退回詳解池');
        renderAll();
      } else {
        const slots = [...expZone.querySelectorAll('.exp-slot.filled')];
        let closestSlot = null, insertPos = 'below', minDist = Infinity, targetIdx = sourceIdx;
        slots.forEach(slot => {
          const r = slot.getBoundingClientRect();
          const centerY = r.top + r.height / 2;
          const d = Math.abs(y - centerY);
          if (d < minDist) { minDist = d; closestSlot = slot; insertPos = y < centerY ? 'above' : 'below'; }
        });
        if (closestSlot) {
          const closestIdx = parseInt(closestSlot.dataset.arrIdx);
          targetIdx = insertPos === 'above' ? closestIdx : closestIdx + 1;
        }
        const placedArr = getExpPlaced(qid);
        if (targetIdx !== sourceIdx && targetIdx !== sourceIdx + 1) {
          const [removed] = placedArr.splice(sourceIdx, 1);
          const newIdx = targetIdx > sourceIdx ? targetIdx - 1 : targetIdx;
          placedArr.splice(newIdx, 0, removed);
          orderCheckResults.delete(qid);
          renderAll();
        }
      }
    }
  }
  document.removeEventListener('pointermove', onReorderMove);
  document.removeEventListener('pointerup', onReorderEnd);
  document.removeEventListener('pointercancel', onReorderEnd);
  reorderState = null;
}

// ==================== 反向查詢 ====================
function reverseLookup(chipData, chipEl) {
  clearReverseLookup();
  const q = questions[currentPage];
  if (!solvedSet.has(q.id) && q.options[q.correctIndex] === chipData.text) {
    document.querySelector('.question-card').classList.add('highlighted');
    chipEl.classList.add('selected');
    document.getElementById('reverseTip').classList.add('show');
  }
}
function clearReverseLookup() {
  document.querySelectorAll('.question-card.highlighted').forEach(c => c.classList.remove('highlighted'));
  document.querySelectorAll('.answer-chip.selected').forEach(c => c.classList.remove('selected'));
  document.getElementById('reverseTip').classList.remove('show');
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.answer-chip')) clearReverseLookup();
});

// ==================== 渲染全部 ====================
// ⚡ 追蹤上次渲染的分類，避免不必要的索引重建
let _lastRenderedCat = null;
let _lastRenderedView = null;
let _indexNeedsUpdate = true;

function renderAll() {
  const mainEl = document.getElementById('mainContent');
  const statsBar = document.getElementById('quizStatsBar');
  if (viewMode === 'quiz') {
    mainEl.classList.add('quiz-active');
    statsBar.classList.remove('hidden');
  } else {
    mainEl.classList.remove('quiz-active');
    statsBar.classList.add('hidden');
  }
  const sub = document.getElementById('headerSubtitle');
  if (sub) sub.textContent = viewMode === 'quiz'
    ? '🎲 隨機四題挑戰模式 · 把答案與詳解拖進正確的題目卡'
    : '把答案拖進正確的題目卡片中';
  updateNav();
  renderBacklinkPanel();
  renderCard();
  if (viewMode !== 'quiz') bindReorderEvents();
  renderAnswerPool();
  renderExpPool();
  renderQuizStatsBar();
  renderSidebar();

  // ⚡ 索引只在切換分類/頁面/模式時才重新渲染
  const curCat = questions.length > 0 ? (questions[currentPage]?.category || '') : '';
  if (_indexNeedsUpdate || curCat !== _lastRenderedCat || viewMode !== _lastRenderedView) {
    renderAnswerIndex();
    renderOptionIndex();
    renderExpIndex();
    renderWordIndex();
    _lastRenderedCat = curCat;
    _lastRenderedView = viewMode;
    _indexNeedsUpdate = false;
  }
}

function invalidateIndexes() { _indexNeedsUpdate = true; }

// ==================== 完成 ====================
function checkCompletion() {
  if (questions.length === 0) return;
  if (viewMode === 'quiz') {
    // Quiz 模式由卡片區域的統計面板處理，不需要 completionArea
    return;
  }
  if (solvedSet.size === questions.length && expCompletedSet.size === questions.length) {
    document.getElementById('completionArea').innerHTML = `
      <div class="completion-banner">
        <div class="emoji">🎉</div>
        <h2>全部完成！答案 + 詳解都對了！</h2>
        <button class="restart-btn" onclick="restart()">再玩一次 🔄</button>
      </div>`;
  }
}

// ==================== Quiz Stats Bar ====================
function getQuizMastery(q) {
  // 綜合當輪嘗試 + 歷史掌握度
  const isSolved = solvedSet.has(q.id);
  const attempts = quizAttempts.get(q.id) || 0;
  const expDone = expCompletedSet.has(q.id);
  const expPlaced = getExpPlaced(q.id).length;
  const expTotal = q.expParts.length;
  const histScore = getMasteryScore(q.id);
  const stats = getQStats(q.id);
  const histTip = stats.rounds > 0 ? ` (歷史掌握 ${histScore}%・${stats.rounds}輪)` : '';

  if (!isSolved && attempts === 0) return { level: '—', cls: '', tip: '尚未作答' + histTip };
  if (isSolved && attempts === 0) {
    const expPct = expTotal > 0 ? Math.round(expPlaced / expTotal * 100) : 100;
    if (expDone) return { level: '★★★', cls: 'mastery-perfect', tip: '完美：一次答對 + 詳解完成' + histTip };
    return { level: '★★☆', cls: 'mastery-good', tip: `一次答對・詳解 ${expPct}%` + histTip };
  }
  if (isSolved && attempts === 1) {
    if (expDone) return { level: '★★☆', cls: 'mastery-good', tip: '良好：2次答對 + 詳解完成' + histTip };
    return { level: '★☆☆', cls: 'mastery-ok', tip: `2次答對・詳解 ${Math.round(expPlaced/expTotal*100)}%` + histTip };
  }
  if (isSolved && attempts >= 2) {
    return { level: '★☆☆', cls: 'mastery-weak', tip: `${attempts+1}次才答對，需加強` + histTip };
  }
  return { level: '☆☆☆', cls: 'mastery-none', tip: `已錯 ${attempts} 次，繼續加油` + histTip };
}

function renderQuizStatsBar() {
  const bar = document.getElementById('quizStatsBar');
  if (viewMode !== 'quiz') { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');

  const quizQs = quizIndices.map(i => questions[i]).filter(Boolean);
  const total = quizQs.length;
  const quizSolved = quizQs.filter(q => solvedSet.has(q.id)).length;
  const quizExpDone = quizQs.filter(q => expCompletedSet.has(q.id)).length;

  // 個別題目掌握度
  const masteryHtml = quizQs.map(q => {
    const m = getQuizMastery(q);
    return `<span class="qs-mastery-dot ${m.cls}" title="${m.tip}">Q${q.id} ${m.level}</span>`;
  }).join('');

  // 整體掌握度：加權平均
  let totalScore = 0;
  quizQs.forEach(q => {
    const attempts = quizAttempts.get(q.id) || 0;
    const isSolved = solvedSet.has(q.id);
    const expRatio = q.expParts.length > 0 ? getExpPlaced(q.id).length / q.expParts.length : 0;
    if (isSolved && attempts === 0) totalScore += 80 + 20 * expRatio; // 一次對 80~100
    else if (isSolved && attempts === 1) totalScore += 50 + 20 * expRatio; // 兩次 50~70
    else if (isSolved) totalScore += 20 + 10 * expRatio; // 多次 20~30
    else totalScore += 0; // 未答對
  });
  const overallPct = total > 0 ? Math.round(totalScore / total) : 0;
  const overallCls = overallPct >= 80 ? 'green' : overallPct >= 50 ? 'amber' : '';

  bar.innerHTML = `
    <div class="qs-mastery-row">${masteryHtml}</div>
    <div class="qs-item">🎯 <span class="qs-val">${quizSolved}/${total}</span></div>
    <div class="qs-item">📖 <span class="qs-val">${quizExpDone}/${total}</span></div>
    <div class="qs-item">📊 <span class="qs-val ${overallCls}">${overallPct}%</span> 掌握</div>
    <button class="qs-new-btn" onclick="startQuiz()">🎲 再來四題</button>`;
}

// ==================== 全頁索引（主內容區展開） ====================
let fullIndexType = null; // 'answer' | 'option' | 'exp' | 'word' | null
let fullIndexFilter = '';

function showFullIndex(type) {
  pushNavState();
  fullIndexType = type;
  fullIndexFilter = '';
  viewMode = 'single';
  activeAnswerKey = null; activeOptionKey = null; activeExpKey = null; activeWordKey = null;
  jtExpandedSpans.clear(); jtDetailTabMap.clear(); jtDetailKey = null;

  const mainEl = document.getElementById('mainContent');
  mainEl.classList.remove('quiz-active');
  document.getElementById('quizStatsBar').classList.add('hidden');
  document.querySelector('.nav-row').classList.add('quiz-hidden');

  document.getElementById('cardArea').innerHTML = renderFullIndex(type, '');
  document.getElementById('backlinkArea').innerHTML = '';
  document.getElementById('answerPool').innerHTML = '';
  document.getElementById('expPool').innerHTML = '';
  document.getElementById('answerDivider').classList.add('section-hidden');
  document.getElementById('expDivider').classList.add('section-hidden');
  document.getElementById('completionArea').innerHTML = '';
  document.getElementById('reverseTip').classList.remove('show');

  document.getElementById('mainContent').scrollTo(0, 0);
  updateBackButton();
  if (window.innerWidth <= 768) toggleSidebar();
}

function filterFullIndex(val) {
  fullIndexFilter = val.toLowerCase();
  document.getElementById('cardArea').innerHTML = renderFullIndex(fullIndexType, fullIndexFilter);
}

function selectFromFullIndex(type, key) {
  fullIndexType = null;
  if (type === 'answer') { selectAnswerIndex(key); }
  else if (type === 'option') { selectOptionIndex(key); }
  else if (type === 'exp') { selectExpIndex(key); }
  else if (type === 'word') { selectWordIndex(key); }
}

function renderFullIndex(type, filter) {
  const configs = {
    answer: { icon: '🔗', title: '正確答案索引', color: '#4a7c59' },
    option: { icon: '📋', title: '全選項索引', color: '#16a34a' },
    exp:    { icon: '📖', title: '詳解索引', color: '#7c3aed' },
    word:   { icon: '🔤', title: '德文單字索引', color: '#ea580c' }
  };
  const cfg = configs[type];
  if (!cfg) return '';

  let itemsHtml = '';
  let totalCount = 0;
  let shownCount = 0;

  if (type === 'answer') {
    const indexMap = buildAnswerIndex();
    const entries = [...indexMap.entries()].sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0], 'de');
    });
    totalCount = entries.length;
    const filtered = filter ? entries.filter(([k]) => k.toLowerCase().includes(filter)) : entries;
    shownCount = filtered.length;
    itemsHtml = filtered.map(([ansText, qs]) => {
      const escaped = ansText.replace(/'/g, "\\'");
      return `<div class="fi-item" onclick="selectFromFullIndex('answer','${escaped}')">
        <span class="fi-icon">💡</span>
        <span class="fi-text">${ansText}</span>
        <span class="fi-badge" style="background:#dce6de;color:#4a7c59;">${qs.length} 題</span>
      </div>`;
    }).join('');
  }

  else if (type === 'option') {
    const indexMap = buildOptionIndex();
    const entries = [...indexMap.entries()].sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0], 'de');
    });
    totalCount = entries.length;
    const filtered = filter ? entries.filter(([k]) => k.toLowerCase().includes(filter)) : entries;
    shownCount = filtered.length;
    itemsHtml = filtered.map(([optText, items]) => {
      const correctCount = items.filter(it => it.isCorrect).length;
      const escaped = optText.replace(/'/g, "\\'");
      return `<div class="fi-item" onclick="selectFromFullIndex('option','${escaped}')">
        <span class="fi-icon">📌</span>
        <span class="fi-text">${optText}</span>
        <span class="fi-badge" style="background:#dcfce7;color:#16a34a;">${items.length} 題</span>
        ${correctCount > 0 ? `<span class="fi-badge" style="background:#fef9c3;color:#ca8a04;">✓${correctCount}</span>` : ''}
      </div>`;
    }).join('');
  }

  else if (type === 'exp') {
    const items = buildExpIndex();
    totalCount = items.length;
    const filtered = filter ? items.filter(it => it.text.toLowerCase().includes(filter) || ('q' + it.questionId).includes(filter)) : items;
    shownCount = filtered.length;
    itemsHtml = filtered.map(item => {
      const preview = item.text.length > 80 ? item.text.slice(0, 80) + '…' : item.text;
      return `<div class="fi-item fi-item-exp" onclick="selectFromFullIndex('exp','${item.key}')">
        <span class="fi-icon">📝</span>
        <span class="fi-badge" style="background:#f3e8ff;color:#7c3aed;min-width:36px;">Q${item.questionId}</span>
        <span class="fi-text fi-text-long">${preview}</span>
      </div>`;
    }).join('');
  }

  else if (type === 'word') {
    const entries = getSortedWordEntries();
    totalCount = entries.length;
    const filtered = filter ? entries.filter(([k, v]) => k.includes(filter) || v.original.toLowerCase().includes(filter)) : entries;
    shownCount = filtered.length;
    const multi = filtered.filter(([,v]) => new Set(v.sources.map(s => s.question.id)).size > 1);
    const single = filtered.filter(([,v]) => new Set(v.sources.map(s => s.question.id)).size === 1);

    if (multi.length > 0) {
      itemsHtml += `<div class="fi-section-label">🔥 跨題共用 (${multi.length})</div>`;
      itemsHtml += multi.map(([key, val]) => {
        const qCount = new Set(val.sources.map(s => s.question.id)).size;
        const escaped = key.replace(/'/g, "\\'");
        return `<div class="fi-item" onclick="selectFromFullIndex('word','${escaped}')">
          <span class="fi-icon">🔤</span>
          <span class="fi-text" style="font-family:Georgia,serif;font-style:italic;">${val.original}</span>
          <span class="fi-badge" style="background:#ffedd5;color:#ea580c;">${qCount} 題</span>
        </div>`;
      }).join('');
    }
    if (single.length > 0) {
      itemsHtml += `<div class="fi-section-label">📝 單題出現 (${single.length})</div>`;
      itemsHtml += single.map(([key, val]) => {
        const escaped = key.replace(/'/g, "\\'");
        return `<div class="fi-item" onclick="selectFromFullIndex('word','${escaped}')">
          <span class="fi-icon" style="opacity:0.4">·</span>
          <span class="fi-text" style="font-family:Georgia,serif;font-style:italic;">${val.original}</span>
          <span class="fi-badge" style="background:#f3f4f6;color:#999;">1</span>
        </div>`;
      }).join('');
    }
  }

  const filterInfo = filter ? `（符合「${filter}」：${shownCount} / ${totalCount}）` : `（共 ${totalCount} 項）`;

  return `<div class="full-index">
    <div class="fi-header" style="border-color:${cfg.color}">
      <div class="fi-title" style="color:${cfg.color}">${cfg.icon} ${cfg.title} ${filterInfo}</div>
      <button class="fi-close" onclick="renderAll()">✕ 關閉</button>
    </div>
    <div class="fi-search">
      <span class="fi-search-icon">🔍</span>
      <input type="text" class="fi-search-input" placeholder="搜尋..." value="${filter}" oninput="filterFullIndex(this.value)" autofocus>
    </div>
    <div class="fi-list">${itemsHtml || '<div class="fi-empty">沒有符合的結果</div>'}</div>
  </div>`;
}

// ==================== 掌握度 Dashboard ====================
let dashboardTab = 'questions'; // 'questions' | 'options' | 'expParts'

function showDashboard(tab, suppressPush) {
  if (!suppressPush) pushNavState();
  if (tab) dashboardTab = tab;
  viewMode = 'single'; // 用 single 框架但顯示 dashboard
  activeAnswerKey = null; activeOptionKey = null; activeExpKey = null; activeWordKey = null;
  jtExpandedSpans.clear(); jtDetailTabMap.clear(); jtDetailKey = null;

  const mainEl = document.getElementById('mainContent');
  mainEl.classList.remove('quiz-active');
  document.getElementById('quizStatsBar').classList.add('hidden');
  document.querySelector('.nav-row').classList.add('quiz-hidden');

  // 渲染 dashboard 到 cardArea，清除其他區域
  document.getElementById('cardArea').innerHTML = renderMasteryDashboard();
  document.getElementById('backlinkArea').innerHTML = '';
  document.getElementById('answerPool').innerHTML = '';
  document.getElementById('expPool').innerHTML = '';
  document.getElementById('answerDivider').classList.add('section-hidden');
  document.getElementById('expDivider').classList.add('section-hidden');
  document.getElementById('completionArea').innerHTML = '';
  document.getElementById('reverseTip').classList.remove('show');
  renderSidebar();
  renderAnswerIndex();
  renderOptionIndex();
  renderExpIndex();
  renderWordIndex();

  document.getElementById('mainContent').scrollTo(0, 0);
  updateBackButton();
  if (tab && window.innerWidth <= 768) toggleSidebar();
}

function switchDashboardTab(tab) {
  dashboardTab = tab;
  inlineTraceWord = null;
  document.getElementById('cardArea').innerHTML = renderMasteryDashboard();
}

function toggleChipGroup(el) {
  el.closest('.chip-mastery-group').classList.toggle('expanded');
}

function renderMasteryDashboard() {
  if (questions.length === 0) {
    return `<div style="text-align:center; padding:60px 20px; color:#bbb;">
      <div style="font-size:3rem; margin-bottom:12px;">📊</div>
      <div style="font-size:1rem;">還沒有題目</div>
    </div>`;
  }

  // Tabs
  const tabsHtml = `
    <div class="mastery-tabs">
      <button class="mastery-tab ${dashboardTab === 'questions' ? 'active' : ''}" onclick="switchDashboardTab('questions')">📊 題目掌握度</button>
      <button class="mastery-tab ${dashboardTab === 'options' ? 'active' : ''}" onclick="switchDashboardTab('options')">🏷️ 選項分析</button>
      <button class="mastery-tab ${dashboardTab === 'expParts' ? 'active' : ''}" onclick="switchDashboardTab('expParts')">📝 詳解小卡</button>
    </div>`;

  let bodyHtml = '';
  if (dashboardTab === 'questions') bodyHtml = renderDashboardQuestions();
  else if (dashboardTab === 'options') bodyHtml = renderDashboardOptions();
  else if (dashboardTab === 'expParts') bodyHtml = renderDashboardExpParts();

  return `
    <div class="mastery-dashboard">
      <div class="mastery-dashboard-header">
        <h2>📊 掌握度總覽</h2>
        <div class="subtitle">全面分析學習進度 · 題目、選項、詳解三維度</div>
      </div>
      ${tabsHtml}
      ${bodyHtml}
    </div>`;
}

// ===== 題目掌握度 Tab =====
function renderDashboardQuestions() {
  const total = questions.length;
  const answered = questions.filter(q => getQStats(q.id).rounds > 0).length;
  const scores = questions.map(q => getMasteryScore(q.id));
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / total);
  const perfectCount = scores.filter(s => s >= 80).length;
  const weakCount = scores.filter(s => s > 0 && s < 40).length;
  const newCount = scores.filter(s => s === 0).length;

  const avgCls = avgScore >= 70 ? 'green' : avgScore >= 40 ? 'amber' : 'red';

  const summaryHtml = `
    <div class="mastery-summary">
      <div class="mastery-summary-card"><div class="ms-val ${avgCls}">${avgScore}%</div><div class="ms-label">平均掌握度</div></div>
      <div class="mastery-summary-card"><div class="ms-val green">${perfectCount}</div><div class="ms-label">已掌握 (≥80%)</div></div>
      <div class="mastery-summary-card"><div class="ms-val amber">${answered - perfectCount - weakCount}</div><div class="ms-label">學習中 (40-79%)</div></div>
      <div class="mastery-summary-card"><div class="ms-val red">${weakCount}</div><div class="ms-label">需加強 (<40%)</div></div>
      <div class="mastery-summary-card"><div class="ms-val blue">${newCount}</div><div class="ms-label">🆕 未作答</div></div>
    </div>`;

  const heatmapHtml = questions.map((q, idx) => {
    const score = getMasteryScore(q.id);
    const stats = getQStats(q.id);
    let lvl = 'lvl-none';
    if (stats.rounds === 0) lvl = 'lvl-none';
    else if (score >= 80) lvl = 'lvl-perfect';
    else if (score >= 50) lvl = 'lvl-good';
    else if (score >= 20) lvl = 'lvl-mid';
    else lvl = 'lvl-low';
    const detail = stats.rounds > 0 ? `${stats.rounds}輪・正確${stats.firstTry}次` : '尚未作答';
    return `<div class="mastery-cell ${lvl}" onclick="goToPage(${idx})" title="Q${q.id} ${detail}">
      <div class="mc-id">Q${q.id}</div>
      <div class="mc-score">${stats.rounds > 0 ? score + '%' : '—'}</div>
      <div class="mc-bar"><div class="mc-bar-fill" style="width:${score}%"></div></div>
    </div>`;
  }).join('');

  const sorted = questions.map((q, idx) => ({ q, idx, score: getMasteryScore(q.id), stats: getQStats(q.id) }))
    .sort((a, b) => a.score - b.score);

  const rankingHtml = sorted.map((item, rank) => {
    const { q, idx, score, stats } = item;
    const preview = q.question.length > 40 ? q.question.slice(0, 40) + '…' : q.question;
    const clickablePreview = makeClickableText(preview);
    const barCls = score >= 80 ? 'green' : score >= 40 ? 'amber' : score > 0 ? 'red' : 'gray';
    const detail = stats.rounds > 0 ? `${stats.rounds}輪・${stats.firstTry}/${stats.rounds}正確` : '未作答';
    return `<div class="mastery-rank-row" onclick="goToPage(${idx})">
      <div class="mastery-rank-num">${rank + 1}</div>
      <div style="min-width:36px;font-size:0.78rem;font-weight:700;color:#888;">Q${q.id}</div>
      <div class="mastery-rank-bar-wrap">
        <div class="mastery-rank-bar ${barCls}" style="width:${Math.max(score, 3)}%"></div>
        <div class="mastery-rank-label">${score}%</div>
      </div>
      <div class="mastery-rank-text" title="${q.question}">${clickablePreview}</div>
      <div class="mastery-rank-detail">${detail}</div>
    </div>`;
  }).join('');

  return `${summaryHtml}
    <div style="font-size:0.82rem;font-weight:700;color:#d97706;margin-bottom:8px;">🗺️ 掌握度熱力圖</div>
    <div class="mastery-heatmap">${heatmapHtml}</div>
    <div class="mastery-ranking">
      <div class="mastery-ranking-title">📋 複習優先順序（掌握度低 → 高）<span style="font-size:0.65rem;color:#a0aec0;font-weight:400;margin-left:8px;">💡 點擊德文單字可查看 Trace</span></div>
      ${rankingHtml}
    </div>`;
}

// ===== 選項分析 Tab =====
function renderDashboardOptions() {
  // 統計摘要
  let totalOpts = 0, touchedOpts = 0, correctOpts = 0, confusedOpts = 0;
  questions.forEach(q => {
    q.options.forEach((_, i) => {
      totalOpts++;
      const chipId = `ans-q${q.id}-${i}`;
      const att = optionAttempts.get(chipId);
      if (att && (att.correct + att.wrong) > 0) {
        touchedOpts++;
        if (att.correct > 0) correctOpts++;
        if (att.wrong > 0) confusedOpts++;
      }
    });
  });

  const summaryHtml = `
    <div class="option-summary-bar">
      <div class="option-summary-item"><div class="os-val" style="color:#4a7c59;">${totalOpts}</div><div class="os-label">選項總數</div></div>
      <div class="option-summary-item"><div class="os-val" style="color:#0284c7;">${touchedOpts}</div><div class="os-label">已嘗試</div></div>
      <div class="option-summary-item"><div class="os-val" style="color:#16a34a;">${correctOpts}</div><div class="os-label">正確使用</div></div>
      <div class="option-summary-item"><div class="os-val" style="color:#dc2626;">${confusedOpts}</div><div class="os-label">曾放錯</div></div>
    </div>`;

  // 分組卡片（每題一組）
  const groupsHtml = questions.map((q, qIdx) => {
    const clickableQ = makeClickableText(q.question.length > 30 ? q.question.slice(0, 30) + '…' : q.question);
    const optionRows = q.options.map((opt, i) => {
      const chipId = `ans-q${q.id}-${i}`;
      const isCorrect = i === q.correctIndex;
      const att = optionAttempts.get(chipId) || { correct: 0, wrong: 0, wrongTargets: [] };
      const totalAtt = att.correct + att.wrong;
      const accPct = totalAtt > 0 ? Math.round(att.correct / totalAtt * 100) : -1;
      const barColor = isCorrect ? '#4a7c59' : (totalAtt === 0 ? '#e5e7eb' : accPct >= 80 ? '#16a34a' : accPct >= 50 ? '#fbbf24' : '#f87171');
      const barWidth = totalAtt === 0 ? 3 : Math.max(3, accPct);
      const clickableOpt = makeClickableText(opt);
      let confusedHtml = '';
      if (att.wrong > 0 && att.wrongTargets.length > 0) {
        const targets = [...new Set(att.wrongTargets)].map(tid => `Q${tid}`).join(', ');
        confusedHtml = `<span style="font-size:0.6rem;color:#dc2626;margin-left:6px;">混淆: ${targets}</span>`;
      }
      return `<div class="iwt-row" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #f0f0f0;${isCorrect ? 'background:#f0fdf4;' : ''}">
        <div style="min-width:28px;font-size:0.72rem;font-weight:700;color:${isCorrect ? '#16a34a' : '#999'};">(${q.labels[i]})</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.78rem;line-height:1.4;">${clickableOpt} ${isCorrect ? '<span style="color:#16a34a;font-weight:700;">✓</span>' : ''}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
            <div style="flex:1;height:4px;background:#f0f0f0;border-radius:2px;">
              <div style="height:100%;width:${barWidth}%;background:${barColor};border-radius:2px;"></div>
            </div>
            <span style="font-size:0.6rem;color:#888;min-width:40px;">${totalAtt > 0 ? `✓${att.correct} ✗${att.wrong}` : '—'}</span>
            ${confusedHtml}
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div class="chip-mastery-group">
      <div class="chip-mastery-group-header" onclick="this.closest('.chip-mastery-group').classList.toggle('expanded')">
        <span class="cmg-qid" onclick="event.stopPropagation();goToPage(${qIdx})">Q${q.id}</span>
        <span class="cmg-question">${clickableQ}</span>
        <span class="cmg-arrow">▶</span>
      </div>
      <div class="chip-mastery-group-body">${optionRows}</div>
    </div>`;
  }).join('');

  return `${summaryHtml}
    <div style="font-size:0.82rem;font-weight:700;color:#d97706;margin:12px 0 8px;">🔤 選項分析（按題分組）<span style="font-size:0.65rem;color:#a0aec0;font-weight:400;margin-left:8px;">💡 點擊德文單字可查看 Trace</span></div>
    ${groupsHtml}`;
}

// ===== 詳解小卡分析 Tab =====
function renderDashboardExpParts() {
  // 統計摘要
  let totalParts = 0, touchedParts = 0, correctParts = 0, wrongParts = 0;
  questions.forEach(q => {
    q.expParts.forEach((_, i) => {
      totalParts++;
      const chipId = `exp-q${q.id}-${i}`;
      const att = expPartAttempts.get(chipId);
      if (att && (att.correct + att.wrong) > 0) {
        touchedParts++;
        if (att.correct > 0) correctParts++;
        if (att.wrong > 0) wrongParts++;
      }
    });
  });

  // 每題的詳解完成度
  let fullyPlacedCount = 0;
  questions.forEach(q => {
    if (expCompletedSet.has(q.id)) fullyPlacedCount++;
  });

  const summaryHtml = `
    <div class="option-summary-bar">
      <div class="option-summary-item"><div class="os-val" style="color:#4a7c59;">${totalParts}</div><div class="os-label">詳解卡總數</div></div>
      <div class="option-summary-item"><div class="os-val" style="color:#0284c7;">${touchedParts}</div><div class="os-label">已嘗試</div></div>
      <div class="option-summary-item"><div class="os-val" style="color:#16a34a;">${correctParts}</div><div class="os-label">正確歸位</div></div>
      <div class="option-summary-item"><div class="os-val" style="color:#dc2626;">${wrongParts}</div><div class="os-label">曾放錯</div></div>
      <div class="option-summary-item"><div class="os-val" style="color:#f59e0b;">${fullyPlacedCount}/${questions.length}</div><div class="os-label">完成全部詳解</div></div>
    </div>`;

  // 分組卡片（每題一組）
  const groupsHtml = questions.map((q, qIdx) => {
    const clickableQ = makeClickableText(q.question.length > 30 ? q.question.slice(0, 30) + '…' : q.question);
    const placedArr = getExpPlaced(q.id);
    const isCompleted = expCompletedSet.has(q.id);
    const completionPct = q.expParts.length > 0 ? Math.round(placedArr.length / q.expParts.length * 100) : 0;

    const partRows = q.expParts.map((part, i) => {
      const chipId = `exp-q${q.id}-${i}`;
      const att = expPartAttempts.get(chipId) || { correct: 0, wrong: 0 };
      const totalAtt = att.correct + att.wrong;
      const isPlaced = placedArr.includes(chipId);
      const barColor = isPlaced ? '#4a7c59' : (att.wrong > 0 ? '#f87171' : (totalAtt > 0 ? '#fbbf24' : '#e5e7eb'));
      const clickablePart = makeClickableText(part.length > 50 ? part.slice(0, 50) + '…' : part);
      return `<div class="iwt-row" style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;border-bottom:1px solid #f0f0f0;${isPlaced ? 'background:#f0fdf4;' : ''}">
        <div style="min-width:28px;font-size:0.72rem;font-weight:700;color:${isPlaced ? '#16a34a' : '#999'};">#${i + 1}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.75rem;line-height:1.4;">${clickablePart} ${isPlaced ? '<span style="color:#16a34a;font-weight:700;">✓</span>' : ''}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
            <div style="flex:1;height:4px;background:#f0f0f0;border-radius:2px;">
              <div style="height:100%;width:${isPlaced ? 100 : (totalAtt > 0 ? 50 : 3)}%;background:${barColor};border-radius:2px;"></div>
            </div>
            <span style="font-size:0.6rem;color:#888;min-width:40px;">${totalAtt > 0 ? `✓${att.correct} ✗${att.wrong}` : '—'}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    const statusBadge = isCompleted
      ? '<span style="font-size:0.6rem;background:#dcfce7;color:#16a34a;padding:1px 6px;border-radius:8px;">✓ 完成</span>'
      : (completionPct > 0
        ? `<span style="font-size:0.6rem;background:#fef3c7;color:#ca8a04;padding:1px 6px;border-radius:8px;">${completionPct}%</span>`
        : '<span style="font-size:0.6rem;background:#f3f4f6;color:#999;padding:1px 6px;border-radius:8px;">未開始</span>');

    return `<div class="chip-mastery-group">
      <div class="chip-mastery-group-header" onclick="this.closest('.chip-mastery-group').classList.toggle('expanded')">
        <span class="cmg-qid" onclick="event.stopPropagation();goToPage(${qIdx})">Q${q.id}</span>
        <span class="cmg-question">${clickableQ} ${statusBadge}</span>
        <span class="cmg-arrow">▶</span>
      </div>
      <div class="chip-mastery-group-body">${partRows}</div>
    </div>`;
  }).join('');

  return `${summaryHtml}
    <div style="font-size:0.82rem;font-weight:700;color:#d97706;margin:12px 0 8px;">📖 詳解小卡分析（按題分組）<span style="font-size:0.65rem;color:#a0aec0;font-weight:400;margin-left:8px;">💡 點擊德文單字可查看 Trace</span></div>
    ${groupsHtml}`;
}

function restart() {
  solvedSet.clear(); expPlacedMap.clear(); expCompletedSet.clear(); orderCheckResults.clear();
  quizAttempts.clear(); navHistory = []; navForwardHistory = [];
  currentPage = 0;
  shuffle(answerChips); buildExpChips(); rebuildChipIndex();
  document.getElementById('completionArea').innerHTML = '';
  // 注意：restart 只清除當輪作答狀態，保留歷史統計（questionStats, optionAttempts, expPartAttempts）
  scheduleSaveLocal();
  if (questions.length >= 4) {
    startQuiz();
  } else {
    viewMode = 'single';
    renderAll();
  }
}

// ==================== 匯入/清空功能已移除 ====================

// ==================== Sidebar Resizer ====================
(function initSidebarResizer() {
  const resizer = document.getElementById('sidebarResizer');
  const sidebar = document.getElementById('sidebar');
  if (!resizer || !sidebar) return;
  let isResizing = false, startX = 0, startW = 0;

  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    resizer.classList.add('active');
    resizer.setPointerCapture(e.pointerId);
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!isResizing) return;
    e.preventDefault();
    const newW = Math.max(180, Math.min(500, startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
  });
  const stopResize = () => {
    isResizing = false;
    resizer.classList.remove('active');
  };
  resizer.addEventListener('pointerup', stopResize);
  resizer.addEventListener('pointercancel', stopResize);
})();

// ==================== 滑動手勢 ====================
let swipeStartX = null;
const mc = document.getElementById('mainContent');
mc.addEventListener('touchstart', (e) => {
  if (viewMode === 'quiz') return; // quiz 模式不用左右滑
  if (e.target.closest('.answer-chip, .exp-chip, .exp-slot.filled, .nav-btn')) return;
  swipeStartX = e.touches[0].clientX;
}, { passive: true });
mc.addEventListener('touchend', (e) => {
  if (swipeStartX === null) return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  if (Math.abs(dx) > 60) goPage(dx < 0 ? 1 : -1);
  swipeStartX = null;
}, { passive: true });

// ==================== Google 登入 + Sheets 同步（Apps Script 版） ====================
// ── 設定 ──
const GOOGLE_CLIENT_ID = '280426045341-s5tias2et5fgfkm6v4pasodaimi9usot.apps.googleusercontent.com';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxm9_wdIwf2RdXgj2TOfxGlw1eOaIYfe-jUy8_4_89Pcb_DFu3NjpJwesR7IV4IRCWfYQ/exec';

let gUser = JSON.parse(localStorage.getItem('flashcard_guser') || 'null'); // { name, email, picture }
let gSyncStatus = 'idle';
let gLastSyncTime = null;
// ── Google Sign-In 初始化 ──
function initGoogleSignIn() {
  if (typeof google === 'undefined' || !google.accounts) {
    // 延遲重試
    setTimeout(initGoogleSignIn, 500);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleSignIn,
    auto_select: true,   // 自動選擇已登入的帳號（靜默登入）
    cancel_on_tap_outside: true,
  });
  // 如果之前已登入，嘗試靜默重新驗證
  if (gUser) {
    google.accounts.id.prompt(); // One Tap 靜默提示
  }
  renderAuthUI();
}

// ── 處理登入回調 ──
function handleGoogleSignIn(response) {
  // response.credential 是 JWT ID token
  const payload = parseJwt(response.credential);
  gUser = {
    name: payload.name || payload.email,
    email: payload.email,
    picture: payload.picture || ''
  };
  localStorage.setItem('flashcard_guser', JSON.stringify(gUser));
  renderAuthUI();
  // 登入後自動從 Sheet 載入
  syncFromSheets();
}

// ── 解析 JWT（不需要驗證，僅解碼 payload） ──
function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch (e) {
    return {};
  }
}

// ── 登出 ──
function googleLogout() {
  gUser = null;
  localStorage.removeItem('flashcard_guser');
  gSyncStatus = 'idle';
  gLastSyncTime = null;
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
  renderAuthUI();
}

// ── 手動觸發登入 ──
function googleLogin() {
  if (typeof google === 'undefined' || !google.accounts) {
    alert('Google 登入服務載入中，請稍候再試');
    return;
  }
  google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      // One Tap 無法顯示（可能被瀏覽器擋了），改用彈出式登入
      google.accounts.id.renderButton(
        document.getElementById('googleSignInFallback'),
        { theme: 'outline', size: 'large', width: '100%', text: 'signin_with' }
      );
      const fb = document.getElementById('googleSignInFallback');
      if (fb) fb.style.display = 'block';
    }
  });
}

// ── Auth + Sync UI ──
function renderAuthUI() {
  const container = document.getElementById('googleAuthContent');
  if (!container) return;

  // 未登入狀態
  if (!gUser) {
    container.innerHTML = `
      <button class="g-login-btn" onclick="googleLogin()">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        使用 Google 登入
      </button>
      <div id="googleSignInFallback" style="display:none; margin-top:6px;"></div>
      <div style="font-size:0.6rem; color:#bbb; margin-top:6px; text-align:center;">登入後自動同步學習進度</div>`;
    return;
  }

  // 已登入狀態
  const syncDot = gSyncStatus;
  const syncText = gSyncStatus === 'idle' ? '已連線'
    : gSyncStatus === 'syncing' ? '同步中…'
    : gSyncStatus === 'success' ? `✓ ${gLastSyncTime || '已同步'}`
    : '✗ 同步失敗';

  container.innerHTML = `
    <div class="g-user-bar">
      ${gUser.picture ? `<img src="${gUser.picture}" referrerpolicy="no-referrer">` : '<div style="width:26px;height:26px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:0.65rem;">👤</div>'}
      <span class="g-name" title="${gUser.email}">${gUser.name}</span>
      <button class="g-logout-btn" onclick="googleLogout()">登出</button>
    </div>
    <div class="gs-sync-bar">
      <span class="sync-dot ${syncDot}"></span>
      <span class="sync-text">${syncText}</span>
    </div>
    <div class="gs-sync-actions">
      <button class="gs-sync-btn" onclick="syncFromSheets()" title="從 Google Sheet 載入">⬇ 載入</button>
    </div>`;
}

function getAppsScriptUrl() {
  return APPS_SCRIPT_URL || localStorage.getItem('flashcard_apps_script_url') || '';
}

function updateSyncStatus(status) {
  gSyncStatus = status;
  if (status === 'success') gLastSyncTime = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  renderAuthUI();
}

// ── 從 Apps Script 載入 ──
async function syncFromSheets() {
  if (!gUser) { alert('請先登入 Google'); return; }
  const url = getAppsScriptUrl();
  if (!url) { alert('尚未設定 Apps Script 網址'); return; }
  updateSyncStatus('syncing');
  try {
    const resp = await fetch(url + '?action=getAll');
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // 載入題目
    if (data.questions && data.questions.length > 0) {
      questions.length = 0;
      questions.push(...data.questions);
    }

    // 載入進度
    if (data.stats) {
      restoreProgress(data.stats);
    }

    // 重建 UI
    orderCheckResults.clear();
    answerChips = [];
    questions.forEach(q => {
      q.options.forEach((opt, i) => {
        answerChips.push({
          chipId: `ans-q${q.id}-${i}`, type: 'answer',
          questionId: q.id, label: (q.labels || ['A','B','C','D'])[i] || String.fromCharCode(65+i),
          text: opt, isCorrect: i === q.correctIndex
        });
      });
    });
    shuffle(answerChips);
    buildExpChips();
    rebuildChipIndex();
    _catMapQLen = -1; _answerIndexQLen = -1; _optionIndexQLen = -1; _expIndexQLen = -1; _wordIndexQLen = -1;
    _indexNeedsUpdate = true;
    currentPage = Math.min(currentPage, questions.length - 1);
    renderAll();
    saveProgressLocal(); // 遠端進度同步到本地
    updateSyncStatus('success');
  } catch (err) {
    console.error('Load error:', err);
    updateSyncStatus('error');
    alert('載入失敗：' + err.message);
  }
}

// ── 進度序列化 / 還原 ──
const PROGRESS_STORAGE_KEY = 'flashcard_progress';
let _saveTimer = null;

function buildProgressJson() {
  return {
    questionStats: [...questionStats.entries()].map(([k, v]) => [k, v]),
    optionAttempts: [...optionAttempts.entries()].map(([k, v]) => [k, v]),
    expPartAttempts: [...expPartAttempts.entries()].map(([k, v]) => [k, v]),
    solvedSet: [...solvedSet],
    expPlacedMap: [...expPlacedMap.entries()].map(([k, v]) => [k, v]),
    expCompletedSet: [...expCompletedSet],
    orderCheckResults: [...orderCheckResults.entries()].map(([k, v]) => [k, v]),
    currentPage: currentPage,
    savedAt: new Date().toISOString()
  };
}

function restoreProgress(progress) {
  if (!progress) return;
  try {
    questionStats.clear();
    if (progress.questionStats) progress.questionStats.forEach(([k, v]) => questionStats.set(k, v));
    optionAttempts.clear();
    if (progress.optionAttempts) progress.optionAttempts.forEach(([k, v]) => optionAttempts.set(k, v));
    expPartAttempts.clear();
    if (progress.expPartAttempts) progress.expPartAttempts.forEach(([k, v]) => expPartAttempts.set(k, v));
    solvedSet.clear();
    if (progress.solvedSet) progress.solvedSet.forEach(id => solvedSet.add(id));
    expPlacedMap.clear();
    if (progress.expPlacedMap) progress.expPlacedMap.forEach(([k, v]) => expPlacedMap.set(k, v));
    expCompletedSet.clear();
    if (progress.expCompletedSet) progress.expCompletedSet.forEach(id => expCompletedSet.add(id));
    orderCheckResults.clear();
    if (progress.orderCheckResults) progress.orderCheckResults.forEach(([k, v]) => orderCheckResults.set(k, v));
    if (typeof progress.currentPage === 'number') currentPage = progress.currentPage;
  } catch (e) {
    console.warn('Failed to restore progress:', e);
  }
}

// ── localStorage 持久化 ──
function saveProgressLocal() {
  try {
    const json = buildProgressJson();
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(json));
  } catch (e) {
    console.warn('無法儲存進度至 localStorage:', e);
  }
}

// 防抖儲存：避免拖放時頻繁寫入，延遲 500ms
function scheduleSaveLocal() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveProgressLocal, 500);
}

function loadProgressLocal() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return false;
    const progress = JSON.parse(raw);
    restoreProgress(progress);
    console.log('✅ 已從 localStorage 還原進度', progress.savedAt ? `(${progress.savedAt})` : '');
    return true;
  } catch (e) {
    console.warn('無法從 localStorage 載入進度:', e);
    return false;
  }
}

function clearProgressLocal() {
  localStorage.removeItem(PROGRESS_STORAGE_KEY);
  console.log('🗑️ 已清除本地進度');
}

// ==================== 啟動 ====================
// 先從 localStorage 還原進度
loadProgressLocal();

// 初始進入 quiz 模式（先用本地題庫）
if (questions.length >= 4) {
  startQuiz();
} else {
  viewMode = 'single';
  renderAll();
}

// 瀏覽器關閉/跳走前自動儲存
window.addEventListener('beforeunload', saveProgressLocal);

// 初始化 Google Sign-In
renderAuthUI();
window.addEventListener('load', initGoogleSignIn);
