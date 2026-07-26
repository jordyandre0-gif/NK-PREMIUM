// ============================================================
// NK PREMIUM — LÓGICA DO APP (v3)
// ============================================================

let currentUser = null;
let UID = null;
let produtos = [], clientes = [], vendas = [], lancamentos = [], itens = [];
let selectedCaptureType = null;
let carrinho = [];
let agendaMonthOffset = 0;
let crediarioDataEditadaManualmente = false;
let ultimoRecibo = null;

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
function col(name){ return db.collection('users').doc(UID).collection(name); }
function firestoreErr(e){ console.error(e); toast('Erro ao salvar: ' + (e && e.message ? e.message : e)); }

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
    'auth/invalid-email':'E-mail inválido.', 'auth/user-not-found':'Usuário não encontrado.',
    'auth/wrong-password':'Senha incorreta.', 'auth/email-already-in-use':'Este e-mail já tem conta — tente entrar.',
    'auth/weak-password':'Senha muito fraca (mín. 6 caracteres).', 'auth/invalid-credential':'E-mail ou senha incorretos.'
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
    renderEstoque(); fillPdvSelects(); renderDashboard();
  }, err => console.error('produtos', err));
  col('clientes').onSnapshot(snap=>{
    clientes = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderClientes(); fillPdvSelects();
  }, err => console.error('clientes', err));
  col('vendas').onSnapshot(snap=>{
    vendas = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    renderVendas(); renderDashboard();
  }, err => console.error('vendas', err));
  col('financeiro').onSnapshot(snap=>{
    lancamentos = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> (b.data||'').localeCompare(a.data||''));
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

// -------------------- AGENDA (calendário) --------------------
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
function renderDashboard(){
  const hoje = todayStr();
  const tarefasAbertas = itens.filter(i=> i.tipo==='tarefa' && !i.concluido);
  const atrasadas = tarefasAbertas.filter(t=> t.data && t.data < hoje);
  const doDia = tarefasAbertas.filter(t=> t.data === hoje);
  $('statAtrasadas').textContent = atrasadas.length;
  $('statHoje').textContent = doDia.length;

  const estoqueBaixo = produtos.filter(p=> Number(p.estoque) <= Number(p.minimo||0));
  $('statEstoqueBaixo').textContent = estoqueBaixo.length;

  const vendasHojeArr = vendas.filter(v=> (v.createdAt||'').slice(0,10) === hoje);
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
  const pendentes = lancamentos.filter(l=> l.tipo==='entrada' && l.recebido===false);
  if(pendentes.length) resumo.push(`${pendentes.length} parcela(s) de crediário ainda a receber.`);
  const lucroHoje = vendasHojeArr.reduce((s,v)=> s+Number(v.lucroTotal||0), 0);
  if(vendasHojeArr.length) resumo.push(`Lucro estimado hoje: ${fmtMoney(lucroHoje)}.`);
  if(totalHoje === 0) resumo.push('Ainda não há vendas registradas hoje.');
  else resumo.push(`Faturamento de hoje: ${fmtMoney(totalHoje)} em ${vendasHojeArr.length} venda(s).`);
  $('resumoExecutivo').innerHTML = resumo.map(r=>'• '+r).join('<br>');
}

function itensDaVenda(v){
  if(v.itens && v.itens.length) return v.itens;
  if(v.produtoNome) return [{produtoNome:v.produtoNome, quantidade:v.quantidade}];
  return [];
}
function renderRanking(){
  const mesAtual = todayStr().slice(0,7);
  const contagem = {};
  vendas.filter(v=> (v.createdAt||'').slice(0,7)===mesAtual).forEach(v=>{
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
    descricao: `Compra de estoque: ${nome} (${estoque}un)`,
    tipo:'saida', valor, data: todayStr(), recebido:true, createdAt: new Date().toISOString()
  }).catch(firestoreErr);
}
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
    registrarCompraEstoque(p.nome, p.custo, p.estoque);
    ['prodNome','prodCusto','prodPreco'].forEach(id=> $(id).value='');
    toast('Produto salvo' + (p.custo && p.estoque ? ' e custo lançado no Financeiro.' : '.'));
  }).catch(firestoreErr);
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
      <td><button class="mini-btn" data-action="excluir-produto" data-id="${p.id}">Excluir</button></td>`;
    tbl.appendChild(tr);
  });
}
function excluirProduto(id){ if(confirm('Excluir produto?')) col('produtos').doc(id).delete().catch(firestoreErr); }

// -------------------- ESTOQUE EM LOTE --------------------
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
function parseNumeroBR(str){
  return parseFloat(String(str||'').trim().replace(/\./g,'').replace(',', '.'));
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
    estoque:p.estoque, minimo:p.minimo, createdAt: new Date().toISOString()
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
    promises.push(col('produtos').doc(prod.id).update({estoque: novoEstoque}));
    logs.push(`✅ ${prod.nome}: ${prod.estoque} → ${novoEstoque}`);
  });
  Promise.all(promises).then(()=>{
    const box = $('baixaResultado'); box.style.display='block'; box.textContent = logs.join('\n');
    $('baixaTexto').value = '';
    toast('Baixa processada.');
  }).catch(firestoreErr);
}

// -------------------- CATÁLOGO --------------------
function gerarCatalogo(){
  const disponiveis = produtos.filter(p=> Number(p.estoque) > 0);
  if(!disponiveis.length){ toast('Nenhum produto com estoque disponível.'); return; }
  const porCategoria = {};
  disponiveis.forEach(p=>{
    const cat = p.categoria || 'Outro';
    if(!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(p);
  });
  let texto = '🖤 NK PREMIUM — CATÁLOGO\n\n';
  Object.keys(porCategoria).forEach(cat=>{
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
  clientes.forEach(c=>{
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

// -------------------- PDV (CARRINHO) --------------------
function fillPdvSelects(){
  const selP = $('pdvProduto');
  const atualP = selP.value;
  selP.innerHTML = produtos.map(p=> `<option value="${p.id}">${escapeHtml(p.nome)} — ${fmtMoney(p.preco)} (estoque: ${p.estoque})</option>`).join('') || '<option value="">— Cadastre um produto —</option>';
  if(atualP) selP.value = atualP;
  const selC = $('pdvCliente');
  const atualC = selC.value;
  selC.innerHTML = '<option value="">Cliente avulso</option>' + clientes.map(c=> `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
  selC.value = atualC;
}
function adicionarAoCarrinho(){
  const prodId = $('pdvProduto').value;
  const prod = produtos.find(p=>p.id===prodId);
  if(!prod){ toast('Cadastre um produto primeiro.'); return; }
  const qtd = Number($('pdvQtd').value)||1;
  const existente = carrinho.find(c=>c.produtoId===prodId);
  if(existente){ existente.quantidade += qtd; }
  else { carrinho.push({produtoId: prod.id, produtoNome: prod.nome, precoUnit: prod.preco, custoUnit: Number(prod.custo)||0, quantidade: qtd}); }
  $('pdvQtd').value = 1;
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

function registrarVenda(){
  if(!carrinho.length){ toast('Adicione ao menos um produto ao carrinho.'); return; }
  const cliId = $('pdvCliente').value;
  const cli = clientes.find(c=>c.id===cliId);
  const avulso = !cliId;
  const pagamento = $('pdvPagamento').value;
  const total = carrinho.reduce((s,c)=> s + c.precoUnit*c.quantidade, 0);

  if(pagamento === 'Crediário' && !cli){ toast('Selecione um cliente cadastrado para venda parcelada (avulso não pode).'); return; }

  const itensVenda = carrinho.map(c=> ({
    produtoId:c.produtoId, produtoNome:c.produtoNome, quantidade:c.quantidade, precoUnit:c.precoUnit,
    custoUnit:c.custoUnit||0, subtotal:c.precoUnit*c.quantidade,
    lucro: c.custoUnit>0 ? (c.precoUnit-c.custoUnit)*c.quantidade : 0
  }));
  const lucroTotal = itensVenda.reduce((s,i)=> s+i.lucro, 0);
  const venda = {
    itens: itensVenda, total, lucroTotal, clienteId: cliId || null, clienteNome: cli ? cli.nome : 'Cliente avulso',
    avulso, pagamento, createdAt: new Date().toISOString()
  };

  col('vendas').add(venda).catch(firestoreErr);
  carrinho.forEach(c=>{
    const prod = produtos.find(p=>p.id===c.produtoId);
    if(prod) col('produtos').doc(prod.id).update({ estoque: Math.max(0, Number(prod.estoque) - c.quantidade) }).catch(firestoreErr);
  });
  if(cli){ col('clientes').doc(cli.id).update({ totalGasto: Number(cli.totalGasto||0)+total, ultimaCompra: todayStr() }).catch(firestoreErr); }

  const descItens = itensVenda.map(i=> i.quantidade+'x '+i.produtoNome).join(', ');

  if(pagamento !== 'Crediário'){
    col('financeiro').add({ descricao: 'Venda: '+descItens+(cli?' — '+cli.nome:' — avulso'), tipo:'entrada', valor: total, data: todayStr(), recebido:true, createdAt: new Date().toISOString() }).catch(firestoreErr);
  } else {
    const parcelas = Math.max(2, Number($('crediarioParcelas').value)||2);
    const intervalo = intervaloAtualDias();
    const primeiraData = $('crediarioPrimeiraData').value || addDays(todayStr(), intervalo);
    const valorBase = Math.round((total/parcelas) * 100) / 100;
    for(let i=0; i<parcelas; i++){
      const vencimento = addDays(primeiraData, intervalo*i);
      const valorParcela = (i === parcelas-1) ? Math.round((total - valorBase*(parcelas-1))*100)/100 : valorBase;
      col('financeiro').add({
        descricao: `Parcela ${i+1}/${parcelas} — ${descItens} — ${cli.nome}`,
        tipo:'entrada', valor: valorParcela, data: vencimento, recebido:false, createdAt: new Date().toISOString()
      }).then(ref=>{
        col('itens').add({
          texto: `Receber parcela ${i+1}/${parcelas} de ${cli.nome} — ${fmtMoney(valorParcela)}`,
          tipo:'tarefa', data: vencimento, concluido:false, prioridadeDoDia:false,
          origem:'crediario', lancamentoId: ref.id, clienteId: cli.id, clienteNome: cli.nome,
          clienteWhats: cli.whatsapp||null, valor: valorParcela, parcelaNum: i+1, parcelaTotal: parcelas,
          createdAt: new Date().toISOString()
        }).catch(firestoreErr);
      }).catch(firestoreErr);
    }
  }

  mostrarRecibo(venda);
  carrinho = []; renderCarrinho();
  $('pdvPagamento').value = 'Pix'; toggleCrediarioBox();
  $('pdvCliente').value = '';
}

function mostrarRecibo(venda){
  const linhas = venda.itens.map(i=> `${i.quantidade}x ${i.produtoNome} — ${fmtMoney(i.subtotal)}`).join('\n');
  const texto = `🖤 NK Premium — Recibo\n\nCliente: ${venda.clienteNome}\n\n${linhas}\n\nTotal: ${fmtMoney(venda.total)}\nPagamento: ${venda.pagamento}${venda.pagamento==='Crediário'?' (parcelado)':''}\n\nObrigado pela preferência! 🖤`;
  $('reciboTexto').textContent = texto;
  const cli = clientes.find(c=>c.id===venda.clienteId);
  const btnWa = $('btnEnviarRecibo');
  if(cli && cli.whatsapp){
    btnWa.style.display = 'block';
    ultimoRecibo = {texto, whats: cli.whatsapp};
  } else {
    btnWa.style.display = 'none';
    ultimoRecibo = {texto, whats: null};
  }
  openModal('modalRecibo');
}
function enviarRecibo(){
  if(!ultimoRecibo || !ultimoRecibo.whats){ toast('Sem WhatsApp para enviar.'); return; }
  const link = waLink(ultimoRecibo.whats, ultimoRecibo.texto);
  if(link) window.open(link, '_blank');
}

function renderVendas(){
  const hoje = todayStr();
  const hojeList = vendas.filter(v=> (v.createdAt||'').slice(0,10)===hoje);
  const el = $('vendasHoje');
  el.innerHTML = hojeList.length ? '' : '<div class="empty">Nenhuma venda registrada hoje.</div>';
  hojeList.forEach(v=>{
    const itensTxt = itensDaVenda(v).map(i=> i.quantidade+'x '+i.produtoNome).join(', ');
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${escapeHtml(itensTxt)} ${v.avulso?'<span class="tag wait">AVULSO</span>':(v.clienteNome?'— '+escapeHtml(v.clienteNome):'')} ${v.pagamento==='Crediário'?'<span class="tag imp">CREDIÁRIO</span>':''}</div>
      <span class="mono">${fmtMoney(v.total)}${v.lucroTotal ? ' <span style="color:var(--ok); font-size:11px;">(lucro '+fmtMoney(v.lucroTotal)+')</span>' : ''}</span>`;
    el.appendChild(div);
  });
}

// -------------------- FINANCEIRO --------------------
function salvarLancamento(){
  const desc = $('finDesc').value.trim();
  if(!desc){ toast('Informe a descrição.'); return; }
  col('financeiro').add({
    descricao: desc, tipo: $('finTipo').value, valor: Number($('finValor').value)||0,
    data: $('finData').value || todayStr(), recebido:true, createdAt: new Date().toISOString()
  }).then(()=>{
    closeModal('modalLancamento');
    ['finDesc','finValor'].forEach(id=> $(id).value='');
    toast('Lançamento salvo.');
  }).catch(firestoreErr);
}
function marcarRecebido(id){
  col('financeiro').doc(id).update({recebido: true}).then(()=> toast('Marcado como recebido.')).catch(firestoreErr);
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
  return {descricao, tipo, valor, data};
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
    descricao:l.descricao, tipo:l.tipo, valor:l.valor, data:l.data, recebido:true, createdAt: new Date().toISOString()
  }));
  Promise.all(promises).then(()=>{
    let resultado = `✅ ${validos.length} lançamento(s) registrado(s).`;
    if(invalidos.length) resultado += `\n⚠️ ${invalidos.length} linha(s) ignorada(s): ${invalidos.join(', ')}`;
    const box = $('loteFinResultado'); box.style.display='block'; box.textContent = resultado;
    $('loteFinTexto').value = '';
    toast('Lote lançado.');
  }).catch(firestoreErr);
}
function renderFinanceiro(){
  const mesAtual = todayStr().slice(0,7);
  const doMes = lancamentos.filter(l=> (l.data||'').slice(0,7)===mesAtual);
  const entradas = doMes.filter(l=>l.tipo==='entrada' && l.recebido!==false).reduce((s,l)=>s+Number(l.valor),0);
  const saidas = doMes.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor),0);
  const aReceber = lancamentos.filter(l=>l.tipo==='entrada' && l.recebido===false).reduce((s,l)=>s+Number(l.valor),0);
  $('finEntradas').textContent = fmtMoney(entradas);
  $('finSaidas').textContent = fmtMoney(saidas);
  $('finSaldo').textContent = fmtMoney(entradas - saidas);
  $('finAReceber').textContent = fmtMoney(aReceber);

  const lucroMes = vendas.filter(v=> (v.createdAt||'').slice(0,7)===mesAtual).reduce((s,v)=> s+Number(v.lucroTotal||0), 0);
  $('finLucro').textContent = fmtMoney(lucroMes);
  const estoqueCusto = produtos.reduce((s,p)=> s + Number(p.custo||0)*Number(p.estoque||0), 0);
  const estoqueVenda = produtos.reduce((s,p)=> s + Number(p.preco||0)*Number(p.estoque||0), 0);
  $('finEstoqueCusto').textContent = fmtMoney(estoqueCusto);
  $('finEstoqueVenda').textContent = fmtMoney(estoqueVenda);

  const tbl = $('tblFinanceiro');
  tbl.innerHTML = '';
  $('finEmpty').style.display = lancamentos.length ? 'none' : 'block';
  lancamentos.slice(0,80).forEach(l=>{
    const tr = document.createElement('tr');
    let statusTag = '—';
    if(l.tipo==='entrada'){ statusTag = l.recebido===false ? '<span class="tag imp">Pendente</span>' : '<span class="tag deleg">Recebido</span>'; }
    const acao = (l.tipo==='entrada' && l.recebido===false) ? `<button class="mini-btn" data-action="marcar-recebido" data-id="${l.id}">Marcar recebido</button>` : '';
    tr.innerHTML = `<td>${l.data}</td><td>${escapeHtml(l.descricao)}</td>
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
  $('btnSignup').addEventListener('click', doSignup);
  $('btnLogout').addEventListener('click', doLogout);
  $('btnTheme').addEventListener('click', toggleTheme);
  $('btnMenuToggle').addEventListener('click', ()=> $('sidebar').classList.toggle('open'));
  $('btnCapture').addEventListener('click', openCapture);
  $('fab').addEventListener('click', openCapture);
  $('btnSalvarCaptura').addEventListener('click', saveCapture);
  $('btnNovoProduto').addEventListener('click', ()=> openModal('modalProduto'));
  $('btnSalvarProduto').addEventListener('click', salvarProduto);
  $('btnNovoCliente').addEventListener('click', ()=> openModal('modalCliente'));
  $('btnSalvarCliente').addEventListener('click', salvarCliente);
  $('btnNovoLancamento').addEventListener('click', ()=> openModal('modalLancamento'));
  $('btnSalvarLancamento').addEventListener('click', salvarLancamento);
  $('btnLancamentoLote').addEventListener('click', ()=> openModal('modalLancamentoLote'));
  $('btnProcessarLoteFin').addEventListener('click', processarLoteFin);
  $('btnAddCarrinho').addEventListener('click', adicionarAoCarrinho);
  $('btnRegistrarVenda').addEventListener('click', registrarVenda);
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
      'excluir-cliente': ()=> excluirCliente(id),
      'cobrar-cliente': ()=> cobrarCliente(id),
      'marcar-recebido': ()=> marcarRecebido(id),
      'remover-carrinho': ()=> removerDoCarrinho(el.dataset.index),
      'agenda-dia': ()=> mostrarAgendaDia(el.dataset.date)
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
