/**
 * Skeduler Companion App
 * Minimal iPad client for viewing schedules and marking shots complete
 */

const SUPABASE_URL = 'https://qcnepxcqilqrhayzhlfa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbmVweGNxaWxxcmhheXpobGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTgwMjYsImV4cCI6MjA3ODAzNDAyNn0.Gz7wvMgtu-UtCqw-5MF9s-T-pk-eo2TSw7zOtedWozk';

// App State
const state = {
  supabase: null,
  user: null,
  projects: [],
  currentProject: null,
  scheduleData: null,
  currentDayIndex: 0,
  pendingChanges: [],
  syncTimeout: null
};

// DOM Elements
const els = {
  authScreen: null,
  projectsScreen: null,
  scheduleScreen: null,
  emailInput: null,
  passwordInput: null,
  signInBtn: null,
  authError: null,
  signOutBtn: null,
  projectList: null,
  loadingProjects: null,
  backBtn: null,
  scheduleTitle: null,
  syncBtn: null,
  dayTabs: null,
  scheduleBody: null,
  syncStatus: null
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Cache DOM elements
  Object.keys(els).forEach(key => {
    els[key] = document.getElementById(key) || document.querySelector(`.${key}`);
  });
  els.authScreen = document.getElementById('authScreen');
  els.projectsScreen = document.getElementById('projectsScreen');
  els.scheduleScreen = document.getElementById('scheduleScreen');
  
  // Initialize Supabase
  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Check existing session
  state.supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      state.user = session.user;
      showProjectsScreen();
    }
  });
  
  // Auth state listener
  state.supabase.auth.onAuthStateChange((event, session) => {
    state.user = session?.user || null;
    if (session) {
      showProjectsScreen();
    } else {
      showAuthScreen();
    }
  });
  
  // Event listeners
  els.signInBtn.addEventListener('click', handleSignIn);
  els.passwordInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSignIn();
  });
  els.signOutBtn.addEventListener('click', handleSignOut);
  els.backBtn.addEventListener('click', showProjectsScreen);
  els.syncBtn.addEventListener('click', syncNow);
  
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  }
}

// Auth handlers
async function handleSignIn() {
  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;
  
  if (!email || !password) {
    showAuthError('Please enter email and password');
    return;
  }
  
  els.signInBtn.disabled = true;
  els.signInBtn.textContent = 'SIGNING IN...';
  
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  
  els.signInBtn.disabled = false;
  els.signInBtn.textContent = 'SIGN IN';
  
  if (error) {
    showAuthError(error.message);
  }
}

async function handleSignOut() {
  await state.supabase.auth.signOut();
  state.projects = [];
  state.currentProject = null;
  state.scheduleData = null;
  showAuthScreen();
}

function showAuthError(msg) {
  els.authError.textContent = msg;
  setTimeout(() => els.authError.textContent = '', 4000);
}

// Screen navigation
function showAuthScreen() {
  els.authScreen.classList.remove('hidden');
  els.projectsScreen.classList.add('hidden');
  els.scheduleScreen.classList.add('hidden');
}

function showProjectsScreen() {
  els.authScreen.classList.add('hidden');
  els.projectsScreen.classList.remove('hidden');
  els.scheduleScreen.classList.add('hidden');
  loadProjects();
}

function showScheduleScreen() {
  els.authScreen.classList.add('hidden');
  els.projectsScreen.classList.add('hidden');
  els.scheduleScreen.classList.remove('hidden');
}

// Projects
async function loadProjects() {
  els.loadingProjects.style.display = 'block';
  els.projectList.innerHTML = '';
  
  const { data, error } = await state.supabase
    .from('projects')
    .select('*')
    .eq('user_id', state.user.id)
    .order('updated_at', { ascending: false });
  
  els.loadingProjects.style.display = 'none';
  
  if (error) {
    els.projectList.innerHTML = `<div class="empty-state"><p>Error loading projects</p></div>`;
    return;
  }
  
  state.projects = data || [];
  
  if (state.projects.length === 0) {
    els.projectList.innerHTML = `
      <div class="empty-state">
        <h2>No Projects</h2>
        <p>Create projects in the desktop app</p>
      </div>
    `;
    return;
  }
  
  state.projects.forEach(project => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `
      <div class="name">${escapeHtml(project.name)}</div>
      <div class="meta">${formatDate(project.updated_at)}</div>
      <div class="arrow">›</div>
    `;
    item.addEventListener('click', () => openProject(project));
    els.projectList.appendChild(item);
  });
}

async function openProject(project) {
  state.currentProject = project;
  els.scheduleTitle.textContent = project.name;
  showScheduleScreen();
  
  // Load schedule file
  const fileName = project.file_path.split('/').pop();
  const { data, error } = await state.supabase.storage
    .from('schedule-files')
    .download(`${state.user.id}/${fileName}`);
  
  if (error) {
    els.scheduleBody.innerHTML = `<tr><td colspan="4" class="empty-state">Error loading schedule</td></tr>`;
    return;
  }
  
  const text = await data.text();
  state.scheduleData = JSON.parse(text);
  state.currentDayIndex = 0;
  
  renderDayTabs();
  renderSchedule();
}

// Day tabs
function renderDayTabs() {
  els.dayTabs.innerHTML = '';
  
  const days = state.scheduleData.days || [{ label: 'Day 1' }];
  
  days.forEach((day, index) => {
    const tab = document.createElement('button');
    tab.className = 'day-tab' + (index === state.currentDayIndex ? ' active' : '');
    tab.textContent = day.label || `Day ${index + 1}`;
    tab.addEventListener('click', () => {
      state.currentDayIndex = index;
      renderDayTabs();
      renderSchedule();
    });
    els.dayTabs.appendChild(tab);
  });
  
  // Hide tabs if only one day
  els.dayTabs.style.display = days.length > 1 ? 'flex' : 'none';
}

// Schedule rendering
function renderSchedule() {
  els.scheduleBody.innerHTML = '';
  
  const days = state.scheduleData.days || [];
  const currentDay = days[state.currentDayIndex];
  
  if (!currentDay || !currentDay.rows) {
    els.scheduleBody.innerHTML = `<tr><td colspan="4" class="empty-state">No rows in schedule</td></tr>`;
    return;
  }
  
  currentDay.rows.forEach(row => {
    renderRow(row);
    
    // Render children (sub-events)
    if (row.children && row.children.length > 0) {
      row.children.forEach(child => renderRow(child, true));
    }
  });
}

function renderRow(row, isChild = false) {
  const tr = document.createElement('tr');
  tr.id = row.id;
  tr.dataset.rowId = row.id;
  
  // Row type styling
  if (row.type === 'event') tr.classList.add('row-event');
  if (row.type === 'calltime') tr.classList.add('row-calltime');
  if (isChild) tr.classList.add('row-child');
  if (row.completed) tr.classList.add('row-complete');
  
  // Status cell (completion toggle)
  const statusCell = document.createElement('td');
  statusCell.className = 'col-status';
  
  // Only show toggle for regular rows, not events/calltimes
  if (row.type !== 'event' && row.type !== 'calltime') {
    const btn = document.createElement('button');
    btn.className = 'complete-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleComplete(row.id, tr);
    });
    statusCell.appendChild(btn);
  }
  tr.appendChild(statusCell);
  
  // Time cell
  const timeCell = document.createElement('td');
  timeCell.className = 'col-time';
  timeCell.textContent = row.start || row.time || '';
  tr.appendChild(timeCell);
  
  // Shot cell
  const shotCell = document.createElement('td');
  shotCell.className = 'col-shot';
  shotCell.textContent = row.shot || row.title || '';
  tr.appendChild(shotCell);
  
  // Description cell
  const descCell = document.createElement('td');
  descCell.className = 'col-desc';
  descCell.textContent = row.desc || row.description || row.notes || '';
  tr.appendChild(descCell);
  
  els.scheduleBody.appendChild(tr);
}

// Completion toggle
function toggleComplete(rowId, tr) {
  const isComplete = tr.classList.toggle('row-complete');
  
  // Update data
  const days = state.scheduleData.days || [];
  const currentDay = days[state.currentDayIndex];
  
  if (currentDay && currentDay.rows) {
    const row = findRow(currentDay.rows, rowId);
    if (row) {
      row.completed = isComplete;
      row.completedAt = isComplete ? Date.now() : null;
    }
  }
  
  // Queue sync
  queueSync();
}

function findRow(rows, id) {
  for (const row of rows) {
    if (row.id === id) return row;
    if (row.children) {
      const found = findRow(row.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Sync
function queueSync() {
  // Debounce - wait 2 seconds after last change
  clearTimeout(state.syncTimeout);
  state.syncTimeout = setTimeout(syncNow, 2000);
  showSyncStatus('Pending...', '');
}

async function syncNow() {
  clearTimeout(state.syncTimeout);
  
  if (!state.currentProject || !state.scheduleData) return;
  
  showSyncStatus('Syncing...', '');
  
  try {
    const fileName = state.currentProject.file_path.split('/').pop();
    const filePath = `${state.user.id}/${fileName}`;
    const jsonString = JSON.stringify(state.scheduleData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Delete then upload (no update permission)
    await state.supabase.storage.from('schedule-files').remove([filePath]);
    
    const { error } = await state.supabase.storage
      .from('schedule-files')
      .upload(filePath, blob, { cacheControl: '3600', upsert: false });
    
    if (error) throw error;
    
    showSyncStatus('Synced', 'success');
  } catch (err) {
    console.error('Sync error:', err);
    showSyncStatus('Sync failed', 'error');
  }
}

function showSyncStatus(message, type) {
  els.syncStatus.textContent = message;
  els.syncStatus.className = 'sync-status visible' + (type ? ` ${type}` : '');
  
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      els.syncStatus.classList.remove('visible');
    }, 2000);
  }
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
