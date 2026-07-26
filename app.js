// ============================================================
// NK PREMIUM — LÓGICA DO APP (v4)
// ============================================================

let currentUser = null;
let UID = null;
let isAdmin = false;
let permissoesModulos = {};
let usuariosAutorizados = [];
let modulosSelecionados = [];
let editandoProdutoId = null;
let produtos = [], clientes = [], vendas = [], lancamentos = [], itens = [];
let selectedCaptureType = null;
let carrinho = [];
let agendaMonthOffset = 0;
let crediarioDataEditadaManualmente = false;
let ultimoRecibo = null;
let filtroEstoque = 'ativos'; // 'ativos' | 'inativos'
let filtroFinanceiro = 'todos'; // 'todos' | 'entrada' | 'areceber' | 'saida'
let editandoVendaId = null;
let vendaEmCancelamento = null;

// -------------------- HELPERS --------------------
function $(id){ return document.getElementById(id); }
function fmtMoney(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function addDays(dateStr, days){
  const d = dateStr ? new Date(dateStr+'T00:00:00') : new Date();
  d.setDate(d.getDate() + Number(days||0));
  return d.toISOString().slice(0,10);
}
function onlyDigits(s){ return (s||'').replace(/\D/g,''); }
function waLink(phone, text){
  const digits = onlyDigits(phone);
  if(!digits) return null;
  const full = digits.length <= 11 ? '55'+digits : digits;
  return 'https://wa.me/'+full+'?text='+encodeURIComponent(text);
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.style.display='block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=> t.style.display='none', 3600);
}
function col(name){ return db.collection('users').doc(WORKSPACE_ID).collection(name); }
function firestoreErr(e){ console.error(e); toast('Erro ao salvar: ' + (e && e.message ? e.message : e)); }
function produtosAtivos(){ return produtos.filter(p=> p.ativo !== false); }
function ordenarPorNome(arr){ return [...arr].sort((a,b)=> (a.nome||'').localeCompare(b.nome||'', 'pt-BR')); }

// -------------------- THEME --------------------
function toggleTheme(){
  const root = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  root.setAttribute('data-theme', isLight ? 'dark' : 'light');
  $('btnTheme').textContent = isLight ? '🌙 Modo escuro' : '☀️ Modo claro';
  localStorage.setItem('nk_theme', isLight ? 'dark' : 'light');
}
(function initTheme(){
  if(localStorage.getItem('nk_theme') === 'light'){ document.documentElement.setAttribute('data-theme','light'); }
})();

// -------------------- AUTH --------------------
function doLogin(){
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  $('loginErr').textContent = '';
  auth.signInWithEmailAndPassword(email, pass).catch(e => $('loginErr').textContent = traduzErro(e));
}
let jaProcessouLogin = false;
function doLoginGoogle(){
  $('loginErr').textContent = '';
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(()=>{
    auth.signInWithRedirect(provider);
  }).catch(e => $('loginErr').textContent = traduzErro(e));
}
auth.getRedirectResult().then(result=>{
  if(result && result.user && !jaProcessouLogin){
    jaProcessouLogin = true;
    verificarAcessoEIniciar(result.user);
  }
}).catch(e=>{
  if(e && e.code) $('loginErr').textContent = traduzErro(e);
});
function doSignup(){
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  $('loginErr').textContent = '';
  if(!email || pass.length < 6){ $('loginErr').textContent = 'Preencha e-mail e senha (mín. 6 caracteres).'; return; }
  auth.createUserWithEmailAndPassword(email, pass).catch(e => $('loginErr').textContent = traduzErro(e));
}
function doLogout(){ auth.signOut(); }
function doResetPassword(){
  const email = $('loginEmail').value.trim();
  $('loginErr').textContent = '';
  if(!email){ $('loginErr').textContent = 'Digite seu e-mail no campo acima primeiro.'; return; }
  auth.sendPasswordResetEmail(email).then(()=>{
    $('loginErr').style.color = 'var(--ok)';
    $('loginErr').textContent = 'Link enviado! Confira seu e-mail (' + email + ') e defina a nova senha.';
  }).catch(e=>{
    $('loginErr').style.color = '';
    $('loginErr').textContent = traduzErro(e);
  });
}
function traduzErro(e){
  const map = {
    'auth/invalid-email':'E-mail inválido.', 'auth/user-not-found':'Usuário não encontrado.',
    'auth/wrong-password':'Senha incorreta.', 'auth/email-already-in-use':'Este e-mail já tem conta — tente entrar.',
    'auth/weak-password':'Senha muito fraca (mín. 6 caracteres).', 'auth/invalid-credential':'E-mail ou senha incorretos.',
    'auth/popup-closed-by-user':'Login cancelado.', 'auth/unauthorized-domain':'Este site ainda não está autorizado no Firebase (Authentication > Configurações > Domínios autorizados).'
  };
  return map[e.code] || ('Erro: ' + e.message);
}

const MODULOS_TOGGLE = ['estoque','pdv','clientes','financeiro'];
const MODULOS_SEMPRE_LIVRES = ['dashboard','agenda','tarefas'];

function aplicarPermissoesNaUI(){
  document.querySelectorAll('.nav-item').forEach(el=>{
    const view = el.dataset.view;
    let permitido = isAdmin || MODULOS_SEMPRE_LIVRES.includes(view) || permissoesModulos[view] === true;
    if(view === 'config') permitido = isAdmin; // config/gestão de usuários é só do admin
    el.style.display = permitido ? '' : 'none';
  });
  $('painelGestaoUsuarios').style.display = isAdmin ? 'block' : 'none';
  // se a view atual não é mais permitida, volta pro dashboard
  const ativo = document.querySelector('.nav-item.active');
  if(ativo && ativo.style.display === 'none'){
    document.querySelector('.nav-item[data-view="dashboard"]').click();
  }
}

function verificarAcessoEIniciar(user){
  if(user.email === OWNER_EMAIL){
    isAdmin = true; permissoesModulos = {};
    finalizarLogin(user);
    return;
  }
  db.collection('users').doc(WORKSPACE_ID).collection('usuarios').doc(user.email).get().then(doc=>{
    if(doc.exists && doc.data().ativo){
      isAdmin = false;
      permissoesModulos = doc.data().modulos || {};
      finalizarLogin(user);
    } else {
      openModal('modalAcessoNegado');
      auth.signOut();
    }
  }).catch(e=>{
    console.error(e);
    openModal('modalAcessoNegado');
    auth.signOut();
  });
}
let listenersIniciados = false;
function finalizarLogin(user){
  currentUser = user; UID = user.uid;
  $('loginScreen').style.display = 'none';
  $('app').classList.add('show');
  $('userEmailShow').textContent = user.email + (isAdmin ? ' (administrador)' : '');
  aplicarPermissoesNaUI();
  if(!listenersIniciados){
    listenersIniciados = true;
    startListeners();
    if(isAdmin) startUsuariosListener();
  }
}

auth.onAuthStateChanged(user => {
  if(user){
    verificarAcessoEIniciar(user);
  } else {
    currentUser = null; UID = null; isAdmin = false; permissoesModulos = {};
    listenersIniciados = false; jaProcessouLogin = false;
    $('loginScreen').style.display = 'flex';
    $('app').classList.remove('show');
  }
});

// -------------------- GESTÃO DE USUÁRIOS (admin) --------------------
function startUsuariosListener(){
  db.collection('users').doc(WORKSPACE_ID).collection('usuarios').onSnapshot(snap=>{
    usuariosAutorizados = snap.docs.map(d=>({email:d.id, ...d.data()}));
    renderUsuarios();
  }, err=> console.error('usuarios', err));
}
function toggleModuloChip(chip){
  chip.classList.toggle('selected');
  const modulo = chip.dataset.modulo;
  if(chip.classList.contains('selected')){ if(!modulosSelecionados.includes(modulo)) modulosSelecionados.push(modulo); }
  else { modulosSelecionados = modulosSelecionados.filter(m=>m!==modulo); }
}
function salvarAcessoUsuario(){
  const email = $('novoUsuarioEmail').value.trim().toLowerCase();
  if(!email || !email.includes('@')){ toast('Informe um e-mail válido.'); return; }
  if(email === OWNER_EMAIL){ toast('Esse já é o e-mail da conta principal.'); return; }
  const modulos = {};
  MODULOS_TOGGLE.forEach(m=> modulos[m] = modulosSelecionados.includes(m));
  db.collection('users').doc(WORKSPACE_ID).collection('usuarios').doc(email).set({
    email, nome: $('novoUsuarioNome').value.trim(), modulos, ativo:true, criadoEm: new Date().toISOString()
  }).then(()=>{
    toast('Acesso salvo para ' + email);
    $('novoUsuarioEmail').value=''; $('novoUsuarioNome').value='';
    modulosSelecionados = [];
    document.querySelectorAll('#modulosChips .chip').forEach(c=>c.classList.remove('selected'));
  }).catch(firestoreErr);
}
function removerAcessoUsuario(email){
  if(!confirm(`Remover o acesso de ${email}? Ele(a) não vai conseguir mais entrar no painel.`)) return;
  db.collection('users').doc(WORKSPACE_ID).collection('usuarios').doc(email).delete().then(()=> toast('Acesso removido.')).catch(firestoreErr);
}
function renderUsuarios(){
  const el = $('listaUsuarios');
  if(!el) return;
  el.innerHTML = usuariosAutorizados.length ? '' : '<div class="empty">Nenhum usuário adicional autorizado ainda.</div>';
  usuariosAutorizados.forEach(u=>{
    const mods = MODULOS_TOGGLE.filter(m=> u.modulos && u.modulos[m]).map(m=>({estoque:'Estoque',pdv:'PDV',clientes:'Clientes',financeiro:'Financeiro'}[m]));
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${escapeHtml(u.nome||u.email)} <span style="color:var(--text-dim); font-size:11px;">(${escapeHtml(u.email)})</span><br>
      <span style="font-size:11px; color:var(--text-dim);">${mods.length? mods.join(', ') : 'Nenhum módulo liberado'}</span></div>
      <button class="mini-btn" data-action="remover-usuario" data-email="${escapeHtml(u.email)}">Remover acesso</button>`;
    el.appendChild(div);
  });
}

// -------------------- MODAL HELPERS --------------------
function openModal(id){ $(id).classList.add('show'); }
function closeModal(id){ $(id).classList.remove('show'); }
function openCapture(){
  $('captureText').value=''; $('captureDate').value='';
  document.querySelectorAll('#captureType .chip').forEach(c=>c.classList.remove('selected'));
  selectedCaptureType = null;
  openModal('modalCaptura');
}

// -------------------- STARTUP LISTENERS --------------------
function startListeners(){
  col('produtos').onSnapshot(snap=>{
    produtos = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderEstoque(); fillPdvDatalist(); fillProdutosExistentesList(); renderDashboard();
  }, err => console.error('produtos', err));
  col('clientes').onSnapshot(snap=>{
    clientes = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderClientes(); fillPdvClienteSelect();
  }, err => console.error('clientes', err));
  col('vendas').onSnapshot(snap=>{
    vendas = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    renderVendas(); renderDashboard();
  }, err => console.error('vendas', err));
  col('financeiro').onSnapshot(snap=>{
    lancamentos = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderFinanceiro();
  }, err => console.error('financeiro', err));
  col('itens').onSnapshot(snap=>{
    itens = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderTarefas(); renderDashboard(); renderAgenda();
  }, err => console.error('itens', err));
}

// -------------------- CAPTURA RÁPIDA --------------------
function saveCapture(){
  const text = $('captureText').value.trim();
  if(!text){ toast('Escreva algo antes de guardar.'); return; }
  const item = {
    texto: text, tipo: selectedCaptureType || null, data: $('captureDate').value || null,
    prioridade: null, concluido: false, prioridadeDoDia: false, createdAt: new Date().toISOString()
  };
  col('itens').add(item).then(()=>{ closeModal('modalCaptura'); toast('Guardado!'); }).catch(firestoreErr);
}
function classificarItem(id, tipo){ col('itens').doc(id).update({tipo}).then(()=> toast('Classificado.')).catch(firestoreErr); }
function concluirItem(id){
  const it = itens.find(i=>i.id===id);
  if(!it) return;
  const novo = !it.concluido;
  col('itens').doc(id).update({concluido: novo}).catch(firestoreErr);
  if(it.lancamentoId){ col('financeiro').doc(it.lancamentoId).update({recebido: novo}).catch(()=>{}); }
}
function marcarPrioridade(id){
  itens.forEach(it=>{ if(it.prioridadeDoDia) col('itens').doc(it.id).update({prioridadeDoDia:false}); });
  col('itens').doc(id).update({prioridadeDoDia:true}).then(()=> toast('Definida como prioridade nº 1.')).catch(firestoreErr);
}
function excluirItem(id){ if(confirm('Excluir este item?')) col('itens').doc(id).delete().catch(firestoreErr); }
function setPrazoRapido(id, dias){ col('itens').doc(id).update({data: addDays(todayStr(), dias)}).catch(firestoreErr); }
function cobrarItem(id){
  const it = itens.find(i=>i.id===id);
  if(!it) return;
  if(!it.clienteWhats){ toast('Esse cliente não tem WhatsApp cadastrado.'); return; }
  const msg = `Olá ${it.clienteNome||''}! Tudo bem? Passando para lembrar da parcela ${it.parcelaNum||''}/${it.parcelaTotal||''} no valor de ${fmtMoney(it.valor)}${it.data ? ', com vencimento em '+it.data : ''}. Qualquer dúvida me chama por aqui 🙂`;
  const link = waLink(it.clienteWhats, msg);
  if(link) window.open(link, '_blank');
}

// -------------------- RENDER: TAREFAS --------------------
function renderTarefas(){
  const inbox = itens.filter(i=>!i.tipo);
  const inboxEl = $('inboxList');
  inboxEl.innerHTML = inbox.length ? '' : '<div class="empty">Sua caixa de entrada está vazia.</div>';
  inbox.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${escapeHtml(it.texto)}</div>
      <select class="classify-select" data-id="${it.id}" style="width:auto; padding:6px 8px; font-size:12px;">
        <option value="">Isto é...</option>
        <option value="tarefa">Tarefa</option><option value="projeto">Projeto</option>
        <option value="ideia">Ideia</option><option value="anotacao">Anotação</option><option value="referencia">Referência</option>
      </select>
      <button class="mini-btn" data-action="excluir-item" data-id="${it.id}">✕</button>`;
    inboxEl.appendChild(div);
  });

  const tarefas = itens.filter(i=> i.tipo === 'tarefa' && !i.concluido);
  const hoje = todayStr();
  const atrasadas = tarefas.filter(t=> t.data && t.data < hoje);
  const doDia = tarefas.filter(t=> t.data === hoje);
  const limiteSemana = addDays(hoje, 7);
  const semana = tarefas.filter(t=> t.data && t.data > hoje && t.data <= limiteSemana);
  const semData = tarefas.filter(t=> !t.data);

  renderTaskGroup('listAtrasadas', atrasadas, 'Nada atrasado. 🎉', true);
  renderTaskGroup('listHoje', doDia, 'Nada para hoje ainda.', false);
  renderTaskGroup('listSemana', semana, 'Nada nos próximos 7 dias.', false);
  renderTaskGroup('listSemData', semData, 'Nada por aqui.', false);
}
function renderTaskGroup(elId, list, emptyMsg, mostrarCobrar){
  const el = $(elId);
  el.innerHTML = list.length ? '' : `<div class="empty">${emptyMsg}</div>`;
  list.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    let botoes = `
      <button class="mini-btn" data-action="prioridade-item" data-id="${it.id}">🎯 Prioridade</button>
      <button class="mini-btn" data-action="prazo-hoje" data-id="${it.id}">Hoje</button>
      <button class="mini-btn" data-action="prazo-amanha" data-id="${it.id}">Amanhã</button>`;
    if(mostrarCobrar && it.clienteWhats){
      botoes += `<button class="mini-btn btn-wa" data-action="cobrar-item" data-id="${it.id}">💬 Cobrar</button>`;
    }
    botoes += `<button class="mini-btn" data-action="excluir-item" data-id="${it.id}">✕</button>`;
    div.innerHTML = `
      <div class="chk" data-action="concluir-item" data-id="${it.id}"></div>
      <div class="title">${escapeHtml(it.texto)} ${it.data ? '<span style="color:var(--text-dim); font-size:11px;">('+it.data+')</span>' : ''}</div>
      ${botoes}`;
    el.appendChild(div);
  });
}

// -------------------- AGENDA --------------------
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function renderAgenda(){
  if(!$('agendaGrid')) return;
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth()+agendaMonthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  $('agendaMesLabel').textContent = MESES[month] + ' de ' + year;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const hoje = todayStr();

  const contagem = {};
  itens.filter(i=>i.tipo==='tarefa' && !i.concluido && i.data).forEach(i=>{ contagem[i.data] = (contagem[i.data]||0)+1; });

  let html = '';
  ['D','S','T','Q','Q','S','S'].forEach(d=> html += `<div style="text-align:center; color:var(--text-dim); font-weight:700; font-size:11px;">${d}</div>`);
  for(let i=0;i<firstDay;i++) html += '<div></div>';
  for(let day=1; day<=daysInMonth; day++){
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const count = contagem[dateStr]||0;
    const isHoje = dateStr===hoje;
    html += `<div class="calendar-day" data-action="agenda-dia" data-date="${dateStr}" style="${isHoje?'border:1px solid var(--gold);':''} ${count?'background:var(--surface-2);':''}">
      <div>${day}</div>
      ${count ? `<div style="width:5px; height:5px; border-radius:50%; background:var(--gold); margin:2px auto 0;"></div>` : ''}
    </div>`;
  }
  $('agendaGrid').innerHTML = html;
}
function mudarMes(delta){ agendaMonthOffset += delta; renderAgenda(); }
function mostrarAgendaDia(dateStr){
  const doDia = itens.filter(i=> i.tipo==='tarefa' && i.data===dateStr);
  const el = $('agendaSelecionado');
  el.innerHTML = doDia.length ? '' : '<div class="empty">Nada nesse dia.</div>';
  doDia.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    let botoes = `<button class="mini-btn" data-action="concluir-item" data-id="${it.id}">${it.concluido?'✓ Concluída':'Marcar feita'}</button>`;
    if(it.clienteWhats) botoes += `<button class="mini-btn btn-wa" data-action="cobrar-item" data-id="${it.id}">💬 Cobrar</button>`;
    div.innerHTML = `<div class="title">${escapeHtml(it.texto)}</div>${botoes}`;
    el.appendChild(div);
  });
}

// -------------------- RENDER: DASHBOARD --------------------
function vendasValidas(){ return vendas.filter(v=> v.status !== 'cancelada'); }
function itensDaVenda(v){
  if(v.itens && v.itens.length) return v.itens;
  if(v.produtoNome) return [{produtoNome:v.produtoNome, quantidade:v.quantidade}];
  return [];
}
function renderDashboard(){
  const hoje = todayStr();
  const tarefasAbertas = itens.filter(i=> i.tipo==='tarefa' && !i.concluido);
  const atrasadas = tarefasAbertas.filter(t=> t.data && t.data < hoje);
  const doDia = tarefasAbertas.filter(t=> t.data === hoje);
  $('statAtrasadas').textContent = atrasadas.length;
  $('statHoje').textContent = doDia.length;

  const estoqueBaixo = produtosAtivos().filter(p=> Number(p.estoque) <= Number(p.minimo||0));
  $('statEstoqueBaixo').textContent = estoqueBaixo.length;

  const vendasHojeArr = vendasValidas().filter(v=> (v.createdAt||'').slice(0,10) === hoje);
  const totalHoje = vendasHojeArr.reduce((s,v)=> s + Number(v.total||0), 0);
  $('statFaturado').textContent = fmtMoney(totalHoje);

  const prioridade = itens.find(i=> i.prioridadeDoDia && !i.concluido);
  if(prioridade){
    $('topPriorityText').textContent = prioridade.texto;
    $('topPriorityMeta').textContent = prioridade.data ? ('Prazo: ' + prioridade.data) : 'Sem prazo definido.';
  } else {
    $('topPriorityText').textContent = 'Nenhuma prioridade definida ainda.';
    $('topPriorityMeta').textContent = 'Abra "Tarefas & Inbox" e clique em 🎯 Prioridade em alguma tarefa.';
  }

  const focus = tarefasAbertas.filter(t=> !t.prioridadeDoDia).sort((a,b)=> (a.data||'9999').localeCompare(b.data||'9999')).slice(0,3);
  const focusEl = $('focusList');
  focusEl.innerHTML = focus.length ? '' : '<div class="empty">Nada em foco além da prioridade nº 1.</div>';
  focus.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    const tagHtml = it.data===hoje ? '<span class="tag urg">HOJE</span>' : (it.data && it.data<hoje ? '<span class="tag urg">ATRASADA</span>' : '<span class="tag wait">SEM DATA</span>');
    div.innerHTML = `<div class="chk" data-action="concluir-item" data-id="${it.id}"></div><div class="title">${escapeHtml(it.texto)}</div>${tagHtml}`;
    focusEl.appendChild(div);
  });

  renderRanking();

  let resumo = [];
  if(estoqueBaixo.length) resumo.push(`${estoqueBaixo.length} produto(s) com estoque baixo — considere repor.`);
  if(atrasadas.length) resumo.push(`${atrasadas.length} tarefa(s) atrasada(s) — vale reorganizar antes de assumir compromissos novos.`);
  const pendentes = lancamentos.filter(l=> l.tipo==='entrada' && l.recebido===false && !l.cancelado);
  if(pendentes.length) resumo.push(`${pendentes.length} parcela(s) de crediário ainda a receber.`);
  const lucroHoje = vendasHojeArr.reduce((s,v)=> s+Number(v.lucroTotal||0), 0);
  if(vendasHojeArr.length) resumo.push(`Lucro estimado hoje: ${fmtMoney(lucroHoje)}.`);
  if(totalHoje === 0) resumo.push('Ainda não há vendas registradas hoje.');
  else resumo.push(`Faturamento de hoje: ${fmtMoney(totalHoje)} em ${vendasHojeArr.length} venda(s).`);
  $('resumoExecutivo').innerHTML = resumo.map(r=>'• '+r).join('<br>');
}
function renderRanking(){
  const mesAtual = todayStr().slice(0,7);
  const contagem = {};
  vendasValidas().filter(v=> (v.createdAt||'').slice(0,7)===mesAtual).forEach(v=>{
    itensDaVenda(v).forEach(i=>{ contagem[i.produtoNome] = (contagem[i.produtoNome]||0) + Number(i.quantidade||0); });
  });
  const arr = Object.entries(contagem).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const el = $('rankingProdutos');
  el.innerHTML = arr.length ? '' : '<div class="empty">Sem vendas suficientes este mês.</div>';
  arr.forEach(([nome, qtd], idx)=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${idx+1}º — ${escapeHtml(nome)}</div><span class="mono">${qtd} un.</span>`;
    el.appendChild(div);
  });
}

// -------------------- ESTOQUE --------------------
function registrarCompraEstoque(nome, custo, estoque){
  const valor = Math.round(custo * estoque * 100) / 100;
  if(valor <= 0) return;
  col('financeiro').add({
    descricao: `Compra de estoque: ${nome} (${estoque}un)`, categoria: 'Compra de estoque',
    tipo:'saida', valor, data: todayStr(), recebido:true, createdAt: new Date().toISOString()
  }).catch(firestoreErr);
}
function abrirModalNovoProduto(){
  editandoProdutoId = null;
  ['prodNome','prodCusto','prodPreco'].forEach(id=> $(id).value='');
  $('prodEstoque').value = 0; $('prodMinimo').value = 2; $('prodCategoria').value = 'Roupas';
  document.querySelector('#modalProduto h3').textContent = 'Novo produto';
  $('btnSalvarProduto').textContent = 'Salvar produto';
  openModal('modalProduto');
}
function editarProduto(id){
  const p = produtos.find(x=>x.id===id);
  if(!p){ toast('Produto não encontrado.'); return; }
  editandoProdutoId = id;
  $('prodNome').value = p.nome; $('prodCategoria').value = p.categoria || 'Roupas';
  $('prodCusto').value = p.custo || 0; $('prodPreco').value = p.preco || 0;
  $('prodEstoque').value = p.estoque || 0; $('prodMinimo').value = p.minimo || 2;
  document.querySelector('#modalProduto h3').textContent = 'Editar produto';
  $('btnSalvarProduto').textContent = 'Salvar alterações';
  openModal('modalProduto');
}
function salvarProduto(){
  const nome = $('prodNome').value.trim();
  if(!nome){ toast('Informe o nome do produto.'); return; }
  const estoque = Number($('prodEstoque').value)||0;
  const p = {
    nome, categoria: $('prodCategoria').value,
    custo: Number($('prodCusto').value)||0, preco: Number($('prodPreco').value)||0,
    estoque, minimo: Number($('prodMinimo').value)||0, ativo: estoque > 0
  };
  if(editandoProdutoId){
    col('produtos').doc(editandoProdutoId).update(p).then(()=>{
      closeModal('modalProduto');
      toast('Produto atualizado.');
      editandoProdutoId = null;
    }).catch(firestoreErr);
    return;
  }
  p.createdAt = new Date().toISOString();
  col('produtos').add(p).then(()=>{
    closeModal('modalProduto');
    registrarCompraEstoque(p.nome, p.custo, p.estoque);
    ['prodNome','prodCusto','prodPreco'].forEach(id=> $(id).value='');
    toast('Produto salvo' + (p.custo && p.estoque ? ' e custo lançado no Financeiro.' : '.'));
  }).catch(firestoreErr);
}
function setFiltroEstoque(f){
  filtroEstoque = f;
  $('btnFiltroAtivos').classList.toggle('active-filter', f==='ativos');
  $('btnFiltroInativos').classList.toggle('active-filter', f==='inativos');
  renderEstoque();
}
function renderEstoque(){
  const tbl = $('tblEstoque');
  tbl.innerHTML = '';
  const filtrados = ordenarPorNome(produtos.filter(p=> filtroEstoque==='ativos' ? p.ativo!==false : p.ativo===false));
  $('estoqueEmpty').style.display = filtrados.length ? 'none' : 'block';
  $('estoqueEmpty').textContent = filtroEstoque==='ativos' ? 'Nenhum produto ativo cadastrado.' : 'Nenhum produto inativo (sem estoque zerado).';
  filtrados.forEach(p=>{
    const baixo = Number(p.estoque) <= Number(p.minimo||0);
    const tr = document.createElement('tr');
    const botaoExtra = p.ativo===false ? `<button class="mini-btn" data-action="reativar-produto" data-id="${p.id}">Reativar</button>` : '';
    tr.innerHTML = `<td>${escapeHtml(p.nome)}</td><td>${escapeHtml(p.categoria||'')}</td>
      <td class="mono">${fmtMoney(p.preco)}</td>
      <td class="mono">${p.estoque} ${baixo?'<span class="tag urg">BAIXO</span>':''} ${p.ativo===false?'<span class="tag wait">INATIVO</span>':''}</td>
      <td style="white-space:nowrap;">${botaoExtra} <button class="mini-btn" data-action="editar-produto" data-id="${p.id}">Editar</button> <button class="mini-btn" data-action="excluir-produto" data-id="${p.id}">Excluir</button></td>`;
    tbl.appendChild(tr);
  });
}
function excluirProduto(id){ if(confirm('Excluir produto?')) col('produtos').doc(id).delete().catch(firestoreErr); }
function reativarProduto(id){ col('produtos').doc(id).update({ativo:true}).then(()=> toast('Produto reativado.')).catch(firestoreErr); }
function fillProdutosExistentesList(){
  const dl = $('produtosExistentesList');
  dl.innerHTML = ordenarPorNome(produtos).map(p=> `<option value="${escapeHtml(p.nome)}">${p.ativo===false?' (inativo)':''}</option>`).join('');
}

// -------------------- ESTOQUE EM LOTE --------------------
function parseNumeroBR(str){ return parseFloat(String(str||'').trim().replace(/\./g,'').replace(',', '.')); }
function parseLoteLinha(linha){
  const parts = linha.split(';').map(s=>s.trim());
  if(!parts[0]) return null;
  const nome = parts[0];
  const preco = parseFloat((parts[1]||'').replace(',', '.'));
  const estoque = parseInt(parts[2]||'0', 10);
  if(!nome || isNaN(preco) || isNaN(estoque)) return {erro: true, nome: nome || linha};
  return {
    nome, preco, estoque, categoria: parts[3] || 'Outro',
    custo: parseFloat((parts[4]||'0').replace(',', '.')) || 0,
    minimo: parseInt(parts[5]||'2', 10) || 2
  };
}
function parseListaBullets(texto){
  const validos = [];
  const regex = /^[\s•·\-*]*(.+?)\s+[–—-]\s+(\d+)\s*unidades?\s*(\([^)]*\))?[\s\S]*?Custo:\s*R\$\s*([\d.,]+)\s*\|\s*Venda:\s*R\$\s*([\d.,]+)/gim;
  let m;
  while((m = regex.exec(texto)) !== null){
    let nome = m[1].trim();
    if(m[3]) nome += ' ' + m[3].trim();
    const estoque = parseInt(m[2], 10);
    const custo = parseNumeroBR(m[4]);
    const preco = parseNumeroBR(m[5]);
    if(!nome || isNaN(estoque) || isNaN(custo) || isNaN(preco)) continue;
    const categoria = /bon[eé]/i.test(nome) ? 'Boné' : 'Roupas';
    validos.push({nome, preco, estoque, categoria, custo, minimo:2});
  }
  return validos;
}
function processarLote(){
  const texto = $('loteTexto').value;
  if(!texto.trim()){ toast('Cole a lista de produtos.'); return; }
  let validos = [], invalidos = [];

  validos = parseListaBullets(texto);
  if(!validos.length){
    const linhas = texto.split('\n').map(l=>l.trim()).filter(Boolean);
    linhas.forEach(l=>{
      const r = parseLoteLinha(l);
      if(!r) return;
      if(r.erro) invalidos.push(r.nome); else validos.push(r);
    });
  }
  if(!validos.length){ toast('Não consegui reconhecer nenhum item nesse texto. Confira o formato.'); return; }

  const promises = validos.map(p=> col('produtos').add({
    nome:p.nome, categoria:p.categoria, custo:p.custo, preco:p.preco,
    estoque:p.estoque, minimo:p.minimo, ativo: p.estoque>0, createdAt: new Date().toISOString()
  }).then(()=>{ registrarCompraEstoque(p.nome, p.custo, p.estoque); }));
  Promise.all(promises).then(()=>{
    const totalInvestido = validos.reduce((s,p)=> s + (p.custo>0 ? p.custo*p.estoque : 0), 0);
    let resultado = `✅ ${validos.length} produto(s) cadastrado(s) com sucesso.`;
    if(totalInvestido > 0) resultado += `\n💰 ${fmtMoney(totalInvestido)} lançados automaticamente no Financeiro (saída, custo do estoque).`;
    if(invalidos.length) resultado += `\n⚠️ ${invalidos.length} linha(s) ignorada(s) (formato incorreto): ${invalidos.join(', ')}`;
    const box = $('loteResultado'); box.style.display='block'; box.textContent = resultado;
    $('loteTexto').value = '';
    toast('Lote processado.');
  }).catch(firestoreErr);
}
function processarBaixa(){
  const linhas = $('baixaTexto').value.split('\n').map(l=>l.trim()).filter(Boolean);
  if(!linhas.length){ toast('Cole ao menos uma linha.'); return; }
  const logs = [];
  const promises = [];
  linhas.forEach(l=>{
    const parts = l.split(';').map(s=>s.trim());
    const nome = parts[0];
    const qtd = parseFloat((parts[1]||'').replace(',', '.'));
    if(!nome || isNaN(qtd)){ logs.push(`⚠️ Linha inválida: "${l}"`); return; }
    const prod = produtos.find(p=> p.nome.toLowerCase() === nome.toLowerCase());
    if(!prod){ logs.push(`❌ Não encontrado: "${nome}"`); return; }
    const novoEstoque = Math.max(0, Number(prod.estoque) - qtd);
    promises.push(col('produtos').doc(prod.id).update({estoque: novoEstoque, ativo: novoEstoque>0}));
    logs.push(`✅ ${prod.nome}: ${prod.estoque} → ${novoEstoque}${novoEstoque<=0?' (inativado)':''}`);
  });
  Promise.all(promises).then(()=>{
    const box = $('baixaResultado'); box.style.display='block'; box.textContent = logs.join('\n');
    $('baixaTexto').value = '';
    toast('Baixa processada.');
  }).catch(firestoreErr);
}

// -------------------- CATÁLOGO --------------------
function gerarCatalogo(){
  const disponiveis = ordenarPorNome(produtosAtivos().filter(p=> Number(p.estoque) > 0));
  if(!disponiveis.length){ toast('Nenhum produto com estoque disponível.'); return; }
  const porCategoria = {};
  disponiveis.forEach(p=>{
    const cat = p.categoria || 'Outro';
    if(!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(p);
  });
  let texto = '🖤 NK PREMIUM — CATÁLOGO\n\n';
  Object.keys(porCategoria).sort().forEach(cat=>{
    texto += `📦 ${cat.toUpperCase()}\n`;
    porCategoria[cat].forEach(p=>{ texto += `• ${p.nome} — ${fmtMoney(p.preco)}\n`; });
    texto += '\n';
  });
  texto += 'Peça já pelo WhatsApp! 🛍️';
  $('catalogoTexto').textContent = texto;
  openModal('modalCatalogo');
}
function copiarTexto(texto){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(()=> toast('Copiado!')).catch(()=> fallbackCopy(texto));
  } else fallbackCopy(texto);
}
function fallbackCopy(texto){
  const ta = document.createElement('textarea');
  ta.value = texto; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{ document.execCommand('copy'); toast('Copiado!'); } catch(e){ toast('Não foi possível copiar automaticamente. Selecione o texto manualmente.'); }
  document.body.removeChild(ta);
}

// -------------------- CLIENTES --------------------
function salvarCliente(){
  const nome = $('cliNome').value.trim();
  if(!nome){ toast('Informe o nome do cliente.'); return; }
  const c = {
    nome, cpf: $('cliCpf').value.trim(), whatsapp: $('cliWhats').value.trim(), instagram: $('cliInsta').value.trim(),
    obs: $('cliObs').value.trim(), totalGasto:0, ultimaCompra: null, createdAt: new Date().toISOString()
  };
  col('clientes').add(c).then(()=>{
    closeModal('modalCliente');
    ['cliNome','cliCpf','cliWhats','cliInsta','cliObs'].forEach(id=> $(id).value='');
    toast('Cliente salvo.');
  }).catch(firestoreErr);
}
function excluirCliente(id){ if(confirm('Excluir cliente?')) col('clientes').doc(id).delete().catch(firestoreErr); }
function cobrarCliente(id){
  const c = clientes.find(x=>x.id===id);
  if(!c || !c.whatsapp){ toast('Esse cliente não tem WhatsApp cadastrado.'); return; }
  const msg = `Olá ${c.nome}! Tudo bem? Aqui é da NK Premium 🖤`;
  const link = waLink(c.whatsapp, msg);
  if(link) window.open(link, '_blank');
}
function renderClientes(){
  const tbl = $('tblClientes');
  tbl.innerHTML = '';
  $('clientesEmpty').style.display = clientes.length ? 'none' : 'block';
  ordenarPorNome(clientes).forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.cpf||'—')}</td><td>${escapeHtml(c.whatsapp||'—')}</td>
      <td>${c.ultimaCompra || '—'}</td><td class="mono">${fmtMoney(c.totalGasto||0)}</td>
      <td style="white-space:nowrap;">
        ${c.whatsapp ? `<button class="mini-btn btn-wa" data-action="cobrar-cliente" data-id="${c.id}">💬</button>` : ''}
        <button class="mini-btn" data-action="excluir-cliente" data-id="${c.id}">✕</button>
      </td>`;
    tbl.appendChild(tr);
  });
}

// -------------------- PDV --------------------
function fillPdvDatalist(){
  const dl = $('produtosDatalist');
  dl.innerHTML = ordenarPorNome(produtosAtivos()).map(p=> `<option value="${escapeHtml(p.nome)}">`).join('');
}
function fillPdvClienteSelect(){
  const selC = $('pdvCliente');
  const atual = selC.value;
  selC.innerHTML = '<option value="">Cliente avulso</option>' + ordenarPorNome(clientes).map(c=> `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
  selC.value = atual;
}
function buscarProdutoPorNomeExato(nome){
  const alvo = (nome||'').trim().toLowerCase();
  return produtosAtivos().find(p=> p.nome.toLowerCase() === alvo);
}
document.addEventListener('DOMContentLoaded', ()=>{});
function atualizarInfoProduto(){
  const prod = buscarProdutoPorNomeExato($('pdvProdutoBusca').value);
  $('pdvProdutoInfo').textContent = prod ? `${fmtMoney(prod.preco)} — estoque: ${prod.estoque}` : '';
}
function adicionarAoCarrinho(){
  const prod = buscarProdutoPorNomeExato($('pdvProdutoBusca').value);
  if(!prod){ toast('Digite o nome exato de um produto ativo (use as sugestões).'); return; }
  const qtd = Number($('pdvQtd').value)||1;
  const existente = carrinho.find(c=>c.produtoId===prod.id);
  if(existente){ existente.quantidade += qtd; }
  else { carrinho.push({produtoId: prod.id, produtoNome: prod.nome, precoUnit: prod.preco, custoUnit: Number(prod.custo)||0, quantidade: qtd}); }
  $('pdvQtd').value = 1;
  $('pdvProdutoBusca').value = '';
  $('pdvProdutoInfo').textContent = '';
  renderCarrinho();
}
function removerDoCarrinho(index){ carrinho.splice(Number(index), 1); renderCarrinho(); }
function renderCarrinho(){
  const el = $('carrinhoLista');
  el.innerHTML = carrinho.length ? '' : '<div class="empty">Carrinho vazio. Adicione produtos acima.</div>';
  let total = 0;
  carrinho.forEach((c, idx)=>{
    const subtotal = c.precoUnit * c.quantidade;
    total += subtotal;
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${c.quantidade}x ${escapeHtml(c.produtoNome)}</div>
      <span class="mono">${fmtMoney(subtotal)}</span>
      <button class="mini-btn" data-action="remover-carrinho" data-index="${idx}">✕</button>`;
    el.appendChild(div);
  });
  $('carrinhoTotal').textContent = carrinho.length ? ('Total: ' + fmtMoney(total)) : '';
}
function toggleCrediarioBox(){
  const show = $('pdvPagamento').value === 'Crediário';
  $('crediarioBox').style.display = show ? 'block' : 'none';
  if(show){ crediarioDataEditadaManualmente = false; atualizarSugestaoData(); }
}
function intervaloAtualDias(){
  const v = $('crediarioIntervalo').value;
  return v === 'custom' ? (Number($('crediarioIntervaloCustom').value)||30) : Number(v);
}
function toggleIntervaloCustom(){
  const custom = $('crediarioIntervalo').value === 'custom';
  $('crediarioIntervaloCustom').style.display = custom ? 'block' : 'none';
  atualizarSugestaoData();
}
function atualizarSugestaoData(){
  if(crediarioDataEditadaManualmente) return;
  $('crediarioPrimeiraData').value = addDays(todayStr(), intervaloAtualDias());
}
function marcarDataManual(){ crediarioDataEditadaManualmente = true; }

function cancelarEdicaoVenda(){
  editandoVendaId = null;
  carrinho = []; renderCarrinho();
  $('bannerEdicao').style.display = 'none';
  $('pdvCliente').value = ''; $('pdvPagamento').value = 'Pix'; toggleCrediarioBox();
}

async function registrarVenda(){
  if(!carrinho.length){ toast('Adicione ao menos um produto ao carrinho.'); return; }
  const cliId = $('pdvCliente').value;
  const cli = clientes.find(c=>c.id===cliId);
  const avulso = !cliId;
  const pagamento = $('pdvPagamento').value;
  const total = carrinho.reduce((s,c)=> s + c.precoUnit*c.quantidade, 0);

  if(pagamento === 'Crediário' && !cli){ toast('Selecione um cliente cadastrado para venda parcelada (avulso não pode).'); return; }

  // Se está editando, cancela a venda original primeiro (devolve estoque, estorna financeiro/tarefas)
  if(editandoVendaId){
    await cancelarVendaInterno(editandoVendaId, 'Editada — substituída por nova versão');
  }

  const itensVenda = carrinho.map(c=> ({
    produtoId:c.produtoId, produtoNome:c.produtoNome, quantidade:c.quantidade, precoUnit:c.precoUnit,
    custoUnit:c.custoUnit||0, subtotal:c.precoUnit*c.quantidade,
    lucro: c.custoUnit>0 ? (c.precoUnit-c.custoUnit)*c.quantidade : 0
  }));
  const lucroTotal = itensVenda.reduce((s,i)=> s+i.lucro, 0);

  let entradaValor = 0;
  if(pagamento === 'Crediário'){ entradaValor = Math.min(total, Math.max(0, Number($('crediarioEntrada').value)||0)); }

  const venda = {
    itens: itensVenda, total, lucroTotal, clienteId: cliId || null, clienteNome: cli ? cli.nome : 'Cliente avulso',
    avulso, pagamento, entrada: entradaValor, status:'ativa', financeiroIds: [], tarefaIds: [],
    createdAt: new Date().toISOString()
  };

  try{
    const vendaRef = await col('vendas').add(venda);

    for(const c of carrinho){
      const prod = produtos.find(p=>p.id===c.produtoId);
      if(prod){
        const novoEstoque = Math.max(0, Number(prod.estoque) - c.quantidade);
        await col('produtos').doc(prod.id).update({ estoque: novoEstoque, ativo: novoEstoque>0 });
      }
    }
    if(cli){ await col('clientes').doc(cli.id).update({ totalGasto: Number(cli.totalGasto||0)+total, ultimaCompra: todayStr() }); }

    const descItens = itensVenda.map(i=> i.quantidade+'x '+i.produtoNome).join(', ');
    const financeiroIds = [];
    const tarefaIds = [];
    const parcelasInfo = [];

    if(pagamento !== 'Crediário'){
      const ref = await col('financeiro').add({ descricao: 'Venda: '+descItens+(cli?' — '+cli.nome:' — avulso'), categoria:null, tipo:'entrada', valor: total, data: todayStr(), recebido:true, vendaId: vendaRef.id, createdAt: new Date().toISOString() });
      financeiroIds.push(ref.id);
    } else {
      if(entradaValor > 0){
        const refEntrada = await col('financeiro').add({ descricao: `Entrada — venda ${descItens} — ${cli.nome}`, categoria:null, tipo:'entrada', valor: entradaValor, data: todayStr(), recebido:true, vendaId: vendaRef.id, createdAt: new Date().toISOString() });
        financeiroIds.push(refEntrada.id);
      }
      const valorParcelar = Math.round((total - entradaValor)*100)/100;
      if(valorParcelar > 0){
        const parcelas = Math.max(1, Number($('crediarioParcelas').value)||1);
        const intervalo = intervaloAtualDias();
        const primeiraData = $('crediarioPrimeiraData').value || addDays(todayStr(), intervalo);
        const valorBase = Math.round((valorParcelar/parcelas) * 100) / 100;
        for(let i=0; i<parcelas; i++){
          const vencimento = addDays(primeiraData, intervalo*i);
          const valorParcela = (i === parcelas-1) ? Math.round((valorParcelar - valorBase*(parcelas-1))*100)/100 : valorBase;
          const finRef = await col('financeiro').add({
            descricao: `Parcela ${i+1}/${parcelas} — ${descItens} — ${cli.nome}`, categoria:null,
            tipo:'entrada', valor: valorParcela, data: vencimento, recebido:false, vendaId: vendaRef.id, createdAt: new Date().toISOString()
          });
          financeiroIds.push(finRef.id);
          const tarefaRef = await col('itens').add({
            texto: `Receber parcela ${i+1}/${parcelas} de ${cli.nome} — ${fmtMoney(valorParcela)}`,
            tipo:'tarefa', data: vencimento, concluido:false, prioridadeDoDia:false,
            origem:'crediario', lancamentoId: finRef.id, clienteId: cli.id, clienteNome: cli.nome,
            clienteWhats: cli.whatsapp||null, valor: valorParcela, parcelaNum: i+1, parcelaTotal: parcelas,
            vendaId: vendaRef.id, createdAt: new Date().toISOString()
          });
          tarefaIds.push(tarefaRef.id);
          parcelasInfo.push({numero:i+1, total:parcelas, valor:valorParcela, vencimento});
        }
      }
    }
    await vendaRef.update({ financeiroIds, tarefaIds });

    mostrarRecibo({...venda, id: vendaRef.id}, parcelasInfo);
    carrinho = []; renderCarrinho();
    $('pdvPagamento').value = 'Pix'; toggleCrediarioBox();
    $('pdvCliente').value = '';
    editandoVendaId = null;
    $('bannerEdicao').style.display = 'none';
    toast('Venda registrada.');
  } catch(e){ firestoreErr(e); }
}

function mostrarRecibo(venda, parcelasInfo){
  const linhas = venda.itens.map(i=> `${i.quantidade}x ${i.produtoNome} — ${fmtMoney(i.subtotal)}`).join('\n');
  let texto = `🖤 NK Premium — Recibo\n\nCliente: ${venda.clienteNome}\n\n${linhas}\n\nTotal: ${fmtMoney(venda.total)}\nPagamento: ${venda.pagamento}`;
  if(venda.pagamento === 'Crediário'){
    if(venda.entrada > 0) texto += `\nEntrada paga: ${fmtMoney(venda.entrada)}`;
    if(parcelasInfo && parcelasInfo.length){
      texto += `\n\nParcelas:`;
      parcelasInfo.forEach(p=> texto += `\n${p.numero}/${p.total} — ${fmtMoney(p.valor)} — vence em ${p.vencimento}`);
    }
  }
  texto += `\n\nObrigado pela preferência! 🖤`;
  $('reciboTexto').textContent = texto;
  const cli = clientes.find(c=>c.id===venda.clienteId);
  const btnWa = $('btnEnviarRecibo');
  if(cli && cli.whatsapp){ btnWa.style.display = 'block'; ultimoRecibo = {texto, whats: cli.whatsapp}; }
  else { btnWa.style.display = 'none'; ultimoRecibo = {texto, whats: null}; }
  openModal('modalRecibo');
}
function enviarRecibo(){
  if(!ultimoRecibo || !ultimoRecibo.whats){ toast('Sem WhatsApp para enviar.'); return; }
  const link = waLink(ultimoRecibo.whats, ultimoRecibo.texto);
  if(link) window.open(link, '_blank');
}

function renderVendas(){
  const el = $('vendasHoje');
  const lista = [...vendas].slice(0,40);
  el.innerHTML = lista.length ? '' : '<div class="empty">Nenhuma venda registrada ainda.</div>';
  lista.forEach(v=>{
    const itensTxt = itensDaVenda(v).map(i=> i.quantidade+'x '+i.produtoNome).join(', ');
    const div = document.createElement('div');
    div.className = 'list-item' + (v.status==='cancelada' ? ' cancelada' : '');
    const data = (v.createdAt||'').slice(0,10);
    let botoes = '';
    if(v.status !== 'cancelada'){
      botoes = `<button class="mini-btn" data-action="editar-venda" data-id="${v.id}">✎ Editar</button>
        <button class="mini-btn btn-danger-ghost" data-action="cancelar-venda" data-id="${v.id}">Cancelar</button>`;
    } else {
      botoes = `<span class="tag urg">CANCELADA</span>`;
    }
    div.innerHTML = `<div class="title">${escapeHtml(itensTxt)} ${v.avulso?'<span class="tag wait">AVULSO</span>':(v.clienteNome?'— '+escapeHtml(v.clienteNome):'')} ${v.pagamento==='Crediário'?'<span class="tag imp">CREDIÁRIO</span>':''} <span style="color:var(--text-dim); font-size:11px;">(${data})</span></div>
      <span class="mono">${fmtMoney(v.total)}${v.lucroTotal ? ' <span style="color:var(--ok); font-size:11px;">(lucro '+fmtMoney(v.lucroTotal)+')</span>' : ''}</span>
      ${botoes}`;
    el.appendChild(div);
  });
}

function editarVenda(id){
  const v = vendas.find(x=>x.id===id);
  if(!v){ toast('Venda não encontrada.'); return; }
  if(v.status === 'cancelada'){ toast('Essa venda já está cancelada.'); return; }
  carrinho = v.itens.map(i=> ({produtoId:i.produtoId, produtoNome:i.produtoNome, precoUnit:i.precoUnit, custoUnit:i.custoUnit||0, quantidade:i.quantidade}));
  renderCarrinho();
  $('pdvCliente').value = v.clienteId || '';
  $('pdvPagamento').value = v.pagamento;
  toggleCrediarioBox();
  if(v.pagamento === 'Crediário'){ $('crediarioEntrada').value = v.entrada || 0; }
  editandoVendaId = id;
  $('bannerEdicaoTexto').textContent = `Editando venda de ${v.clienteNome} (${fmtMoney(v.total)}) — ajuste os itens e finalize.`;
  $('bannerEdicao').style.display = 'flex';
  document.querySelector('.nav-item[data-view="pdv"]').click();
  toast('Ajuste o carrinho e finalize para salvar as mudanças.');
}

function abrirModalCancelarVenda(id){ vendaEmCancelamento = id; $('motivoCancelamento').value=''; openModal('modalCancelarVenda'); }
async function confirmarCancelamentoVenda(){
  if(!vendaEmCancelamento) return;
  const motivo = $('motivoCancelamento').value.trim();
  try{
    await cancelarVendaInterno(vendaEmCancelamento, motivo);
    closeModal('modalCancelarVenda');
    toast('Venda cancelada e estoque devolvido.');
  } catch(e){ firestoreErr(e); }
  vendaEmCancelamento = null;
}
async function cancelarVendaInterno(vendaId, motivo){
  const v = vendas.find(x=>x.id===vendaId);
  if(!v || v.status==='cancelada') return;
  // devolve estoque
  for(const item of (v.itens||[])){
    const prod = produtos.find(p=>p.id===item.produtoId);
    if(prod){
      const novoEstoque = Number(prod.estoque||0) + Number(item.quantidade||0);
      await col('produtos').doc(prod.id).update({ estoque: novoEstoque, ativo: true });
    }
  }
  // cancela lançamentos financeiros vinculados
  for(const finId of (v.financeiroIds||[])){
    await col('financeiro').doc(finId).update({ cancelado: true, recebido:false }).catch(()=>{});
  }
  // remove tarefas de cobrança vinculadas
  for(const tarefaId of (v.tarefaIds||[])){
    await col('itens').doc(tarefaId).delete().catch(()=>{});
  }
  // reverte total gasto do cliente
  if(v.clienteId){
    const cli = clientes.find(c=>c.id===v.clienteId);
    if(cli){ await col('clientes').doc(cli.id).update({ totalGasto: Math.max(0, Number(cli.totalGasto||0)-Number(v.total||0)) }).catch(()=>{}); }
  }
  await col('vendas').doc(vendaId).update({ status:'cancelada', motivoCancelamento: motivo||'', canceladoEm: new Date().toISOString() });
}

// -------------------- FINANCEIRO --------------------
function salvarLancamento(){
  const desc = $('finDesc').value.trim();
  if(!desc){ toast('Informe a descrição.'); return; }
  col('financeiro').add({
    descricao: desc, tipo: $('finTipo').value, categoria: $('finCategoria').value || null,
    valor: Number($('finValor').value)||0, data: $('finData').value || todayStr(), recebido:true, createdAt: new Date().toISOString()
  }).then(()=>{
    closeModal('modalLancamento');
    ['finDesc','finValor'].forEach(id=> $(id).value='');
    toast('Lançamento salvo.');
  }).catch(firestoreErr);
}
function parseLoteFinLinha(linha){
  const parts = linha.split(';').map(s=>s.trim());
  if(!parts[0]) return null;
  const descricao = parts[0];
  let tipo = (parts[1]||'saida').toLowerCase();
  if(tipo !== 'entrada' && tipo !== 'saida') tipo = 'saida';
  const valor = parseFloat((parts[2]||'').replace(',', '.'));
  if(!descricao || isNaN(valor)) return {erro:true, nome:descricao||linha};
  const data = parts[3] || todayStr();
  const categoria = parts[4] || null;
  return {descricao, tipo, valor, data, categoria};
}
function processarLoteFin(){
  const linhas = $('loteFinTexto').value.split('\n').map(l=>l.trim()).filter(Boolean);
  if(!linhas.length){ toast('Cole ao menos uma linha.'); return; }
  const validos = [], invalidos = [];
  linhas.forEach(l=>{
    const r = parseLoteFinLinha(l);
    if(!r) return;
    if(r.erro) invalidos.push(r.nome); else validos.push(r);
  });
  const promises = validos.map(l=> col('financeiro').add({
    descricao:l.descricao, tipo:l.tipo, valor:l.valor, data:l.data, categoria:l.categoria, recebido:true, createdAt: new Date().toISOString()
  }));
  Promise.all(promises).then(()=>{
    let resultado = `✅ ${validos.length} lançamento(s) registrado(s).`;
    if(invalidos.length) resultado += `\n⚠️ ${invalidos.length} linha(s) ignorada(s): ${invalidos.join(', ')}`;
    const box = $('loteFinResultado'); box.style.display='block'; box.textContent = resultado;
    $('loteFinTexto').value = '';
    toast('Lote lançado.');
  }).catch(firestoreErr);
}
function marcarRecebido(id){
  col('financeiro').doc(id).update({recebido: true}).then(()=> toast('Marcado como recebido.')).catch(firestoreErr);
}
function setFiltroFinanceiro(f){
  filtroFinanceiro = (filtroFinanceiro === f) ? 'todos' : f;
  ['cardEntrada','cardAReceber','cardSaidas'].forEach(id=> $(id).classList.remove('filter-active'));
  const map = {entrada:'cardEntrada', areceber:'cardAReceber', saida:'cardSaidas'};
  if(map[filtroFinanceiro]) $(map[filtroFinanceiro]).classList.add('filter-active');
  const labels = {todos:'todos os lançamentos', entrada:'entradas recebidas', areceber:'parcelas a receber (por vencimento)', saida:'saídas'};
  $('filtroFinanceiroLabel').textContent = 'Mostrando: ' + labels[filtroFinanceiro];
  renderFinanceiro();
}
function renderFinanceiro(){
  const naoCancelados = lancamentos.filter(l=> !l.cancelado);
  const mesAtual = todayStr().slice(0,7);
  const doMes = naoCancelados.filter(l=> (l.data||'').slice(0,7)===mesAtual);
  const entradas = doMes.filter(l=>l.tipo==='entrada' && l.recebido!==false).reduce((s,l)=>s+Number(l.valor),0);
  const saidas = doMes.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor),0);
  const aReceber = naoCancelados.filter(l=>l.tipo==='entrada' && l.recebido===false).reduce((s,l)=>s+Number(l.valor),0);
  $('finEntradas').textContent = fmtMoney(entradas);
  $('finSaidas').textContent = fmtMoney(saidas);
  $('finAReceber').textContent = fmtMoney(aReceber);

  const lucroMes = vendasValidas().filter(v=> (v.createdAt||'').slice(0,7)===mesAtual).reduce((s,v)=> s+Number(v.lucroTotal||0), 0);
  $('finLucro').textContent = fmtMoney(lucroMes);
  const estoqueCusto = produtosAtivos().reduce((s,p)=> s + Number(p.custo||0)*Number(p.estoque||0), 0);
  $('finEstoqueCusto').textContent = fmtMoney(estoqueCusto);
  $('finFaturamentoPrevisto').textContent = fmtMoney(entradas + aReceber);

  let visiveis = naoCancelados;
  if(filtroFinanceiro === 'entrada') visiveis = naoCancelados.filter(l=> l.tipo==='entrada' && l.recebido!==false);
  else if(filtroFinanceiro === 'areceber') visiveis = naoCancelados.filter(l=> l.tipo==='entrada' && l.recebido===false);
  else if(filtroFinanceiro === 'saida') visiveis = naoCancelados.filter(l=> l.tipo==='saida');

  if(filtroFinanceiro === 'areceber'){
    visiveis = [...visiveis].sort((a,b)=> (a.data||'9999').localeCompare(b.data||'9999'));
  } else {
    visiveis = [...visiveis].sort((a,b)=> (b.data||'').localeCompare(a.data||''));
  }

  const tbl = $('tblFinanceiro');
  tbl.innerHTML = '';
  $('finEmpty').style.display = visiveis.length ? 'none' : 'block';
  visiveis.slice(0,100).forEach(l=>{
    const tr = document.createElement('tr');
    let statusTag = '—';
    if(l.tipo==='entrada'){ statusTag = l.recebido===false ? '<span class="tag imp">Pendente</span>' : '<span class="tag deleg">Recebido</span>'; }
    const acao = (l.tipo==='entrada' && l.recebido===false) ? `<button class="mini-btn" data-action="marcar-recebido" data-id="${l.id}">Marcar recebido</button>` : '';
    tr.innerHTML = `<td>${l.data}</td><td>${escapeHtml(l.descricao)}</td><td>${escapeHtml(l.categoria||'—')}</td>
      <td>${l.tipo==='entrada' ? '<span class="tag deleg">Entrada</span>' : '<span class="tag urg">Saída</span>'}</td>
      <td>${statusTag} ${acao}</td>
      <td class="mono">${fmtMoney(l.valor)}</td>`;
    tbl.appendChild(tr);
  });
}

// -------------------- BACKUP --------------------
function exportarBackup(){
  const data = { exportadoEm: new Date().toISOString(), produtos, clientes, vendas, lancamentos, itens };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `nk-premium-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup baixado.');
}

// ============================================================
// BINDING DE EVENTOS
// ============================================================
function bindStaticEvents(){
  $('btnLogin').addEventListener('click', doLogin);
  $('btnLoginGoogle').addEventListener('click', doLoginGoogle);
  $('btnSignup').addEventListener('click', doSignup);
  $('btnEsqueciSenha').addEventListener('click', doResetPassword);
  $('btnFecharAcessoNegado').addEventListener('click', ()=> closeModal('modalAcessoNegado'));
  $('btnLogout').addEventListener('click', doLogout);
  $('btnTheme').addEventListener('click', toggleTheme);
  $('btnMenuToggle').addEventListener('click', ()=> $('sidebar').classList.toggle('open'));
  $('btnCapture').addEventListener('click', openCapture);
  $('fab').addEventListener('click', openCapture);
  $('btnSalvarCaptura').addEventListener('click', saveCapture);
  $('btnNovoProduto').addEventListener('click', abrirModalNovoProduto);
  $('btnSalvarProduto').addEventListener('click', salvarProduto);
  $('btnSalvarAcessoUsuario').addEventListener('click', salvarAcessoUsuario);
  document.querySelectorAll('#modulosChips .chip').forEach(chip=>{
    chip.addEventListener('click', ()=> toggleModuloChip(chip));
  });
  $('btnFiltroAtivos').addEventListener('click', ()=> setFiltroEstoque('ativos'));
  $('btnFiltroInativos').addEventListener('click', ()=> setFiltroEstoque('inativos'));
  $('btnNovoCliente').addEventListener('click', ()=> openModal('modalCliente'));
  $('btnSalvarCliente').addEventListener('click', salvarCliente);
  $('btnNovoLancamento').addEventListener('click', ()=> openModal('modalLancamento'));
  $('btnSalvarLancamento').addEventListener('click', salvarLancamento);
  $('btnLancamentoLote').addEventListener('click', ()=> openModal('modalLancamentoLote'));
  $('btnProcessarLoteFin').addEventListener('click', processarLoteFin);
  $('btnAddCarrinho').addEventListener('click', adicionarAoCarrinho);
  $('btnRegistrarVenda').addEventListener('click', registrarVenda);
  $('btnCancelarEdicao').addEventListener('click', cancelarEdicaoVenda);
  $('pdvProdutoBusca').addEventListener('input', atualizarInfoProduto);
  $('btnGerarCatalogo').addEventListener('click', gerarCatalogo);
  $('btnCopiarCatalogo').addEventListener('click', ()=> copiarTexto($('catalogoTexto').textContent));
  $('btnListaLote').addEventListener('click', ()=> openModal('modalListaLote'));
  $('btnProcessarLote').addEventListener('click', processarLote);
  $('btnBaixaLista').addEventListener('click', ()=> openModal('modalBaixaLista'));
  $('btnProcessarBaixa').addEventListener('click', processarBaixa);
  $('pdvPagamento').addEventListener('change', toggleCrediarioBox);
  $('crediarioIntervalo').addEventListener('change', toggleIntervaloCustom);
  $('crediarioIntervaloCustom').addEventListener('input', atualizarSugestaoData);
  $('crediarioPrimeiraData').addEventListener('input', marcarDataManual);
  $('btnCopiarRecibo').addEventListener('click', ()=> copiarTexto($('reciboTexto').textContent));
  $('btnEnviarRecibo').addEventListener('click', enviarRecibo);
  $('btnConfirmarCancelamento').addEventListener('click', confirmarCancelamentoVenda);
  $('btnMesAnterior').addEventListener('click', ()=> mudarMes(-1));
  $('btnMesProximo').addEventListener('click', ()=> mudarMes(1));
  $('btnExportarBackup').addEventListener('click', exportarBackup);

  document.querySelectorAll('[data-close]').forEach(el=>{
    el.addEventListener('click', ()=> closeModal(el.dataset.close));
  });

  document.querySelectorAll('#captureType .chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.querySelectorAll('#captureType .chip').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedCaptureType = chip.dataset.t;
    });
  });

  document.querySelectorAll('.nav-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      el.classList.add('active');
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      $('view-'+el.dataset.view).classList.add('active');
      const titles = {dashboard:'Painel do Dia', estoque:'Estoque', pdv:'Vendas (PDV)', clientes:'Clientes', financeiro:'Financeiro', agenda:'Agenda', tarefas:'Tarefas & Inbox', config:'Configurações'};
      $('pageTitle').textContent = titles[el.dataset.view];
      $('sidebar').classList.remove('open');
      if(el.dataset.view === 'agenda') renderAgenda();
    });
  });

  document.body.addEventListener('click', function(e){
    const filterEl = e.target.closest('[data-filter]');
    if(filterEl){ setFiltroFinanceiro(filterEl.dataset.filter); return; }
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const id = el.dataset.id;
    const action = el.dataset.action;
    const actions = {
      'excluir-item': ()=> excluirItem(id),
      'concluir-item': ()=> concluirItem(id),
      'prioridade-item': ()=> marcarPrioridade(id),
      'prazo-hoje': ()=> setPrazoRapido(id, 0),
      'prazo-amanha': ()=> setPrazoRapido(id, 1),
      'cobrar-item': ()=> cobrarItem(id),
      'excluir-produto': ()=> excluirProduto(id),
      'editar-produto': ()=> editarProduto(id),
      'reativar-produto': ()=> reativarProduto(id),
      'excluir-cliente': ()=> excluirCliente(id),
      'cobrar-cliente': ()=> cobrarCliente(id),
      'marcar-recebido': ()=> marcarRecebido(id),
      'remover-carrinho': ()=> removerDoCarrinho(el.dataset.index),
      'agenda-dia': ()=> mostrarAgendaDia(el.dataset.date),
      'editar-venda': ()=> editarVenda(id),
      'cancelar-venda': ()=> abrirModalCancelarVenda(id),
      'remover-usuario': ()=> removerAcessoUsuario(el.dataset.email)
    };
    if(actions[action]) actions[action]();
  });
  document.body.addEventListener('change', function(e){
    if(e.target.classList.contains('classify-select')){
      const val = e.target.value;
      if(val) classificarItem(e.target.dataset.id, val);
    }
  });

  $('pageDate').textContent = new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long'});
}
bindStaticEvents();
