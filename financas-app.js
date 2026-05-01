function getSavedConfig(){
  try{
    const current=localStorage.getItem(SUPABASE_CONFIG_KEY);
    if(current) return JSON.parse(current);
    const legacy=localStorage.getItem(LEGACY_SUPABASE_CONFIG_KEY);
    if(!legacy) return null;
    const parsed=JSON.parse(legacy);
    if(isValidConfig(parsed)) saveConfig(parsed);
    return parsed;
  }
  catch{return null;}
}

function getEmbeddedConfig(){
  return EMBEDDED_SUPABASE_CONFIG;
}

function hasEmbeddedConfig(){
  return isValidConfig(getEmbeddedConfig());
}

function resolveSupabaseConfig(){
  const saved=getSavedConfig();
  if(isValidConfig(saved)) return saved;
  const embedded=getEmbeddedConfig();
  if(isValidConfig(embedded)) return embedded;
  return null;
}

function readConfigForm(){
  return {
    url:q('inp-supabase-url').value.trim(),
    anonKey:q('inp-supabase-key').value.trim(),
  };
}

function loadConfigForm(){
  const cfg=resolveSupabaseConfig();
  if(!cfg) return;
  q('inp-supabase-url').value=cfg.url||'';
  q('inp-supabase-key').value=cfg.anonKey||'';
  setConfigStatus(hasEmbeddedConfig()?'Configuracao embarcada no app.':'Configuracao carregada deste dispositivo.','ok');
}

function saveConfig(cfg){localStorage.setItem(SUPABASE_CONFIG_KEY,JSON.stringify(cfg));}

function isValidConfig(cfg){
  if(!cfg?.url || !cfg?.anonKey) return false;
  try{return /^https?:\/\//.test(new URL(cfg.url).toString());}
  catch{return false;}
}

function setConfigStatus(msg,tipo=''){
  const el=q('config-status');
  if(!el) return;
  el.textContent=msg;
  el.className=`config-status${tipo?` ${tipo}`:''}`;
}

function syncConfigUi(){
  const configCard=q('config-card');
  const authSub=q('auth-logo-sub');
  if(configCard) configCard.style.display=hasEmbeddedConfig()?'none':'';
  if(authSub) authSub.textContent=hasEmbeddedConfig()?'Seu dinheiro, organizado com calma.':'Controle pessoal';
}

function bindAuthListener(){
  if(authListenerBound || !db) return;
  db.auth.onAuthStateChange(async (_e,session)=>{
    if(session){
      S.user=session.user;
      showApp();
      await loadCustomSubs();
      refreshDashboardIfVisible();
    }else showAuth();
  });
  authListenerBound=true;
}

async function bootSupabase(){
  const cfg=resolveSupabaseConfig();
  if(!isValidConfig(cfg)){
    showAuth();
    syncConfigUi();
    setConfigStatus('Preencha e salve a configuracao do Supabase para entrar.','err');
    return;
  }
  try{
    const { createClient } = supabase;
    db = createClient(cfg.url,cfg.anonKey,{
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true,
        storageKey:SUPABASE_AUTH_STORAGE_KEY,
        storage:window.localStorage,
      }
    });
    bindAuthListener();
    const {data:{session}}=await db.auth.getSession();
    if(session){
      S.user=session.user;
      showApp();
      await loadCustomSubs();
      refreshDashboardIfVisible();
    }else showAuth();
    syncConfigUi();
    setConfigStatus(hasEmbeddedConfig()?'Configuracao embarcada no app.':'Configuracao salva neste dispositivo.','ok');
  }catch(_ex){
    db=null;
    showAuth();
    syncConfigUi();
    setConfigStatus('Nao foi possivel iniciar o Supabase com essa configuracao.','err');
  }
}

function setupConfig(){
  syncConfigUi();
  q('btn-save-config').addEventListener('click',async ()=>{
    const cfg=readConfigForm();
    if(!isValidConfig(cfg)){
      setConfigStatus('Informe uma URL valida e a chave anon do Supabase.','err');
      return;
    }
    saveConfig(cfg);
    setConfigStatus('Configuracao salva. Inicializando...','ok');
    await bootSupabase();
  });
}

function setupDashboard(){
  q('btn-dashboard-refresh').addEventListener('click',()=>refreshDashboard());
}

async function ensureActiveSession(){
  if(!db) return false;
  if(S.user) return true;
  try{
    const { data, error } = await db.auth.getSession();
    if(error) throw error;
    if(data?.session?.user){
      S.user=data.session.user;
      return true;
    }
  }catch{}
  S.user=null;
  showAuth();
  return false;
}

function monthInputToDate(value){
  return value?`${value}-01`:null;
}

function buildParcelamentoCategoriaOptions(){
  const sel=q('parc-categoria');
  if(!sel) return;
  sel.innerHTML='<option value="">Selecionar...</option>';
  CATS.forEach(cat=>{
    const o=document.createElement('option');
    o.value=cat.nome;
    o.textContent=cat.nome;
    sel.appendChild(o);
  });
}

function syncParcelamentoOwnerContext(){
  const owner=q('parc-owner');
  const contexto=q('parc-contexto');
  const necessidade=q('parc-necessidade');
  if(!owner || !contexto) return;
  if(owner.value==='mae'){
    contexto.value='mae';
    necessidade.value='';
  }
}

function syncParcelamentoResumo(){
  const total=Number(q('parc-total')?.value||0);
  const pagas=Number(q('parc-pagas')?.value||0);
  const valor=Number(q('parc-valor')?.value||0);
  const abertas=Math.max(total-pagas,0);
  const totalAberto=abertas*valor;
  const el=q('parc-resumo');
  if(!el) return;
  if(!total || !valor){
    el.innerHTML='Informe os dados do parcelamento para calcular o total ainda em aberto.';
    return;
  }
  el.innerHTML=`<strong>Resumo:</strong> restam ${abertas} parcela(s) em aberto, com total estimado de ${moneyBR(totalAberto)}.`;
}

function resetParcelamentoAtivo(){
  q('parc-descricao').value='';
  q('parc-owner').value='eu';
  q('parc-contexto').value='pessoal';
  q('parc-categoria').value='';
  q('parc-necessidade').value='';
  q('parc-subcategoria').value='';
  q('parc-cartao').value='';
  q('parc-total').value='';
  q('parc-pagas').value='';
  q('parc-valor').value='';
  q('parc-vencimento').value='';
  q('parc-data-compra').value='';
  q('parc-inicio').value='';
  syncParcelamentoResumo();
}

function setupParcelamentos(){
  if(!q('btn-salvar-parcelamento-ativo')) return;
  buildParcelamentoCategoriaOptions();
  q('parc-owner').addEventListener('change',syncParcelamentoOwnerContext);
  ['parc-total','parc-pagas','parc-valor'].forEach(id=>{
    q(id).addEventListener('input',syncParcelamentoResumo);
  });
  q('btn-salvar-parcelamento-ativo').addEventListener('click',salvarParcelamentoAtivo);
  syncParcelamentoOwnerContext();
  syncParcelamentoResumo();
}

q('form-auth').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=q('inp-email').value.trim(), pwd=q('inp-senha').value;
  const btn=q('btn-auth'),err=q('auth-err');
  if(!db){
    err.style.color='#C0392B';
    err.textContent='A configuracao do app ainda nao foi concluida.';
    return;
  }
  btn.disabled=true;btn.textContent='...';err.textContent='';
  try{
    let res;
    if(authMode==='register'){
      res=await db.auth.signUp({email,password:pwd});
      if(res.error)throw res.error;
      err.style.color='var(--sage-dk)';err.textContent='Conta criada! Verifique seu e-mail.';
    }else{
      res=await db.auth.signInWithPassword({email,password:pwd});
      if(res.error)throw res.error;
    }
  }catch(ex){
    err.style.color='#C0392B';err.textContent=traduzErro(ex.message);
  }finally{
    btn.disabled=false;
    btn.textContent=authMode==='login'?'Entrar':'Criar conta';
  }
});

q('btn-toggle-mode').addEventListener('click',()=>{
  authMode=authMode==='login'?'register':'login';
  q('btn-auth').textContent=authMode==='login'?'Entrar':'Criar conta';
  q('btn-toggle-mode').textContent=authMode==='login'?'Criar conta':'Ja tenho conta';
  q('auth-err').textContent='';
});

const logout=()=>db.auth.signOut().then(()=>{
  S.user=null;
  showAuth();
});
q('btn-logout').addEventListener('click',logout);
q('btn-logout-2').addEventListener('click',logout);

function showAuth(){syncConfigUi();q('screen-auth').classList.remove('hidden');q('screen-app').classList.add('hidden');}
function showApp(){q('screen-auth').classList.add('hidden');q('screen-app').classList.remove('hidden');}

function traduzErro(m){
  if(m.includes('Invalid login'))return'E-mail ou senha incorretos';
  if(m.includes('already registered'))return'E-mail ja cadastrado';
  if(m.includes('Password should'))return'Senha muito curta (min. 6 caracteres)';
  return m;
}

function setupNav(){
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    let t;
    btn.addEventListener('pointerdown',()=>{
      if(!tabSupportsList(btn.dataset.tab)) return;
      t=setTimeout(()=>openList(btn.dataset.tab),500);
    });
    btn.addEventListener('pointerup',()=>clearTimeout(t));
    btn.addEventListener('pointerleave',()=>clearTimeout(t));
    btn.addEventListener('click',()=>{
      if(btn.classList.contains('active')){
        if(tabSupportsList(btn.dataset.tab)) openList(btn.dataset.tab);
        else if(btn.dataset.tab==='dashboard') refreshDashboard();
        return;
      }
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      q(`tab-${btn.dataset.tab}`).classList.add('active');
      if(btn.dataset.tab==='dashboard') refreshDashboard();
    });
  });
}

function tabSupportsList(tab){return tab==='gastos'||tab==='entradas';}

function setDates(){
  const now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString();
  q('inp-data-gasto').value=local.slice(0,16);
  q('inp-data-entrada').value=local.slice(0,10);
}

function bindValor(inpId,numId,cb){
  const inp=q(inpId),num=q(numId);
  inp.addEventListener('input',()=>{
    const cents=parseInt(inp.value.replace(/\D/g,'')||'0',10);
    num.textContent=fmt(cents);cb(cents);
  });
  inp.closest('.value-card').addEventListener('click',()=>inp.focus());
}

function fmt(c){return Math.floor(c/100).toLocaleString('pt-BR')+','+String(c%100).padStart(2,'0');}

function moneyBR(value){
  return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function localDateTimeToIso(value){
  if(!value) throw new Error('Data e hora nao informadas.');
  const [datePart,timePart='00:00']=value.split('T');
  const [year,month,day]=datePart.split('-').map(Number);
  const [hour,minute]=timePart.split(':').map(Number);
  const localDate=new Date(year,(month||1)-1,day||1,hour||0,minute||0,0,0);
  if(Number.isNaN(localDate.getTime())) throw new Error('Data e hora invalidas neste dispositivo.');
  return localDate.toISOString();
}

function dateInputToMiddayIso(value){
  if(!value) throw new Error('Data nao informada.');
  const [year,month,day]=value.split('-').map(Number);
  const localDate=new Date(year,(month||1)-1,day||1,12,0,0,0);
  if(Number.isNaN(localDate.getTime())) throw new Error('Data invalida neste dispositivo.');
  return localDate.toISOString();
}

function isoToDatetimeLocal(value){
  if(!value) return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return '';
  const year=d.getFullYear();
  const month=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  const hour=String(d.getHours()).padStart(2,'0');
  const minute=String(d.getMinutes()).padStart(2,'0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function newUuid(){
  if(globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0;
    const v=c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

function buildParcelas(){
  const wrap=q('parcelas-row');
  [['A vista','a_vista'],['1x','1x'],['2x','2x'],['3x','3x'],['4x','4x'],
   ['5x','5x'],['6x','6x'],['7x','7x'],['8x','8x'],['9x','9x'],
   ['10x','10x'],['11x','11x'],['12x','12x']].forEach(([l,v],i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='p-btn'+(i===0?' active':'');
    b.dataset.v=v;
    b.textContent=l;
    b.addEventListener('click',()=>{
      document.querySelectorAll('.p-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      S.parcela=v;
    });
    wrap.appendChild(b);
  });
}

function setupGastos(){
  document.querySelectorAll('.owner-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.owner-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      S.owner=btn.dataset.owner;
      q('meus-campos').style.display=S.owner==='mae'?'none':'flex';
      q('opt-transf').style.display=S.owner==='mae'?'':'none';
      if(S.owner==='eu'&&q('sel-forma').value==='transferencia')q('sel-forma').value='credito';
    });
  });
  document.querySelectorAll('.nec-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.nec-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      S.necessidade=+btn.dataset.v;
    });
  });
  q('sel-cat').addEventListener('change',onCatChange);
  q('sel-sub').addEventListener('change',onSubChange);
  q('btn-salvar-gasto').addEventListener('click',salvarGasto);
  const p=JSON.parse(localStorage.getItem('gPresets')||'{}');
  if(p.forma)q('sel-forma').value=p.forma;
  if(p.banco)q('sel-banco').value=p.banco;
}

function buildCats(){
  const sel=q('sel-cat');
  CATS.forEach(c=>{
    const o=document.createElement('option');
    o.value=c.id;
    o.textContent=c.nome;
    sel.appendChild(o);
  });
}

function onCatChange(){
  S.catId=q('sel-cat').value||null;
  if(!S.catId){
    q('sub-wrap').style.display='none';
    q('custom-sub-wrap').style.display='none';
    return;
  }
  const cat=CATS.find(c=>c.id===S.catId),sel=q('sel-sub');
  sel.innerHTML='<option value="">Selecionar...</option>';
  cat.subs.forEach(s=>{
    const o=document.createElement('option');
    o.value=s;
    o.textContent=s;
    sel.appendChild(o);
  });
  (S.customSubs[S.catId]||[]).forEach(s=>{
    const o=document.createElement('option');
    o.value=s;
    o.textContent=`${s} ✦`;
    sel.appendChild(o);
  });
  if(cat.outros){
    const o=document.createElement('option');
    o.value='__outros__';
    o.textContent='Outros...';
    sel.appendChild(o);
  }
  q('sub-wrap').style.display='';
  q('custom-sub-wrap').style.display='none';
}

function onSubChange(){
  const isO=q('sel-sub').value==='__outros__';
  q('custom-sub-wrap').style.display=isO?'':'none';
  if(isO)setTimeout(()=>q('inp-custom-sub').focus(),50);
}

function getSubFinal(){
  const v=q('sel-sub').value;
  return v==='__outros__'?q('inp-custom-sub').value.trim():v;
}

async function persistCustomSub(catId,nome){
  if(!nome||(S.customSubs[catId]||[]).includes(nome))return;
  if(!S.customSubs[catId])S.customSubs[catId]=[];
  S.customSubs[catId].push(nome);
  localStorage.setItem('customSubs',JSON.stringify(S.customSubs));
  if(S.user){
    await db.from('subcategorias_custom').upsert(
      {user_id:S.user.id,categoria:catId,nome},
      {onConflict:'user_id,categoria,nome'}
    );
  }
}

async function loadCustomSubs(){
  if(!S.user)return;
  const{data}=await db.from('subcategorias_custom').select('categoria,nome').eq('user_id',S.user.id);
  if(data){
    data.forEach(r=>{
      if(!S.customSubs[r.categoria])S.customSubs[r.categoria]=[];
      if(!S.customSubs[r.categoria].includes(r.nome))S.customSubs[r.categoria].push(r.nome);
    });
    localStorage.setItem('customSubs',JSON.stringify(S.customSubs));
  }
}

function buildLancamentoFromGasto(gasto,legacyId){
  return {
    user_id:gasto.user_id,
    tipo:'saida',
    proprietario_economico:gasto.dono==='mae'?'mae':'eu',
    contexto:gasto.dono==='mae'?'mae':(gasto.categoria==='Moradia'?'casa_atual':'pessoal'),
    descricao:gasto.subcategoria || gasto.categoria || (gasto.dono==='mae'?'Gasto Mae':'Gasto'),
    categoria:gasto.categoria,
    subcategoria:gasto.subcategoria,
    necessidade:gasto.necessidade,
    valor:gasto.valor,
    data_evento:gasto.data,
    forma_pagamento:gasto.forma_pagamento,
    banco_referencia:gasto.banco,
    observacoes:`Origem app: gastos; legado_id=${legacyId}; tipo_pagamento=${gasto.tipo_pagamento}`,
  };
}

function buildLancamentoFromEntrada(entrada,legacyId){
  return {
    user_id:entrada.user_id,
    tipo:'entrada',
    proprietario_economico:'eu',
    contexto:entrada.origem==='aluguel'?'casa_atual':'pessoal',
    descricao:
      entrada.origem==='transferencia'
        ? (entrada.origem_motivo || entrada.origem_de || 'Transferencia')
        : (entrada.origem==='outro' ? (entrada.origem_especificacao || 'Outro') : origemLabel(entrada.origem)),
    categoria:'Entradas',
    subcategoria:entrada.origem,
    valor:entrada.valor,
    data_evento:dateInputToMiddayIso(entrada.data),
    observacoes:[
      'Origem app: entradas',
      `legado_id=${legacyId}`,
      entrada.origem_de?`origem_de=${entrada.origem_de}`:'',
      entrada.origem_motivo?`origem_motivo=${entrada.origem_motivo}`:'',
      entrada.origem_especificacao?`origem_especificacao=${entrada.origem_especificacao}`:''
    ].filter(Boolean).join('; '),
  };
}

async function insertLancamento(lancamento){
  if(!S.user || !db) return;
  const { error } = await db.from('lancamentos').insert(lancamento);
  if(error) throw error;
}

async function getLinkedLancamentoIds(legacyId){
  if(!S.user || !db) return [];
  const ids=new Set();
  const direct=await db.from('lancamentos').select('id').eq('user_id',S.user.id).eq('id',legacyId);
  if(!direct.error && direct.data) direct.data.forEach(row=>ids.add(row.id));
  const linked=await db.from('lancamentos').select('id').eq('user_id',S.user.id).ilike('observacoes',`%legado_id=${legacyId}%`);
  if(!linked.error && linked.data) linked.data.forEach(row=>ids.add(row.id));
  return [...ids];
}

async function syncLinkedLancamentosForGasto(gasto,legacyId){
  const ids=await getLinkedLancamentoIds(legacyId);
  const payload=buildLancamentoFromGasto(gasto,legacyId);
  if(!ids.length){
    await insertLancamento(payload);
    return;
  }
  for(const id of ids){
    const { error } = await db.from('lancamentos').update(payload).eq('user_id',S.user.id).eq('id',id);
    if(error) throw error;
  }
}

async function syncLinkedLancamentosForEntrada(entrada,legacyId){
  const ids=await getLinkedLancamentoIds(legacyId);
  const payload=buildLancamentoFromEntrada(entrada,legacyId);
  if(!ids.length){
    await insertLancamento(payload);
    return;
  }
  for(const id of ids){
    const { error } = await db.from('lancamentos').update(payload).eq('user_id',S.user.id).eq('id',id);
    if(error) throw error;
  }
}

async function deleteLinkedLancamentos(legacyId){
  const ids=await getLinkedLancamentoIds(legacyId);
  if(!ids.length) return;
  const { error } = await db.from('lancamentos').delete().eq('user_id',S.user.id).in('id',ids);
  if(error) throw error;
}

async function salvarGasto(){
  if(!db || !(await ensureActiveSession())){toast('Entre novamente para salvar o gasto.','err');return;}
  if(!S.gastoCents){toast('Digite o valor','err');return;}
  const isEu=S.owner==='eu',sub=isEu?getSubFinal():null,isCustom=isEu&&q('sel-sub').value==='__outros__';
  if(isEu&&!S.catId){toast('Selecione uma categoria','err');return;}
  const btn=q('btn-salvar-gasto');
  btn.disabled=true;
  btn.textContent='Salvando...';
  try{
    let lancamentoWarning=false;
    if(isCustom&&sub)await persistCustomSub(S.catId,sub);
    const legacyId=newUuid();
    const gasto={
      id:legacyId,
      user_id:S.user?.id,
      dono:S.owner,
      valor:S.gastoCents/100,
      tipo_pagamento:S.parcela,
      forma_pagamento:q('sel-forma').value,
      banco:q('sel-banco').value,
      data:localDateTimeToIso(q('inp-data-gasto').value),
      categoria:isEu?CATS.find(c=>c.id===S.catId)?.nome:null,
      subcategoria:sub,
      necessidade:isEu?S.necessidade:null
    };
    if(S.user){
      const { error } = await db.from('gastos').insert(gasto);
      if(error) throw error;
      try{await syncLinkedLancamentosForGasto(gasto,legacyId);}
      catch{lancamentoWarning=true;}
    }else{
      enqueueOffline('gastos',gasto);
    }
    localStorage.setItem('gPresets',JSON.stringify({forma:q('sel-forma').value,banco:q('sel-banco').value}));
    toast(lancamentoWarning?'Gasto salvo, mas o resumo nao foi atualizado.':'Gasto salvo!',lancamentoWarning?'err':'ok');
    resetGastos();
    refreshDashboardIfVisible();
  }catch(ex){
    toast(`Nao foi possivel salvar o gasto.${ex?.message?` ${ex.message}`:''}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Salvar Gasto';
  }
}

function resetGastos(){
  S.gastoCents=0;
  S.necessidade=null;
  S.catId=null;
  S.parcela='a_vista';
  q('val-gasto-inp').value='';
  q('val-gasto-num').textContent='0,00';
  document.querySelectorAll('.p-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.p-btn[data-v="a_vista"]').classList.add('active');
  document.querySelectorAll('.nec-btn').forEach(b=>b.classList.remove('active'));
  q('sel-cat').value='';
  q('sub-wrap').style.display='none';
  q('custom-sub-wrap').style.display='none';
  setDates();
}

function setupEntradas(){
  q('sel-origem').addEventListener('change',()=>{
    const v=q('sel-origem').value;
    q('transf-fields').style.display=v==='transferencia'?'flex':'none';
    q('outro-field').style.display=v==='outro'?'':'none';
  });
  q('btn-salvar-entrada').addEventListener('click',salvarEntrada);
}

async function salvarParcelamentoAtivo(){
  if(!db || !(await ensureActiveSession())){toast('Entre novamente para salvar parcelamentos.','err');return;}
  const descricao=q('parc-descricao').value.trim();
  const proprietario=q('parc-owner').value;
  const contexto=q('parc-contexto').value;
  const categoria=q('parc-categoria').value || null;
  const necessidade=q('parc-necessidade').value ? Number(q('parc-necessidade').value) : null;
  const subcategoria=q('parc-subcategoria').value.trim() || null;
  const cartao=q('parc-cartao').value.trim();
  const totalParcelas=Number(q('parc-total').value||0);
  const parcelasPagas=Number(q('parc-pagas').value||0);
  const valorParcela=Number(q('parc-valor').value||0);
  const diaVencimento=q('parc-vencimento').value ? Number(q('parc-vencimento').value) : null;
  const dataCompra=monthInputToDate(q('parc-data-compra').value);
  const inicioCompetencia=monthInputToDate(q('parc-inicio').value);

  if(!descricao){toast('Descreva a compra parcelada.','err');return;}
  if(!totalParcelas || totalParcelas < 2){toast('Informe um total de parcelas valido.','err');return;}
  if(parcelasPagas < 0 || parcelasPagas >= totalParcelas){toast('Parcelas ja pagas devem ser menores que o total.','err');return;}
  if(!valorParcela || valorParcela <= 0){toast('Informe o valor da parcela.','err');return;}
  if(!dataCompra){toast('Informe o mes da compra.','err');return;}
  if(!inicioCompetencia){toast('Informe o mes da primeira parcela.','err');return;}
  if(contexto==='mae' && proprietario!=='mae'){toast('Para contexto Mae, selecione a compra como da sua mae.','err');return;}

  const btn=q('btn-salvar-parcelamento-ativo');
  btn.disabled=true;
  btn.textContent='Salvando...';
  try{
    const observacoes=cartao?`Cartao/referencia: ${cartao}`:null;
    const { error } = await db.rpc('criar_parcelamento_ativo_existente',{
      p_descricao:descricao,
      p_categoria:categoria,
      p_subcategoria:subcategoria,
      p_necessidade:necessidade,
      p_proprietario_economico:proprietario,
      p_contexto:contexto,
      p_total_parcelas:totalParcelas,
      p_parcelas_ja_pagas:parcelasPagas,
      p_valor_parcela_base:valorParcela,
      p_data_compra:dataCompra,
      p_inicio_competencia:inicioCompetencia,
      p_dia_vencimento:diaVencimento,
      p_observacoes:observacoes
    });
    if(error) throw error;
    toast('Parcelamento ativo salvo!','ok');
    resetParcelamentoAtivo();
  }catch(ex){
    const msg=ex?.message||'';
    if(msg.includes('criar_parcelamento_ativo_existente')){
      toast('Rode antes o SQL complementar de parcelamentos ativos no Supabase.','err');
    }else{
      toast(`Nao foi possivel salvar o parcelamento.${msg?` ${msg}`:''}`,'err');
    }
  }finally{
    btn.disabled=false;
    btn.textContent='Salvar Parcelamento Ativo';
  }
}

async function salvarEntrada(){
  if(!db || !(await ensureActiveSession())){toast('Entre novamente para salvar a entrada.','err');return;}
  if(!S.entradaCents){toast('Digite o valor','err');return;}
  const origem=q('sel-origem').value;
  const btn=q('btn-salvar-entrada');
  btn.disabled=true;
  btn.textContent='Salvando...';
  try{
    let lancamentoWarning=false;
    const legacyId=newUuid();
    const entrada={
      id:legacyId,
      user_id:S.user?.id,
      valor:S.entradaCents/100,
      origem,
      origem_de:origem==='transferencia'?q('inp-origem-de').value.trim():null,
      origem_motivo:origem==='transferencia'?q('inp-origem-motivo').value.trim():null,
      origem_especificacao:origem==='outro'?q('inp-origem-spec').value.trim():null,
      data:q('inp-data-entrada').value
    };
    if(S.user){
      const { error } = await db.from('entradas').insert(entrada);
      if(error) throw error;
      try{await syncLinkedLancamentosForEntrada(entrada,legacyId);}
      catch{lancamentoWarning=true;}
    }else{
      enqueueOffline('entradas',entrada);
    }
    toast(lancamentoWarning?'Entrada salva, mas o resumo nao foi atualizado.':'Entrada salva!',lancamentoWarning?'err':'ok');
    resetEntradas();
    refreshDashboardIfVisible();
  }catch(ex){
    toast(`Nao foi possivel salvar a entrada.${ex?.message?` ${ex.message}`:''}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Salvar Entrada';
  }
}

function resetEntradas(){
  S.entradaCents=0;
  q('val-entrada-inp').value='';
  q('val-entrada-num').textContent='0,00';
  q('sel-origem').value='pro_labore';
  q('transf-fields').style.display='none';
  q('outro-field').style.display='none';
  q('inp-origem-de').value='';
  q('inp-origem-motivo').value='';
  q('inp-origem-spec').value='';
  setDates();
}

function monthLabel(key){
  return new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}

function percentChange(current,previous){
  if(!previous && !current) return 'sem variacao';
  if(!previous) return '+100%';
  const delta=((current-previous)/previous)*100;
  const signal=delta>0?'+':'';
  return `${signal}${delta.toFixed(1).replace('.',',')}%`;
}

function aggregateDashboard(rows){
  const months={};
  rows.forEach(row=>{
    const key=row.mes_competencia;
    if(!months[key]) months[key]={entradas:0,saidas:0,categorias:{},necessidades:{}};
    const bucket=months[key];
    const value=Number(row.valor)||0;
    if(row.tipo==='entrada') bucket.entradas+=value;
    if(row.tipo==='saida'){
      bucket.saidas+=value;
      const cat=row.categoria || 'Sem categoria';
      bucket.categorias[cat]=(bucket.categorias[cat]||0)+value;
      if(row.necessidade) bucket.necessidades[row.necessidade]=(bucket.necessidades[row.necessidade]||0)+value;
    }
  });
  return months;
}

function aggregateOriginBreakdown(rows){
  const months={};
  rows.forEach(row=>{
    const key=row.mes_analisado;
    if(!key) return;
    months[key]={
      custo_herdado_mes:Number(row.custo_herdado_mes)||0,
      gasto_novo_no_mes:Number(row.gasto_novo_no_mes)||0,
      gasto_jogado_para_futuro_no_mes:Number(row.gasto_jogado_para_futuro_no_mes)||0,
      parcelamentos_ativos_mes:Number(row.parcelamentos_ativos_mes)||0,
    };
  });
  return months;
}

function renderBarList(containerId,items,tone=''){
  const el=q(containerId);
  if(!items.length){
    el.innerHTML='<div class="dash-empty">Sem dados suficientes neste periodo.</div>';
    return;
  }
  const max=Math.max(...items.map(item=>item.value),1);
  el.innerHTML=items.map(item=>`
    <div class="bar-row">
      <div class="bar-meta">
        <div class="bar-label">${item.label}</div>
        <div class="bar-value">${moneyBR(item.value)}${item.share!=null?` • ${item.share}%`:''}</div>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${tone}" style="width:${Math.max((item.value/max)*100,4)}%"></div>
      </div>
    </div>
  `).join('');
}

function renderDashboard(data,originData={}){
  const metricsEl=q('dashboard-metrics');
  const monthsEl=q('dashboard-months');
  const statusEl=q('dashboard-status');
  const subtitleEl=q('dashboard-subtitle');
  const keys=Object.keys(data).sort();

  if(!keys.length){
    metricsEl.innerHTML='<div class="summary-card wide"><div class="summary-note">Ainda nao existem lancamentos suficientes para montar o resumo.</div></div>';
    monthsEl.innerHTML='<div class="dash-empty">Cadastre novos gastos e entradas para alimentar o dashboard.</div>';
    renderBarList('dashboard-categories',[]);
    renderBarList('dashboard-needs',[],'sage');
    subtitleEl.textContent='Visao geral dos ultimos 6 meses';
    statusEl.textContent='Sem dados no periodo.';
    statusEl.className='dashboard-status';
    return;
  }

  const currentKey=keys[keys.length-1];
  const previousKey=keys[keys.length-2];
  const current=data[currentKey];
  const previous=previousKey?data[previousKey]:{entradas:0,saidas:0};
  const currentOrigin=originData[currentKey] || {
    custo_herdado_mes:0,
    gasto_novo_no_mes:current.saidas||0,
    gasto_jogado_para_futuro_no_mes:0,
    parcelamentos_ativos_mes:0,
  };
  const saldo=current.entradas-current.saidas;

  subtitleEl.textContent=`Mes atual: ${monthLabel(currentKey)}`;
  statusEl.textContent=currentOrigin.parcelamentos_ativos_mes
    ? `Resumo com ${currentOrigin.parcelamentos_ativos_mes} parcelamento(s) ativo(s) impactando o mes.`
    : 'Dados consolidados a partir de lancamentos.';
  statusEl.className='dashboard-status ok';

  metricsEl.innerHTML=`
    <div class="summary-card">
      <div class="summary-kicker">Entradas</div>
      <div class="summary-value pos">${moneyBR(current.entradas)}</div>
      <div class="summary-note">vs mes anterior: ${percentChange(current.entradas, previous.entradas)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Saidas</div>
      <div class="summary-value neg">${moneyBR(current.saidas)}</div>
      <div class="summary-note">vs mes anterior: ${percentChange(current.saidas, previous.saidas)}</div>
    </div>
    <div class="summary-card wide">
      <div class="summary-kicker">Saldo do mes</div>
      <div class="summary-value ${saldo>=0?'pos':'neg'}">${moneyBR(saldo)}</div>
      <div class="summary-note">Competencia ${monthLabel(currentKey)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Custo herdado</div>
      <div class="summary-value neg">${moneyBR(currentOrigin.custo_herdado_mes)}</div>
      <div class="summary-note">Parcelas de compras feitas em meses anteriores.</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Gasto novo no mes</div>
      <div class="summary-value neg">${moneyBR(currentOrigin.gasto_novo_no_mes)}</div>
      <div class="summary-note">Custos que nasceram e pesaram no proprio mes.</div>
    </div>
    <div class="summary-card wide">
      <div class="summary-kicker">Gasto jogado para o futuro</div>
      <div class="summary-value">${moneyBR(currentOrigin.gasto_jogado_para_futuro_no_mes)}</div>
      <div class="summary-note">Compromissos criados neste mes para competencias futuras.</div>
    </div>
  `;

  monthsEl.innerHTML=keys.slice(-6).reverse().map(key=>{
    const item=data[key];
    const balance=item.entradas-item.saidas;
    return `
      <div class="month-row">
        <div>
          <div class="month-name">${monthLabel(key)}</div>
          <div class="dash-card-sub">${moneyBR(item.entradas)} entradas • ${moneyBR(item.saidas)} saidas</div>
        </div>
        <div class="month-balance ${balance>=0?'pos':'neg'}">${moneyBR(balance)}</div>
      </div>
    `;
  }).join('');

  const totalSaidas=current.saidas || 0;
  const categoryItems=Object.entries(current.categorias)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,6)
    .map(([label,value])=>({
      label,
      value,
      share:totalSaidas?Math.round((value/totalSaidas)*100):null
    }));
  renderBarList('dashboard-categories',categoryItems);

  const needLabels={1:'Vital',2:'Basico',3:'Superfluo',4:'Bobagem'};
  const needItems=Object.entries(current.necessidades)
    .sort((a,b)=>Number(a[0])-Number(b[0]))
    .map(([key,value])=>({
      label:needLabels[key]||`Nivel ${key}`,
      value,
      share:totalSaidas?Math.round((value/totalSaidas)*100):null
    }));
  renderBarList('dashboard-needs',needItems,'sage');
}

async function refreshDashboard(){
  const statusEl=q('dashboard-status');
  if(!statusEl) return;
  if(!db || !(await ensureActiveSession())){
    statusEl.textContent='Entre no app para carregar o resumo.';
    statusEl.className='dashboard-status err';
    return;
  }
  statusEl.textContent='Atualizando resumo...';
  statusEl.className='dashboard-status';
  try{
    const now=new Date();
    const from=new Date(now.getFullYear(),now.getMonth()-5,1);
    const fromKey=`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-01`;
    const [baseRes,originRes] = await Promise.all([
      db
        .from('lancamentos')
        .select('mes_competencia,tipo,valor,categoria,necessidade')
        .eq('user_id',S.user.id)
        .gte('mes_competencia',fromKey)
        .order('mes_competencia',{ascending:true}),
      db
        .from('v_gastos_origem_competencia')
        .select('mes_analisado,gasto_novo_no_mes,custo_herdado_mes,gasto_jogado_para_futuro_no_mes,parcelamentos_ativos_mes')
        .eq('user_id',S.user.id)
        .gte('mes_analisado',fromKey)
        .order('mes_analisado',{ascending:true})
    ]);
    if(baseRes.error) throw baseRes.error;
    if(originRes.error) throw originRes.error;
    renderDashboard(
      aggregateDashboard(baseRes.data || []),
      aggregateOriginBreakdown(originRes.data || [])
    );
  }catch(_ex){
    statusEl.textContent='Nao foi possivel carregar o dashboard.';
    statusEl.className='dashboard-status err';
  }
}

function refreshDashboardIfVisible(){
  const tab=q('tab-dashboard');
  if(tab && tab.classList.contains('active')) refreshDashboard();
}

async function openList(tab){
  if(!db || !(await ensureActiveSession())){
    toast('Entre novamente para abrir seus registros.','err');
    return;
  }
  const listEl=q('sheet-list'),titleEl=q('sheet-title');
  listEl.innerHTML='<div class="empty-state"><div class="empty-state-icon">⏳</div><p>Carregando...</p></div>';
  titleEl.textContent=tab==='gastos'?'Meus Gastos':'Minhas Entradas';
  q('list-overlay').classList.add('show');
  q('list-sheet').classList.add('show');
  try{
    let items=[];
    let error=null;
    if(tab==='gastos'){
      const res=await db.from('gastos').select('*').eq('user_id',S.user.id).order('data',{ascending:false}).limit(150);
      items=res.data||[];
      error=res.error;
    }else{
      const res=await db.from('entradas').select('*').eq('user_id',S.user.id).order('data',{ascending:false}).limit(150);
      items=res.data||[];
      error=res.error;
    }
    if(error) throw error;
    if(!items.length){
      listEl.innerHTML='<div class="empty-state"><div class="empty-state-icon">🔍</div><p>Nenhum registro ainda</p></div>';
      return;
    }
    const groups={};
    items.forEach(item=>{
      const rawDate=(item.data || item.created_at || '').slice(0,10);
      const d=rawDate || 'sem-data';
      if(!groups[d])groups[d]=[];
      groups[d].push(item);
    });
    listEl.innerHTML='';
    Object.entries(groups).forEach(([date,records])=>{
      const dh=document.createElement('div');
      dh.className='day-header';
      dh.textContent=date==='sem-data'?'Sem data':formatDay(date);
      listEl.appendChild(dh);
      records.forEach(rec=>{
        const el=document.createElement('div');
        el.className='list-item';
        const isG=tab==='gastos';
        const catId=isG?CATS.find(c=>c.nome===rec.categoria)?.id:null;
        const icon=isG?(CAT_ICONS[catId]||'💸'):'💰';
        const title=isG?(rec.subcategoria||rec.categoria||(rec.dono==='mae'?'Gasto Mae':'Gasto')):origemLabel(rec.origem);
        const sub=isG?(rec.dono==='mae'?'Minha Mae':rec.categoria||''):(rec.origem_de||rec.origem_especificacao||'');
        const val='R$ '+Number(rec.valor).toLocaleString('pt-BR',{minimumFractionDigits:2});
        el.innerHTML=`
          <div class="list-item-icon ${isG?'terra':'sage'}">${icon}</div>
          <div class="list-item-info">
            <div class="list-item-title">${title}</div>
            ${sub?`<div class="list-item-sub">${sub}</div>`:''}
          </div>
          <div class="list-item-val ${isG?'neg':'pos'}">${val}</div>`;
        el.addEventListener('click',()=>openDetail(rec,tab));
        listEl.appendChild(el);
      });
    });
  }catch(ex){
    listEl.innerHTML=`<div class="empty-state"><div class="empty-state-icon">!</div><p>Erro ao carregar registros.</p><p style="font-size:12px">${ex?.message||''}</p></div>`;
  }
}

function openDetail(rec,tab){
  S.detailRecord=rec;
  S.detailTab=tab;
  const isG=tab==='gastos';
  const catId=isG?CATS.find(c=>c.nome===rec.categoria)?.id:null;
  const icon=isG?(CAT_ICONS[catId]||'💸'):'💰';
  const di=q('detail-icon');
  di.textContent=icon;
  di.style.background=isG?'#FAE8E1':'#E3EEE2';
  q('detail-title').textContent=isG?(rec.categoria||'Gasto'):origemLabel(rec.origem);
  const rows=[['Valor','R$ '+rec.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})]];
  if(isG){
    if(rec.dono==='mae')rows.push(['Quem','Minha Mae']);
    if(rec.subcategoria)rows.push(['Subcategoria',rec.subcategoria]);
    rows.push(['Pagamento',rec.tipo_pagamento==='a_vista'?'A vista':rec.tipo_pagamento]);
    rows.push(['Forma',fmtForma(rec.forma_pagamento)]);
    rows.push(['Banco',rec.banco]);
    if(rec.necessidade)rows.push(['Necessidade',['','Vital','Basico','Superfluo','Bobagem'][rec.necessidade]]);
  }else{
    if(rec.origem_de)rows.push(['De quem',rec.origem_de]);
    if(rec.origem_motivo)rows.push(['Motivo',rec.origem_motivo]);
    if(rec.origem_especificacao)rows.push(['Especificacao',rec.origem_especificacao]);
  }
  rows.push(['Data',formatDateTime(rec.data)]);
  q('detail-rows').innerHTML=rows.map(([k,v])=>`<div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('');
  q('detail-actions').style.display=(tab==='gastos'||tab==='entradas')?'flex':'none';
  q('detail-edit').style.display=tab==='gastos'?'':'none';
  q('detail-delete').textContent=tab==='gastos'?'Excluir gasto':'Excluir entrada';
  q('detail-overlay').classList.add('show');
}

function buildEditCategoryOptions(selected){
  q('edit-gasto-categoria').innerHTML=[
    '<option value="">Selecionar...</option>',
    ...CATS.map(cat=>`<option value="${cat.nome}" ${cat.nome===selected?'selected':''}>${cat.nome}</option>`)
  ].join('');
}

function openEditGasto(){
  const rec=S.detailRecord;
  if(!rec || S.detailTab!=='gastos') return;
  buildEditCategoryOptions(rec.categoria || '');
  q('edit-gasto-valor').value=Number(rec.valor).toFixed(2);
  q('edit-gasto-data').value=isoToDatetimeLocal(rec.data);
  q('edit-gasto-subcategoria').value=rec.subcategoria || '';
  q('edit-gasto-necessidade').value=rec.necessidade || '';
  q('edit-overlay').classList.add('show');
}

function closeEditGasto(){
  q('edit-overlay').classList.remove('show');
}

async function saveEditedGasto(){
  const rec=S.detailRecord;
  if(!rec || S.detailTab!=='gastos') return;
  if(!db || !(await ensureActiveSession())){toast('Entre novamente para editar o gasto.','err');return;}
  const btn=q('edit-save');
  btn.disabled=true;
  btn.textContent='Salvando...';
  const updated={
    valor:Number(q('edit-gasto-valor').value || 0),
    data:localDateTimeToIso(q('edit-gasto-data').value),
    categoria:q('edit-gasto-categoria').value || null,
    subcategoria:q('edit-gasto-subcategoria').value.trim() || null,
    necessidade:q('edit-gasto-necessidade').value ? Number(q('edit-gasto-necessidade').value) : null,
  };
  try{
    const { error } = await db.from('gastos').update(updated).eq('user_id',S.user.id).eq('id',rec.id);
    if(error) throw error;
    const merged={...rec,...updated};
    await syncLinkedLancamentosForGasto(merged,rec.id);
    S.detailRecord=merged;
    closeEditGasto();
    q('detail-overlay').classList.remove('show');
    toast('Gasto atualizado!','ok');
    refreshDashboardIfVisible();
  }catch(ex){
    toast(`Nao foi possivel atualizar o gasto.${ex?.message?` ${ex.message}`:''}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Salvar alteracoes';
  }
}

async function deleteCurrentRecord(){
  const rec=S.detailRecord;
  const tab=S.detailTab;
  if(!rec || !tab) return;
  if(!db || !(await ensureActiveSession())){toast('Entre novamente para excluir o registro.','err');return;}
  const label=tab==='gastos'?'gasto':'entrada';
  if(!confirm(`Deseja excluir este ${label}?`)) return;
  try{
    if(tab==='gastos'){
      const { error } = await db.from('gastos').delete().eq('user_id',S.user.id).eq('id',rec.id);
      if(error) throw error;
      await deleteLinkedLancamentos(rec.id);
    }else{
      const { error } = await db.from('entradas').delete().eq('user_id',S.user.id).eq('id',rec.id);
      if(error) throw error;
      await deleteLinkedLancamentos(rec.id);
    }
    q('detail-overlay').classList.remove('show');
    closeList();
    toast(`${tab==='gastos'?'Gasto':'Entrada'} excluido!`,'ok');
    refreshDashboardIfVisible();
  }catch(ex){
    toast(`Nao foi possivel excluir o registro.${ex?.message?` ${ex.message}`:''}`,'err');
  }
}

q('sheet-close').addEventListener('click',closeList);
q('list-overlay').addEventListener('click',closeList);
q('detail-close').addEventListener('click',()=>q('detail-overlay').classList.remove('show'));
q('detail-edit').addEventListener('click',openEditGasto);
q('detail-delete').addEventListener('click',deleteCurrentRecord);
q('detail-overlay').addEventListener('click',e=>{
  if(e.target===q('detail-overlay'))q('detail-overlay').classList.remove('show');
});
q('edit-cancel').addEventListener('click',closeEditGasto);
q('edit-save').addEventListener('click',saveEditedGasto);
q('edit-overlay').addEventListener('click',e=>{
  if(e.target===q('edit-overlay')) closeEditGasto();
});

function closeList(){
  q('list-overlay').classList.remove('show');
  q('list-sheet').classList.remove('show');
}

function enqueueOffline(tabela,dados){
  S.offlineQ.push({tabela,dados,ts:Date.now()});
  localStorage.setItem('offlineQ',JSON.stringify(S.offlineQ));
}

function toast(msg,tipo=''){
  const el=q('toast');
  el.textContent=msg;
  el.className=`toast show ${tipo}`;
  clearTimeout(_tt);
  _tt=setTimeout(()=>{el.className='toast';},2800);
}

function formatDay(iso){
  const hoje=new Date().toISOString().slice(0,10);
  const ontem=new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(iso===hoje)return'Hoje';
  if(iso===ontem)return'Ontem';
  return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'});
}

function formatDateTime(iso){
  if(!iso)return'';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('pt-BR')+(iso.includes('T')?' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'');
}

function origemLabel(o){
  return{
    pro_labore:'Pro-labore',
    adiantamento_lucros:'Adiantamento de lucros',
    bonus:'Bonus',
    reembolso:'Reembolso',
    aluguel:'Aluguel',
    transferencia:'Transferencia',
    outro:'Outro'
  }[o]||o;
}

function fmtForma(f){
  return{
    credito:'Credito',
    conta_corrente:'Conta corrente',
    transferencia:'Transferencia'
  }[f]||f;
}
