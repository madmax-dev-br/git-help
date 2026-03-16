// ============================================================
// GitLab Repository Manager - App
// ============================================================

const App = {
  gitlabUrl: 'https://gitlab.com',
  token: '',
  projectPath: localStorage.getItem('sdui_project_path') || '',
  pipelineConfig: null,
  compareConfig: null,
  projects: [],
  selectedProject: null,
  selectedBranch: null,
  submodules: [],
  processCards: [],
  pollingIntervals: {},
  branchesCache: [],
  unseenCount: 0,
  drawerOpen: false,
  favorites: JSON.parse(localStorage.getItem('favorite_projects') || '[]'),
};

// ============================================================
// API Module
// ============================================================

const API = {
  _buildUrl(endpoint) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const target = `${App.gitlabUrl}/api/v4${endpoint}${sep}private_token=${encodeURIComponent(App.token)}`;
    return `/proxy?url=${encodeURIComponent(target)}`;
  },

  async fetch(endpoint, options = {}) {
    const url = this._buildUrl(endpoint);
    const headers = { ...options.headers };
    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const resp = await fetch(url, { ...options, headers });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API ${resp.status}: ${err}`);
    }
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return resp.json();
    return resp.text();
  },

  async fetchAll(endpoint) {
    let page = 1;
    let all = [];
    while (true) {
      const sep = endpoint.includes('?') ? '&' : '?';
      const target = `${App.gitlabUrl}/api/v4${endpoint}${sep}per_page=100&page=${page}&private_token=${encodeURIComponent(App.token)}`;
      const url = `/proxy?url=${encodeURIComponent(target)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      all = all.concat(data);
      const next = resp.headers.get('x-next-page');
      if (!next || next === '') break;
      page = parseInt(next);
    }
    return all;
  },

  validateToken() { return this.fetch('/user'); },
  getProjects() { return this.fetchAll('/projects?membership=true&order_by=name&sort=asc'); },

  getFileRaw(projectId, filePath, ref) {
    return this.fetch(`/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`);
  },

  getProjectByPath(path) {
    return this.fetch(`/projects/${encodeURIComponent(path)}`);
  },

  getBranches(projectId) {
    return this.fetchAll(`/projects/${projectId}/repository/branches`);
  },

  createBranch(projectId, branchName, ref) {
    return this.fetch(`/projects/${projectId}/repository/branches`, {
      method: 'POST',
      body: { branch: branchName, ref },
    });
  },

  updateFile(projectId, filePath, branch, content, commitMessage) {
    return this.fetch(`/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      body: { branch, content, commit_message: commitMessage },
    });
  },

  createPipeline(projectId, ref, variables = []) {
    return this.fetch(`/projects/${projectId}/pipeline`, {
      method: 'POST',
      body: { ref, variables },
    });
  },

  getPipeline(projectId, pipelineId) {
    return this.fetch(`/projects/${projectId}/pipelines/${pipelineId}`);
  },

  createMergeRequest(projectId, sourceBranch, targetBranch, title, labels = [], milestoneId = null) {
    const body = {
      source_branch: sourceBranch,
      target_branch: targetBranch,
      title,
    };
    if (labels.length) body.labels = labels.join(',');
    if (milestoneId) body.milestone_id = milestoneId;
    return this.fetch(`/projects/${projectId}/merge_requests`, {
      method: 'POST',
      body,
    });
  },

  getLabels(projectId) {
    return this.fetchAll(`/projects/${projectId}/labels`);
  },

  async getMilestones(projectId) {
    // Try project milestones first, then also fetch group milestones if project belongs to a group
    const projectMilestones = await this.fetchAll(`/projects/${projectId}/milestones?state=active`);
    try {
      const proj = App.selectedProject;
      if (proj && proj.namespace && proj.namespace.kind === 'group') {
        const groupId = proj.namespace.id;
        const groupMilestones = await this.fetchAll(`/groups/${groupId}/milestones?state=active`);
        // Merge, avoiding duplicates by title
        const titles = new Set(projectMilestones.map(m => m.title));
        for (const gm of groupMilestones) {
          if (!titles.has(gm.title)) projectMilestones.push(gm);
        }
      }
    } catch { /* group milestones not available */ }
    return projectMilestones;
  },

  getLastCommit(projectId, ref) {
    return this.fetch(`/projects/${projectId}/repository/commits?ref_name=${encodeURIComponent(ref)}&per_page=1`);
  },

  compareBranches(projectId, from, to) {
    return this.fetch(`/projects/${projectId}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  },
};

// ============================================================
// UI Helpers
// ============================================================

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function notify(title, body) {
  const type = body.includes('fail') || body.includes('error') ? 'error' : 'success';
  showToast(`${title}: ${body}`, type);
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Build a GitLab web URL for a project
function projectWebUrl(projectId) {
  const proj = findProject(projectId);
  return proj ? proj.web_url : `${App.gitlabUrl}`;
}

function findProject(projectId) {
  if (App.selectedProject?.id === projectId) return App.selectedProject;
  const sub = App.submodules.find(s => s.projectId === projectId);
  return sub?.project || null;
}

// ============================================================
// Time & Recent Branches Helpers
// ============================================================

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { text: 'Today', css: 'today' };
  if (diffDays === 1) return { text: 'Yesterday', css: 'yesterday' };
  return { text: `${diffDays}d ago`, css: 'older' };
}

function getRecentBranches() {
  try {
    return JSON.parse(localStorage.getItem('recent_branches') || '[]');
  } catch { return []; }
}

function addRecentBranch(name) {
  let recent = getRecentBranches().filter(b => b !== name);
  recent.unshift(name);
  if (recent.length > 8) recent = recent.slice(0, 8);
  localStorage.setItem('recent_branches', JSON.stringify(recent));
}

// ============================================================
// Branch Autocomplete Component
// ============================================================

function branchInputHtml(inputId, placeholder = 'Type branch name...') {
  const recent = getRecentBranches();
  const recentHtml = recent.length
    ? `<div class="recent-branches" id="${inputId}-recent">${recent.map(b =>
        `<span class="recent-branch-tag" data-branch="${b}" data-target="${inputId}"><i class="fas fa-history"></i> ${b}</span>`
      ).join('')}</div>`
    : '';

  return `
    <div class="branch-input-wrap" id="${inputId}-wrap">
      <input type="text" id="${inputId}" placeholder="${placeholder}" autocomplete="off" />
      <div class="branch-suggestions" id="${inputId}-suggestions"></div>
    </div>
    ${recentHtml}
  `;
}

function initBranchAutocomplete(inputId, branches) {
  const input = document.getElementById(inputId);
  const suggestionsEl = document.getElementById(`${inputId}-suggestions`);
  if (!input || !suggestionsEl) return;

  let highlighted = -1;

  function renderSuggestions(filter) {
    const q = filter.toLowerCase();
    const filtered = q ? branches.filter(b => b.name.toLowerCase().includes(q)) : branches.slice(0, 20);
    if (!filtered.length) {
      suggestionsEl.classList.remove('visible');
      return;
    }
    highlighted = -1;
    suggestionsEl.innerHTML = filtered.map((b, i) =>
      `<div class="branch-suggestion" data-name="${b.name}" data-index="${i}"><i class="fas fa-code-branch"></i> ${b.name}</div>`
    ).join('');
    suggestionsEl.classList.add('visible');

    suggestionsEl.querySelectorAll('.branch-suggestion').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = el.dataset.name;
        suggestionsEl.classList.remove('visible');
      });
    });
  }

  input.addEventListener('focus', () => renderSuggestions(input.value));
  input.addEventListener('input', () => renderSuggestions(input.value));
  input.addEventListener('blur', () => setTimeout(() => suggestionsEl.classList.remove('visible'), 150));
  input.addEventListener('keydown', (e) => {
    const items = suggestionsEl.querySelectorAll('.branch-suggestion');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === highlighted));
      if (items[highlighted]) items[highlighted].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === highlighted));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && items[highlighted]) {
        input.value = items[highlighted].dataset.name;
        suggestionsEl.classList.remove('visible');
      }
    } else if (e.key === 'Escape') {
      suggestionsEl.classList.remove('visible');
    }
  });

  // Set default to default branch
  if (App.selectedProject) {
    input.value = App.selectedBranch || App.selectedProject.default_branch || 'main';
  }
}

// Click handler for recent branch tags (delegated)
document.addEventListener('click', (e) => {
  const tag = e.target.closest('.recent-branch-tag');
  if (!tag) return;
  const targetId = tag.dataset.target;
  const input = document.getElementById(targetId);
  if (input) input.value = tag.dataset.branch;
});

// ============================================================
// .gitmodules Parser
// ============================================================

function parseGitmodules(text) {
  const modules = [];
  let current = null;
  for (const line of text.split('\n')) {
    const sectionMatch = line.match(/\[submodule\s+"(.+?)"\]/);
    if (sectionMatch) {
      current = { name: sectionMatch[1], path: '', url: '' };
      modules.push(current);
      continue;
    }
    if (!current) continue;
    const kvMatch = line.match(/^\s*(path|url)\s*=\s*(.+)/);
    if (kvMatch) current[kvMatch[1]] = kvMatch[2].trim();
  }
  return modules;
}

function extractGitlabPath(url) {
  let path = url.replace(/\.git$/, '');
  const sshMatch = path.match(/@[^:]+:(.+)/);
  if (sshMatch) return sshMatch[1];
  try { return new URL(path).pathname.replace(/^\//, ''); }
  catch { return path; }
}

// ============================================================
// Connection
// ============================================================

// ============================================================
// Setup Flow
// ============================================================

function showSetupScreen() {
  $('#setup-overlay').classList.remove('hidden');
  const savedPath = App.projectPath;
  if (savedPath) $('#setup-path').value = savedPath;
  $('#setup-path').focus();
}

function hideSetupScreen() {
  $('#setup-overlay').classList.add('hidden');
}

async function setupConnect(projectPath) {
  const errorEl = $('#setup-error');
  errorEl.classList.add('hidden');

  const btn = $('#btn-setup-connect');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connecting...';

  try {
    const resp = await fetch('/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
    });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Server returned invalid response. Make sure you are using server.py (http://localhost:8080)');
    }

    if (!resp.ok) {
      errorEl.textContent = data.error || 'Setup failed';
      errorEl.classList.remove('hidden');
      return;
    }

    App.token = data.token;
    App.projectPath = projectPath;
    App.pipelineConfig = data.pipelineConfig;
    App.compareConfig = data.compareConfig;
    localStorage.setItem('sdui_project_path', projectPath);

    hideSetupScreen();
    await connectToGitlab();
  } catch (e) {
    errorEl.textContent = e.message || 'Connection error';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plug"></i> Connect';
  }
}

async function connectToGitlab() {
  const status = $('#connection-status');
  status.innerHTML = '<span class="spinner"></span> Connecting...';

  try {
    const user = await API.validateToken();
    status.innerHTML = `<i class="fas fa-check-circle"></i> ${user.username}`;
    status.className = 'status-ok';
    $('#btn-change-project').classList.remove('hidden');
    requestNotificationPermission();
    loadProjects();
  } catch (e) {
    status.innerHTML = '<i class="fas fa-times-circle"></i> Failed';
    status.className = 'status-error';
    showToast('Token validation failed: ' + e.message, 'error');
    showSetupScreen();
  }
}

// ============================================================
// Projects
// ============================================================

async function loadProjects() {
  const list = $('#project-list');
  list.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading projects...</p></div>';
  $('#project-search').disabled = false;

  try {
    App.projects = await API.getProjects();
    renderProjectList(App.projects);
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading projects</p></div>';
    showToast(e.message, 'error');
  }
}

function toggleFavorite(projectId, e) {
  e.stopPropagation();
  const idx = App.favorites.indexOf(projectId);
  if (idx >= 0) {
    App.favorites.splice(idx, 1);
  } else {
    App.favorites.push(projectId);
  }
  localStorage.setItem('favorite_projects', JSON.stringify(App.favorites));
  // Re-render with current filter
  const q = $('#project-search').value.toLowerCase();
  const filtered = q
    ? App.projects.filter(p => p.name.toLowerCase().includes(q) || p.path_with_namespace.toLowerCase().includes(q))
    : App.projects;
  renderProjectList(filtered);
}

function projectItemHtml(p) {
  const isFav = App.favorites.includes(p.id);
  return `
    <div class="project-item ${App.selectedProject?.id === p.id ? 'active' : ''}" data-id="${p.id}">
      <div class="project-icon"><i class="fas fa-cube"></i></div>
      <div class="project-item-info">
        <div class="project-item-name">${p.name}</div>
        <div class="project-item-path">${p.path_with_namespace}</div>
      </div>
      <button class="fav-btn ${isFav ? 'fav-active' : ''}" data-fav-id="${p.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
        <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
      </button>
    </div>
  `;
}

function renderProjectList(projects) {
  const list = $('#project-list');
  if (!projects.length) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No projects found</p></div>';
    return;
  }

  const favProjects = projects.filter(p => App.favorites.includes(p.id));
  const otherProjects = projects.filter(p => !App.favorites.includes(p.id));

  let html = '';
  if (favProjects.length) {
    html += '<div class="project-list-section"><div class="project-list-section-title"><i class="fas fa-star"></i> Favorites</div>';
    html += favProjects.map(projectItemHtml).join('');
    html += '</div>';
    if (otherProjects.length) {
      html += '<div class="project-list-divider"></div>';
      html += '<div class="project-list-section"><div class="project-list-section-title"><i class="fas fa-folder-open"></i> All Projects</div>';
      html += otherProjects.map(projectItemHtml).join('');
      html += '</div>';
    }
  } else {
    html = projects.map(projectItemHtml).join('');
  }

  list.innerHTML = html;

  list.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => selectProject(parseInt(el.dataset.id)));
  });

  list.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => toggleFavorite(parseInt(btn.dataset.favId), e));
  });

  // Auto-select first favorite, or first project
  if (!App.selectedProject) {
    const favProjects = projects.filter(p => App.favorites.includes(p.id));
    const first = favProjects.length ? favProjects[0] : projects[0];
    if (first) selectProject(first.id);
  }
}

async function selectProject(projectId) {
  const project = App.projects.find(p => p.id === projectId);
  if (!project) return;
  App.selectedProject = project;
  App.selectedBranch = project.default_branch || 'main';
  App.submodules = [];
  App.branchesCache = [];

  renderProjectList(App.projects);

  $('#no-project-selected').classList.add('hidden');
  $('#project-detail').classList.remove('hidden');
  $('#right-panel').classList.remove('hidden');
  $('#app').classList.remove('no-right-panel');
  $('#project-name').textContent = project.name;
  $('#project-description').textContent = project.description || '';
  $('#project-web-link').href = project.web_url || '#';

  // Show current branch
  renderCurrentBranch();

  // Pre-fetch branches
  API.getBranches(project.id).then(branches => { App.branchesCache = branches; }).catch(() => {});

  const subList = $('#submodules-list');
  subList.innerHTML = '<div style="padding:10px;color:var(--text-secondary)"><span class="spinner"></span> Loading submodules...</div>';

  try {
    const raw = await API.getFileRaw(project.id, '.gitmodules', App.selectedBranch);
    const modules = parseGitmodules(raw);

    const resolved = await Promise.allSettled(
      modules.map(async (m) => {
        const glPath = extractGitlabPath(m.url);
        try {
          const proj = await API.getProjectByPath(glPath);
          return { ...m, projectId: proj.id, project: proj };
        } catch {
          return { ...m, projectId: null, project: null };
        }
      })
    );

    App.submodules = resolved.filter(r => r.status === 'fulfilled').map(r => r.value);
    renderSubmodules();

    // Fetch last commit for each project (main + submodules)
    fetchCommitInfo();
  } catch {
    App.submodules = [];
    renderSubmodules();
    fetchCommitInfo();
  }
}

function renderCurrentBranch() {
  // Branch is now shown on each module card
}

async function fetchCommitInfo() {
  const allProjects = [
    { id: App.selectedProject.id, name: App.selectedProject.name, web_url: App.selectedProject.web_url },
    ...App.submodules.filter(s => s.projectId).map(s => ({ id: s.projectId, name: s.name, web_url: s.project?.web_url }))
  ];

  for (const proj of allProjects) {
    try {
      const commits = await API.getLastCommit(proj.id, App.selectedBranch);
      if (commits && commits.length) {
        const commit = commits[0];
        const age = timeAgo(commit.committed_date);
        // Update the submodule item with commit info
        const subEl = document.querySelector(`[data-commit-proj="${proj.id}"]`);
        if (subEl) {
          const branchTag = subEl.querySelector('.sub-branch-tag');
          const branchHtml = branchTag ? branchTag.outerHTML : '';
          subEl.innerHTML = `
            ${branchHtml}
            <a class="commit-hash" href="${proj.web_url}/-/commit/${commit.short_id}" target="_blank">${commit.short_id}</a>
            <span class="commit-age ${age.css}">${age.text}</span>
          `;
        }
      }
    } catch { /* ignore */ }
  }
}

function renderSubmodules() {
  const subList = $('#submodules-list');
  const branch = App.selectedBranch || 'main';

  // Main project entry first
  const mainHtml = `
    <div class="submodule-item">
      <div class="submodule-icon" style="background:var(--accent-glow);color:var(--accent)"><i class="fas fa-cube"></i></div>
      <div class="sub-info">
        <div class="sub-name">${App.selectedProject.name} <small style="color:var(--text-muted)">(main)</small></div>
        <div class="sub-path">${App.selectedProject.path_with_namespace}</div>
      </div>
      <div class="sub-commit" data-commit-proj="${App.selectedProject.id}">
        <span class="sub-branch-tag"><i class="fas fa-code-branch"></i> ${branch}</span>
        <span class="spinner"></span>
      </div>
    </div>
  `;

  const subsHtml = App.submodules.map(s => `
    <div class="submodule-item">
      <div class="submodule-icon"><i class="fas fa-puzzle-piece"></i></div>
      <div class="sub-info">
        <div class="sub-name">${s.name}</div>
        <div class="sub-path">${s.path}</div>
      </div>
      ${s.project
        ? `<div class="sub-commit" data-commit-proj="${s.projectId}">
            <span class="sub-branch-tag"><i class="fas fa-code-branch"></i> ${branch}</span>
            <span class="spinner"></span>
          </div>`
        : '<span class="sub-badge unresolved">unresolved</span>'
      }
    </div>
  `).join('');

  subList.innerHTML = mainHtml + subsHtml;
}

// ============================================================
// Project Search Filter
// ============================================================

$('#project-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderProjectList(App.projects.filter(p =>
    p.name.toLowerCase().includes(q) || p.path_with_namespace.toLowerCase().includes(q)
  ));
});

// ============================================================
// Modal System
// ============================================================

function openModal(title, bodyHtml, onRun, { keepOpen = false, runLabel = '<i class="fas fa-play"></i> Run', fullscreen = false } = {}) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal-overlay').classList.remove('hidden');
  $('#modal').classList.toggle('modal-fullscreen', fullscreen);

  const runBtn = $('#modal-run');
  const newBtn = runBtn.cloneNode(true);
  newBtn.disabled = false;
  newBtn.style.opacity = '1';
  newBtn.style.cursor = 'pointer';
  newBtn.innerHTML = runLabel;
  runBtn.replaceWith(newBtn);
  newBtn.addEventListener('click', () => { if (!keepOpen) closeModal(); onRun(); });
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal').classList.remove('modal-fullscreen');
}

$('#modal-close').addEventListener('click', closeModal);
$('#modal-cancel').addEventListener('click', closeModal);
$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('#modal-overlay')) closeModal();
});

// ============================================================
// Project Checkboxes
// ============================================================

function projectCheckboxesHtml() {
  const items = [];
  if (App.selectedProject) {
    items.push(`<div class="checkbox-item">
      <input type="checkbox" value="${App.selectedProject.id}" checked
        data-name="${App.selectedProject.name}" data-path="${App.selectedProject.path_with_namespace}">
      <span>${App.selectedProject.name} <small style="color:var(--text-muted)">(main)</small></span>
    </div>`);
  }
  for (const s of App.submodules) {
    if (s.projectId) {
      items.push(`<div class="checkbox-item">
        <input type="checkbox" value="${s.projectId}" checked
          data-name="${s.name}" data-path="${s.project?.path_with_namespace || ''}">
        <span>${s.name}</span>
      </div>`);
    }
  }
  return `<div class="checkbox-list" id="project-checkboxes">${items.join('')}</div>`;
}

function getSelectedProjects() {
  return Array.from($$('#project-checkboxes input:checked')).map(cb => ({
    id: parseInt(cb.value),
    name: cb.dataset.name,
    path: cb.dataset.path,
  }));
}

// ============================================================
// Actions
// ============================================================

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'select-branch') openSelectBranchDialog();
  else if (action === 'create-branch') openCreateBranchDialog();
  else if (action === 'create-mr') openCreateMRDialog();
  else if (action === 'change-version') openChangeVersionDialog();
  else if (action === 'start-pipeline') openStartPipelineDialog();
  else if (action === 'compare-branches') openCompareBranchesDialog();
  else if (action === 'merge-back') openMergeBackDialog();
});

// --- Select Branch ---

async function openSelectBranchDialog() {
  const proj = App.selectedProject;
  if (!proj) return;

  const html = `
    <div class="form-group">
      <label>Branch</label>
      ${branchInputHtml('dlg-select-branch', 'Type to search branches...')}
    </div>
  `;

  openModal('Select Branch', html, () => {
    const branch = $('#dlg-select-branch').value.trim();
    if (!branch) { showToast('Select a branch', 'error'); return; }
    App.selectedBranch = branch;
    addRecentBranch(branch);
    // Re-render submodules with new branch commit info
    renderSubmodules();
    fetchCommitInfo();
    showToast(`Switched to ${branch}`, 'success');
  }, { runLabel: '<i class="fas fa-random"></i> Switch' });

  // Wait for DOM then init autocomplete
  await ensureBranches();
  initBranchAutocomplete('dlg-select-branch', App.branchesCache);
}

async function ensureBranches() {
  if (App.branchesCache.length) return;
  try {
    App.branchesCache = await API.getBranches(App.selectedProject.id);
  } catch { showToast('Failed to load branches', 'error'); }
}

// --- Create Branch ---

async function openCreateBranchDialog() {
  const proj = App.selectedProject;
  if (!proj) return;

  const html = `
    <div class="form-group">
      <label>Source Branch</label>
      ${branchInputHtml('dlg-source-branch', 'Source branch...')}
    </div>
    <div class="form-group">
      <label>New Branch Name</label>
      <input type="text" id="dlg-new-branch" placeholder="feature/my-branch" />
    </div>
    <div class="form-group">
      <label>Apply to Projects</label>
      ${projectCheckboxesHtml()}
    </div>
  `;

  openModal('Create Branch', html, () => {
    const source = $('#dlg-source-branch').value.trim();
    const name = $('#dlg-new-branch').value.trim();
    const projects = getSelectedProjects();
    if (!name) { showToast('Branch name required', 'error'); return; }
    if (!source) { showToast('Source branch required', 'error'); return; }
    addRecentBranch(source);
    runCreateBranch(projects, name, source);
  }, { runLabel: '<i class="fas fa-code-branch"></i> Create' });

  await ensureBranches();
  initBranchAutocomplete('dlg-source-branch', App.branchesCache);
}

function runCreateBranch(projects, branchName, sourceBranch) {
  const desc = `${branchName} from ${sourceBranch}`;
  const card = createProcessCard('create-branch', 'Create Branch', desc, projects);

  addRecentBranch(branchName);

  (async () => {
    projects.forEach(p => updateCardDetail(card, p.id, 'running'));
    await Promise.all(projects.map(async (proj) => {
      try {
        await API.createBranch(proj.id, branchName, sourceBranch);
        const webUrl = projectWebUrl(proj.id);
        updateCardDetail(card, proj.id, 'success', 'Created', {
          url: `${webUrl}/-/tree/${encodeURIComponent(branchName)}`,
          label: branchName,
        });
      } catch (e) {
        updateCardDetail(card, proj.id, 'failed', e.message);
      }
    }));
    finalizeCard(card);
  })();
}

// --- Create Merge Request ---

function initSuggestInput(inputId, items, displayKey = 'name') {
  const input = document.getElementById(inputId);
  const suggestionsEl = document.getElementById(`${inputId}-suggestions`);
  if (!input || !suggestionsEl) return;

  let highlighted = -1;

  function render(filter) {
    const q = filter.toLowerCase();
    const filtered = q ? items.filter(i => i[displayKey].toLowerCase().includes(q)) : items.slice(0, 20);
    if (!filtered.length) { suggestionsEl.classList.remove('visible'); return; }
    highlighted = -1;
    suggestionsEl.innerHTML = filtered.map((item, i) =>
      `<div class="branch-suggestion" data-name="${item[displayKey]}" data-index="${i}"><i class="fas fa-tag"></i> ${item[displayKey]}</div>`
    ).join('');
    suggestionsEl.classList.add('visible');
    suggestionsEl.querySelectorAll('.branch-suggestion').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectItem(el.dataset.name);
      });
    });
  }

  function selectItem(name) {
    // For comma-separated inputs (labels), append after last comma
    if (input.dataset.multi === 'true') {
      const parts = input.value.split(',');
      parts[parts.length - 1] = ' ' + name;
      input.value = parts.join(',').replace(/^,\s*/, '');
      // trigger preview update
      input.dispatchEvent(new Event('input'));
    } else {
      input.value = name;
    }
    suggestionsEl.classList.remove('visible');
  }

  input.addEventListener('focus', () => {
    const query = input.dataset.multi === 'true'
      ? (input.value.split(',').pop() || '').trim()
      : input.value;
    render(query);
  });
  input.addEventListener('input', () => {
    const query = input.dataset.multi === 'true'
      ? (input.value.split(',').pop() || '').trim()
      : input.value;
    render(query);
  });
  input.addEventListener('blur', () => setTimeout(() => suggestionsEl.classList.remove('visible'), 150));
  input.addEventListener('keydown', (e) => {
    const elItems = suggestionsEl.querySelectorAll('.branch-suggestion');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, elItems.length - 1);
      elItems.forEach((el, i) => el.classList.toggle('highlighted', i === highlighted));
      if (elItems[highlighted]) elItems[highlighted].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      elItems.forEach((el, i) => el.classList.toggle('highlighted', i === highlighted));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && elItems[highlighted]) {
        selectItem(elItems[highlighted].dataset.name);
      }
    } else if (e.key === 'Escape') {
      suggestionsEl.classList.remove('visible');
    }
  });
}

function suggestInputHtml(inputId, placeholder, multi = false) {
  return `
    <div class="branch-input-wrap" id="${inputId}-wrap">
      <input type="text" id="${inputId}" placeholder="${placeholder}" autocomplete="off" ${multi ? 'data-multi="true"' : ''} />
      <div class="branch-suggestions" id="${inputId}-suggestions"></div>
    </div>
  `;
}

async function openCreateMRDialog() {
  const proj = App.selectedProject;
  if (!proj) return;

  const html = `
    <div class="form-group">
      <label>Source Branch</label>
      ${branchInputHtml('dlg-mr-source', 'Source branch...')}
    </div>
    <div class="form-group">
      <label>Target Branch <span style="color:var(--error)">*</span></label>
      ${branchInputHtml('dlg-mr-target', 'Target branch...')}
    </div>
    <div class="form-group">
      <label>Title <span style="color:var(--error)">*</span></label>
      <input type="text" id="dlg-mr-title" placeholder="Merge request title" />
    </div>
    <div class="form-group">
      <label>Labels</label>
      ${suggestInputHtml('dlg-mr-labels', 'Type to search labels...', true)}
      <div class="labels-preview" id="labels-preview"></div>
    </div>
    <div class="form-group">
      <label>Milestone</label>
      ${suggestInputHtml('dlg-mr-milestone', 'Type to search milestones...')}
    </div>
    <div class="form-group">
      <label>Apply to Projects</label>
      ${projectCheckboxesHtml()}
    </div>
  `;

  openModal('Create Merge Request', html, () => {
    const source = $('#dlg-mr-source').value.trim();
    const target = $('#dlg-mr-target').value.trim();
    const title = $('#dlg-mr-title').value.trim();
    const labelsStr = $('#dlg-mr-labels')?.value.trim() || '';
    const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()).filter(Boolean) : [];
    const milestoneTitle = $('#dlg-mr-milestone')?.value.trim() || '';
    const milestone = App._milestonesCache.find(m => m.title === milestoneTitle);
    const projects = getSelectedProjects();
    if (!source) { showToast('Source branch required', 'error'); return; }
    if (!target) { showToast('Target branch required', 'error'); return; }
    if (!title) { showToast('Title required', 'error'); return; }
    addRecentBranch(source);
    addRecentBranch(target);
    runCreateMR(projects, source, target, title, labels, milestone ? milestone.id : null);
  }, { runLabel: '<i class="fas fa-code-merge"></i> Create MR' });

  // Validate required fields to enable/disable Run button
  const runBtn = $('#modal-run');
  runBtn.disabled = true;
  runBtn.style.opacity = '0.5';
  runBtn.style.cursor = 'not-allowed';

  function validateMRForm() {
    const target = $('#dlg-mr-target')?.value.trim();
    const title = $('#dlg-mr-title')?.value.trim();
    const valid = target && title;
    runBtn.disabled = !valid;
    runBtn.style.opacity = valid ? '1' : '0.5';
    runBtn.style.cursor = valid ? 'pointer' : 'not-allowed';
  }

  ['input', 'change', 'blur'].forEach(evt => {
    $('#dlg-mr-target').addEventListener(evt, validateMRForm);
    $('#dlg-mr-title').addEventListener(evt, validateMRForm);
  });

  await ensureBranches();
  initBranchAutocomplete('dlg-mr-source', App.branchesCache);
  initBranchAutocomplete('dlg-mr-target', App.branchesCache);
  // Re-validate after autocomplete sets default values
  validateMRForm();

  // Fetch labels and milestones from GitLab in parallel
  App._labelsCache = [];
  App._milestonesCache = [];

  const fetchLabels = API.getLabels(proj.id).catch(() => []);
  const fetchMilestones = API.getMilestones(proj.id).catch(() => []);
  const [labels, milestones] = await Promise.all([fetchLabels, fetchMilestones]);

  App._labelsCache = labels;
  App._milestonesCache = milestones;

  // Init suggest inputs only if modal is still open
  if (!$('#modal-overlay').classList.contains('hidden')) {
    initSuggestInput('dlg-mr-labels', labels, 'name');
    initSuggestInput('dlg-mr-milestone', milestones, 'title');
  }

  // Labels preview
  const labelsInput = $('#dlg-mr-labels');
  if (labelsInput) {
    labelsInput.addEventListener('input', () => {
      const preview = $('#labels-preview');
      const vals = labelsInput.value.split(',').map(l => l.trim()).filter(Boolean);
      preview.innerHTML = vals.map(l => `<span class="label-tag">${l}</span>`).join('');
    });
  }
}

function runCreateMR(projects, sourceBranch, targetBranch, title, labels, milestoneId) {
  const desc = `${sourceBranch} → ${targetBranch}${labels.length ? ` [${labels.join(', ')}]` : ''}`;
  const card = createProcessCard('create-mr', 'Create Merge Request', desc, projects);

  (async () => {
    projects.forEach(p => updateCardDetail(card, p.id, 'running'));
    await Promise.all(projects.map(async (proj) => {
      try {
        const mr = await API.createMergeRequest(proj.id, sourceBranch, targetBranch, title, labels, milestoneId);
        const webUrl = projectWebUrl(proj.id);
        updateCardDetail(card, proj.id, 'success', `!${mr.iid}`, {
          url: `${webUrl}/-/merge_requests/${mr.iid}`,
          label: `!${mr.iid}`,
        });
      } catch (e) {
        updateCardDetail(card, proj.id, 'failed', e.message);
      }
    }));
    finalizeCard(card);
  })();
}

// --- Change Version ---

async function openChangeVersionDialog() {
  const proj = App.selectedProject;
  if (!proj) return;

  const html = `
    <div class="form-group">
      <label>Branch</label>
      ${branchInputHtml('dlg-version-branch', 'Target branch...')}
    </div>
    <div class="form-group">
      <label>New Version</label>
      <input type="text" id="dlg-version-value" placeholder="1.2.3" />
    </div>
    <div class="form-group">
      <label>Commit Message</label>
      <input type="text" id="dlg-version-msg" value="Bump version" />
    </div>
    <div class="form-group">
      <label>Apply to Projects</label>
      ${projectCheckboxesHtml()}
    </div>
  `;

  openModal('Change Version', html, () => {
    const branch = $('#dlg-version-branch').value.trim();
    const version = $('#dlg-version-value').value.trim();
    const msg = $('#dlg-version-msg').value.trim();
    const projects = getSelectedProjects();
    if (!version) { showToast('Version required', 'error'); return; }
    if (!branch) { showToast('Branch required', 'error'); return; }
    addRecentBranch(branch);
    runChangeVersion(projects, branch, version, msg);
  }, { runLabel: '<i class="fas fa-tag"></i> Update Version' });

  await ensureBranches();
  initBranchAutocomplete('dlg-version-branch', App.branchesCache);
}

function runChangeVersion(projects, branch, version, commitMsg) {
  const filePath = 'README.md';
  const card = createProcessCard('change-version', 'Change Version', `→ ${version} on ${branch}`, projects);

  (async () => {
    projects.forEach(p => updateCardDetail(card, p.id, 'running'));
    await Promise.all(projects.map(async (proj) => {
      try {
        const currentContent = await API.getFileRaw(proj.id, filePath, branch);
        const updated = currentContent.replace(
          /("version"\s*:\s*")([^"]*)/g,
          `$1${version}`
        );
        if (updated === currentContent) {
          updateCardDetail(card, proj.id, 'failed', 'No version pattern found');
          return;
        }
        await API.updateFile(proj.id, filePath, branch, updated, commitMsg || `Bump version to ${version}`);
        const webUrl = projectWebUrl(proj.id);
        updateCardDetail(card, proj.id, 'success', `→ ${version}`, {
          url: `${webUrl}/-/blob/${encodeURIComponent(branch)}/${filePath}`,
          label: filePath,
        });
      } catch (e) {
        updateCardDetail(card, proj.id, 'failed', e.message);
      }
    }));
    finalizeCard(card);
  })();
}

// --- Start Pipeline ---

function getPipelineTypes() {
  const types = [];
  if (App.pipelineConfig && App.pipelineConfig.types) {
    types.push(...App.pipelineConfig.types);
  }
  types.push({ id: '__custom__', title: 'Custom', subtypes: [], variables: [], template: null });
  return types;
}

function resolveTemplate(template, variableValues, branch) {
  let json = JSON.stringify(template);
  json = json.replace(/\{\{BRANCH\}\}/g, branch);
  for (const [key, value] of Object.entries(variableValues)) {
    json = json.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return JSON.parse(json);
}

function renderPipelineVariables(variables) {
  const container = $('#pipeline-dynamic-vars');
  if (!container) return;
  if (!variables || !variables.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = variables.map(v => {
    if (v.type === 'boolean') {
      return `<div class="var-field">
        <div class="checkbox-wrap">
          <label for="pvar-${v.key}">${v.label || v.key}</label>
          <input type="checkbox" id="pvar-${v.key}" data-var-key="${v.key}" ${v.default ? 'checked' : ''} />
        </div>
      </div>`;
    }
    if (v.type === 'environment') {
      const envs = (v.options || ['staging', 'production', 'development']).map(o =>
        `<option value="${o}" ${o === v.default ? 'selected' : ''}>${o}</option>`
      ).join('');
      return `<div class="var-field">
        <label>${v.label || v.key}</label>
        <select data-var-key="${v.key}">${envs}</select>
      </div>`;
    }
    if (v.type === 'select') {
      const opts = (v.options || []).map(o =>
        `<option value="${o}" ${o === v.default ? 'selected' : ''}>${o}</option>`
      ).join('');
      return `<div class="var-field">
        <label>${v.label || v.key}</label>
        <select data-var-key="${v.key}">${opts}</select>
      </div>`;
    }
    return `<div class="var-field">
      <label>${v.label || v.key}</label>
      <input type="text" data-var-key="${v.key}" value="${v.default || ''}" placeholder="${v.label || v.key}" />
    </div>`;
  }).join('');
}

function collectPipelineVarValues() {
  const values = {};
  const fields = document.querySelectorAll('#pipeline-dynamic-vars [data-var-key]');
  fields.forEach(el => {
    const key = el.dataset.varKey;
    if (el.type === 'checkbox') {
      values[key] = el.checked ? 'true' : 'false';
    } else {
      values[key] = el.value;
    }
  });
  return values;
}

function onPipelineTypeChange() {
  const types = getPipelineTypes();
  const typeId = $('#pipeline-type-select').value;
  const type = types.find(t => t.id === typeId);
  const subtypeGroup = $('#pipeline-subtype-group');
  const varsGroup = $('#pipeline-vars-group');
  const customGroup = $('#pipeline-custom-group');

  // Reset
  subtypeGroup.classList.add('hidden');
  customGroup.classList.add('hidden');
  varsGroup.classList.remove('hidden');

  if (typeId === '__custom__') {
    varsGroup.classList.add('hidden');
    customGroup.classList.remove('hidden');
    return;
  }

  if (type && type.subtypes && type.subtypes.length > 0) {
    subtypeGroup.classList.remove('hidden');
    $('#pipeline-subtype-select').innerHTML = type.subtypes.map(s =>
      `<option value="${s.id}">${s.title}</option>`
    ).join('');
    onPipelineSubtypeChange();
  } else if (type) {
    renderPipelineVariables(type.variables || []);
  }
}

function onPipelineSubtypeChange() {
  const types = getPipelineTypes();
  const typeId = $('#pipeline-type-select').value;
  const type = types.find(t => t.id === typeId);
  if (!type) return;
  const subtypeId = $('#pipeline-subtype-select').value;
  const subtype = type.subtypes.find(s => s.id === subtypeId);
  renderPipelineVariables(subtype ? subtype.variables || [] : []);
}

window.onPipelineTypeChange = onPipelineTypeChange;
window.onPipelineSubtypeChange = onPipelineSubtypeChange;

async function openStartPipelineDialog() {
  const proj = App.selectedProject;
  if (!proj) return;

  const types = getPipelineTypes();
  const typeOptions = types.map(t => `<option value="${t.id}">${t.title}</option>`).join('');

  const html = `
    <div class="form-group">
      <label>Pipeline Type</label>
      <select id="pipeline-type-select" class="pipeline-type-select" onchange="onPipelineTypeChange()">${typeOptions}</select>
    </div>
    <div class="form-group hidden" id="pipeline-subtype-group">
      <label>Subtype</label>
      <select id="pipeline-subtype-select" class="pipeline-subtype-select" onchange="onPipelineSubtypeChange()"></select>
    </div>
    <div class="form-group" id="pipeline-vars-group">
      <label>Variables</label>
      <div id="pipeline-dynamic-vars"></div>
    </div>
    <div class="form-group hidden" id="pipeline-custom-group">
      <label>Pipeline JSON</label>
      <textarea class="pipeline-custom-textarea" id="pipeline-custom-json" placeholder='{"ref":"main","variables":[{"key":"MY_VAR","value":"value","variable_type":"env_var"}]}'></textarea>
    </div>
    <div class="form-group">
      <label>Branch / Ref</label>
      ${branchInputHtml('dlg-pipeline-branch', 'Target branch...')}
    </div>
    <div class="form-group">
      <label>Apply to Projects</label>
      ${projectCheckboxesHtml()}
    </div>
  `;

  openModal('Start Pipeline', html, () => {
    const branch = $('#dlg-pipeline-branch').value.trim();
    const projects = getSelectedProjects();
    if (!branch) { showToast('Branch required', 'error'); return; }
    addRecentBranch(branch);

    const typeId = $('#pipeline-type-select').value;

    if (typeId === '__custom__') {
      const jsonText = $('#pipeline-custom-json').value.trim();
      if (!jsonText) { showToast('JSON required', 'error'); return; }
      try {
        const parsed = JSON.parse(jsonText);
        const ref = parsed.ref || branch;
        const variables = parsed.variables || [];
        runStartPipeline(projects, ref, variables);
      } catch (e) {
        showToast('Invalid JSON: ' + e.message, 'error');
        return;
      }
      return;
    }

    // Resolve template
    const types = getPipelineTypes();
    const type = types.find(t => t.id === typeId);
    let template = type.template;
    let variables = type.variables || [];

    if (type.subtypes && type.subtypes.length > 0) {
      const subtypeId = $('#pipeline-subtype-select').value;
      const subtype = type.subtypes.find(s => s.id === subtypeId);
      if (subtype) {
        template = subtype.template;
        variables = subtype.variables || [];
      }
    }

    if (template) {
      const varValues = collectPipelineVarValues();
      const resolved = resolveTemplate(template, varValues, branch);
      runStartPipeline(projects, resolved.ref || branch, resolved.variables || []);
    } else {
      runStartPipeline(projects, branch, []);
    }
  }, { runLabel: '<i class="fas fa-play-circle"></i> Start Pipeline' });

  // Trigger initial type render
  setTimeout(() => onPipelineTypeChange(), 0);

  await ensureBranches();
  initBranchAutocomplete('dlg-pipeline-branch', App.branchesCache);
}

function runStartPipeline(projects, ref, variables) {
  const card = createProcessCard('pipeline', 'Pipeline', `ref: ${ref}`, projects);

  (async () => {
    const pipelineIds = {};
    projects.forEach(p => updateCardDetail(card, p.id, 'running'));

    await Promise.all(projects.map(async (proj) => {
      try {
        const pipeline = await API.createPipeline(proj.id, ref, variables);
        pipelineIds[proj.id] = pipeline.id;
        const webUrl = projectWebUrl(proj.id);
        updateCardDetail(card, proj.id, 'running', `#${pipeline.id}: created`, {
          url: `${webUrl}/-/pipelines/${pipeline.id}`,
          label: `#${pipeline.id}`,
        });
      } catch (e) {
        updateCardDetail(card, proj.id, 'failed', e.message);
      }
    }));

    card.pipelineIds = pipelineIds;
    saveCards();
    pollPipelines(card, pipelineIds);
  })();
}

function pollPipelines(card, pipelineIds) {
  const entries = Object.entries(pipelineIds);
  if (!entries.length) { finalizeCard(card); return; }

  const intervalId = setInterval(async () => {
    let allDone = true;
    for (const [projIdStr, pipelineId] of entries) {
      const projId = parseInt(projIdStr);
      try {
        const p = await API.getPipeline(projId, pipelineId);
        const webUrl = projectWebUrl(projId);
        const link = { url: `${webUrl}/-/pipelines/${pipelineId}`, label: `#${pipelineId}` };

        if (['success', 'failed', 'canceled', 'skipped'].includes(p.status)) {
          updateCardDetail(card, projId, p.status === 'success' ? 'success' : 'failed', `#${pipelineId}: ${p.status}`, link);
        } else {
          updateCardDetail(card, projId, 'running', `#${pipelineId}: ${p.status}`, link);
          allDone = false;
        }
      } catch {
        allDone = false;
      }
    }
    if (allDone) {
      clearInterval(intervalId);
      finalizeCard(card);
    }
  }, 10000);

  App.pollingIntervals[card.id] = intervalId;
}

// ============================================================
// Compare Branches
// ============================================================

function globMatch(pattern, filePath) {
  // Simple glob: ** = any path, * = any segment chars, ? = single char
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + regex + '$', 'i').test(filePath);
}

function filterDiffsByStrategy(diffs, strategy) {
  if (!strategy) return { filtered: diffs, ignored: 0 };
  const ignorePatterns = strategy.ignoreFiles || [];
  const linePatterns = (strategy.linePatterns || []).map(p => new RegExp(p.pattern));

  let ignored = 0;
  const filtered = diffs.filter(d => {
    const path = d.new_path || d.old_path || '';
    // Check file ignore patterns
    if (ignorePatterns.some(p => globMatch(p, path))) { ignored++; return false; }
    // Check line patterns — if ALL changed lines match, ignore the file
    if (linePatterns.length && d.diff) {
      const changedLines = d.diff.split('\n')
        .filter(l => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
        .map(l => l.substring(1));
      if (changedLines.length && changedLines.every(line => linePatterns.some(re => re.test(line)))) {
        ignored++;
        return false;
      }
    }
    return true;
  });
  return { filtered, ignored };
}

function getCompareStrategies() {
  return App.compareConfig?.strategies || [];
}

async function openCompareBranchesDialog() {
  const proj = App.selectedProject;
  if (!proj) return;

  const strategies = getCompareStrategies();
  const strategyOptions = strategies.map(s => `<option value="${s.id}">${s.title}</option>`).join('');

  const html = `
    <div class="compare-top-row">
      <div class="compare-branches-row">
        <div class="compare-branch-field">
          <label>Source Branch</label>
          ${branchInputHtml('dlg-compare-from', 'Source branch...')}
        </div>
        <div class="compare-arrow"><i class="fas fa-long-arrow-alt-right"></i></div>
        <div class="compare-branch-field">
          <label>Target Branch</label>
          ${branchInputHtml('dlg-compare-to', 'Target branch...')}
        </div>
      </div>
      <div class="compare-strategy-row">
        <div class="form-group" style="margin:0">
          <label>Strategy</label>
          <select id="dlg-compare-strategy">
            <option value="">Default (show all)</option>
            ${strategyOptions}
          </select>
        </div>
      </div>
    </div>
    <div id="compare-results" class="hidden">
      <div class="section-title" style="margin-top:16px"><i class="fas fa-exchange-alt"></i> Comparison Results</div>
      <div id="compare-results-list"></div>
    </div>
  `;

  openModal('Compare Branches', html, () => {
    const from = $('#dlg-compare-from').value.trim();
    const to = $('#dlg-compare-to').value.trim();
    if (!from || !to) { showToast('Both branches required', 'error'); return; }
    runCompareBranches(from, to);
  }, { keepOpen: true, runLabel: '<i class="fas fa-exchange-alt"></i> Compare', fullscreen: true });

  // Re-render results when strategy changes
  $('#dlg-compare-strategy').addEventListener('change', () => {
    if (App._lastCompare) renderCompareResults();
  });

  await ensureBranches();
  initBranchAutocomplete('dlg-compare-from', App.branchesCache);
  initBranchAutocomplete('dlg-compare-to', App.branchesCache);
}

async function runCompareBranches(from, to) {
  const resultsEl = $('#compare-results');
  const listEl = $('#compare-results-list');
  resultsEl.classList.remove('hidden');
  listEl.innerHTML = '<div style="padding:12px;color:var(--text-muted)"><span class="spinner"></span> Comparing...</div>';

  const allProjects = [
    { id: App.selectedProject.id, name: App.selectedProject.name, path: App.selectedProject.path_with_namespace },
    ...App.submodules.filter(s => s.projectId).map(s => ({ id: s.projectId, name: s.name, path: s.project?.path_with_namespace || s.path }))
  ];

  // Fetch both directions for conflict detection
  const results = await Promise.all(allProjects.map(async (proj) => {
    try {
      const [forward, reverse] = await Promise.all([
        API.compareBranches(proj.id, from, to),
        API.compareBranches(proj.id, to, from),
      ]);
      // Conflicted files: changed in both directions (same path in both diffs)
      const forwardPaths = new Set((forward.diffs || []).map(d => d.new_path || d.old_path));
      const reversePaths = new Set((reverse.diffs || []).map(d => d.new_path || d.old_path));
      const conflictedFiles = [...forwardPaths].filter(p => reversePaths.has(p));
      return { proj, comparison: forward, conflictedFiles, error: null };
    } catch (e) {
      return { proj, comparison: null, conflictedFiles: [], error: e.message };
    }
  }));

  App._lastCompare = { from, to, results };
  renderCompareResults();
}

function renderCompareResults() {
  const { from, to, results } = App._lastCompare;
  const listEl = $('#compare-results-list');
  const strategyId = $('#dlg-compare-strategy')?.value || '';
  const strategies = getCompareStrategies();
  const strategy = strategyId ? strategies.find(s => s.id === strategyId) : null;

  listEl.innerHTML = results.map(r => {
    if (r.error) {
      const is404 = r.error.includes('404');
      return `
        <div class="compare-result-item">
          <div class="compare-result-header">
            <span class="compare-result-name">${r.proj.name}</span>
            <span class="compare-result-badge badge-muted">${is404 ? 'Branch not found' : 'Error'}</span>
          </div>
          ${!is404 ? `<div class="compare-result-error">${r.error}</div>` : ''}
        </div>`;
    }
    const allDiffs = r.comparison.diffs || [];
    const commits = r.comparison.commits || [];
    const { filtered: diffs, ignored } = filterDiffsByStrategy(allDiffs, strategy);
    const fileCount = diffs.length;
    const commitCount = commits.length;
    const conflicts = r.conflictedFiles || [];
    // Filter conflicts by strategy too
    const visibleConflicts = strategy
      ? conflicts.filter(f => !((strategy.ignoreFiles || []).some(p => globMatch(p, f))))
      : conflicts;

    if (fileCount === 0 && commitCount === 0 && visibleConflicts.length === 0) {
      return `
        <div class="compare-result-item">
          <div class="compare-result-header">
            <span class="compare-result-name">${r.proj.name}</span>
            <span class="compare-result-badge badge-success">Up to date</span>
            ${ignored ? `<span class="compare-result-badge badge-muted">${ignored} file${ignored !== 1 ? 's' : ''} hidden</span>` : ''}
          </div>
        </div>`;
    }

    const filesHtml = diffs.map(d => {
      const path = d.new_path || d.old_path;
      const isConflict = visibleConflicts.includes(path);
      return `<div class="compare-file-row${isConflict ? ' conflict' : ''}">
        <span class="compare-file-path">${path}</span>
        ${d.new_file ? '<span class="compare-file-badge added">added</span>' : ''}
        ${d.deleted_file ? '<span class="compare-file-badge deleted">deleted</span>' : ''}
        ${d.renamed_file ? '<span class="compare-file-badge renamed">renamed</span>' : ''}
        ${isConflict ? '<span class="compare-file-badge conflict"><i class="fas fa-exclamation-triangle"></i> conflict</span>' : ''}
      </div>`;
    }).join('');

    return `
      <div class="compare-result-item${visibleConflicts.length ? ' has-conflicts' : ''}">
        <div class="compare-result-header">
          <span class="compare-result-name">${r.proj.name}</span>
          <div class="compare-result-stats">
            <span class="compare-result-badge badge-info">${fileCount} file${fileCount !== 1 ? 's' : ''} changed</span>
            <span class="compare-result-badge badge-info">${commitCount} commit${commitCount !== 1 ? 's' : ''}</span>
            ${visibleConflicts.length ? `<span class="compare-result-badge badge-warning"><i class="fas fa-exclamation-triangle"></i> ${visibleConflicts.length} conflict${visibleConflicts.length !== 1 ? 's' : ''}</span>` : ''}
            ${ignored ? `<span class="compare-result-badge badge-muted">${ignored} hidden</span>` : ''}
          </div>
        </div>
        <div class="compare-files-list">${filesHtml}</div>
        <div class="compare-result-actions">
          <button class="btn-small btn-create-mr" data-proj-id="${r.proj.id}" data-proj-name="${r.proj.name}" data-proj-path="${r.proj.path}">
            <i class="fas fa-code-merge"></i> Create MR
          </button>
        </div>
      </div>`;
  }).join('');

  // Bind MR shortcut buttons
  listEl.querySelectorAll('.btn-create-mr').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      openCreateMRDialogPrefilled(from, to, parseInt(btn.dataset.projId), btn.dataset.projName, btn.dataset.projPath);
    });
  });
}

function openCreateMRDialogPrefilled(source, target, projId, projName, projPath) {
  const proj = App.selectedProject;
  if (!proj) return;

  const html = `
    <div class="form-group">
      <label>Source Branch</label>
      ${branchInputHtml('dlg-mr-source', 'Source branch...')}
    </div>
    <div class="form-group">
      <label>Target Branch <span style="color:var(--error)">*</span></label>
      ${branchInputHtml('dlg-mr-target', 'Target branch...')}
    </div>
    <div class="form-group">
      <label>Title <span style="color:var(--error)">*</span></label>
      <input type="text" id="dlg-mr-title" placeholder="Merge request title" />
    </div>
    <div class="form-group">
      <label>Labels</label>
      ${suggestInputHtml('dlg-mr-labels', 'Type to search labels...', true)}
      <div class="labels-preview" id="labels-preview"></div>
    </div>
    <div class="form-group">
      <label>Milestone</label>
      ${suggestInputHtml('dlg-mr-milestone', 'Type to search milestones...')}
    </div>
    <div class="form-group">
      <label>Apply to Projects</label>
      ${projectCheckboxesHtml()}
    </div>
  `;

  openModal('Create Merge Request', html, () => {
    const s = $('#dlg-mr-source').value.trim();
    const t = $('#dlg-mr-target').value.trim();
    const title = $('#dlg-mr-title').value.trim();
    const labelsStr = $('#dlg-mr-labels')?.value.trim() || '';
    const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()).filter(Boolean) : [];
    const milestoneTitle = $('#dlg-mr-milestone')?.value.trim() || '';
    const milestone = App._milestonesCache.find(m => m.title === milestoneTitle);
    const projects = getSelectedProjects();
    if (!s) { showToast('Source branch required', 'error'); return; }
    if (!t) { showToast('Target branch required', 'error'); return; }
    if (!title) { showToast('Title required', 'error'); return; }
    addRecentBranch(s);
    addRecentBranch(t);
    runCreateMR(projects, s, t, title, labels, milestone ? milestone.id : null);
  }, { runLabel: '<i class="fas fa-code-merge"></i> Create MR' });

  // Pre-fill values
  setTimeout(() => {
    $('#dlg-mr-source').value = source;
    $('#dlg-mr-target').value = target;
    $('#dlg-mr-title').value = `Merge ${source} into ${target}`;

    // Pre-select only the specific project
    $$('#project-checkboxes input').forEach(cb => {
      cb.checked = parseInt(cb.value) === projId;
    });
  }, 0);

  // Validate required fields
  const runBtn = $('#modal-run');
  runBtn.disabled = true;
  runBtn.style.opacity = '0.5';
  runBtn.style.cursor = 'not-allowed';

  function validateMRForm() {
    const t = $('#dlg-mr-target')?.value.trim();
    const title = $('#dlg-mr-title')?.value.trim();
    const valid = t && title;
    runBtn.disabled = !valid;
    runBtn.style.opacity = valid ? '1' : '0.5';
    runBtn.style.cursor = valid ? 'pointer' : 'not-allowed';
  }

  ['input', 'change', 'blur'].forEach(evt => {
    $('#dlg-mr-target').addEventListener(evt, validateMRForm);
    $('#dlg-mr-title').addEventListener(evt, validateMRForm);
  });

  (async () => {
    await ensureBranches();
    initBranchAutocomplete('dlg-mr-source', App.branchesCache);
    initBranchAutocomplete('dlg-mr-target', App.branchesCache);
    validateMRForm();

    App._labelsCache = [];
    App._milestonesCache = [];
    const fetchLabels = API.getLabels(proj.id).catch(() => []);
    const fetchMilestones = API.getMilestones(proj.id).catch(() => []);
    const [labels, milestones] = await Promise.all([fetchLabels, fetchMilestones]);
    App._labelsCache = labels;
    App._milestonesCache = milestones;
    if (!$('#modal-overlay').classList.contains('hidden')) {
      initSuggestInput('dlg-mr-labels', labels, 'name');
      initSuggestInput('dlg-mr-milestone', milestones, 'title');
    }
  })();
}

// ============================================================
// Merge Back
// ============================================================

async function openMergeBackDialog() {
  const proj = App.selectedProject;
  if (!proj) return;

  const html = `
    <div class="compare-branches-row">
      <div class="compare-branch-field">
        <label>Source Branch</label>
        ${branchInputHtml('dlg-mergeback-from', 'Source branch...')}
      </div>
      <div class="compare-arrow"><i class="fas fa-long-arrow-alt-right"></i></div>
      <div class="compare-branch-field">
        <label>Target Branch</label>
        ${branchInputHtml('dlg-mergeback-to', 'Target branch...')}
      </div>
    </div>
    <div class="form-group" style="margin-top:16px">
      <label>Mode</label>
      <div class="mergeback-mode-options">
        <label class="radio-option selected" data-mode="mr">
          <input type="radio" name="mergeback-mode" value="mr" checked />
          <div class="radio-option-content">
            <span class="radio-option-title"><i class="fas fa-code-merge"></i> Merge Request</span>
            <small>Create a merge request on GitLab</small>
          </div>
        </label>
        <label class="radio-option" data-mode="local">
          <input type="radio" name="mergeback-mode" value="local" />
          <div class="radio-option-content">
            <span class="radio-option-title"><i class="fas fa-terminal"></i> Local Merge</span>
            <small>Clone, merge locally and push (temp folder, auto-cleaned)</small>
          </div>
        </label>
      </div>
    </div>
    <div id="mergeback-mr-options">
      <div class="form-group">
        <label>Merge Request Title</label>
        <input type="text" id="dlg-mergeback-title" placeholder="Merge back title..." />
      </div>
    </div>
    <div class="form-group">
      <label>Apply to Projects</label>
      ${projectCheckboxesHtml()}
    </div>
  `;

  openModal('Merge Back', html, () => {
    const from = $('#dlg-mergeback-from').value.trim();
    const to = $('#dlg-mergeback-to').value.trim();
    const projects = getSelectedProjects();
    if (!from || !to) { showToast('Both branches required', 'error'); return; }
    addRecentBranch(from);
    addRecentBranch(to);

    const mode = document.querySelector('input[name="mergeback-mode"]:checked').value;
    if (mode === 'mr') {
      const title = $('#dlg-mergeback-title').value.trim() || `Merge back ${from} into ${to}`;
      runCreateMR(projects, from, to, title, [], null);
    } else {
      runLocalMergeBack(projects, from, to);
    }
  }, { runLabel: '<i class="fas fa-undo"></i> Merge Back', fullscreen: true });

  // Mode toggle
  setTimeout(() => {
    const radios = document.querySelectorAll('input[name="mergeback-mode"]');
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.mergeback-mode-options .radio-option').forEach(el => el.classList.remove('selected'));
        radio.closest('.radio-option').classList.add('selected');
        const mrOpts = $('#mergeback-mr-options');
        mrOpts.style.display = radio.value === 'mr' ? '' : 'none';
      });
    });

    // Auto-fill title on branch change
    const titleEl = $('#dlg-mergeback-title');
    titleEl.addEventListener('input', () => { titleEl._userEdited = true; });

    function updateTitle() {
      const from = $('#dlg-mergeback-from')?.value.trim();
      const to = $('#dlg-mergeback-to')?.value.trim();
      if (from && to && !titleEl._userEdited) {
        titleEl.value = `Merge back ${from} into ${to}`;
      }
    }

    ['input', 'change', 'blur'].forEach(evt => {
      $('#dlg-mergeback-from').addEventListener(evt, updateTitle);
      $('#dlg-mergeback-to').addEventListener(evt, updateTitle);
    });
  }, 0);

  await ensureBranches();
  initBranchAutocomplete('dlg-mergeback-from', App.branchesCache);
  initBranchAutocomplete('dlg-mergeback-to', App.branchesCache);
}

function runLocalMergeBack(projects, source, target) {
  const desc = `Local: ${source} → ${target}`;
  const card = createProcessCard('merge-back', 'Merge Back (Local)', desc, projects);

  (async () => {
    projects.forEach(p => updateCardDetail(card, p.id, 'running', 'Cloning...'));

    await Promise.all(projects.map(async (proj) => {
      try {
        const fullProj = findProject(proj.id);
        const cloneUrl = fullProj?.http_url_to_repo || `${App.gitlabUrl}/${proj.path}.git`;

        updateCardDetail(card, proj.id, 'running', 'Cloning & merging...');

        const resp = await fetch('/merge-back', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cloneUrl,
            source,
            target,
            token: App.token,
            projectName: proj.name,
          }),
        });

        const result = await resp.json();

        if (result.status === 'success') {
          updateCardDetail(card, proj.id, 'success', 'Merged & pushed');
        } else if (result.status === 'conflict') {
          updateCardDetail(card, proj.id, 'failed', 'Merge conflict');
        } else {
          updateCardDetail(card, proj.id, 'failed', result.error || 'Failed');
        }
      } catch (e) {
        updateCardDetail(card, proj.id, 'failed', e.message);
      }
    }));

    finalizeCard(card);
  })();
}

// ============================================================
// Process Cards
// ============================================================

let cardIdCounter = 0;

function saveCards() {
  const data = App.processCards.map(c => ({
    id: c.id,
    actionType: c.actionType,
    actionLabel: c.actionLabel,
    description: c.description,
    projects: c.projects,
    done: c.done,
    pipelineIds: c.pipelineIds || null,
  }));
  localStorage.setItem('process_cards', JSON.stringify(data));
  localStorage.setItem('card_id_counter', cardIdCounter);
}

function loadCards() {
  try {
    const data = JSON.parse(localStorage.getItem('process_cards') || '[]');
    const savedCounter = parseInt(localStorage.getItem('card_id_counter') || '0');
    if (savedCounter > cardIdCounter) cardIdCounter = savedCounter;

    for (const c of data) {
      const card = { ...c };
      App.processCards.push(card);
      renderCardFromData(card);

      // Resume polling for running pipelines
      if (!card.done && card.pipelineIds && Object.keys(card.pipelineIds).length) {
        pollPipelines(card, card.pipelineIds);
      }
    }

    if (App.processCards.length) {
      showDrawer();
      updateDrawerBar();
    }
  } catch { /* ignore corrupt data */ }
}

function renderCardFromData(card) {
  const icon = actionIcons[card.actionType] || 'fa-cog';
  const overallStatus = card.done
    ? (card.projects.every(p => p.status === 'success') ? 'success' : 'failed')
    : 'running';
  const statusLabel = card.done ? (overallStatus === 'success' ? 'Done' : 'Completed') : 'Running';

  const el = document.createElement('div');
  el.className = 'process-card' + (card.done ? '' : ' card-running');
  el.id = `card-${card.id}`;

  const colors = { pending: 'var(--text-muted)', running: 'var(--info)', success: 'var(--success)', failed: 'var(--error)' };

  el.innerHTML = `
    <button class="dismiss-btn" onclick="dismissCard(${card.id})"><i class="fas fa-times"></i></button>
    <div class="process-card-top">
      <div class="process-card-header">
        <span class="process-card-title"><i class="fas ${icon}"></i> ${card.actionLabel}</span>
        <span class="process-card-status status-${overallStatus}" id="card-status-${card.id}">${statusLabel}</span>
      </div>
      <div class="process-card-desc">${card.description}</div>
      <div class="process-card-details" id="card-details-${card.id}">
        ${card.projects.map(p => `
          <div class="detail-row" id="card-${card.id}-proj-${p.id}">
            <div class="detail-left">
              <span class="detail-status-icon${p.status === 'running' ? ' running' : ''}" style="background:${colors[p.status] || colors.pending}" id="card-${card.id}-proj-${p.id}-icon"></span>
              <span class="detail-name">${p.name}</span>
            </div>
            <div class="detail-right">
              <span class="detail-msg" id="card-${card.id}-proj-${p.id}-msg">${p.detail || p.status}</span>
              <span id="card-${card.id}-proj-${p.id}-link">${p.link ? `<a class="detail-link" href="${p.link.url}" target="_blank"><i class="fas fa-external-link-alt"></i> ${p.link.label}</a>` : ''}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="process-card-links" id="card-links-${card.id}" style="${card.done ? 'display:flex' : 'display:none'}">
      ${card.done ? card.projects.filter(p => p.link).map(p =>
        `<a class="card-link" href="${p.link.url}" target="_blank"><i class="fas fa-external-link-alt"></i> ${p.name}: ${p.link.label}</a>`
      ).join('') : ''}
    </div>
  `;
  $('#process-cards').prepend(el);
}

const actionIcons = {
  'select-branch': 'fa-random',
  'create-branch': 'fa-code-branch',
  'create-mr': 'fa-code-merge',
  'change-version': 'fa-tag',
  'pipeline': 'fa-play-circle',
  'compare': 'fa-exchange-alt',
  'merge-back': 'fa-undo',
};

function createProcessCard(actionType, actionLabel, description, projects) {
  const id = ++cardIdCounter;
  const card = {
    id, actionType, actionLabel, description,
    projects: projects.map(p => ({ ...p, status: 'pending', detail: '', link: null })),
    done: false,
  };
  App.processCards.push(card);

  showDrawer();

  const icon = actionIcons[actionType] || 'fa-cog';
  const el = document.createElement('div');
  el.className = 'process-card card-running';
  el.id = `card-${id}`;
  el.innerHTML = `
    <button class="dismiss-btn" onclick="dismissCard(${id})"><i class="fas fa-times"></i></button>
    <div class="process-card-top">
      <div class="process-card-header">
        <span class="process-card-title"><i class="fas ${icon}"></i> ${actionLabel}</span>
        <span class="process-card-status status-running" id="card-status-${id}">Running</span>
      </div>
      <div class="process-card-desc">${description}</div>
      <div class="process-card-details" id="card-details-${id}">
        ${projects.map(p => `
          <div class="detail-row" id="card-${id}-proj-${p.id}">
            <div class="detail-left">
              <span class="detail-status-icon running" style="background:var(--text-muted)" id="card-${id}-proj-${p.id}-icon"></span>
              <span class="detail-name">${p.name}</span>
            </div>
            <div class="detail-right">
              <span class="detail-msg" id="card-${id}-proj-${p.id}-msg">pending</span>
              <span id="card-${id}-proj-${p.id}-link"></span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="process-card-links" id="card-links-${id}" style="display:none"></div>
  `;
  $('#process-cards').prepend(el);
  if (!App.drawerOpen) {
    App.unseenCount++;
  }
  updateDrawerBar();
  saveCards();
  return card;
}

function updateCardDetail(card, projectId, status, detail, link) {
  const proj = card.projects.find(p => p.id === projectId);
  if (proj) {
    proj.status = status;
    proj.detail = detail || status;
    if (link) proj.link = link;
  }

  const colors = { pending: 'var(--text-muted)', running: 'var(--info)', success: 'var(--success)', failed: 'var(--error)' };
  const prefix = `card-${card.id}-proj-${projectId}`;

  const iconEl = document.getElementById(`${prefix}-icon`);
  if (iconEl) {
    iconEl.style.background = colors[status] || 'var(--text-muted)';
    iconEl.className = `detail-status-icon${status === 'running' ? ' running' : ''}`;
  }

  const msgEl = document.getElementById(`${prefix}-msg`);
  if (msgEl) msgEl.textContent = detail || status;

  const linkEl = document.getElementById(`${prefix}-link`);
  if (linkEl && link) {
    linkEl.innerHTML = `<a class="detail-link" href="${link.url}" target="_blank"><i class="fas fa-external-link-alt"></i> ${link.label}</a>`;
  }

  updateDrawerBar();
  saveCards();
}

function finalizeCard(card) {
  card.done = true;
  const cardEl = document.getElementById(`card-${card.id}`);
  if (cardEl) cardEl.classList.remove('card-running');
  const allSuccess = card.projects.every(p => p.status === 'success');
  const anyFailed = card.projects.some(p => p.status === 'failed');
  const overallStatus = allSuccess ? 'success' : anyFailed ? 'failed' : 'success';

  const statusEl = document.getElementById(`card-status-${card.id}`);
  if (statusEl) {
    statusEl.textContent = allSuccess ? 'Done' : 'Completed';
    statusEl.className = `process-card-status status-${overallStatus}`;
  }

  // Build summary links footer
  const linksEl = document.getElementById(`card-links-${card.id}`);
  if (linksEl) {
    const links = card.projects
      .filter(p => p.link)
      .map(p => `<a class="card-link" href="${p.link.url}" target="_blank"><i class="fas fa-external-link-alt"></i> ${p.name}: ${p.link.label}</a>`);

    if (links.length) {
      linksEl.innerHTML = links.join('');
      linksEl.style.display = 'flex';
    }
  }

  notify(card.actionLabel, allSuccess ? 'All projects succeeded' : 'Some projects failed');
  updateDrawerBar();
  saveCards();
}

window.dismissCard = function (cardId) {
  const el = document.getElementById(`card-${cardId}`);
  if (el) el.remove();
  if (App.pollingIntervals[cardId]) {
    clearInterval(App.pollingIntervals[cardId]);
    delete App.pollingIntervals[cardId];
  }
  App.processCards = App.processCards.filter(c => c.id !== cardId);
  if (!App.processCards.length) {
    $('#process-drawer').classList.add('hidden');
  }
  updateDrawerBar();
  saveCards();
};

// ============================================================
// Process Drawer
// ============================================================

function showDrawer() {
  $('#process-drawer').classList.remove('hidden');
}

function updateDrawerBar() {
  const label = $('#drawer-bar-label');
  const badge = $('#drawer-badge');

  if (!App.processCards.length) {
    label.textContent = 'No processes';
    badge.classList.add('hidden');
    return;
  }

  // Show last (most recent) card status
  const drawer = $('#process-drawer');
  const last = App.processCards[App.processCards.length - 1];
  const running = App.processCards.filter(c => !c.done).length;
  drawer.classList.toggle('running', running > 0);
  if (running > 0) {
    label.innerHTML = `<span style="color:var(--info)"><i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>${running} running</span> — ${last.actionLabel}: ${last.description}`;
  } else {
    const allSuccess = last.projects.every(p => p.status === 'success');
    const statusColor = allSuccess ? 'var(--success)' : 'var(--error)';
    const statusIcon = allSuccess ? 'fa-check-circle' : 'fa-exclamation-circle';
    label.innerHTML = `<span style="color:${statusColor}"><i class="fas ${statusIcon}" style="margin-right:6px"></i>${last.actionLabel}</span> — ${allSuccess ? 'All succeeded' : 'Completed with errors'}`;
  }

  // Badge for unseen
  if (App.unseenCount > 0 && !App.drawerOpen) {
    badge.textContent = App.unseenCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

window.toggleProcessDrawer = function () {
  const drawer = $('#process-drawer');
  const isCollapsed = drawer.classList.contains('collapsed');

  if (isCollapsed) {
    drawer.classList.remove('collapsed');
    App.drawerOpen = true;
    App.unseenCount = 0;
    updateDrawerBar();
  } else {
    drawer.classList.add('collapsed');
    App.drawerOpen = false;
  }
};

// ============================================================
// Init
// ============================================================

(function init() {
  // Start with no right panel
  $('#app').classList.add('no-right-panel');

  // Setup button handlers
  $('#btn-setup-connect').addEventListener('click', () => {
    const path = $('#setup-path').value.trim();
    if (!path) {
      $('#setup-error').textContent = 'Please enter a project path';
      $('#setup-error').classList.remove('hidden');
      return;
    }
    setupConnect(path);
  });

  $('#setup-path').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-setup-connect').click();
  });

  $('#btn-change-project').addEventListener('click', showSetupScreen);

  // Check for saved project path
  const savedPath = App.projectPath;
  if (savedPath) {
    hideSetupScreen();
    setupConnect(savedPath);
  } else {
    showSetupScreen();
  }

  // Restore saved process cards
  loadCards();
})();
