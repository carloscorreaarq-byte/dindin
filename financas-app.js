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
      await loadCasaAtualConfig();
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
      await loadCasaAtualConfig();
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
  setupCasaAtual();
  setupAlya();
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

function cacheKeyForUser(baseKey){
  return `${baseKey}:${S.user?.id || 'anon'}`;
}

function writeCache(baseKey,value){
  try{
    localStorage.setItem(cacheKeyForUser(baseKey),JSON.stringify(value));
  }catch{}
}

function readCache(baseKey,fallback=null){
  try{
    const raw=localStorage.getItem(cacheKeyForUser(baseKey));
    return raw?JSON.parse(raw):fallback;
  }catch{
    return fallback;
  }
}

async function withTimeout(promise,ms,label='operacao'){
  let handle;
  const timeout=new Promise((_,reject)=>{
    handle=setTimeout(()=>reject(new Error(`Tempo esgotado ao acessar ${label}.`)),ms);
  });
  try{
    return await Promise.race([promise,timeout]);
  }finally{
    clearTimeout(handle);
  }
}

function currentMonthStart(){
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
}

function normalizeMonthStart(value){
  if(!value) return null;
  const text=String(value);
  if(/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text.slice(0,7)}-01`;
  return null;
}

function normalizeCasaAtualConfig(raw){
  const valor=Number(raw?.valor_mensal_fixo ?? raw?.valorMensalFixo ?? 0);
  const normalized={
    descricao:(raw?.descricao || 'Media da sublocacao atual').toString().trim() || 'Media da sublocacao atual',
    valor_mensal_fixo:Number.isFinite(valor) && valor > 0 ? Number(valor.toFixed(2)) : null,
    inicio_vigencia:normalizeMonthStart(raw?.inicio_vigencia || raw?.inicioVigencia),
    ativo:Boolean((raw?.ativo ?? true) && Number.isFinite(valor) && valor > 0),
  };
  if(!normalized.inicio_vigencia && normalized.ativo){
    normalized.inicio_vigencia=currentMonthStart();
  }
  return normalized;
}

function getCasaAtualConfig(){
  return normalizeCasaAtualConfig(readCache(CASA_ATUAL_CONFIG_KEY,{}));
}

function setCasaAtualConfigLocal(config){
  const normalized=normalizeCasaAtualConfig(config);
  writeCache(CASA_ATUAL_CONFIG_KEY,normalized);
  S.casaAtualConfig=normalized;
  return normalized;
}

async function loadCasaAtualConfig(){
  const local=getCasaAtualConfig();
  S.casaAtualConfig=local;
  if(!db || !S.user) return local;
  try{
    const res=await withTimeout(
      db
        .from('contratos_sublocacao')
        .select('descricao,valor_mensal_fixo,inicio_vigencia,ativo')
        .eq('user_id',S.user.id)
        .eq('ativo',true)
        .order('inicio_vigencia',{ascending:false})
        .limit(1),
      8000,
      'configuracao da casa atual'
    );
    if(!res.error && (res.data||[]).length){
      return setCasaAtualConfigLocal(res.data[0]);
    }
  }catch{}
  return local;
}

async function persistCasaAtualConfig(config){
  const normalized=setCasaAtualConfigLocal(config);
  if(!db || !S.user) return { remote:false, config:normalized };
  try{
    const disable=await withTimeout(
      db.from('contratos_sublocacao').update({ativo:false}).eq('user_id',S.user.id).eq('ativo',true),
      8000,
      'desativacao da sublocacao anterior'
    );
    if(disable.error) throw disable.error;
    if(normalized.ativo && normalized.valor_mensal_fixo){
      const insert=await withTimeout(
        db.from('contratos_sublocacao').insert({
          user_id:S.user.id,
          descricao:normalized.descricao,
          valor_mensal_fixo:normalized.valor_mensal_fixo,
          inicio_vigencia:normalized.inicio_vigencia || currentMonthStart(),
          ativo:true,
        }),
        8000,
        'salvamento da sublocacao'
      );
      if(insert.error) throw insert.error;
    }
    return { remote:true, config:normalized };
  }catch{
    return { remote:false, config:normalized };
  }
}

function openCasaAtualConfig(){
  const config=S.casaAtualConfig || getCasaAtualConfig();
  q('casa-descricao').value=config.descricao || 'Media da sublocacao atual';
  q('casa-valor-fixo').value=config.valor_mensal_fixo ? Number(config.valor_mensal_fixo).toFixed(2) : '';
  q('casa-inicio-vigencia').value=config.inicio_vigencia ? config.inicio_vigencia.slice(0,7) : '';
  q('casa-overlay').classList.add('show');
}

function closeCasaAtualConfig(){
  q('casa-overlay').classList.remove('show');
}

async function saveCasaAtualConfig(){
  const btn=q('casa-salvar');
  btn.disabled=true;
  btn.textContent='Salvando...';
  try{
    const valor=Number(q('casa-valor-fixo').value||0);
    const config={
      descricao:q('casa-descricao').value.trim() || 'Media da sublocacao atual',
      valor_mensal_fixo:valor > 0 ? valor : null,
      inicio_vigencia:normalizeMonthStart(q('casa-inicio-vigencia').value) || currentMonthStart(),
      ativo:valor > 0,
    };
    const result=await persistCasaAtualConfig(config);
    closeCasaAtualConfig();
    toast(
      result.remote ? 'Media de sublocacao salva!' : 'Media salva neste dispositivo.',
      'ok'
    );
    refreshDashboardIfVisible();
  }catch(ex){
    toast(`Nao foi possivel salvar a media da sublocacao.${ex?.message?` ${ex.message}`:''}`,'err');
  }finally{
    btn.disabled=false;
    btn.textContent='Salvar media';
  }
}

function setupCasaAtual(){
  if(!q('btn-casa-config')) return;
  q('btn-casa-config').addEventListener('click',openCasaAtualConfig);
  q('casa-cancelar').addEventListener('click',closeCasaAtualConfig);
  q('casa-overlay').addEventListener('click',e=>{
    if(e.target===q('casa-overlay')) closeCasaAtualConfig();
  });
  q('casa-salvar').addEventListener('click',saveCasaAtualConfig);
}

const ALYA_CONSTRUTORA_BLOCOS = new Set(['entrada','mensal','anual','reforco','intermediaria']);
const ALYA_REFORCO_BLOCOS = new Set(['reforco','anual','intermediaria']);
const ALYA_REAJUSTE_BLOCOS = new Set(['mensal','anual','reforco','financiamento','intermediaria']);

function alyaSegmento(bloco){
  return bloco==='financiamento' ? 'financiamento' : 'construtora';
}

function alyaBlocoLabel(bloco){
  const labels={
    entrada:'Entrada',
    mensal:'Mensal',
    anual:'Anual',
    reforco:'Reforco',
    financiamento:'Financiamento',
    intermediaria:'Intermediaria',
  };
  return labels[bloco] || bloco || 'Evento';
}

function addPeriodToDate(dateText,frequency,step){
  const date=new Date(`${dateText}T12:00:00`);
  if(Number.isNaN(date.getTime())) return null;
  if(frequency==='mensal') date.setMonth(date.getMonth()+step);
  else if(frequency==='anual') date.setFullYear(date.getFullYear()+step);
  return date.toISOString().slice(0,10);
}

function moneyInput(id){
  return Number(q(id)?.value || 0);
}

function alyaEffectiveValue(item){
  return Number(item?.valor_atual ?? item?.valor_base ?? 0) || 0;
}

async function ensureAlyaEmpreendimento(){
  if(!db || !(await ensureActiveSession())) throw new Error('Entre novamente para acessar o Alya.');
  const existing=await withTimeout(
    db.from('empreendimentos').select('id,nome,unidade,ativo').eq('user_id',S.user.id).eq('ativo',true).order('created_at',{ascending:false}).limit(1),
    12000,
    'empreendimento Alya'
  );
  if(existing.error) throw existing.error;
  if((existing.data||[]).length) return existing.data[0];
  const payload={
    user_id:S.user.id,
    nome:'Alya Paraiso',
    unidade:'Unid 122',
    ativo:true,
  };
  const created=await withTimeout(
    db.from('empreendimentos').insert(payload).select('id,nome,unidade,ativo').single(),
    12000,
    'criacao do empreendimento Alya'
  );
  if(created.error) throw created.error;
  return created.data;
}

function setAlyaFormVisibility(targetId){
  ['alya-base-form','alya-payment-form','alya-history-form'].forEach(id=>{
    const el=q(id);
    if(el) el.classList.toggle('hidden',id!==targetId || !targetId);
  });
}

function fillAlyaPaymentSelects(flow){
  const openItems=(flow||[])
    .filter(item=>item.status!=='pago' && item.status!=='cancelado')
    .sort((a,b)=>String(a.data_vencimento_base).localeCompare(String(b.data_vencimento_base)));

  const renderOptions=(items,placeholder)=>[
    `<option value="">${placeholder}</option>`,
    ...items.map(item=>`<option value="${item.id}">${alyaBlocoLabel(item.bloco)} • ${item.data_vencimento_base} • ${moneyBR(alyaEffectiveValue(item))}</option>`)
  ].join('');

  q('alya-payment-item').innerHTML=renderOptions(openItems,'Selecionar evento em aberto...');
  q('alya-history-item').innerHTML=renderOptions(openItems,'Selecionar evento antigo em aberto...');
}

function aggregateAlyaPanel(flow,pagamentos){
  const paidMap=new Map((pagamentos||[]).map(item=>[item.alya_fluxo_base_id,item]));
  let totalPago=0;
  let abertas=0;
  let pagas=0;
  let saldoConstrutora=0;
  let saldoFinanciamento=0;
  let nextReforco=null;

  (pagamentos||[]).forEach(item=>{
    totalPago += Number(item.valor_pago)||0;
  });

  (flow||[]).forEach(item=>{
    const value=alyaEffectiveValue(item);
    if(item.status==='pago'){
      pagas += 1;
    }else if(item.status!=='cancelado'){
      abertas += 1;
      if(alyaSegmento(item.bloco)==='financiamento') saldoFinanciamento += value;
      else saldoConstrutora += value;
      if(ALYA_REFORCO_BLOCOS.has(item.bloco)){
        if(!nextReforco || String(item.data_vencimento_base) < String(nextReforco.data_vencimento_base)){
          nextReforco=item;
        }
      }
    }
    if(item.status==='pago' && !paidMap.has(item.id)){
      totalPago += value;
    }
  });

  return {
    totalPago,
    saldoConstrutora,
    saldoFinanciamento,
    saldoTotal:saldoConstrutora+saldoFinanciamento,
    abertas,
    pagas,
    nextReforco,
  };
}

function renderAlyaPanel(summary,flow,empreendimento){
  const statusEl=q('alya-status');
  const metricsEl=q('alya-metrics');
  const nextEl=q('alya-next-reforco');
  const segEl=q('alya-segments');
  if(!statusEl || !metricsEl || !nextEl || !segEl) return;

  if(!empreendimento){
    statusEl.textContent='Cadastre o fluxo base do Alya para iniciar o painel.';
    statusEl.className='dashboard-status';
    metricsEl.innerHTML='<div class="summary-card wide"><div class="summary-note">Quando voce salvar o primeiro bloco do fluxo contratual, o painel Alya passa a consolidar saldo, parcelas e marcos futuros.</div></div>';
    nextEl.innerHTML='<div class="dash-empty">Sem reforcos cadastrados ainda.</div>';
    segEl.innerHTML='<div class="dash-empty">Sem saldo consolidado enquanto o fluxo base nao for cadastrado.</div>';
    return;
  }

  statusEl.textContent=summary.abertas
    ? `${empreendimento.nome} ${empreendimento.unidade ? `• ${empreendimento.unidade}` : ''} com ${summary.abertas} evento(s) em aberto.`
    : `${empreendimento.nome} ${empreendimento.unidade ? `• ${empreendimento.unidade}` : ''} sem eventos em aberto no momento.`;
  statusEl.className='dashboard-status ok';

  metricsEl.innerHTML=`
    <div class="summary-card">
      <div class="summary-kicker">Total pago</div>
      <div class="summary-value pos">${moneyBR(summary.totalPago)}</div>
      <div class="summary-note">Tudo que ja foi marcado como pago.</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Parcelas em aberto</div>
      <div class="summary-value">${summary.abertas}</div>
      <div class="summary-note">Eventos ainda pendentes no fluxo.</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Eventos pagos</div>
      <div class="summary-value">${summary.pagas}</div>
      <div class="summary-note">Eventos ja quitados no contrato.</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Saldo construtora</div>
      <div class="summary-value neg">${moneyBR(summary.saldoConstrutora)}</div>
      <div class="summary-note">Mensais, reforcos, anuais e demais parcelas da construtora.</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Saldo financiamento</div>
      <div class="summary-value neg">${moneyBR(summary.saldoFinanciamento)}</div>
      <div class="summary-note">Segmento separado do saldo da construtora.</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Saldo total</div>
      <div class="summary-value neg">${moneyBR(summary.saldoTotal)}</div>
      <div class="summary-note">Construtora + financiamento.</div>
    </div>
  `;

  if(summary.nextReforco){
    nextEl.innerHTML=`
      <div class="next-highlight">
        <div>
          <div class="next-highlight-kicker">${alyaBlocoLabel(summary.nextReforco.bloco)}</div>
          <div class="next-highlight-value">${moneyBR(alyaEffectiveValue(summary.nextReforco))}</div>
          <div class="dash-card-subline">${summary.nextReforco.descricao || 'Parcela extra em aberto'}</div>
        </div>
        <div style="text-align:right">
          <div class="next-highlight-date">${dateBR(summary.nextReforco.data_vencimento_base)}</div>
          <div class="dash-card-subline">Proximo marco extra</div>
        </div>
      </div>
    `;
  }else{
    nextEl.innerHTML='<div class="dash-empty">Nenhuma parcela de reforco em aberto encontrada.</div>';
  }

  segEl.innerHTML=`
    <div class="seg-row">
      <div>
        <div class="seg-name">Construtora</div>
        <div class="seg-sub">Mensais, reforcos, anuais, entrada e intermediarias abertas.</div>
      </div>
      <div class="seg-val neg">${moneyBR(summary.saldoConstrutora)}</div>
    </div>
    <div class="seg-row">
      <div>
        <div class="seg-name">Financiamento</div>
        <div class="seg-sub">Saldo visivel separadamente no painel.</div>
      </div>
      <div class="seg-val neg">${moneyBR(summary.saldoFinanciamento)}</div>
    </div>
    <div class="seg-row">
      <div>
        <div class="seg-name">Total em aberto</div>
        <div class="seg-sub">${summary.abertas} parcela(s) / evento(s) ainda pendentes.</div>
      </div>
      <div class="seg-val neg">${moneyBR(summary.saldoTotal)}</div>
    </div>
  `;

  fillAlyaPaymentSelects(flow||[]);
}

async function refreshAlyaDashboard(){
  const statusEl=q('alya-status');
  if(!statusEl) return;
  if(!db || !(await ensureActiveSession())){
    statusEl.textContent='Entre no app para carregar o painel do Alya.';
    statusEl.className='dashboard-status err';
    return;
  }
  statusEl.textContent='Atualizando painel Alya...';
  statusEl.className='dashboard-status';
  try{
    const empreendimentoRes=await withTimeout(
      db.from('empreendimentos').select('id,nome,unidade,ativo').eq('user_id',S.user.id).eq('ativo',true).order('created_at',{ascending:false}).limit(1),
      12000,
      'empreendimento Alya'
    );
    if(empreendimentoRes.error) throw empreendimentoRes.error;
    const empreendimento=(empreendimentoRes.data||[])[0] || null;
    if(!empreendimento){
      renderAlyaPanel({totalPago:0,saldoConstrutora:0,saldoFinanciamento:0,saldoTotal:0,abertas:0,pagas:0,nextReforco:null},[],null);
      writeCache(ALYA_CACHE_KEY,{flow:[],pagamentos:[],empreendimento:null});
      return;
    }

    const [flowRes,pagRes]=await Promise.all([
      withTimeout(
        db.from('alya_fluxo_base').select('*').eq('user_id',S.user.id).eq('empreendimento_id',empreendimento.id).order('data_vencimento_base',{ascending:true}).order('ordem',{ascending:true}),
        12000,
        'fluxo Alya'
      ),
      withTimeout(
        db.from('alya_pagamentos').select('*').eq('user_id',S.user.id).eq('empreendimento_id',empreendimento.id).order('data_pagamento',{ascending:false}),
        12000,
        'pagamentos Alya'
      )
    ]);
    if(flowRes.error) throw flowRes.error;
    if(pagRes.error) throw pagRes.error;

    const flow=flowRes.data||[];
    const pagamentos=pagRes.data||[];
    renderAlyaPanel(aggregateAlyaPanel(flow,pagamentos),flow,empreendimento);
    writeCache(ALYA_CACHE_KEY,{flow,pagamentos,empreendimento});
  }catch(ex){
    const cached=readCache(ALYA_CACHE_KEY,null);
    if(cached){
      renderAlyaPanel(
        aggregateAlyaPanel(cached.flow||[],cached.pagamentos||[]),
        cached.flow||[],
        cached.empreendimento||null
      );
      statusEl.textContent='Mostrando o ultimo painel Alya salvo neste dispositivo.';
      statusEl.className='dashboard-status err';
      return;
    }
    const msg=ex?.message||'';
    statusEl.textContent=(msg.includes('empreendimentos') || msg.includes('alya_fluxo_base') || msg.includes('alya_pagamentos'))
      ? 'Aplique primeiro o SQL da Fase 4 do Alya para habilitar este modulo.'
      : 'Nao foi possivel carregar o Alya.';
    statusEl.className='dashboard-status err';
  }
}

function refreshAlyaIfVisible(){
  const tab=q('tab-investimentos');
  if(tab && tab.classList.contains('active')) refreshAlyaDashboard();
}

async function saveAlyaBaseFlow(){
  if(!db || !(await ensureActiveSession())){toast('Entre novamente para salvar o fluxo do Alya.','err');return;}
  const descricao=q('alya-base-descricao').value.trim();
  const bloco=q('alya-base-bloco').value;
  const frequencia=q('alya-base-frequencia').value;
  const dataBase=q('alya-base-data').value;
  const quantidade=Number(q('alya-base-quantidade').value||0) || 1;
  const valorBase=moneyInput('alya-base-valor');
  const ordemInicial=Number(q('alya-base-ordem').value||0) || 1;
  if(!descricao){toast('Descreva o bloco do Alya.','err');return;}
  if(!dataBase){toast('Informe o primeiro vencimento.','err');return;}
  if(!valorBase || valorBase <= 0){toast('Informe o valor base.','err');return;}
  if(!quantidade || quantidade < 1){toast('Informe a quantidade de eventos.','err');return;}

  const btn=q('btn-alya-salvar-base');
  btn.disabled=true;
  btn.textContent='Salvando...';
  try{
    const empreendimento=await ensureAlyaEmpreendimento();
    const rows=[];
    for(let i=0;i<quantidade;i++){
      rows.push({
        id:newUuid(),
        user_id:S.user.id,
        empreendimento_id:empreendimento.id,
        bloco,
        descricao:quantidade > 1 ? `${descricao} ${i+1}/${quantidade}` : descricao,
        ordem:ordemInicial + i,
        data_vencimento_base:addPeriodToDate(dataBase,frequencia,i) || dataBase,
        valor_base:Number(valorBase.toFixed(2)),
        valor_atual:Number(valorBase.toFixed(2)),
        status:'aberto',
      });
    }
    const res=await withTimeout(
      db.from('alya_fluxo_base').insert(rows),
      12000,
      'salvamento do fluxo base do Alya'
    );
    if(res.error) throw res.error;
    toast('Fluxo base do Alya salvo!','ok');
    q('alya-base-descricao').value='';
    q('alya-base-data').value='';
    q('alya-base-quantidade').value='';
    q('alya-base-valor').value='';
    q('alya-base-ordem').value='';
    setAlyaFormVisibility(null);
    refreshAlyaIfVisible();
  }catch(ex){
    const msg=ex?.message||'';
    if(msg.includes('empreendimentos') || msg.includes('alya_fluxo_base') || msg.includes('alya_pagamentos')){
      toast('Rode antes o SQL da Fase 4 do Alya no Supabase.','err');
    }else{
      toast(`Nao foi possivel salvar o fluxo do Alya.${msg?` ${msg}`:''}`,'err');
    }
  }finally{
    btn.disabled=false;
    btn.textContent='Salvar fluxo base';
  }
}

async function applyAlyaPayment(itemId,date,value,notes,isHistoric=false){
  if(!db || !(await ensureActiveSession())) throw new Error('Entre novamente para salvar o pagamento.');
  const empreendimento=await ensureAlyaEmpreendimento();
  const flowRes=await withTimeout(
    db.from('alya_fluxo_base').select('*').eq('user_id',S.user.id).eq('empreendimento_id',empreendimento.id).order('data_vencimento_base',{ascending:true}).order('ordem',{ascending:true}),
    12000,
    'leitura do fluxo Alya'
  );
  if(flowRes.error) throw flowRes.error;
  const flow=flowRes.data||[];
  const current=flow.find(item=>item.id===itemId);
  if(!current) throw new Error('Evento do Alya nao encontrado.');

  const paymentPayload={
    id:newUuid(),
    user_id:S.user.id,
    empreendimento_id:empreendimento.id,
    alya_fluxo_base_id:current.id,
    data_pagamento:date,
    valor_pago:Number(value.toFixed(2)),
    observacoes:isHistoric ? `Historico antigo. ${notes || ''}`.trim() : (notes || null),
  };
  const payRes=await withTimeout(
    db.from('alya_pagamentos').insert(paymentPayload),
    12000,
    'registro de pagamento Alya'
  );
  if(payRes.error) throw payRes.error;

  const currentUpdate=await withTimeout(
    db.from('alya_fluxo_base').update({
      status:'pago',
      valor_atual:Number(value.toFixed(2)),
    }).eq('user_id',S.user.id).eq('id',current.id),
    12000,
    'fechamento do evento pago'
  );
  if(currentUpdate.error) throw currentUpdate.error;

  if(current.bloco==='mensal'){
    const previousPaid=flow
      .filter(item=>item.bloco==='mensal' && item.id!==current.id && item.status==='pago' && String(item.data_vencimento_base) < String(current.data_vencimento_base))
      .sort((a,b)=>String(b.data_vencimento_base).localeCompare(String(a.data_vencimento_base)))[0];
    const previousValue=previousPaid ? alyaEffectiveValue(previousPaid) : 0;
    const factor=previousValue > 0 ? Number((value / previousValue).toFixed(8)) : null;
    if(factor && Number.isFinite(factor) && factor > 0 && Math.abs(factor - 1) > 0.000001){
      const futureRows=flow.filter(item=>
        item.status==='aberto' &&
        ALYA_REAJUSTE_BLOCOS.has(item.bloco) &&
        String(item.data_vencimento_base) > String(current.data_vencimento_base)
      );
      for(const future of futureRows){
        const nextValue=Number((alyaEffectiveValue(future) * factor).toFixed(2));
        const res=await withTimeout(
          db.from('alya_fluxo_base').update({valor_atual:nextValue}).eq('user_id',S.user.id).eq('id',future.id),
          12000,
          'reajuste das parcelas futuras do Alya'
        );
        if(res.error) throw res.error;
      }
      await withTimeout(
        db.from('alya_pagamentos').update({fator_vs_parcela_anterior:factor}).eq('user_id',S.user.id).eq('id',paymentPayload.id),
        12000,
        'registro do fator de reajuste Alya'
      );
    }
  }
}

async function saveAlyaPayment(isHistoric=false){
  const prefix=isHistoric ? 'alya-history' : 'alya-payment';
  const itemId=q(`${prefix}-item`).value;
  const date=q(`${prefix}-date`).value;
  const value=Number(q(`${prefix}-value`).value||0);
  const notes=isHistoric ? 'Cadastro pontual de historico anterior ao app.' : q('alya-payment-notes').value.trim();
  if(!itemId){toast('Selecione o evento do Alya.','err');return;}
  if(!date){toast('Informe a data do pagamento.','err');return;}
  if(!value || value <= 0){toast('Informe o valor pago.','err');return;}

  const btn=q(isHistoric ? 'btn-alya-salvar-history' : 'btn-alya-salvar-payment');
  btn.disabled=true;
  btn.textContent='Salvando...';
  try{
    await applyAlyaPayment(itemId,date,value,notes,isHistoric);
    toast(isHistoric ? 'Historico antigo registrado!' : 'Pagamento do Alya registrado!','ok');
    q(`${prefix}-item`).value='';
    q(`${prefix}-date`).value='';
    q(`${prefix}-value`).value='';
    if(!isHistoric) q('alya-payment-notes').value='';
    if(isHistoric) setAlyaFormVisibility(null);
    refreshAlyaIfVisible();
  }catch(ex){
    const msg=ex?.message||'';
    if(msg.includes('empreendimentos') || msg.includes('alya_fluxo_base') || msg.includes('alya_pagamentos')){
      toast('Rode antes o SQL da Fase 4 do Alya no Supabase.','err');
    }else{
      toast(`Nao foi possivel registrar o pagamento do Alya.${msg?` ${msg}`:''}`,'err');
    }
  }finally{
    btn.disabled=false;
    btn.textContent=isHistoric ? 'Registrar historico antigo' : 'Registrar pagamento';
  }
}

function setupAlya(){
  if(!q('btn-alya-refresh')) return;
  q('btn-alya-refresh').addEventListener('click',refreshAlyaDashboard);
  q('btn-alya-toggle-base').addEventListener('click',()=>{
    const hidden=q('alya-base-form').classList.contains('hidden');
    setAlyaFormVisibility(hidden ? 'alya-base-form' : null);
  });
  q('btn-alya-toggle-payment').addEventListener('click',()=>{
    const hidden=q('alya-payment-form').classList.contains('hidden');
    setAlyaFormVisibility(hidden ? 'alya-payment-form' : null);
  });
  q('btn-alya-toggle-history').addEventListener('click',()=>{
    const hidden=q('alya-history-form').classList.contains('hidden');
    setAlyaFormVisibility(hidden ? 'alya-history-form' : null);
  });
  q('btn-alya-salvar-base').addEventListener('click',saveAlyaBaseFlow);
  q('btn-alya-salvar-payment').addEventListener('click',()=>saveAlyaPayment(false));
  q('btn-alya-salvar-history').addEventListener('click',()=>saveAlyaPayment(true));
}

function buildMonthKeys(fromDate,count=6){
  const keys=[];
  for(let i=0;i<count;i++){
    const d=new Date(fromDate.getFullYear(),fromDate.getMonth()+i,1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);
  }
  return keys;
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
        else if(btn.dataset.tab==='investimentos') refreshAlyaDashboard();
        return;
      }
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      q(`tab-${btn.dataset.tab}`).classList.add('active');
      if(btn.dataset.tab==='dashboard') refreshDashboard();
      if(btn.dataset.tab==='investimentos') refreshAlyaDashboard();
    });
  });
}

function tabSupportsList(tab){return tab==='gastos'||tab==='entradas';}

function setDates(){
  const now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString();
  q('inp-data-gasto').value=local.slice(0,16);
  q('inp-data-entrada').value=local.slice(0,10);
  if(q('alya-payment-date')) q('alya-payment-date').value=local.slice(0,10);
  if(q('alya-history-date')) q('alya-history-date').value=local.slice(0,10);
  if(q('alya-base-data')) q('alya-base-data').value=local.slice(0,10);
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

function dateBR(value){
  if(!value) return '--';
  return new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR');
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
      syncGastoContextHint();
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
  syncGastoContextHint();
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

function syncGastoContextHint(){
  const note=q('gasto-contexto-note');
  if(!note) return;
  const show=S.owner==='eu' && S.catId==='moradia';
  note.classList.toggle('show',show);
}

function onCatChange(){
  S.catId=q('sel-cat').value||null;
  if(!S.catId){
    q('sub-wrap').style.display='none';
    q('custom-sub-wrap').style.display='none';
    syncGastoContextHint();
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
  syncGastoContextHint();
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
  const { error } = await withTimeout(
    db.from('lancamentos').insert(lancamento),
    12000,
    'lancamentos'
  );
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
      const { error } = await withTimeout(
        db.from('gastos').insert(gasto),
        12000,
        'gastos'
      );
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
  syncGastoContextHint();
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
    const { error } = await withTimeout(
      db.rpc('criar_parcelamento_ativo_existente',{
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
      }),
      12000,
      'parcelamentos'
    );
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
      const { error } = await withTimeout(
        db.from('entradas').insert(entrada),
        12000,
        'entradas'
      );
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

function toCompetenciaMesFromIso(value){
  if(!value) return null;
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

function toCompetenciaMesFromDate(value){
  if(!value) return null;
  const [year,month]=String(value).split('-');
  if(!year || !month) return null;
  return `${year}-${month}-01`;
}

function buildDashboardRowsFromLegacy(gastos,entradas){
  const rows=[];
  (entradas||[]).forEach(item=>{
    const mes=toCompetenciaMesFromDate(item.data);
    if(!mes) return;
    rows.push({
      mes_competencia:mes,
      tipo:'entrada',
      valor:Number(item.valor)||0,
      categoria:'Entradas',
      necessidade:null,
    });
  });
  (gastos||[]).forEach(item=>{
    const mes=toCompetenciaMesFromIso(item.data);
    if(!mes) return;
    rows.push({
      mes_competencia:mes,
      tipo:'saida',
      valor:Number(item.valor)||0,
      categoria:item.categoria || 'Sem categoria',
      necessidade:item.necessidade || null,
    });
  });
  return rows;
}

function buildCasaAtualRowsFromLegacy(gastos,entradas){
  const rows=[];
  (entradas||[]).forEach(item=>{
    const mes=toCompetenciaMesFromDate(item.data);
    if(!mes) return;
    rows.push({
      mes_competencia:mes,
      tipo:'entrada',
      valor:Number(item.valor)||0,
    });
  });
  (gastos||[]).forEach(item=>{
    const mes=toCompetenciaMesFromIso(item.data);
    if(!mes) return;
    rows.push({
      mes_competencia:mes,
      tipo:'saida',
      valor:Number(item.valor)||0,
    });
  });
  return rows;
}

function aggregateCasaAtual(rows,config,monthKeys){
  const months={};
  (monthKeys||[]).forEach(key=>{
    months[key]={
      custo:0,receita_real:0,receita_media:0,receita_usada:0,
      resultado:0,resultado_validado:null,resultado_referencia:null,
      validado:false,diferenca_validacao:null
    };
  });
  (rows||[]).forEach(row=>{
    const key=normalizeMonthStart(row.mes_competencia || row.mes_analisado || row.data_evento || row.data);
    if(!key) return;
    if(!months[key]){
      months[key]={
        custo:0,receita_real:0,receita_media:0,receita_usada:0,
        resultado:0,resultado_validado:null,resultado_referencia:null,
        validado:false,diferenca_validacao:null
      };
    }
    const value=Number(row.valor)||0;
    if(row.tipo==='saida') months[key].custo+=value;
    if(row.tipo==='entrada') months[key].receita_real+=value;
  });
  const fixedValue=Number(config?.valor_mensal_fixo)||0;
  const startKey=normalizeMonthStart(config?.inicio_vigencia);
  Object.keys(months).forEach(key=>{
    const useReference=config?.ativo && fixedValue > 0 && (!startKey || key >= startKey);
    const item=months[key];
    item.receita_media=useReference ? fixedValue : 0;
    item.validado=item.receita_real > 0;
    item.receita_usada=item.validado ? item.receita_real : item.receita_media;
    item.resultado=item.receita_usada - item.custo;
    item.resultado_validado=item.validado ? item.receita_real - item.custo : null;
    item.resultado_referencia=item.receita_media > 0 ? item.receita_media - item.custo : null;
    item.diferenca_validacao=(item.validado && item.receita_media > 0)
      ? item.receita_real - item.receita_media
      : null;
  });
  return months;
}

function average(nums){
  const valid=(nums||[]).filter(n=>Number.isFinite(n));
  if(!valid.length) return 0;
  return valid.reduce((sum,n)=>sum+n,0)/valid.length;
}

function renderCasaAtualPanel(months,config){
  const metricsEl=q('casa-metrics');
  const monthsEl=q('casa-months');
  const statusEl=q('casa-status');
  const keys=Object.keys(months||{}).sort();
  const hasActivity=keys.some(key=>{
    const item=months[key];
    return (item?.custo || item?.receita_real || item?.receita_fixa);
  });

  if(!metricsEl || !monthsEl || !statusEl) return;

  if(!keys.length || !hasActivity){
    metricsEl.innerHTML='<div class="summary-card wide"><div class="summary-note">Ainda nao existem gastos de moradia ou receita de sublocacao suficientes para montar a analise da casa atual.</div></div>';
    monthsEl.innerHTML='<div class="dash-empty">Cadastre gastos em Moradia e configure a sublocacao fixa para acompanhar o resultado mensal.</div>';
    statusEl.textContent='Sem dados da casa atual no periodo.';
    statusEl.className='dashboard-status';
    return;
  }

  const currentKey=keys[keys.length-1];
  const previousKey=keys[keys.length-2];
  const current=months[currentKey];
  const previous=previousKey ? months[previousKey] : {custo:0,resultado:0};
  const recent=keys.slice(-3).map(key=>months[key].resultado);
  const all=keys.map(key=>months[key].resultado);
  const avg3=average(recent);
  const avg6=average(all);
  const fixedActive=Boolean(config?.ativo && Number(config?.valor_mensal_fixo));
  const fixedLabel=fixedActive ? moneyBR(Number(config.valor_mensal_fixo)||0) : 'Nao definido';
  const validatedLabel=current.validado ? moneyBR(current.receita_real) : 'Pendente';
  const validationDelta=current.diferenca_validacao;

  if(!fixedActive){
    statusEl.textContent='Defina a media de sublocacao para comparar o aluguel validado de cada mes.';
    statusEl.className='dashboard-status err';
  }else if(!current.validado){
    statusEl.textContent='Este mes ainda nao foi validado por uma entrada em Aluguel; o painel esta usando a media salva como referencia.';
    statusEl.className='dashboard-status err';
  }else if(current.resultado < 0 || avg3 < 0){
    statusEl.textContent='O aluguel validado do mes e/ou o periodo recente ficaram abaixo do custo real da casa.';
    statusEl.className='dashboard-status err';
  }else{
    statusEl.textContent='A entrada validada de Aluguel esta cobrindo o custo real da casa no periodo recente.';
    statusEl.className='dashboard-status ok';
  }

  metricsEl.innerHTML=`
    <div class="summary-card">
      <div class="summary-kicker">Custo real</div>
      <div class="summary-value neg">${moneyBR(current.custo)}</div>
      <div class="summary-note">vs mes anterior: ${percentChange(current.custo, previous.custo)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Media de sublocacao</div>
      <div class="summary-value ${fixedActive?'pos':''}">${fixedLabel}</div>
      <div class="summary-note">${config?.inicio_vigencia ? `Referencia desde ${monthLabel(config.inicio_vigencia)}` : 'Use o botao acima para configurar'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Aluguel validado</div>
      <div class="summary-value ${current.validado?'pos':''}">${validatedLabel}</div>
      <div class="summary-note">${current.validado ? 'Valor puxado das entradas em Aluguel deste mes.' : 'Lance uma entrada em Aluguel para validar o mes.'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Resultado do mes</div>
      <div class="summary-value ${current.resultado>=0?'pos':'neg'}">${moneyBR(current.resultado)}</div>
      <div class="summary-note">${current.validado ? `Validado por Aluguel em ${monthLabel(currentKey)}` : `Provisorio pela media em ${monthLabel(currentKey)}`}</div>
    </div>
    <div class="summary-card">
      <div class="summary-kicker">Media movel 3 meses</div>
      <div class="summary-value ${avg3>=0?'pos':'neg'}">${moneyBR(avg3)}</div>
      <div class="summary-note">Leitura curta para revisar a media de referencia.</div>
    </div>
    <div class="summary-card wide">
      <div class="summary-kicker">${current.validado && validationDelta!=null ? 'Desvio do aluguel validado' : 'Media do periodo'}</div>
      <div class="summary-value ${(current.validado && validationDelta!=null ? validationDelta : avg6)>=0?'pos':'neg'}">${moneyBR(current.validado && validationDelta!=null ? validationDelta : avg6)}</div>
      <div class="summary-note">${current.validado && validationDelta!=null
        ? `Comparacao entre a entrada real de Aluguel e a media salva para ${monthLabel(currentKey)}.`
        : (fixedActive ? 'Se esse valor ficar negativo por recorrencia, vale revisar a media de sublocacao.' : 'Sem media definida, o resultado ainda nao e uma projecao automatica.')
      }</div>
    </div>
  `;

  monthsEl.innerHTML=keys.slice(-6).reverse().map(key=>{
    const item=months[key];
    return `
      <div class="month-row">
        <div>
          <div class="month-name">${monthLabel(key)}</div>
          <div class="dash-card-sub">${moneyBR(item.custo)} custo • ${moneyBR(item.receita_usada)} receita usada</div>
          <div class="dash-card-subline">${item.validado ? `${moneyBR(item.receita_real)} aluguel validado` : `${moneyBR(item.receita_media)} media de referencia`}</div>
        </div>
        <div class="month-balance ${item.resultado>=0?'pos':'neg'}">${moneyBR(item.resultado)}</div>
      </div>
    `;
  }).join('');
}

function buildLegacyLikeRecordFromLancamento(row){
  return {
    id:row.id,
    user_id:row.user_id,
    valor:Number(row.valor)||0,
    categoria:row.categoria,
    subcategoria:row.subcategoria,
    necessidade:row.necessidade,
    data:row.data_evento,
    dono:row.proprietario_economico==='mae'?'mae':'eu',
    tipo_pagamento:'a_vista',
    forma_pagamento:row.forma_pagamento,
    banco:row.banco_referencia,
    origem:row.subcategoria,
    origem_de:null,
    origem_motivo:null,
    origem_especificacao:null,
  };
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
  const now=new Date();
  const from=new Date(now.getFullYear(),now.getMonth()-5,1);
  const fromKey=`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-01`;
  const monthKeys=buildMonthKeys(from,6);
  try{
    const casaConfig=S.casaAtualConfig || await loadCasaAtualConfig();
    const [baseRes,originRes,casaRes] = await Promise.all([
      withTimeout(
        db
          .from('lancamentos')
          .select('mes_competencia,tipo,valor,categoria,necessidade')
          .eq('user_id',S.user.id)
          .gte('mes_competencia',fromKey)
          .order('mes_competencia',{ascending:true}),
        12000,
        'resumo em lancamentos'
      ),
      withTimeout(
        db
          .from('v_gastos_origem_competencia')
          .select('mes_analisado,gasto_novo_no_mes,custo_herdado_mes,gasto_jogado_para_futuro_no_mes,parcelamentos_ativos_mes')
          .eq('user_id',S.user.id)
          .gte('mes_analisado',fromKey)
          .order('mes_analisado',{ascending:true}),
        12000,
        'resumo temporal'
      ),
      withTimeout(
        db
          .from('lancamentos')
          .select('mes_competencia,tipo,valor')
          .eq('user_id',S.user.id)
          .eq('contexto','casa_atual')
          .gte('mes_competencia',fromKey)
          .order('mes_competencia',{ascending:true}),
        12000,
        'resultado da casa atual'
      )
    ]);
    let dashboardRows=[];
    let originRows=[];
    let casaRows=[];

    if(!baseRes.error && (baseRes.data||[]).length){
      dashboardRows=baseRes.data||[];
    }else{
      const [gastosRes,entradasRes] = await Promise.all([
        withTimeout(
          db.from('gastos').select('valor,data,categoria,necessidade').eq('user_id',S.user.id).gte('data',fromKey).order('data',{ascending:true}),
          12000,
          'gastos legados'
        ),
        withTimeout(
          db.from('entradas').select('valor,data').eq('user_id',S.user.id).gte('data',fromKey).order('data',{ascending:true}),
          12000,
          'entradas legadas'
        )
      ]);
      if(gastosRes.error) throw gastosRes.error;
      if(entradasRes.error) throw entradasRes.error;
      dashboardRows=buildDashboardRowsFromLegacy(gastosRes.data||[],entradasRes.data||[]);
    }

    if(!originRes.error){
      originRows=originRes.data||[];
    }

    if(!casaRes.error && (casaRes.data||[]).length){
      casaRows=casaRes.data||[];
    }else{
      const [moradiaRes,aluguelRes]=await Promise.all([
        withTimeout(
          db.from('gastos').select('valor,data').eq('user_id',S.user.id).eq('categoria','Moradia').gte('data',fromKey).order('data',{ascending:true}),
          12000,
          'gastos de moradia'
        ),
        withTimeout(
          db.from('entradas').select('valor,data').eq('user_id',S.user.id).eq('origem','aluguel').gte('data',fromKey).order('data',{ascending:true}),
          12000,
          'entradas de aluguel'
        ),
      ]);
      if(moradiaRes.error) throw moradiaRes.error;
      if(aluguelRes.error) throw aluguelRes.error;
      casaRows=buildCasaAtualRowsFromLegacy(moradiaRes.data||[],aluguelRes.data||[]);
    }

    renderDashboard(
      aggregateDashboard(dashboardRows),
      aggregateOriginBreakdown(originRows)
    );
    renderCasaAtualPanel(
      aggregateCasaAtual(casaRows,casaConfig,monthKeys),
      casaConfig
    );
    writeCache(DASHBOARD_CACHE_KEY,{
      dashboardRows,
      originRows,
      casaRows,
      casaConfig,
      fromKey,
      savedAt:new Date().toISOString()
    });
  }catch(ex){
    const cached=readCache(DASHBOARD_CACHE_KEY,null);
    if(cached?.dashboardRows?.length){
      renderDashboard(
        aggregateDashboard(cached.dashboardRows),
        aggregateOriginBreakdown(cached.originRows||[])
      );
      renderCasaAtualPanel(
        aggregateCasaAtual(cached.casaRows||[],normalizeCasaAtualConfig(cached.casaConfig||{}),monthKeys),
        normalizeCasaAtualConfig(cached.casaConfig||{})
      );
      statusEl.textContent='Mostrando o ultimo resumo salvo neste dispositivo.';
      statusEl.className='dashboard-status err';
      return;
    }
    statusEl.textContent='Nao foi possivel carregar o dashboard.';
    statusEl.className='dashboard-status err';
    renderCasaAtualPanel(
      aggregateCasaAtual([],S.casaAtualConfig || getCasaAtualConfig(),monthKeys),
      S.casaAtualConfig || getCasaAtualConfig()
    );
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
      const res=await withTimeout(
        db.from('gastos').select('*').eq('user_id',S.user.id).order('data',{ascending:false}).limit(150),
        12000,
        'lista de gastos'
      );
      items=res.data||[];
      error=res.error;
      if((error || !items.length) && db){
        const fallback=await withTimeout(
          db
            .from('lancamentos')
            .select('id,user_id,valor,categoria,subcategoria,necessidade,data_evento,proprietario_economico,forma_pagamento,banco_referencia')
            .eq('user_id',S.user.id)
            .eq('tipo','saida')
            .order('data_evento',{ascending:false})
            .limit(150),
          12000,
          'lista de gastos em lancamentos'
        );
        if(!fallback.error && (fallback.data||[]).length){
          items=(fallback.data||[]).map(buildLegacyLikeRecordFromLancamento);
          error=null;
        }
      }
      if(items.length) writeCache(GASTOS_CACHE_KEY,items);
    }else{
      const res=await withTimeout(
        db.from('entradas').select('*').eq('user_id',S.user.id).order('data',{ascending:false}).limit(150),
        12000,
        'lista de entradas'
      );
      items=res.data||[];
      error=res.error;
      if((error || !items.length) && db){
        const fallback=await withTimeout(
          db
            .from('lancamentos')
            .select('id,user_id,valor,subcategoria,data_evento')
            .eq('user_id',S.user.id)
            .eq('tipo','entrada')
            .order('data_evento',{ascending:false})
            .limit(150),
          12000,
          'lista de entradas em lancamentos'
        );
        if(!fallback.error && (fallback.data||[]).length){
          items=(fallback.data||[]).map(buildLegacyLikeRecordFromLancamento);
          error=null;
        }
      }
      if(items.length) writeCache(ENTRADAS_CACHE_KEY,items);
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
    const cached=readCache(tab==='gastos'?GASTOS_CACHE_KEY:ENTRADAS_CACHE_KEY,[]);
    if(cached.length){
      const groups={};
      cached.forEach(item=>{
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
          const icon=isG?(CAT_ICONS[catId]||'ðŸ’¸'):'ðŸ’°';
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
      toast('Mostrando os ultimos registros salvos neste dispositivo.','err');
      return;
    }
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
