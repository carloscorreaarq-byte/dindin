const SUPABASE_CONFIG_KEY = 'financas_supabase_config';
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
  customSubs:JSON.parse(localStorage.getItem('customSubs')||'{}'),
  offlineQ:JSON.parse(localStorage.getItem('offlineQ')||'[]'),
};

const q = id => document.getElementById(id);
