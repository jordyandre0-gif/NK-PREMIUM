// ============================================================
// NK PREMIUM — LÓGICA DO APP
// ============================================================

let currentUser = null;
let UID = null;

// -------------------- HELPERS --------------------
function $(id){ return document.getElementById(id); }
function fmtMoney(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.style.display='block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=> t.style.display='none', 2600);
}
function col(name){ return db.collection('users').doc(UID).collection(name); }

// -------------------- THEME --------------------
function toggleTheme(){
  const root = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  root.setAttribute('data-theme', isLight ? 'dark' : 'light');
  $('themeBtn').textContent = isLight ? '🌙 Modo escuro' : '☀️ Modo claro';
  localStorage.setItem('nk_theme', isLight ? 'dark' : 'light');
}
(function initTheme(){
  const saved = localStorage.getItem('nk_theme');
  if(saved === 'light'){ document.documentElement.setAttribute('data-theme','light'); }
})();

// -------------------- AUTH --------------------
function doLogin(){
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  $('loginErr').textContent = '';
  auth.signInWithEmailAndPassword(email, pass).catch(e => $('loginErr').textContent = traduzErro(e));
}
function doSignup(){
  const email = $('loginEmail').value.trim();
  const pass = $('loginPass').value;
  $('loginErr').textContent = '';
  if(!email || pass.length < 6){ $('loginErr').textContent = 'Preencha e-mail e senha (mín. 6 caracteres).'; return; }
  auth.createUserWithEmailAndPassword(email, pass).catch(e => $('loginErr').textContent = traduzErro(e));
}
function doLogout(){ auth.signOut(); }
function traduzErro(e){
  const map = {
    'auth/invalid-email':'E-mail inválido.',
    'auth/user-not-found':'Usuário não encontrado.',
    'auth/wrong-password':'Senha incorreta.',
    'auth/email-already-in-use':'Este e-mail já tem conta — tente entrar.',
    'auth/weak-password':'Senha muito fraca (mín. 6 caracteres).',
    'auth/invalid-credential':'E-mail ou senha incorretos.'
  };
  return map[e.code] || ('Erro: ' + e.message);
}

auth.onAuthStateChanged(user => {
  if(user){
    currentUser = user; UID = user.uid;
    $('loginScreen').style.display = 'none';
    $('app').classList.add('show');
    $('userEmailShow').textContent = user.email;
    startListeners();
  } else {
    currentUser = null; UID = null;
    $('loginScreen').style.display = 'flex';
    $('app').classList.remove('show');
  }
});

// -------------------- NAV --------------------
document.querySelectorAll('.nav-item').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    $('view-'+el.dataset.view).classList.add('active');
    const titles = {dashboard:'Painel do Dia', estoque:'Estoque', pdv:'Vendas (PDV)', clientes:'Clientes', financeiro:'Financeiro', tarefas:'Tarefas & Inbox', config:'Configurações'};
    $('pageTitle').textContent = titles[el.dataset.view];
    document.getElementById('sidebar').classList.remove('open');
  });
});
$('pageDate').textContent = new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long'});

// -------------------- MODALS --------------------
function openModal(id){ $(id).classList.add('show'); }
function closeModal(id){ $(id).classList.remove('show'); }
function openCapture(){
  $('captureText').value=''; $('captureDate').value='';
  document.querySelectorAll('#captureType .chip').forEach(c=>c.classList.remove('selected'));
  selectedCaptureType = null;
  openModal('modalCaptura');
}
let selectedCaptureType = null;
document.querySelectorAll('#captureType .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#captureType .chip').forEach(c=>c.classList.remove('selected'));
    chip.classList.add('selected');
    selectedCaptureType = chip.dataset.t;
  });
});

// -------------------- LOCAL STATE --------------------
let produtos = [], clientes = [], vendas = [], lancamentos = [], itens = [];

function startListeners(){
  col('produtos').onSnapshot(snap=>{
    produtos = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderEstoque(); fillPdvSelects(); renderDashboard();
  });
  col('clientes').onSnapshot(snap=>{
    clientes = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderClientes(); fillPdvSelects();
  });
  col('vendas').onSnapshot(snap=>{
    vendas = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    renderVendas(); renderDashboard();
  });
  col('financeiro').onSnapshot(snap=>{
    lancamentos = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (b.data||'').localeCompare(a.data||''));
    renderFinanceiro();
  });
  col('itens').onSnapshot(snap=>{
    itens = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderTarefas(); renderDashboard();
  });
}

// -------------------- CAPTURA RÁPIDA (Inbox) --------------------
function saveCapture(){
  const text = $('captureText').value.trim();
  if(!text){ toast('Escreva algo antes de guardar.'); return; }
  const item = {
    texto: text,
    tipo: selectedCaptureType || null, // null = ainda não classificado (fica na Inbox)
    data: $('captureDate').value || null,
    prioridade: null,
    concluido: false,
    prioridadeDoDia: false,
    createdAt: new Date().toISOString()
  };
  col('itens').add(item).then(()=>{
    closeModal('modalCaptura');
    toast('Guardado! ' + (item.tipo ? '' : 'Classifique depois em Tarefas.'));
  });
}

function classificarItem(id, tipo){
  col('itens').doc(id).update({tipo}).then(()=> toast('Classificado.'));
}
function concluirItem(id, atual){
  col('itens').doc(id).update({concluido: !atual});
}
function marcarPrioridade(id){
  // desmarca outras e marca essa
  itens.forEach(it=>{ if(it.prioridadeDoDia) col('itens').doc(it.id).update({prioridadeDoDia:false}); });
  col('itens').doc(id).update({prioridadeDoDia:true}).then(()=> toast('Definida como prioridade nº 1.'));
}
function excluirItem(id){
  if(confirm('Excluir este item?')) col('itens').doc(id).delete();
}
function setPrazoRapido(id, dias){
  const d = new Date(); d.setDate(d.getDate()+dias);
  col('itens').doc(id).update({data: d.toISOString().slice(0,10)});
}

// -------------------- RENDER: TAREFAS --------------------
function renderTarefas(){
  const inbox = itens.filter(i=>!i.tipo);
  const inboxEl = $('inboxList');
  inboxEl.innerHTML = inbox.length ? '' : '<div class="empty">Sua caixa de entrada está vazia. Use o botão "+" para capturar qualquer ideia solta.</div>';
  inbox.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${escapeHtml(it.texto)}</div>
      <select onchange="classificarItem('${it.id}', this.value)" style="width:auto; padding:6px 8px; font-size:12px;">
        <option value="">Isto é...</option>
        <option value="tarefa">Tarefa</option><option value="projeto">Projeto</option>
        <option value="ideia">Ideia</option><option value="anotacao">Anotação</option><option value="referencia">Referência</option>
      </select>
      <button class="mini-btn" onclick="excluirItem('${it.id}')">✕</button>`;
    inboxEl.appendChild(div);
  });

  const tarefas = itens.filter(i=> i.tipo === 'tarefa' && !i.concluido);
  const hoje = todayStr();
  const atrasadas = tarefas.filter(t=> t.data && t.data < hoje);
  const doDia = tarefas.filter(t=> t.data === hoje);
  const seteDias = new Date(); seteDias.setDate(seteDias.getDate()+7);
  const semana = tarefas.filter(t=> t.data && t.data > hoje && t.data <= seteDias.toISOString().slice(0,10));
  const semData = tarefas.filter(t=> !t.data);

  renderTaskGroup('listAtrasadas', atrasadas, 'Nada atrasado. 🎉');
  renderTaskGroup('listHoje', doDia, 'Nada para hoje ainda.');
  renderTaskGroup('listSemana', semana, 'Nada nos próximos 7 dias.');
  renderTaskGroup('listSemData', semData, 'Nada por aqui.');
}
function renderTaskGroup(elId, list, emptyMsg){
  const el = $(elId);
  el.innerHTML = list.length ? '' : `<div class="empty">${emptyMsg}</div>`;
  list.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="chk" onclick="concluirItem('${it.id}', false)"></div>
      <div class="title">${escapeHtml(it.texto)} ${it.data ? '<span style="color:var(--text-dim); font-size:11px;">('+it.data+')</span>' : ''}</div>
      <button class="mini-btn" onclick="marcarPrioridade('${it.id}')">🎯 Prioridade</button>
      <button class="mini-btn" onclick="setPrazoRapido('${it.id}',0)">Hoje</button>
      <button class="mini-btn" onclick="setPrazoRapido('${it.id}',1)">Amanhã</button>
      <button class="mini-btn" onclick="excluirItem('${it.id}')">✕</button>`;
    el.appendChild(div);
  });
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

// -------------------- RENDER: DASHBOARD --------------------
function renderDashboard(){
  const hoje = todayStr();
  const tarefasAbertas = itens.filter(i=> i.tipo==='tarefa' && !i.concluido);
  const atrasadas = tarefasAbertas.filter(t=> t.data && t.data < hoje);
  const doDia = tarefasAbertas.filter(t=> t.data === hoje);
  $('statAtrasadas').textContent = atrasadas.length;
  $('statHoje').textContent = doDia.length;

  const estoqueBaixo = produtos.filter(p=> Number(p.estoque) <= Number(p.minimo||0));
  $('statEstoqueBaixo').textContent = estoqueBaixo.length;

  const vendasHoje = vendas.filter(v=> (v.createdAt||'').slice(0,10) === hoje);
  const totalHoje = vendasHoje.reduce((s,v)=> s + Number(v.total||0), 0);
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
    div.innerHTML = `<div class="chk" onclick="concluirItem('${it.id}', false)"></div>
      <div class="title">${escapeHtml(it.texto)}</div>
      ${it.data==hoje?'<span class="tag urg">HOJE</span>': it.data && it.data<hoje ? '<span class="tag urg">ATRASADA</span>' : '<span class="tag wait">SEM DATA</span>'}`;
    focusEl.appendChild(div);
  });

  // resumo executivo simples e honesto (sem inventar dados)
  let resumo = [];
  if(estoqueBaixo.length) resumo.push(`${estoqueBaixo.length} produto(s) com estoque baixo — considere repor.`);
  if(atrasadas.length) resumo.push(`${atrasadas.length} tarefa(s) atrasada(s) — vale reorganizar antes de assumir compromissos novos.`);
  if(totalHoje === 0) resumo.push('Ainda não há vendas registradas hoje.');
  else resumo.push(`Faturamento de hoje: ${fmtMoney(totalHoje)} em ${vendasHoje.length} venda(s).`);
  $('resumoExecutivo').innerHTML = resumo.map(r=>'• '+r).join('<br>');
}

// -------------------- ESTOQUE --------------------
function salvarProduto(){
  const nome = $('prodNome').value.trim();
  if(!nome){ toast('Informe o nome do produto.'); return; }
  const p = {
    nome, categoria: $('prodCategoria').value,
    custo: Number($('prodCusto').value)||0, preco: Number($('prodPreco').value)||0,
    estoque: Number($('prodEstoque').value)||0, minimo: Number($('prodMinimo').value)||0,
    createdAt: new Date().toISOString()
  };
  col('produtos').add(p).then(()=>{
    closeModal('modalProduto');
    ['prodNome','prodCusto','prodPreco'].forEach(id=> $(id).value='');
    toast('Produto salvo.');
  });
}
function renderEstoque(){
  const tbl = $('tblEstoque');
  tbl.innerHTML = '';
  $('estoqueEmpty').style.display = produtos.length ? 'none' : 'block';
  produtos.forEach(p=>{
    const baixo = Number(p.estoque) <= Number(p.minimo||0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(p.nome)}</td><td>${escapeHtml(p.categoria||'')}</td>
      <td class="mono">${fmtMoney(p.preco)}</td>
      <td class="mono">${p.estoque} ${baixo?'<span class="tag urg">BAIXO</span>':''}</td>
      <td><button class="mini-btn" onclick="excluirProduto('${p.id}')">Excluir</button></td>`;
    tbl.appendChild(tr);
  });
}
function excluirProduto(id){ if(confirm('Excluir produto?')) col('produtos').doc(id).delete(); }

// -------------------- CLIENTES --------------------
function salvarCliente(){
  const nome = $('cliNome').value.trim();
  if(!nome){ toast('Informe o nome do cliente.'); return; }
  const c = {
    nome, whatsapp: $('cliWhats').value.trim(), instagram: $('cliInsta').value.trim(),
    obs: $('cliObs').value.trim(), totalGasto:0, ultimaCompra: null,
    createdAt: new Date().toISOString()
  };
  col('clientes').add(c).then(()=>{
    closeModal('modalCliente');
    ['cliNome','cliWhats','cliInsta','cliObs'].forEach(id=> $(id).value='');
    toast('Cliente salvo.');
  });
}
function renderClientes(){
  const tbl = $('tblClientes');
  tbl.innerHTML = '';
  $('clientesEmpty').style.display = clientes.length ? 'none' : 'block';
  clientes.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.whatsapp||'—')}</td>
      <td>${c.ultimaCompra || '—'}</td><td class="mono">${fmtMoney(c.totalGasto||0)}</td>`;
    tbl.appendChild(tr);
  });
}

// -------------------- PDV --------------------
function fillPdvSelects(){
  const selP = $('pdvProduto');
  selP.innerHTML = produtos.map(p=> `<option value="${p.id}">${escapeHtml(p.nome)} — ${fmtMoney(p.preco)} (estoque: ${p.estoque})</option>`).join('') || '<option value="">— Cadastre um produto —</option>';
  const selC = $('pdvCliente');
  selC.innerHTML = '<option value="">— Sem cliente —</option>' + clientes.map(c=> `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
}
function registrarVenda(){
  const prodId = $('pdvProduto').value;
  const prod = produtos.find(p=>p.id===prodId);
  if(!prod){ toast('Cadastre um produto primeiro.'); return; }
  const qtd = Number($('pdvQtd').value)||1;
  const cliId = $('pdvCliente').value;
  const cli = clientes.find(c=>c.id===cliId);
  const total = prod.preco * qtd;

  const venda = {
    produtoNome: prod.nome, produtoId: prod.id, quantidade: qtd,
    clienteNome: cli ? cli.nome : null, clienteId: cliId || null,
    pagamento: $('pdvPagamento').value, total,
    createdAt: new Date().toISOString()
  };
  col('vendas').add(venda);
  col('produtos').doc(prod.id).update({ estoque: Math.max(0, Number(prod.estoque) - qtd) });
  col('financeiro').add({ descricao: 'Venda: '+prod.nome, tipo:'entrada', valor: total, data: todayStr(), createdAt: new Date().toISOString() });
  if(cli){
    col('clientes').doc(cli.id).update({ totalGasto: Number(cli.totalGasto||0)+total, ultimaCompra: todayStr() });
  }
  toast('Venda registrada: ' + fmtMoney(total));
}
function renderVendas(){
  const hoje = todayStr();
  const hojeList = vendas.filter(v=> (v.createdAt||'').slice(0,10)===hoje);
  const el = $('vendasHoje');
  el.innerHTML = hojeList.length ? '' : '<div class="empty">Nenhuma venda registrada hoje.</div>';
  hojeList.forEach(v=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${escapeHtml(v.produtoNome)} x${v.quantidade} ${v.clienteNome ? '— '+escapeHtml(v.clienteNome):''}</div>
      <span class="mono">${fmtMoney(v.total)}</span>`;
    el.appendChild(div);
  });
}

// -------------------- FINANCEIRO --------------------
function salvarLancamento(){
  const desc = $('finDesc').value.trim();
  if(!desc){ toast('Informe a descrição.'); return; }
  col('financeiro').add({
    descricao: desc, tipo: $('finTipo').value, valor: Number($('finValor').value)||0,
    data: $('finData').value || todayStr(), createdAt: new Date().toISOString()
  }).then(()=>{
    closeModal('modalLancamento');
    ['finDesc','finValor'].forEach(id=> $(id).value='');
    toast('Lançamento salvo.');
  });
}
function renderFinanceiro(){
  const mesAtual = todayStr().slice(0,7);
  const doMes = lancamentos.filter(l=> (l.data||'').slice(0,7)===mesAtual);
  const entradas = doMes.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor),0);
  const saidas = doMes.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor),0);
  $('finEntradas').textContent = fmtMoney(entradas);
  $('finSaidas').textContent = fmtMoney(saidas);
  $('finSaldo').textContent = fmtMoney(entradas - saidas);

  const tbl = $('tblFinanceiro');
  tbl.innerHTML = '';
  $('finEmpty').style.display = lancamentos.length ? 'none' : 'block';
  lancamentos.slice(0,50).forEach(l=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${l.data}</td><td>${escapeHtml(l.descricao)}</td>
      <td>${l.tipo==='entrada' ? '<span class="tag deleg">Entrada</span>' : '<span class="tag urg">Saída</span>'}</td>
      <td class="mono">${fmtMoney(l.valor)}</td>`;
    tbl.appendChild(tr);
  });
}
