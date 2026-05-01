# Blueprint de Implantacao Final - Sistema de Financas

## Objetivo

Consolidar o sistema de financas pessoais em uma base unica que permita:

- registrar gastos e entradas com qualidade analitica
- registrar compras parceladas, inclusive parcelamentos ja em andamento
- separar com clareza o que e seu, o que e da sua mae e o que pertence a contextos especificos
- acompanhar o custo real da casa atual versus a sublocacao de valor fixo
- acompanhar o fluxo completo e o saldo projetado do apartamento Alya
- preparar a base para um modulo futuro de investimentos

Este documento considera apenas o que foi lido nos arquivos atuais `html`, `json`, `sql` e `js`. O PDF do Alya nao foi usado nesta etapa.

## Estado Atual

O sistema atual ja entrega:

- autenticacao via Supabase
- cadastro de gastos
- cadastro de entradas
- classificacao simples por categoria, subcategoria e necessidade
- separacao basica entre `eu` e `mae`
- listagem simples de registros

O sistema atual ainda nao entrega:

- dashboards analiticos reais
- modelagem do apartamento Alya
- modelagem da casa atual como centro de resultado
- controle de saldo da sua mae com voce
- competencia mensal real de parcelamentos
- cadastro orientado de parcelamentos ativos ja existentes no cartao
- modulo de investimentos

## Principios de Implantacao

1. O sistema deve separar `natureza financeira` de `contexto analitico`.
2. Nem todo gasto de categoria `Moradia` e igual a "despesa qualquer"; no seu caso ele tambem alimenta um painel proprio da casa atual.
3. O Alya deve ser tratado como modulo proprio, nao como categoria de gasto.
4. O dinheiro da sua mae precisa de rastreabilidade patrimonial e de caixa.
5. Dashboards devem nascer em cima de estrutura de dados estavel, nao em cima de regras espalhadas na interface.
6. Investimentos entram depois que fluxo de caixa, casa atual e Alya estiverem consistentes.
7. Parcelamentos precisam guardar tanto o mes em que a compra foi feita quanto o mes em que cada parcela impacta o caixa.

## Visao de Dominio

O sistema final deve organizar os dados em cinco dominios:

1. Fluxo pessoal
2. Casa atual e sublocacao
3. Alya
4. Fluxo da mae
5. Investimentos

### 1. Fluxo pessoal

Entram seus gastos, entradas, transferencias, reembolsos e classificacoes analiticas.

### 2. Casa atual e sublocacao

Entram todos os gastos do apartamento atual alugado e a receita fixa de sublocacao, para medir resultado mensal e tendencia.

### 3. Alya

Entram o cronograma-base contratado, as parcelas ja pagas, os fatores de atualizacao, os saldos projetados e os blocos do fluxo de pagamento.

### 4. Fluxo da mae

Entram gastos feitos para ela, valores dela parados na sua conta, aportes, resgates, reembolsos e saldo liquido dela sob sua guarda.

### 5. Investimentos

Entram ativos, eventos financeiros e evolucao de posicao. Este dominio fica para a fase final.

## Modelo de Dados Alvo

O banco atual nao deve crescer apenas adicionando colunas em `gastos` e `entradas`. O ideal e evoluir para um modelo mais explicito.

### Tabelas Base

#### `contas_financeiras`

Representa onde o dinheiro transita.

Campos sugeridos:

- `id`
- `user_id`
- `nome`
- `instituicao`
- `tipo`
- `titularidade` (`eu`, `mae`, `compartilhado`)
- `ativa`

#### `lancamentos`

Tabela central de caixa. Deve substituir a analise separada de gastos e entradas.

Campos sugeridos:

- `id`
- `user_id`
- `tipo` (`saida`, `entrada`, `transferencia_interna`, `ajuste`)
- `proprietario_economico` (`eu`, `mae`)
- `contexto` (`pessoal`, `mae`, `casa_atual`, `alya`, `investimento`)
- `descricao`
- `categoria`
- `subcategoria`
- `necessidade`
- `valor`
- `data_contratacao`
- `data_evento`
- `mes_origem_compra`
- `mes_competencia`
- `conta_origem_id`
- `conta_destino_id`
- `forma_pagamento`
- `banco_referencia`
- `observacoes`
- `created_at`

Observacao:

- `mes_competencia` e obrigatorio para dashboard mensal consistente.
- `mes_origem_compra` responde quando a obrigacao foi criada, mesmo que o impacto de caixa aconteca em meses futuros.
- `contexto = casa_atual` deve ser preenchido em todos os gastos da categoria `Moradia` ligados ao apartamento atual.

#### `parcelamentos`

Define uma compra parcelada como contrato, e nao so como texto.

Campos sugeridos:

- `id`
- `user_id`
- `lancamento_origem_id`
- `descricao`
- `categoria`
- `subcategoria`
- `necessidade`
- `contexto`
- `total_parcelas`
- `parcela_atual`
- `valor_total`
- `valor_parcela_base`
- `valor_total_aberto`
- `data_compra`
- `mes_origem_compra`
- `inicio_competencia`
- `origem_cadastro` (`nova_compra`, `parcela_ativa_migrada`)
- `ativo`

#### `parcelas_lancamento`

Explode o parcelamento nas competencias mensais para analise correta.

Campos sugeridos:

- `id`
- `user_id`
- `parcelamento_id`
- `numero_parcela`
- `mes_origem_compra`
- `mes_competencia`
- `valor`
- `status` (`prevista`, `paga`)
- `lancamento_pagamento_id`

## Parcelamentos Ativos e Competencia Retroativa

Esse ponto passa a ser obrigatorio para a implantacao final.

Cenario:

- voce ja possui parcelas em aberto no cartao, contratadas em meses anteriores
- essas parcelas precisam entrar na analise mensal a partir de agora
- o dashboard nao pode tratar todo gasto do mes como se tivesse nascido no proprio mes

Diretriz operacional:

- o sistema deve permitir cadastrar um parcelamento ja existente, mesmo que a compra original tenha acontecido no passado
- o cadastro minimo deve permitir informar mes da compra, valor total, quantidade total, quantidade ja paga, quantidade em aberto, valor da parcela, cartao/conta, categoria, subcategoria, necessidade e contexto
- o sistema deve gerar automaticamente apenas as parcelas ainda em aberto quando a intencao for iniciar o controle a partir de hoje
- o sistema pode permitir, como modo opcional, reconstruir parcelas antigas ja pagas se voce quiser historico completo retroativo

Regra de leitura:

- parcela em aberto de compra antiga entra no custo do mes em que ela vence
- mas ela deve continuar marcada como obrigacao originada em mes anterior
- isso permite diferenciar caixa do mes de decisao de consumo do mes

### Tabelas da Mae

#### `movimentos_mae`

Rastreia tudo que afeta o patrimonio dela sob sua gestao.

Campos sugeridos:

- `id`
- `user_id`
- `tipo` (`gasto_pago_por_mim`, `reembolso_recebido`, `aporte_dela`, `resgate_para_ela`, `saldo_em_conta`, `investimento`)
- `descricao`
- `valor`
- `data_evento`
- `conta_relacionada_id`
- `observacoes`

#### `saldos_mae_snapshot`

Opcional para performance e conciliacao.

Campos sugeridos:

- `id`
- `user_id`
- `data_referencia`
- `saldo_caixa_comigo`
- `saldo_investido`
- `saldo_total`

### Tabelas da Casa Atual

Nao precisa de modulo isolado se o `contexto = casa_atual` estiver bem preenchido, mas duas tabelas ajudam.

#### `contratos_sublocacao`

Campos sugeridos:

- `id`
- `user_id`
- `descricao`
- `valor_mensal_fixo`
- `inicio_vigencia`
- `fim_vigencia`
- `ativo`

#### `receitas_casa_atual`

Pode ser view ou tabela, dependendo do processo.

Campos sugeridos:

- `id`
- `user_id`
- `origem`
- `valor`
- `data_evento`
- `mes_competencia`
- `contrato_sublocacao_id`

### Tabelas do Alya

#### `empreendimentos`

Campos sugeridos:

- `id`
- `user_id`
- `nome`
- `unidade`
- `ativo`

#### `alya_fluxo_base`

Cronograma contratado original, sem atualizacao.

Campos sugeridos:

- `id`
- `user_id`
- `empreendimento_id`
- `bloco` (`entrada`, `mensal`, `anual`, `reforco`, `financiamento`, `intermediaria`)
- `ordem`
- `data_vencimento_base`
- `valor_base`
- `quantidade_total`
- `grupo_reajuste`
- `status` (`aberto`, `pago`, `cancelado`)

#### `alya_pagamentos`

Registra os pagamentos reais feitos.

Campos sugeridos:

- `id`
- `user_id`
- `empreendimento_id`
- `alya_fluxo_base_id`
- `data_pagamento`
- `valor_pago`
- `numero_referencia`
- `indice_aplicado`
- `fator_vs_parcela_anterior`
- `observacoes`

#### `alya_projecoes`

Pode comecar como view materializada ou logica de consulta.

Campos calculados desejados:

- `valor_atualizado_parcela`
- `saldo_total_aberto_atualizado`
- `quantidade_parcelas_abertas`
- `total_pago`
- `percentual_pago`

### Tabelas Futuras de Investimentos

#### `ativos`

- `id`
- `user_id`
- `instituicao`
- `ticker_ou_nome`
- `classe`
- `titularidade`
- `ativo`

#### `movimentos_investimento`

- `id`
- `user_id`
- `ativo_id`
- `tipo` (`aporte`, `resgate`, `rendimento`, `taxa`, `transferencia`)
- `valor`
- `quantidade`
- `data_evento`
- `observacoes`

## Regras de Classificacao

### Categoria x Contexto

Regra obrigatoria:

- categoria responde "o que foi isso?"
- contexto responde "em qual analise isso entra?"

Exemplos:

- energia do apartamento atual: categoria `Moradia`, contexto `casa_atual`
- compra de farmacia para voce: categoria `Saude`, contexto `pessoal`
- conta paga para sua mae: categoria pode ser nula ou especifica, contexto `mae`, proprietario `mae`

### Necessidade

Manter a escala atual faz sentido:

- `1` vital
- `2` basico
- `3` superfluo
- `4` bobagem

Diretriz:

- necessidade deve existir apenas para gastos pessoais analisaveis
- nao aplicar automaticamente em Alya, mae ou transferencias puras

### Moradia

Regra fechada:

- todo gasto que pertença ao apartamento atual alugado deve carregar `contexto = casa_atual`
- isso inclui aluguel, servicos, faxina, produtos, taxas e afins

## Regras de Calculo dos Dashboards

### Dashboard Geral Pessoal

Indicadores principais:

- total de entradas do mes
- total de saidas do mes
- saldo do mes
- custo do mes vindo de meses anteriores
- gasto novo do mes com impacto no proprio mes
- gasto criado no mes e empurrado para meses futuros
- gasto por categoria
- gasto por subcategoria
- gasto por necessidade
- evolucao mensal
- top variacoes versus mes anterior

Leituras obrigatorias:

- visao de caixa do mes
- visao de compromissos assumidos no mes

Regras analiticas:

- `custo_herdado_mes` = soma das parcelas com `mes_competencia = mes_analisado` e `mes_origem_compra < mes_analisado`
- `gasto_novo_no_mes` = soma dos gastos com `mes_competencia = mes_analisado` e `mes_origem_compra = mes_analisado`
- `gasto_jogado_para_futuro_no_mes` = soma das parcelas com `mes_origem_compra = mes_analisado` e `mes_competencia > mes_analisado`
- o dashboard deve mostrar tanto o valor que pesou no mes quanto o valor de compromisso futuro criado naquele mes

### Dashboard da Casa Atual

Objetivo:

medir se a sublocacao fixa esta cobrindo o custo real da moradia.

Metricas:

- custo total mensal da casa atual
- receita mensal de sublocacao
- resultado mensal = sublocacao - custo real
- media movel de 3 meses
- media movel de 6 meses
- percentual de variacao de custo
- alerta de defasagem do valor fixo

Regra central:

- se `resultado mensal < 0` por recorrencia ou se a media movel ficar negativa, o painel deve sugerir revisao do valor fixo

### Dashboard da Mae

Objetivo:

separar claramente o que e dela do que e seu.

Metricas:

- total pago por voce para ela no periodo
- total reembolsado por ela
- saldo dela em sua conta
- saldo investido dela
- saldo total sob sua gestao

### Dashboard Alya

Objetivo:

acompanhar valor pago, saldo aberto, numero de parcelas restantes e projecoes atualizadas.

Metricas:

- total pago ate hoje
- saldo aberto atualizado
- quantidade de eventos pagos
- quantidade de eventos em aberto
- valor atualizado da proxima parcela
- valor atualizado do financiamento
- valor atualizado dos reforcos/anuais
- serie de evolucao do saldo

## Regra de Atualizacao do Alya

Esta e a regra principal descrita por voce e deve virar regra de negocio central do sistema.

### Conceito

Quando voce cadastra uma nova parcela mensal paga do Alya, o sistema compara:

- valor da parcela mensal atual paga
- valor da parcela mensal anterior conhecida

E calcula:

- `fator_atualizacao = parcela_atual / parcela_anterior`

### Aplicacao

O `fator_atualizacao` deve ser aplicado a todos os itens futuros em aberto que pertencam ao mesmo fluxo reajustavel:

- proximas parcelas mensais
- financiamento em aberto
- parcelas extras de reforco em aberto

### Regras operacionais

1. Parcelas ja pagas nunca devem ser recalculadas retroativamente.
2. Apenas itens em aberto recebem novo fator.
3. O sistema deve manter historico dos fatores aplicados por evento pago.
4. A projecao deve sempre refletir o ultimo fator valido conhecido.
5. Se uma parcela for corrigida manualmente, o sistema deve recomputar as projecoes futuras a partir dela.

### Estrategia de implementacao

O fluxo base do contrato fica salvo em `alya_fluxo_base`.

Quando um pagamento mensal real entra em `alya_pagamentos`, o sistema:

1. identifica a parcela mensal anterior comparavel
2. calcula o fator
3. grava o fator no pagamento
4. recalcula todas as linhas futuras em aberto dos grupos afetados
5. atualiza os totais do dashboard

## Views e Camadas Analiticas Recomendadas

### `v_lancamentos_mensais`

Agrupa por `mes_competencia`, `tipo`, `contexto`, `categoria`, `proprietario_economico`.

### `v_gastos_origem_competencia`

Entrega por mes:

- total que nasceu no proprio mes
- total herdado de meses anteriores
- total jogado para meses futuros
- quantidade de parcelamentos ativos impactando o mes

### `v_resultado_casa_atual`

Entrega por mes:

- custo total
- receita de sublocacao
- resultado
- media movel

### `v_saldo_mae`

Entrega:

- total aportado por ela
- total gasto por conta dela
- total reembolsado
- saldo atual sob sua guarda

### `v_alya_posicao_atual`

Entrega:

- total_base_contratado
- total_pago
- saldo_aberto_atualizado
- proxima_parcela
- fator_atual

## Dashboards Prioritarios

### Fase 1

- dashboard geral pessoal
- dashboard de gastos por categoria
- dashboard por necessidade
- cadastro de parcelamentos ativos
- leitura por origem temporal do gasto

### Fase 2

- dashboard da casa atual

### Fase 3

- dashboard Alya

### Fase 4

- dashboard da mae

### Fase 5

- dashboard de investimentos

## Backlog de Implantacao

Regra de acompanhamento:

- itens concluidos devem ser marcados com `[x]`
- itens futuros devem permanecer como `[ ]`
- a cada rodada de implementacao, o blueprint deve refletir o estado real do projeto

Registro de execucao:

- `2026-05-01`: corrigida a navegacao das abas `investimentos` e `parcelas`
- `2026-05-01`: removidos os segredos hardcoded do frontend; a configuracao do Supabase agora e salva localmente pela tela de autenticacao
- `2026-05-01`: corrigido o encoding dos arquivos principais (`financas.html`, `financas-manifest.json`, `financas-schema.sql`, `financas-sw.js`) para restaurar textos legiveis em UTF-8
- `2026-05-01`: ajustados manifest, service worker e registro do PWA para usar caminhos relativos, novo versionamento de cache e armazenamento dinamico de recursos locais
- `2026-05-01`: separado o JavaScript monolitico em arquivos `financas-core.js`, `financas-app.js` e `financas-init.js`, mantendo a logica atual e melhorando a base para evolucao
- `2026-05-01`: checklist manual da Fase 0 validado com sucesso; liberado checkpoint tecnico e inicio da Fase 1
- `2026-05-01`: criada a especificacao SQL inicial da Fase 1 em `financas-fase1-lancamentos.sql`, introduzindo o nucleo `lancamentos`, `contexto` e `mes_competencia` sem remover o schema legado
- `2026-05-01`: criado o script `financas-fase1-migracao-legado.sql` para migrar `gastos` e `entradas` para `lancamentos` de forma idempotente e rastreavel, ainda sem aplicar no banco remoto
- `2026-05-01`: ajustada a geracao de `mes_competencia` para timezone fixa `America/Sao_Paulo`, evitando erro de expressao nao-imutavel no Postgres/Supabase
- `2026-05-01`: criada a modelagem incremental de parcelamentos em `financas-fase1-parcelamentos.sql`, com tabelas de contrato, parcelas por competencia, resumo analitico e funcao segura de sincronizacao
- `2026-05-01`: confirmado que os scripts da Fase 1 (`lancamentos`, migracao legada e parcelamentos) ja foram aplicados no Supabase
- `2026-05-01`: iniciado o dashboard geral da Fase 2 no `index.html`, com aba `Resumo`, consolidacao mensal por `lancamentos` e blocos analiticos por categoria e necessidade
- `2026-05-01`: novos gastos e entradas passaram a gravar tambem em `lancamentos`, mantendo o dashboard atualizado apos cada cadastro
- `2026-05-01`: corrigido o PWA para usar `index.html` como app shell real, com novo versionamento de cache em `financas-v3`
- `2026-05-01`: corrigido o fluxo de submissao para nao travar em `Salvando...` quando houver falha de sincronizacao no resumo; a listagem de gastos e entradas passou a exibir erros de consulta e foi adicionada a edicao/exclusao de gastos a partir do detalhe do registro
- `2026-05-01`: atualizado o service worker para `financas-v4`, forçando renovacao do cache apos os ajustes de cadastro, listagem e detalhe
- `2026-05-01`: iniciada a rodada de branding do app como `dindin`, com novo nome visual, tema verde, suporte a icones dedicados e cache `financas-v5`
- `2026-05-01`: reforcada a persistencia de sessao do Supabase com `storageKey` proprio e configuracao explicita de `persistSession`, preparando o app para permanecer logado entre acessos
- `2026-05-01`: preparada a base para configuracao Supabase embarcada no app, permitindo remover a etapa manual de URL/chave assim que os valores reais do projeto forem inseridos
- `2026-05-01`: configuracao real do projeto Supabase embarcada no app `dindin`, removendo a necessidade de URL/chave manual para novos usuarios e atualizando o cache para `financas-v6`
- `2026-05-01`: blueprint ampliado para tratar parcelamentos ativos como requisito central, incluindo cadastro de parcelas ja em aberto, `mes_origem_compra` e leitura analitica separando custo herdado, gasto novo no mes e gasto empurrado para o futuro
- `2026-05-01`: criado o script complementar `financas-fase1-parcelamentos-ativos.sql`, adicionando `data_contratacao`, `mes_origem_compra`, suporte a parcelamentos ativos ja existentes e a view `v_gastos_origem_competencia`; o script foi preparado no projeto e ainda precisa ser executado no Supabase
- `2026-05-01`: a aba `Parcelas` deixou de ser placeholder e ganhou um fluxo inicial para cadastro manual de parcelamentos ativos, pronto para usar a funcao `criar_parcelamento_ativo_existente(...)` depois da execucao do SQL complementar; o cache do app foi atualizado para `financas-v7`
- `2026-05-01`: corrigido o script `financas-fase1-parcelamentos-ativos.sql` para manter a ordem original das colunas da view `v_parcelamentos_resumo`, evitando erro de substituicao da view no Postgres
- `2026-05-01`: reforcada a compatibilidade mobile no fluxo de gastos e entradas com recuperacao explicita de sessao antes de salvar/listar, fallback para `UUID` sem `crypto.randomUUID()` e parser manual de `datetime-local`; o cache do app foi atualizado para `financas-v8`
- `2026-05-01`: corrigido o scroll da aba `Parcelas` no celular e conectado o dashboard geral a `v_gastos_origem_competencia`, passando a exibir custo herdado, gasto novo no mes e gasto jogado para o futuro; o cache do app foi atualizado para `financas-v9`
- `2026-05-01`: corrigido o layout do app instalado no celular, ancorando telas, overlays e navegacao inferior ao frame da aplicacao e compactando a barra inferior no modo standalone; o cache do app foi atualizado para `financas-v10`
- `2026-05-01`: revertido o posicionamento estrutural de telas e menu inferior para `fixed`, restaurando a barra de navegacao parada no Safari e no app instalado, com padding extra nas areas rolaveis para nao esconder campos atras do menu; o cache do app foi atualizado para `financas-v11`
- `2026-05-01`: a aba `Parcelas` passou a reutilizar exatamente o container rolavel de `Resumo` (`dashboard-scroll`) e teve removido o bloco explicativo inutil, alinhando seu comportamento de scroll ao painel que ja funcionava; o cache do app foi atualizado para `financas-v12`

### Fase 0 - Saneamento da base atual

- [x] corrigir encoding dos arquivos
- [x] remover segredos hardcoded do frontend e migrar configuracao sensivel
- [x] separar o JS monolitico em modulos
- [x] ajustar PWA e cache
- [x] corrigir navegacao das abas `investimentos` e `parcelas`

### Fase 1 - Refatoracao de dados

- [x] criar modelo alvo de `lancamentos`
- [x] introduzir `contexto` e `mes_competencia`
- [x] modelar parcelamentos corretamente
- [x] criar migracao dos dados atuais de `gastos` e `entradas`
- [x] complementar a modelagem com `data_contratacao` e `mes_origem_compra`
- [x] permitir gerar parcelas futuras a partir de parcelamentos ativos ja existentes

### Fase 2 - Dashboards essenciais

- [x] consolidar consultas mensais
- [x] construir dashboard geral
- [x] construir dashboard por categoria
- [x] construir dashboard por necessidade
- [x] criar fluxo de cadastro de parcelamentos ativos
- [x] separar no dashboard o custo herdado de meses anteriores
- [x] separar no dashboard o gasto novo do proprio mes
- [x] separar no dashboard o gasto do mes empurrado para competencias futuras

### Fase 3 - Casa atual

- [ ] implementar `contexto = casa_atual`
- [ ] registrar sublocacao fixa
- [ ] criar analise de resultado mensal da casa

### Fase 4 - Alya

- [ ] cadastrar fluxo base do contrato
- [ ] cadastrar historico de parcelas pagas
- [ ] implementar regra de fator de atualizacao
- [ ] construir painel de saldo, faltante e projecao

### Fase 5 - Mae

- [ ] modelar saldo da mae com voce
- [ ] criar dashboard especifico da mae

### Fase 6 - Investimentos

- [ ] modelar ativos e eventos
- [ ] registrar aportes, retiradas e rendimentos
- [ ] construir painel de evolucao por ativo e consolidado

## Criticos de Sucesso

O sistema so deve ser considerado pronto para uso analitico quando:

- os lancamentos estiverem com `contexto` confiavel
- os parcelamentos ativos antigos puderem ser cadastrados sem distorcer a leitura mensal
- o dashboard geral separar corretamente custo herdado, gasto novo do mes e gasto jogado para frente
- a casa atual tiver resultado mensal automatico
- o saldo da sua mae com voce estiver reconciliavel
- o Alya recalcular corretamente o aberto futuro a partir da ultima parcela mensal informada
- os dashboards mensais baterem com os valores reais

## Ordem Recomendada de Execucao

1. saneamento tecnico
2. refatoracao do banco
3. complementar parcelamentos ativos e origem temporal
4. dashboard geral
5. casa atual
6. Alya
7. mae
8. investimentos

## Proximo Passo Objetivo

O melhor proximo passo de implementacao e este:

1. complementar o modelo de dados para guardar `data_contratacao` e `mes_origem_compra`
2. criar o fluxo de cadastro manual de parcelamentos ativos ja existentes no cartao
3. ajustar o dashboard para separar `custo herdado`, `gasto novo no mes` e `gasto jogado para o futuro`

Se quisermos seguir com eficiencia, a proxima entrega pratica deve ser a especificacao SQL complementar de parcelamentos ativos e origem temporal, seguida do formulario de cadastro dessas parcelas em aberto.
