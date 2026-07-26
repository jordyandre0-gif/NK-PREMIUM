// ============================================================
// NK PREMIUM — LÓGICA DO APP (v2)
// ============================================================

let currentUser = null;
let UID = null;
let produtos = [], clientes = [], vendas = [], lancamentos = [], itens = [];
let selectedCaptureType = null;

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
  const full = digits.length <= 11 ? '55'+digits : digits; // assume Brasil se vier sem DDI
  return 'https://wa.me/'+full+'?text='+encodeURIComponent(text);
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.style.display='block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=> t.style.display='none', 3200);
}
function col(name){ return db.collection('users').doc(UID).collection(name); }

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

// -------------------- STARTUP LISTENERS (Firestore) --------------------
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
    renderTarefas(); renderDashboard();
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
  col('itens').add(item).then(()=>{ closeModal('modalCaptura'); toast('Guardado!'); });
}
function classificarItem(id, tipo){ col('itens').doc(id).update({tipo}).then(()=> toast('Classificado.')); }
function concluirItem(id){
  const it = itens.find(i=>i.id===id);
  if(!it) return;
  const novo = !it.concluido;
  col('itens').doc(id).update({concluido: novo});
  if(it.lancamentoId){
    col('financeiro').doc(it.lancamentoId).update({recebido: novo}).catch(()=>{});
  }
}
function marcarPrioridade(id){
  itens.forEach(it=>{ if(it.prioridadeDoDia) col('itens').doc(it.id).update({prioridadeDoDia:false}); });
  col('itens').doc(id).update({prioridadeDoDia:true}).then(()=> toast('Definida como prioridade nº 1.'));
}
function excluirItem(id){ if(confirm('Excluir este item?')) col('itens').doc(id).delete(); }
function setPrazoRapido(id, dias){ col('itens').doc(id).update({data: addDays(todayStr(), dias)}); }
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

  let resumo = [];
  if(estoqueBaixo.length) resumo.push(`${estoqueBaixo.length} produto(s) com estoque baixo — considere repor.`);
  if(atrasadas.length) resumo.push(`${atrasadas.length} tarefa(s) atrasada(s) — vale reorganizar antes de assumir compromissos novos.`);
  const pendentes = lancamentos.filter(l=> l.tipo==='entrada' && l.recebido===false);
  if(pendentes.length) resumo.push(`${pendentes.length} parcela(s) de crediário ainda a receber.`);
  if(totalHoje === 0) resumo.push('Ainda não há vendas registradas hoje.');
  else resumo.push(`Faturamento de hoje: ${fmtMoney(totalHoje)} em ${vendasHojeArr.length} venda(s).`);
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
      <td><button class="mini-btn" data-action="excluir-produto" data-id="${p.id}">Excluir</button></td>`;
    tbl.appendChild(tr);
  });
}
function excluirProduto(id){ if(confirm('Excluir produto?')) col('produtos').doc(id).delete(); }

// -------------------- ESTOQUE EM LOTE --------------------
function parseLoteLinha(linha){
  const parts = linha.split(';').map(s=>s.trim());
  if(!parts[0]) return null;
  const nome = parts[0];
  const preco = parseFloat((parts[1]||'').replace(',', '.'));
  const estoque = parseInt(parts[2]||'0', 10);
  if(!nome || isNaN(preco) || isNaN(estoque)) return {erro: true, nome: nome || linha};
  return {
    nome, preco, estoque,
    categoria: parts[3] || 'Outro',
    custo: parseFloat((parts[4]||'0').replace(',', '.')) || 0,
    minimo: parseInt(parts[5]||'2', 10) || 2
  };
}
function processarLote(){
  const linhas = $('loteTexto').value.split('\n').map(l=>l.trim()).filter(Boolean);
  if(!linhas.length){ toast('Cole ao menos uma linha.'); return; }
  const validos = [], invalidos = [];
  linhas.forEach(l=>{
    const r = parseLoteLinha(l);
    if(!r) return;
    if(r.erro) invalidos.push(r.nome); else validos.push(r);
  });
  const promises = validos.map(p=> col('produtos').add({
    nome:p.nome, categoria:p.categoria, custo:p.custo, preco:p.preco,
    estoque:p.estoque, minimo:p.minimo, createdAt: new Date().toISOString()
  }));
  Promise.all(promises).then(()=>{
    let resultado = `✅ ${validos.length} produto(s) cadastrado(s) com sucesso.`;
    if(invalidos.length) resultado += `\n⚠️ ${invalidos.length} linha(s) ignorada(s) (formato incorreto): ${invalidos.join(', ')}`;
    const box = $('loteResultado'); box.style.display='block'; box.textContent = resultado;
    $('loteTexto').value = '';
    toast('Lote processado.');
  });
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
  });
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
function copiarCatalogo(){
  const texto = $('catalogoTexto').textContent;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(()=> toast('Catálogo copiado!')).catch(()=> fallbackCopy(texto));
  } else fallbackCopy(texto);
}
function fallbackCopy(texto){
  const ta = document.createElement('textarea');
  ta.value = texto; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{ document.execCommand('copy'); toast('Catálogo copiado!'); } catch(e){ toast('Não foi possível copiar automaticamente. Selecione o texto manualmente.'); }
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
  });
}
function excluirCliente(id){ if(confirm('Excluir cliente?')) col('clientes').doc(id).delete(); }
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

// -------------------- PDV --------------------
function fillPdvSelects(){
  const selP = $('pdvProduto');
  selP.innerHTML = produtos.map(p=> `<option value="${p.id}">${escapeHtml(p.nome)} — ${fmtMoney(p.preco)} (estoque: ${p.estoque})</option>`).join('') || '<option value="">— Cadastre um produto —</option>';
  const selC = $('pdvCliente');
  const atual = selC.value;
  selC.innerHTML = '<option value="">— Sem cliente —</option>' + clientes.map(c=> `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
  selC.value = atual;
}
function toggleCrediarioBox(){
  const show = $('pdvPagamento').value === 'Crediário';
  $('crediarioBox').style.display = show ? 'block' : 'none';
  if(show && !$('crediarioPrimeiraData').value){
    $('crediarioPrimeiraData').value = addDays(todayStr(), Number($('crediarioIntervalo').value)||30);
  }
}
function toggleIntervaloCustom(){
  const custom = $('crediarioIntervalo').value === 'custom';
  $('crediarioIntervaloCustom').style.display = custom ? 'block' : 'none';
}
function registrarVenda(){
  const prodId = $('pdvProduto').value;
  const prod = produtos.find(p=>p.id===prodId);
  if(!prod){ toast('Cadastre um produto primeiro.'); return; }
  const qtd = Number($('pdvQtd').value)||1;
  const cliId = $('pdvCliente').value;
  const cli = clientes.find(c=>c.id===cliId);
  const pagamento = $('pdvPagamento').value;
  const total = prod.preco * qtd;

  if(pagamento === 'Crediário' && !cli){ toast('Selecione um cliente para venda parcelada.'); return; }

  const venda = {
    produtoNome: prod.nome, produtoId: prod.id, quantidade: qtd,
    clienteNome: cli ? cli.nome : null, clienteId: cliId || null,
    pagamento, total, createdAt: new Date().toISOString()
  };
  col('vendas').add(venda);
  col('produtos').doc(prod.id).update({ estoque: Math.max(0, Number(prod.estoque) - qtd) });

  if(cli){ col('clientes').doc(cli.id).update({ totalGasto: Number(cli.totalGasto||0)+total, ultimaCompra: todayStr() }); }

  if(pagamento !== 'Crediário'){
    col('financeiro').add({ descricao: 'Venda: '+prod.nome+(cli?' — '+cli.nome:''), tipo:'entrada', valor: total, data: todayStr(), recebido:true, createdAt: new Date().toISOString() });
    toast('Venda registrada: ' + fmtMoney(total));
  } else {
    const parcelas = Math.max(2, Number($('crediarioParcelas').value)||2);
    let intervalo = $('crediarioIntervalo').value;
    intervalo = intervalo === 'custom' ? (Number($('crediarioIntervaloCustom').value)||30) : Number(intervalo);
    const primeiraData = $('crediarioPrimeiraData').value || addDays(todayStr(), intervalo);
    const valorBase = Math.round((total/parcelas) * 100) / 100;

    for(let i=0; i<parcelas; i++){
      const vencimento = addDays(primeiraData, intervalo*i);
      const valorParcela = (i === parcelas-1) ? Math.round((total - valorBase*(parcelas-1))*100)/100 : valorBase;
      col('financeiro').add({
        descricao: `Parcela ${i+1}/${parcelas} — ${prod.nome} — ${cli.nome}`,
        tipo:'entrada', valor: valorParcela, data: vencimento, recebido:false, createdAt: new Date().toISOString()
      }).then(ref=>{
        col('itens').add({
          texto: `Receber parcela ${i+1}/${parcelas} de ${cli.nome} — ${fmtMoney(valorParcela)}`,
          tipo:'tarefa', data: vencimento, concluido:false, prioridadeDoDia:false,
          origem:'crediario', lancamentoId: ref.id, clienteId: cli.id, clienteNome: cli.nome,
          clienteWhats: cli.whatsapp||null, valor: valorParcela, parcelaNum: i+1, parcelaTotal: parcelas,
          createdAt: new Date().toISOString()
        });
      });
    }
    toast(`Venda parcelada em ${parcelas}x registrada.`);
  }
}
function renderVendas(){
  const hoje = todayStr();
  const hojeList = vendas.filter(v=> (v.createdAt||'').slice(0,10)===hoje);
  const el = $('vendasHoje');
  el.innerHTML = hojeList.length ? '' : '<div class="empty">Nenhuma venda registrada hoje.</div>';
  hojeList.forEach(v=>{
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `<div class="title">${escapeHtml(v.produtoNome)} x${v.quantidade} ${v.clienteNome ? '— '+escapeHtml(v.clienteNome):''} ${v.pagamento==='Crediário'?'<span class="tag imp">CREDIÁRIO</span>':''}</div>
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
    data: $('finData').value || todayStr(), recebido:true, createdAt: new Date().toISOString()
  }).then(()=>{
    closeModal('modalLancamento');
    ['finDesc','finValor'].forEach(id=> $(id).value='');
    toast('Lançamento salvo.');
  });
}
function marcarRecebido(id){
  col('financeiro').doc(id).update({recebido: true}).then(()=> toast('Marcado como recebido.'));
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

  const tbl = $('tblFinanceiro');
  tbl.innerHTML = '';
  $('finEmpty').style.display = lancamentos.length ? 'none' : 'block';
  lancamentos.slice(0,80).forEach(l=>{
    const tr = document.createElement('tr');
    let statusTag = '—';
    if(l.tipo==='entrada'){
      statusTag = l.recebido===false ? '<span class="tag imp">Pendente</span>' : '<span class="tag deleg">Recebido</span>';
    }
    const acao = (l.tipo==='entrada' && l.recebido===false) ? `<button class="mini-btn" data-action="marcar-recebido" data-id="${l.id}">Marcar recebido</button>` : '';
    tr.innerHTML = `<td>${l.data}</td><td>${escapeHtml(l.descricao)}</td>
      <td>${l.tipo==='entrada' ? '<span class="tag deleg">Entrada</span>' : '<span class="tag urg">Saída</span>'}</td>
      <td>${statusTag} ${acao}</td>
      <td class="mono">${fmtMoney(l.valor)}</td>`;
    tbl.appendChild(tr);
  });
}

// ============================================================
// BINDING DE EVENTOS (delegação — corrige botões que não respondiam)
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
  $('btnRegistrarVenda').addEventListener('click', registrarVenda);
  $('btnGerarCatalogo').addEventListener('click', gerarCatalogo);
  $('btnCopiarCatalogo').addEventListener('click', copiarCatalogo);
  $('btnListaLote').addEventListener('click', ()=> openModal('modalListaLote'));
  $('btnProcessarLote').addEventListener('click', processarLote);
  $('btnBaixaLista').addEventListener('click', ()=> openModal('modalBaixaLista'));
  $('btnProcessarBaixa').addEventListener('click', processarBaixa);
  $('pdvPagamento').addEventListener('change', toggleCrediarioBox);
  $('crediarioIntervalo').addEventListener('change', toggleIntervaloCustom);

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
      const titles = {dashboard:'Painel do Dia', estoque:'Estoque', pdv:'Vendas (PDV)', clientes:'Clientes', financeiro:'Financeiro', tarefas:'Tarefas & Inbox', config:'Configurações'};
      $('pageTitle').textContent = titles[el.dataset.view];
      $('sidebar').classList.remove('open');
    });
  });

  // Delegação global: cobre todo botão criado dinamicamente (tabelas e listas)
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
      'marcar-recebido': ()=> marcarRecebido(id)
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
