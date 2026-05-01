function getSavedConfig(){
  try{return JSON.parse(localStorage.getItem(SUPABASE_CONFIG_KEY) || 'null');}
  catch{return null;}
}

function readConfigForm(){
  return {
    url:q('inp-supabase-url').value.trim(),
    anonKey:q('inp-supabase-key').value.trim(),
  };
}

function loadConfigForm(){
  const cfg=getSavedConfig();
  if(!cfg) return;
  q('inp-supabase-url').value=cfg.url||'';
  q('inp-supabase-key').value=cfg.anonKey||'';
  setConfigStatus('Configuração carregada deste dispositivo.','ok');
}

function saveConfig(cfg){localStorage.setItem(SUPABASE_CONFIG_KEY,JSON.stringify(cfg));}

function isValidConfig(cfg){
  if(!cfg?.url || !cfg?.anonKey) return false;
  try{return /^https?:\/\//.test(new URL(cfg.url).toString());}
  catch{return false;}
}

function setConfigStatus(msg,tipo=''){
  const el=q('config-status');
  el.textContent=msg;
  el.className=`config-status${tipo?` ${tipo}`:''}`;
}

function bindAuthListener(){
  if(authListenerBound || !db) return;
  db.auth.onAuthStateChange(async (_e,session)=>{
    if(session){
      S.user=session.user;
      showApp();
      await loadCustomSubs();
    }else showAuth();
  });
  authListenerBound=true;
}

async function bootSupabase(){
  const cfg=getSavedConfig();
  if(!isValidConfig(cfg)){
    showAuth();
    setConfigStatus('Preencha e salve a configuração do Supabase para entrar.','err');
    return;
  }
  try{
    const { createClient } = supabase;
    db = createClient(cfg.url,cfg.anonKey);
    bindAuthListener();
    const {data:{session}}=await db.auth.getSession();
    if(session){
      S.user=session.user;
      showApp();
      await loadCustomSubs();
    }else showAuth();
    setConfigStatus('Configuração salva neste dispositivo.','ok');
  }catch(_ex){
    db=null;
    showAuth();
    setConfigStatus('Não foi possível iniciar o Supabase com essa configuração.','err');
  }
}

function setupConfig(){
  q('btn-save-config').addEventListener('click',async ()=>{
    const cfg=readConfigForm();
    if(!isValidConfig(cfg)){
      setConfigStatus('Informe uma URL válida e a chave anon do Supabase.','err');
      return;
    }
    saveConfig(cfg);
    setConfigStatus('Configuração salva. Inicializando...','ok');
    await bootSupabase();
  });
}

q('form-auth').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=q('inp-email').value.trim(), pwd=q('inp-senha').value;
  const btn=q('btn-auth'),err=q('auth-err');
  if(!db){
    err.style.color='#C0392B';
    err.textContent='Salve a configuração do Supabase antes de entrar.';
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
  }finally{btn.disabled=false;btn.textContent=authMode==='login'?'Entrar':'Criar conta';}
});

q('btn-toggle-mode').addEventListener('click',()=>{
  authMode=authMode==='login'?'register':'login';
  q('btn-auth').textContent=authMode==='login'?'Entrar':'Criar conta';
  q('btn-toggle-mode').textContent=authMode==='login'?'Criar conta':'Já tenho conta';
  q('auth-err').textContent='';
});

const logout=()=>db.auth.signOut().then(showAuth);
q('btn-logout').addEventListener('click',logout);
q('btn-logout-2').addEventListener('click',logout);

function showAuth(){q('screen-auth').classList.remove('hidden');q('screen-app').classList.add('hidden');}
function showApp(){q('screen-auth').classList.add('hidden');q('screen-app').classList.remove('hidden');}

function traduzErro(m){
  if(m.includes('Invalid login'))return'E-mail ou senha incorretos';
  if(m.includes('already registered'))return'E-mail já cadastrado';
  if(m.includes('Password should'))return'Senha muito curta (mín. 6 caracteres)';
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
        return;
      }
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');q(`tab-${btn.dataset.tab}`).classList.add('active');
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

function buildParcelas(){
  const wrap=q('parcelas-row');
  [['À vista','a_vista'],['1x','1x'],['2x','2x'],['3x','3x'],['4x','4x'],
   ['5x','5x'],['6x','6x'],['7x','7x'],['8x','8x'],['9x','9x'],
   ['10x','10x'],['11x','11x'],['12x','12x']].forEach(([l,v],i)=>{
    const b=document.createElement('button');
    b.type='button';b.className='p-btn'+(i===0?' active':'');b.dataset.v=v;b.textContent=l;
    b.addEventListener('click',()=>{
      document.querySelectorAll('.p-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');S.parcela=v;
    });
    wrap.appendChild(b);
  });
}

function setupGastos(){
  document.querySelectorAll('.owner-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.owner-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');S.owner=btn.dataset.owner;
      q('meus-campos').style.display=S.owner==='mae'?'none':'flex';
      q('opt-transf').style.display=S.owner==='mae'?'':'none';
      if(S.owner==='eu'&&q('sel-forma').value==='transferencia')q('sel-forma').value='credito';
    });
  });
  document.querySelectorAll('.nec-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.nec-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');S.necessidade=+btn.dataset.v;
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
  CATS.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.nome;sel.appendChild(o);});
}

function onCatChange(){
  S.catId=q('sel-cat').value||null;
  if(!S.catId){q('sub-wrap').style.display='none';q('custom-sub-wrap').style.display='none';return;}
  const cat=CATS.find(c=>c.id===S.catId),sel=q('sel-sub');
  sel.innerHTML='<option value="">Selecionar...</option>';
  cat.subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});
  (S.customSubs[S.catId]||[]).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s+' ✦';sel.appendChild(o);});
  if(cat.outros){const o=document.createElement('option');o.value='__outros__';o.textContent='Outros...';sel.appendChild(o);}
  q('sub-wrap').style.display='';q('custom-sub-wrap').style.display='none';
}

function onSubChange(){
  const isO=q('sel-sub').value==='__outros__';
  q('custom-sub-wrap').style.display=isO?'':'none';
  if(isO)setTimeout(()=>q('inp-custom-sub').focus(),50);
}

function getSubFinal(){const v=q('sel-sub').value;return v==='__outros__'?q('inp-custom-sub').value.trim():v;}

async function persistCustomSub(catId,nome){
  if(!nome||(S.customSubs[catId]||[]).includes(nome))return;
  if(!S.customSubs[catId])S.customSubs[catId]=[];
  S.customSubs[catId].push(nome);
  localStorage.setItem('customSubs',JSON.stringify(S.customSubs));
  if(S.user)await db.from('subcategorias_custom').upsert({user_id:S.user.id,categoria:catId,nome},{onConflict:'user_id,categoria,nome'});
}

async function loadCustomSubs(){
  if(!S.user)return;
  const{data}=await db.from('subcategorias_custom').select('categoria,nome').eq('user_id',S.user.id);
  if(data){
    data.forEach(r=>{if(!S.customSubs[r.categoria])S.customSubs[r.categoria]=[];if(!S.customSubs[r.categoria].includes(r.nome))S.customSubs[r.categoria].push(r.nome);});
    localStorage.setItem('customSubs',JSON.stringify(S.customSubs));
  }
}

async function salvarGasto(){
  if(!S.gastoCents){toast('Digite o valor','err');return;}
  const isEu=S.owner==='eu',sub=isEu?getSubFinal():null,isCustom=isEu&&q('sel-sub').value==='__outros__';
  if(isEu&&!S.catId){toast('Selecione uma categoria','err');return;}
  if(isCustom&&sub)await persistCustomSub(S.catId,sub);
  const gasto={user_id:S.user?.id,dono:S.owner,valor:S.gastoCents/100,tipo_pagamento:S.parcela,
    forma_pagamento:q('sel-forma').value,banco:q('sel-banco').value,data:q('inp-data-gasto').value,
    categoria:isEu?CATS.find(c=>c.id===S.catId)?.nome:null,subcategoria:sub,necessidade:isEu?S.necessidade:null};
  const btn=q('btn-salvar-gasto');btn.disabled=true;btn.textContent='Salvando...';
  try{
    if(S.user){const{error}=await db.from('gastos').insert(gasto);if(error)throw error;}
    else enqueueOffline('gastos',gasto);
    localStorage.setItem('gPresets',JSON.stringify({forma:q('sel-forma').value,banco:q('sel-banco').value}));
    toast('Gasto salvo! ✓','ok');resetGastos();
  }catch(ex){enqueueOffline('gastos',gasto);toast('Salvo localmente','ok');resetGastos();}
  finally{btn.disabled=false;btn.textContent='Salvar Gasto';}
}

function resetGastos(){
  S.gastoCents=0;S.necessidade=null;S.catId=null;S.parcela='a_vista';
  q('val-gasto-inp').value='';q('val-gasto-num').textContent='0,00';
  document.querySelectorAll('.p-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.p-btn[data-v="a_vista"]').classList.add('active');
  document.querySelectorAll('.nec-btn').forEach(b=>b.classList.remove('active'));
  q('sel-cat').value='';q('sub-wrap').style.display='none';q('custom-sub-wrap').style.display='none';
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

async function salvarEntrada(){
  if(!S.entradaCents){toast('Digite o valor','err');return;}
  const origem=q('sel-origem').value;
  const entrada={user_id:S.user?.id,valor:S.entradaCents/100,origem,
    origem_de:origem==='transferencia'?q('inp-origem-de').value.trim():null,
    origem_motivo:origem==='transferencia'?q('inp-origem-motivo').value.trim():null,
    origem_especificacao:origem==='outro'?q('inp-origem-spec').value.trim():null,
    data:q('inp-data-entrada').value};
  const btn=q('btn-salvar-entrada');btn.disabled=true;btn.textContent='Salvando...';
  try{
    if(S.user){const{error}=await db.from('entradas').insert(entrada);if(error)throw error;}
    else enqueueOffline('entradas',entrada);
    toast('Entrada salva! ✓','ok');resetEntradas();
  }catch(ex){enqueueOffline('entradas',entrada);toast('Salvo localmente','ok');resetEntradas();}
  finally{btn.disabled=false;btn.textContent='Salvar Entrada';}
}

function resetEntradas(){
  S.entradaCents=0;q('val-entrada-inp').value='';q('val-entrada-num').textContent='0,00';
  q('sel-origem').value='pro_labore';
  q('transf-fields').style.display='none';q('outro-field').style.display='none';
  q('inp-origem-de').value='';q('inp-origem-motivo').value='';q('inp-origem-spec').value='';
  setDates();
}

async function openList(tab){
  if(!S.user)return;
  const listEl=q('sheet-list'),titleEl=q('sheet-title');
  listEl.innerHTML='<div class="empty-state"><div class="empty-state-icon">⏳</div><p>Carregando...</p></div>';
  titleEl.textContent=tab==='gastos'?'Meus Gastos':'Minhas Entradas';
  q('list-overlay').classList.add('show');q('list-sheet').classList.add('show');
  let items=[];
  if(tab==='gastos'){const{data}=await db.from('gastos').select('*').eq('user_id',S.user.id).order('data',{ascending:false}).limit(150);items=data||[];}
  else{const{data}=await db.from('entradas').select('*').eq('user_id',S.user.id).order('data',{ascending:false}).limit(150);items=data||[];}
  if(!items.length){listEl.innerHTML='<div class="empty-state"><div class="empty-state-icon">🔍</div><p>Nenhum registro ainda</p></div>';return;}
  const groups={};
  items.forEach(item=>{const d=item.data.slice(0,10);if(!groups[d])groups[d]=[];groups[d].push(item);});
  listEl.innerHTML='';
  Object.entries(groups).forEach(([date,records])=>{
    const dh=document.createElement('div');dh.className='day-header';dh.textContent=formatDay(date);listEl.appendChild(dh);
    records.forEach(rec=>{
      const el=document.createElement('div');el.className='list-item';
      const isG=tab==='gastos';
      const catId=isG?CATS.find(c=>c.nome===rec.categoria)?.id:null;
      const icon=isG?(CAT_ICONS[catId]||'💸'):'💰';
      const title=isG?(rec.subcategoria||rec.categoria||(rec.dono==='mae'?'Gasto Mãe':'Gasto')):origemLabel(rec.origem);
      const sub=isG?(rec.dono==='mae'?'👩 Minha Mãe':rec.categoria||''):(rec.origem_de||rec.origem_especificacao||'');
      const val='R$ '+rec.valor.toLocaleString('pt-BR',{minimumFractionDigits:2});
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
}

function openDetail(rec,tab){
  const isG=tab==='gastos';
  const catId=isG?CATS.find(c=>c.nome===rec.categoria)?.id:null;
  const icon=isG?(CAT_ICONS[catId]||'💸'):'💰';
  const di=q('detail-icon');
  di.textContent=icon;di.style.background=isG?'#FAE8E1':'#E3EEE2';
  q('detail-title').textContent=isG?(rec.categoria||'Gasto'):origemLabel(rec.origem);
  const rows=[['Valor','R$ '+rec.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})]];
  if(isG){
    if(rec.dono==='mae')rows.push(['Quem','👩 Minha Mãe']);
    if(rec.subcategoria)rows.push(['Subcategoria',rec.subcategoria]);
    rows.push(['Pagamento',rec.tipo_pagamento==='a_vista'?'À vista':rec.tipo_pagamento]);
    rows.push(['Forma',fmtForma(rec.forma_pagamento)]);
    rows.push(['Banco',rec.banco]);
    if(rec.necessidade)rows.push(['Necessidade',['','Vital','Básico','Supérfluo','Bobagem'][rec.necessidade]]);
  }else{
    if(rec.origem_de)rows.push(['De quem',rec.origem_de]);
    if(rec.origem_motivo)rows.push(['Motivo',rec.origem_motivo]);
    if(rec.origem_especificacao)rows.push(['Especificação',rec.origem_especificacao]);
  }
  rows.push(['Data',formatDateTime(rec.data)]);
  q('detail-rows').innerHTML=rows.map(([k,v])=>`<div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('');
  q('detail-overlay').classList.add('show');
}

q('sheet-close').addEventListener('click',closeList);
q('list-overlay').addEventListener('click',closeList);
q('detail-close').addEventListener('click',()=>q('detail-overlay').classList.remove('show'));
q('detail-overlay').addEventListener('click',e=>{if(e.target===q('detail-overlay'))q('detail-overlay').classList.remove('show');});

function closeList(){q('list-overlay').classList.remove('show');q('list-sheet').classList.remove('show');}

function enqueueOffline(tabela,dados){S.offlineQ.push({tabela,dados,ts:Date.now()});localStorage.setItem('offlineQ',JSON.stringify(S.offlineQ));}

function toast(msg,tipo=''){
  const el=q('toast');el.textContent=msg;el.className=`toast show ${tipo}`;
  clearTimeout(_tt);_tt=setTimeout(()=>{el.className='toast';},2800);
}

function formatDay(iso){
  const hoje=new Date().toISOString().slice(0,10);
  const ontem=new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(iso===hoje)return'Hoje';if(iso===ontem)return'Ontem';
  return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'});
}

function formatDateTime(iso){
  if(!iso)return'';const d=new Date(iso);
  return d.toLocaleDateString('pt-BR')+(iso.includes('T')?' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'');
}

function origemLabel(o){return{pro_labore:'Pró-labore',adiantamento_lucros:'Adiantamento de lucros',bonus:'Bônus',reembolso:'Reembolso',aluguel:'Aluguel',transferencia:'Transferência',outro:'Outro'}[o]||o;}
function fmtForma(f){return{credito:'Crédito',conta_corrente:'Conta corrente',transferencia:'Transferência'}[f]||f;}
