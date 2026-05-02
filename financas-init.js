document.addEventListener('DOMContentLoaded', async () => {
  initDiagnosticMode();
  buildParcelas();
  buildCats();
  bindValor('val-gasto-inp','val-gasto-num',v=>S.gastoCents=v);
  bindValor('val-entrada-inp','val-entrada-num',v=>S.entradaCents=v);
  setupGastos();
  setupEntradas();
  setupParcelamentos();
  setupConfig();
  setupDashboard();
  setupNav();
  setDates();
  loadConfigForm();
  await bootSupabase();
});

if('serviceWorker' in navigator){navigator.serviceWorker.register('./financas-sw.js').catch(()=>{});}
