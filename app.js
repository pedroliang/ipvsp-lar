/* ============================================================
   Cuidando do Lar — IPVSP
   App: escala + estoque com Supabase Realtime
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

/* -------------------- Estado -------------------- */
const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-11
  escalas: [],   // [{ id, data, horario, pessoa1, pessoa2, observacao }]
  estoque: [],   // [{ id, nome, categoria, qtd, urgente, observacao, status, autor, ... }]
  online: false,
};

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DIAS_SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

/* -------------------- Supabase client -------------------- */
let supabase = null;
let isConfigured = SUPABASE_URL
  && /^https:\/\//.test(SUPABASE_URL)
  && SUPABASE_ANON_KEY
  && SUPABASE_ANON_KEY.length > 30;

if (isConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } }
    });
  } catch (e) {
    console.error('Falha ao iniciar Supabase:', e);
    isConfigured = false;
  }
}

/* -------------------- Storage local (fallback) -------------------- */
const LS_KEY_ESCALA = 'cdl_escalas_v1';
const LS_KEY_ESTOQUE = 'cdl_estoque_v1';

function loadLocal() {
  try {
    state.escalas = JSON.parse(localStorage.getItem(LS_KEY_ESCALA) || '[]');
    state.estoque = JSON.parse(localStorage.getItem(LS_KEY_ESTOQUE) || '[]');
  } catch { /* noop */ }
}
function saveLocal() {
  if (isConfigured) return;
  localStorage.setItem(LS_KEY_ESCALA, JSON.stringify(state.escalas));
  localStorage.setItem(LS_KEY_ESTOQUE, JSON.stringify(state.estoque));
}

/* -------------------- Helpers -------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const uid = () => 'tmp_' + Math.random().toString(36).slice(2, 10);

function fmtDate(d) {
  // d: 'YYYY-MM-DD'
  if (!d) return '';
  const [y,m,day] = d.split('-').map(Number);
  return new Date(y, m-1, day);
}
function pad2(n) { return String(n).padStart(2, '0'); }
function dateToISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function getSundaysOfMonth(year, month) {
  const sundays = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    if (date.getDay() === 0) sundays.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return sundays;
}
function getNextSunday(from = new Date()) {
  const d = new Date(from);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

/* -------------------- Toast -------------------- */
let toastTimer = null;
function toast(msg, kind = 'ok') {
  const el = $('#toast');
  $('#toastText').textContent = msg;
  el.hidden = false;
  el.classList.add('is-show');
  el.style.background = kind === 'error' ? 'var(--danger)' : 'var(--ink)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, 2400);
}

/* -------------------- Status bar -------------------- */
function setStatus(text, ok = true) {
  const bar = $('#statusBar');
  bar.hidden = false;
  bar.classList.toggle('is-error', !ok);
  $('#statusBarText').textContent = text;
  if (ok && text === 'Conectado') {
    setTimeout(() => { bar.hidden = true; }, 1800);
  }
}

/* ============================================================
   ESCALA — fetch / render / CRUD
   ============================================================ */

async function fetchEscalas() {
  if (!isConfigured) return;
  const { data, error } = await supabase
    .from('escalas')
    .select('*')
    .order('data', { ascending: true });
  if (error) {
    console.error(error);
    toast('Erro ao carregar escala', 'error');
    return;
  }
  state.escalas = data || [];
  renderEscala();
  renderFeatured();
  renderMonthTabs();
}

function renderMonthTabs() {
  const tabs = $('#monthTabs');
  // descobrir quais meses têm dados no ano atual
  const monthsWithData = new Set();
  state.escalas.forEach(e => {
    const d = fmtDate(e.data);
    if (d.getFullYear() === state.year) monthsWithData.add(d.getMonth());
  });

  tabs.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const btn = document.createElement('button');
    btn.className = 'month-tab';
    if (m === state.month) btn.classList.add('is-active');
    if (monthsWithData.has(m)) btn.classList.add('has-data');
    btn.innerHTML = `${MESES_CURTO[m]}<span class="dot"></span>`;
    btn.addEventListener('click', () => {
      state.month = m;
      renderMonthTabs();
      renderEscala();
    });
    tabs.appendChild(btn);
  }
  $('#yearDisplay').textContent = state.year;
}

function renderEscala() {
  const list = $('#scheduleList');
  const today = new Date(); today.setHours(0,0,0,0);
  const itens = state.escalas
    .filter(e => {
      const d = fmtDate(e.data);
      return d.getFullYear() === state.year && d.getMonth() === state.month;
    })
    .sort((a, b) => a.data.localeCompare(b.data));

  if (itens.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-art">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <h4>Nenhum domingo cadastrado em ${MESES[state.month]}</h4>
        <p>Use <strong>Preencher mês</strong> para cadastrar todos os domingos de uma vez, ou <strong>Novo registro</strong>.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = itens.map(e => {
    const d = fmtDate(e.data);
    const isPast = d < today && !isSameDay(d, today);
    const isCurrent = isSameDay(d, today) || (d > today && isSameDay(d, getNextSunday(today)));
    const cls = ['schedule-row'];
    if (isPast) cls.push('is-past');
    if (isCurrent) cls.push('is-current');

    const names = [e.pessoa1, e.pessoa2].filter(Boolean).join(' & ');
    return `
      <div class="${cls.join(' ')}">
        <div class="row-date">
          <span class="d">${pad2(d.getDate())}/${pad2(d.getMonth()+1)}</span>
          <span class="w">${DIAS_SEMANA[d.getDay()]}</span>
        </div>
        <div class="row-time">${e.horario || '—'}</div>
        <div class="row-pair">
          <span class="names">${escapeHtml(names || '—')}</span>
          ${e.observacao ? `<span class="obs">${escapeHtml(e.observacao)}</span>` : ''}
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-edit="${e.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-delete="${e.id}" title="Remover">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-edit]').forEach(b => {
    b.addEventListener('click', () => openEntryModal(state.escalas.find(x => x.id == b.dataset.edit)));
  });
  list.querySelectorAll('[data-delete]').forEach(b => {
    b.addEventListener('click', () => deleteEscala(b.dataset.delete));
  });
}

function renderFeatured() {
  const card = $('#featuredCard');
  const today = new Date(); today.setHours(0,0,0,0);
  const next = getNextSunday(today);
  const matching = state.escalas.find(e => isSameDay(fmtDate(e.data), next));

  if (!matching) {
    card.innerHTML = `
      <div class="featured-empty">
        <span class="featured-eyebrow">Próximo domingo · ${pad2(next.getDate())}/${pad2(next.getMonth()+1)}</span>
        <p>Nenhum cuidador escalado ainda.</p>
        <button class="btn-primary" id="featuredAddBtn">Escalar este domingo</button>
      </div>
    `;
    $('#featuredAddBtn').addEventListener('click', () => {
      openEntryModal({ data: dateToISO(next) });
    });
    return;
  }

  const d = fmtDate(matching.data);
  const names = [matching.pessoa1, matching.pessoa2].filter(Boolean);

  card.innerHTML = `
    <div class="featured-grid">
      <div class="featured-date">
        <span class="day">${pad2(d.getDate())}</span>
        <span class="month">${MESES_CURTO[d.getMonth()]}</span>
      </div>
      <div class="featured-body">
        <span class="featured-eyebrow">Cuidadores deste domingo</span>
        <h3 class="featured-names">${escapeHtml(names[0] || '')}${names[1] ? ` <em>&amp;</em> ${escapeHtml(names[1])}` : ''}</h3>
        <div class="featured-meta">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${escapeHtml(matching.horario || '09h30')}
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            IPV São Paulo
          </span>
        </div>
        ${matching.observacao ? `<p class="featured-obs">${escapeHtml(matching.observacao)}</p>` : ''}
      </div>
      <button class="featured-edit" id="featuredEditBtn">Editar</button>
    </div>
  `;

  $('#featuredEditBtn').addEventListener('click', () => openEntryModal(matching));
}

/* -------------------- Escala CRUD -------------------- */
function openEntryModal(entry = null) {
  $('#entryModalTitle').textContent = entry?.id ? 'Editar registro' : 'Novo registro';
  $('#entryId').value = entry?.id || '';
  $('#entryData').value = entry?.data || dateToISO(getNextSunday());
  $('#entryHorario').value = entry?.horario || '09h30';
  $('#entryPessoa1').value = entry?.pessoa1 || '';
  $('#entryPessoa2').value = entry?.pessoa2 || '';
  $('#entryObs').value = entry?.observacao || '';
  $('#entryDeleteBtn').hidden = !entry?.id;
  showModal('entryModal');
}

async function saveEscala(e) {
  e.preventDefault();
  const id = $('#entryId').value;
  const payload = {
    data: $('#entryData').value,
    horario: $('#entryHorario').value.trim() || '09h30',
    pessoa1: $('#entryPessoa1').value.trim(),
    pessoa2: $('#entryPessoa2').value.trim() || null,
    observacao: $('#entryObs').value.trim() || null,
  };
  if (!payload.data || !payload.pessoa1) {
    toast('Preencha data e cuidador 1', 'error');
    return;
  }

  if (isConfigured) {
    if (id) {
      const { error } = await supabase.from('escalas').update(payload).eq('id', id);
      if (error) return toast('Erro ao salvar', 'error');
    } else {
      const { error } = await supabase.from('escalas').insert(payload);
      if (error) return toast('Erro ao salvar', 'error');
    }
  } else {
    if (id) {
      state.escalas = state.escalas.map(x => x.id == id ? { ...x, ...payload, id } : x);
    } else {
      state.escalas.push({ ...payload, id: uid() });
    }
    saveLocal();
    renderEscala(); renderFeatured(); renderMonthTabs();
  }
  hideModal('entryModal');
  toast('Registro salvo');
}

async function deleteEscala(id) {
  if (!confirm('Remover este registro?')) return;
  if (isConfigured) {
    const { error } = await supabase.from('escalas').delete().eq('id', id);
    if (error) return toast('Erro ao remover', 'error');
  } else {
    state.escalas = state.escalas.filter(x => x.id != id);
    saveLocal();
    renderEscala(); renderFeatured(); renderMonthTabs();
  }
  toast('Registro removido');
}

/* -------------------- Preencher mês -------------------- */
function openMonthModal() {
  const select = $('#monthSelect');
  select.innerHTML = MESES.map((m,i) => `<option value="${i}" ${i===state.month?'selected':''}>${m}</option>`).join('');
  $('#monthYear').value = state.year;
  $('#monthHorario').value = '09h30';
  buildMonthSundays();
  showModal('monthModal');
}

function buildMonthSundays() {
  const month = parseInt($('#monthSelect').value, 10);
  const year = parseInt($('#monthYear').value, 10);
  const sundays = getSundaysOfMonth(year, month);
  const container = $('#monthSundays');

  container.innerHTML = sundays.map((d, idx) => {
    const iso = dateToISO(d);
    const existing = state.escalas.find(e => e.data === iso);
    return `
      <div class="sunday-row" data-iso="${iso}">
        <div class="label">
          <strong>${pad2(d.getDate())}/${pad2(d.getMonth()+1)}</strong>
          <small>${idx+1}º domingo</small>
        </div>
        <input type="text" placeholder="Cuidador 1" value="${escapeHtml(existing?.pessoa1 || '')}" data-field="p1" />
        <input type="text" placeholder="Cuidador 2 (opcional)" value="${escapeHtml(existing?.pessoa2 || '')}" data-field="p2" />
      </div>
    `;
  }).join('');
}

async function saveMonth() {
  const horario = $('#monthHorario').value.trim() || '09h30';
  const rows = $$('#monthSundays .sunday-row');
  const ops = [];
  for (const row of rows) {
    const iso = row.dataset.iso;
    const p1 = $('input[data-field=p1]', row).value.trim();
    const p2 = $('input[data-field=p2]', row).value.trim();
    if (!p1 && !p2) continue;
    const existing = state.escalas.find(e => e.data === iso);
    const payload = {
      data: iso,
      horario,
      pessoa1: p1 || null,
      pessoa2: p2 || null,
    };
    if (existing) {
      ops.push({ kind: 'update', id: existing.id, payload });
    } else {
      ops.push({ kind: 'insert', payload });
    }
  }

  if (isConfigured) {
    for (const op of ops) {
      if (op.kind === 'insert') {
        const { error } = await supabase.from('escalas').insert(op.payload);
        if (error) console.error(error);
      } else {
        const { error } = await supabase.from('escalas').update(op.payload).eq('id', op.id);
        if (error) console.error(error);
      }
    }
  } else {
    for (const op of ops) {
      if (op.kind === 'insert') {
        state.escalas.push({ ...op.payload, id: uid() });
      } else {
        state.escalas = state.escalas.map(x => x.id == op.id ? { ...x, ...op.payload } : x);
      }
    }
    saveLocal();
    renderEscala(); renderFeatured(); renderMonthTabs();
  }

  hideModal('monthModal');
  toast(`${ops.length} domingo(s) salvos`);
}

/* ============================================================
   ESTOQUE
   ============================================================ */

async function fetchEstoque() {
  if (!isConfigured) return;
  const { data, error } = await supabase
    .from('estoque')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    toast('Erro ao carregar estoque', 'error');
    return;
  }
  state.estoque = data || [];
  renderEstoque();
}

function renderEstoque() {
  const limpeza = state.estoque.filter(i => i.categoria === 'limpeza');
  const food = state.estoque.filter(i => i.categoria === 'comes_bebes');

  $('#cleanCount').textContent = `${limpeza.filter(i=>i.status!=='comprado').length} pendente(s) · ${limpeza.length} no total`;
  $('#foodCount').textContent = `${food.filter(i=>i.status!=='comprado').length} pendente(s) · ${food.length} no total`;

  $('#stockListLimpeza').innerHTML = renderStockList(limpeza)
    || `<li class="stock-empty">Nada faltando aqui — graças a Deus.</li>`;
  $('#stockListComesBebes').innerHTML = renderStockList(food)
    || `<li class="stock-empty">Sem necessidades registradas.</li>`;

  // bind buttons
  $$('[data-stock-toggle]').forEach(b => b.addEventListener('click', () => toggleStock(b.dataset.stockToggle)));
  $$('[data-stock-edit]').forEach(b => b.addEventListener('click', () => openStockModal(state.estoque.find(x => x.id == b.dataset.stockEdit))));
  $$('[data-stock-del]').forEach(b => b.addEventListener('click', () => deleteStock(b.dataset.stockDel)));
}

function renderStockList(items) {
  if (!items.length) return '';
  // ordena: urgentes primeiro, depois pendentes, depois comprados
  const sorted = [...items].sort((a, b) => {
    const sa = (a.status === 'comprado' ? 2 : (a.urgente ? 0 : 1));
    const sb = (b.status === 'comprado' ? 2 : (b.urgente ? 0 : 1));
    if (sa !== sb) return sa - sb;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
  return sorted.map(i => {
    const cls = ['stock-item'];
    if (i.status === 'comprado') cls.push('is-done');
    if (i.urgente && i.status !== 'comprado') cls.push('is-urgent');
    const ts = i.created_at ? new Date(i.created_at) : null;
    const when = ts ? ts.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
    return `
      <li class="${cls.join(' ')}">
        <button class="stock-check" data-stock-toggle="${i.id}" title="Marcar como comprado">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <div class="stock-body">
          <div class="stock-name">
            ${escapeHtml(i.nome)}
            ${i.qtd ? `<span class="qty">· ${escapeHtml(i.qtd)}</span>` : ''}
            ${i.urgente && i.status !== 'comprado' ? `<span class="stock-tag">Urgente</span>` : ''}
          </div>
          ${i.observacao ? `<div class="stock-obs">${escapeHtml(i.observacao)}</div>` : ''}
          <div class="stock-meta">
            ${i.autor ? `Adicionado por <strong>${escapeHtml(i.autor)}</strong>` : 'Adicionado'}
            ${when ? ` · ${when}` : ''}
            ${i.status === 'comprado' ? ' · ✓ comprado' : ''}
          </div>
        </div>
        <div class="stock-actions">
          <button class="icon-btn" data-stock-edit="${i.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-stock-del="${i.id}" title="Remover">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </li>
    `;
  }).join('');
}

function openStockModal(item = null) {
  $('#stockModalTitle').textContent = item?.id ? 'Editar item' : 'Novo item';
  $('#stockId').value = item?.id || '';
  $('#stockNome').value = item?.nome || '';
  $('#stockCategoria').value = item?.categoria || 'limpeza';
  $('#stockQtd').value = item?.qtd || '';
  $('#stockObs').value = item?.observacao || '';
  $('#stockUrgente').checked = !!item?.urgente;
  $('#stockAutor').value = item?.autor || localStorage.getItem('cdl_autor') || '';
  $('#stockDeleteBtn').hidden = !item?.id;
  showModal('stockModal');
}

async function saveStock(e) {
  e.preventDefault();
  const id = $('#stockId').value;
  const payload = {
    nome: $('#stockNome').value.trim(),
    categoria: $('#stockCategoria').value,
    qtd: $('#stockQtd').value.trim() || null,
    observacao: $('#stockObs').value.trim() || null,
    urgente: $('#stockUrgente').checked,
    autor: $('#stockAutor').value.trim() || null,
  };
  if (!payload.nome) return toast('Diga o nome do item', 'error');
  if (payload.autor) localStorage.setItem('cdl_autor', payload.autor);

  if (isConfigured) {
    if (id) {
      const { error } = await supabase.from('estoque').update(payload).eq('id', id);
      if (error) return toast('Erro ao salvar', 'error');
    } else {
      const { error } = await supabase.from('estoque').insert({ ...payload, status: 'pendente' });
      if (error) return toast('Erro ao salvar', 'error');
    }
  } else {
    if (id) {
      state.estoque = state.estoque.map(x => x.id == id ? { ...x, ...payload } : x);
    } else {
      state.estoque.unshift({
        ...payload,
        id: uid(),
        status: 'pendente',
        created_at: new Date().toISOString(),
      });
    }
    saveLocal();
    renderEstoque();
  }
  hideModal('stockModal');
  toast('Item salvo');
}

async function toggleStock(id) {
  const item = state.estoque.find(x => x.id == id);
  if (!item) return;
  const newStatus = item.status === 'comprado' ? 'pendente' : 'comprado';
  if (isConfigured) {
    const { error } = await supabase.from('estoque').update({ status: newStatus }).eq('id', id);
    if (error) return toast('Erro ao atualizar', 'error');
  } else {
    item.status = newStatus;
    saveLocal();
    renderEstoque();
  }
}

async function deleteStock(id) {
  if (!confirm('Remover este item?')) return;
  if (isConfigured) {
    const { error } = await supabase.from('estoque').delete().eq('id', id);
    if (error) return toast('Erro ao remover', 'error');
  } else {
    state.estoque = state.estoque.filter(x => x.id != id);
    saveLocal();
    renderEstoque();
  }
  toast('Removido');
}

/* ============================================================
   Realtime
   ============================================================ */
function subscribeRealtime() {
  if (!isConfigured) return;

  supabase
    .channel('escalas-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'escalas' }, () => {
      fetchEscalas();
    })
    .subscribe((status) => {
      state.online = status === 'SUBSCRIBED';
      setStatus(state.online ? 'Conectado' : 'Reconectando…', state.online);
    });

  supabase
    .channel('estoque-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, () => {
      fetchEstoque();
    })
    .subscribe();
}

/* ============================================================
   Modal helpers
   ============================================================ */
function showModal(id) {
  const el = document.getElementById(id);
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}
function hideModal(id) {
  const el = document.getElementById(id);
  el.hidden = true;
  document.body.style.overflow = '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

/* ============================================================
   Bootstrap
   ============================================================ */
function bind() {
  // Close modais
  $$('.modal [data-close]').forEach(b => b.addEventListener('click', () => {
    const modal = b.closest('.modal');
    if (modal) hideModal(modal.id);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal:not([hidden])').forEach(m => hideModal(m.id));
    }
  });

  // Year switch
  $('#yearPrev').addEventListener('click', () => { state.year--; renderMonthTabs(); renderEscala(); });
  $('#yearNext').addEventListener('click', () => { state.year++; renderMonthTabs(); renderEscala(); });

  // Buttons
  $('#addEntryBtn').addEventListener('click', () => openEntryModal());
  $('#addMonthBtn').addEventListener('click', () => openMonthModal());
  $('#addStockBtn').addEventListener('click', () => openStockModal());
  $('#refreshBtn').addEventListener('click', () => {
    if (isConfigured) { fetchEscalas(); fetchEstoque(); toast('Atualizando…'); }
    else { renderEscala(); renderFeatured(); renderEstoque(); }
  });

  // Forms
  $('#entryForm').addEventListener('submit', saveEscala);
  $('#stockForm').addEventListener('submit', saveStock);
  $('#entryDeleteBtn').addEventListener('click', () => {
    const id = $('#entryId').value;
    if (id) { hideModal('entryModal'); deleteEscala(id); }
  });
  $('#stockDeleteBtn').addEventListener('click', () => {
    const id = $('#stockId').value;
    if (id) { hideModal('stockModal'); deleteStock(id); }
  });
  $('#monthSelect').addEventListener('change', buildMonthSundays);
  $('#monthYear').addEventListener('change', buildMonthSundays);
  $('#saveMonthBtn').addEventListener('click', saveMonth);

  // Sidebar nav active state on scroll
  const sections = ['destaque','escala','estoque'].map(id => document.getElementById(id));
  const navItems = $$('.nav-item');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navItems.forEach(n => n.classList.toggle('is-active', n.getAttribute('href') === `#${id}`));
      }
    });
  }, { rootMargin: '-30% 0% -50% 0%' });
  sections.forEach(s => s && observer.observe(s));
}

async function boot() {
  bind();

  if (!isConfigured) {
    setStatus('Modo local (configure o Supabase em config.js)', false);
    loadLocal();
    renderMonthTabs();
    renderEscala();
    renderFeatured();
    renderEstoque();
    return;
  }

  setStatus('Conectando…');
  await Promise.all([fetchEscalas(), fetchEstoque()]);
  subscribeRealtime();
}

document.addEventListener('DOMContentLoaded', boot);
