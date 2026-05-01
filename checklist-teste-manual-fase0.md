# Checklist de Teste Manual - Fase 0

## Objetivo

Validar se a base tecnica do app continua funcional apos as melhorias da Fase 0, antes de iniciar a refatoracao do banco na Fase 1.

## Preparacao

- ter em maos a `Supabase URL`
- ter em maos a `anon key`
- abrir o arquivo `financas.html` no ambiente em que voce costuma testar
- se houver PWA instalado anteriormente, considerar remover e instalar de novo apos o teste de cache

## Fluxo 1 - Carregamento inicial

- [ ] abrir o app
- [ ] verificar se a tela de autenticacao aparece corretamente
- [ ] verificar se os textos estao legiveis, sem caracteres corrompidos

Resultado esperado:

- a interface deve carregar sem layout quebrado
- os textos devem aparecer com acentos normais

## Fluxo 2 - Configuracao do Supabase

- [ ] preencher `Supabase URL`
- [ ] preencher `Chave anon`
- [ ] clicar em `Salvar configuracao`

Resultado esperado:

- deve aparecer mensagem de configuracao salva
- o app nao deve travar

## Fluxo 3 - Autenticacao

- [ ] fazer login com uma conta existente

Resultado esperado:

- o app deve sair da tela de autenticacao e abrir a area principal

## Fluxo 4 - Cadastro de gasto

- [ ] abrir a aba `Gastos`
- [ ] preencher valor
- [ ] selecionar categoria e subcategoria
- [ ] definir necessidade
- [ ] salvar

Resultado esperado:

- deve aparecer confirmacao de sucesso
- o formulario deve ser resetado apos salvar

## Fluxo 5 - Cadastro de entrada

- [ ] abrir a aba `Entradas`
- [ ] preencher valor
- [ ] selecionar origem
- [ ] salvar

Resultado esperado:

- deve aparecer confirmacao de sucesso
- o formulario deve ser resetado apos salvar

## Fluxo 6 - Navegacao

- [ ] alternar entre `Gastos`, `Entradas`, `Invest.`, `Parcelas`
- [ ] clicar novamente na aba ativa `Gastos`
- [ ] clicar novamente na aba ativa `Entradas`
- [ ] clicar novamente na aba ativa `Invest.`
- [ ] clicar novamente na aba ativa `Parcelas`

Resultado esperado:

- `Gastos` e `Entradas` podem abrir a lista
- `Invest.` e `Parcelas` nao devem abrir lista errada
- a navegacao deve continuar fluida

## Fluxo 7 - Lista e detalhe

- [ ] abrir a lista de gastos
- [ ] abrir um item da lista
- [ ] fechar detalhe
- [ ] abrir a lista de entradas
- [ ] abrir um item da lista

Resultado esperado:

- lista deve carregar sem erro
- detalhe deve abrir com os dados corretos

## Fluxo 8 - Persistencia local

- [ ] recarregar a pagina
- [ ] verificar se a configuracao do Supabase foi mantida

Resultado esperado:

- a configuracao deve continuar preenchida

## Fluxo 9 - PWA e cache

- [ ] recarregar o app uma segunda vez
- [ ] verificar se ele continua abrindo normalmente
- [ ] se instalar como app, abrir a versao instalada

Resultado esperado:

- o app deve continuar funcional
- nao deve haver comportamento estranho por cache antigo

## Criterio de aprovacao

Se todos os fluxos acima estiverem corretos, a Fase 0 pode ser considerada validada para checkpoint no GitHub e inicio da Fase 1.

## Se algo falhar

Anotar:

- em qual fluxo falhou
- o que voce fez antes
- a mensagem exibida
- se falhou no navegador, PWA instalado ou ambos
