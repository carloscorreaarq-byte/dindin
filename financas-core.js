const APP_NAME = 'dindin';
const SUPABASE_CONFIG_KEY = 'dindin_supabase_config';
const LEGACY_SUPABASE_CONFIG_KEY = 'financas_supabase_config';
const SUPABASE_AUTH_STORAGE_KEY = 'dindin-auth';
const DASHBOARD_CACHE_KEY = 'dindin_dashboard_cache';
const GASTOS_CACHE_KEY = 'dindin_gastos_cache';
const ENTRADAS_CACHE_KEY = 'dindin_entradas_cache';
const CASA_ATUAL_CONFIG_KEY = 'dindin_casa_atual_config';
const ALYA_CACHE_KEY = 'dindin_alya_cache';
const DIAGNOSTIC_VISIBLE_KEY = 'dindin_diag_visible';
const SESSION_RECHECK_MS = 30000;
const EMBEDDED_SUPABASE_CONFIG = Object.freeze({
  url: 'https://beqzurjtawlbloorbijz.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcXp1cmp0YXdsYmxvb3JiaWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTkyMDIsImV4cCI6MjA5MzE3NTIwMn0.hlEgHsH4crMN7xXRuuFK6GjaBpLrWYvS4Y0S3NFFer8',
});
let db = null;
let authListenerBound = false;
let authMode = 'login';
let _tt;

const CATS = [
  {id:'alimentacao',nome:'Alimentação', subs:['Mercado','Restaurante','Delivery','Café','Besteira'],        outros:false},
  {id:'transporte', nome:'Transporte',  subs:['Uber/99','Passagem aérea'],                                  outros:true},
  {id:'lazer',      nome:'Lazer',       subs:['Festa','Bebida','Ilícitos','Cinema'],                        outros:true},
  {id:'saude',      nome:'Saúde',       subs:['Psicóloga','Consulta','Exame','Farmácia'],                   outros:false},
  {id:'fitness',    nome:'Fitness',     subs:['Academia','Natação','Instrutor','Médico','Bomba','Manipulados','Tirzepatida'], outros:false},
  {id:'moradia',    nome:'Moradia',     subs:['Aluguel','Gás','Energia','Produtos de Casa','Faxina','Serviços gerais','Taxas extras'], outros:false},
  {id:'compras',    nome:'Compras',     subs:['Roupas','Acessórios','Calçados','Decoração','Eletrônicos'],  outros:false},
  {id:'servicos',   nome:'Serviços',    subs:['Assinaturas','Internet/Celular','Aplicativos','Programas'],  outros:false},
  {id:'pessoal',    nome:'Pessoal',     subs:['Cabeleireiro','Higiene'],                                    outros:true},
];

const CAT_ICONS = {
  alimentacao:'🍽️',
  transporte:'🚗',
  lazer:'🎉',
  saude:'💊',
  fitness:'💪',
  moradia:'🏠',
  compras:'🛍️',
  servicos:'📱',
  pessoal:'✂️'
};

const S = {
  user:null,owner:'eu',gastoCents:0,entradaCents:0,
  parcela:'a_vista',necessidade:null,catId:null,
  sessionCheckedAt:0,
  diag:{
    visible:(localStorage.getItem(DIAGNOSTIC_VISIBLE_KEY) ?? '1') !== '0',
    auth:'Aguardando inicializacao',
    authTone:'',
    authDetail:'Sem sessao carregada ainda.',
    summary:'Aguardando primeira leitura',
    summaryTone:'',
    list:'Aguardando primeira lista',
    listTone:'',
    lastAction:'Abrindo app',
    lastError:'Nenhum erro registrado',
    updatedAt:null,
  },
  customSubs:JSON.parse(localStorage.getItem('customSubs')||'{}'),
  offlineQ:JSON.parse(localStorage.getItem('offlineQ')||'[]'),
};

const q = id => document.getElementById(id);
