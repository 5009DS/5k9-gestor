# 5K9 Gestor

Fluxo de caixa do estúdio: de onde vem o dinheiro, quanto entrou em cada mês,
quanto foi repassado a cada integrante e o que o estúdio gasta consigo mesmo.

Mesmo desenho e mesma stack do [5K9 Forms](../5K9%20Forms) — módulos ES servidos
direto, sem build, sobre o design system da marca (`tokens.css` + `ds/`).

---

## Rodar

```bash
node .claude/static-server.js
```

Abre em `http://localhost:5174`. Não há passo de build: o servidor só entrega os
arquivos de `Sistema/` e devolve `index.html` para rotas sem extensão (o mesmo
que o `vercel.json` faz em produção).

## Modo local × Supabase

Enquanto `Sistema/lib/supabase-config.js` estiver vazio, o sistema roda em
**modo local**: tudo é gravado no `localStorage` deste navegador, ninguém mais
do time enxerga e limpar o cache apaga os dados. A topnav mostra o selo âmbar
"Modo local" o tempo todo por causa disso.

Para conectar o banco de verdade:

1. crie um projeto Supabase **novo**, separado do que hospeda o 5K9 Forms;
2. rode `Sistema/db/schema.sql` no SQL Editor dele;
3. crie um usuário por pessoa em *Authentication → Users → Add user*;
4. copie *Project URL* e a chave `anon` de *Settings → API*;
5. cole as duas em `Sistema/lib/supabase-config.js`.

Exporte os dados em **Configurações → Cópia de segurança** antes de trocar de
modo: a troca não leva nada junto. Depois de conectado, use "Importar".

## Telas

| Rota | O que responde |
|---|---|
| `/` | Fechamento do mês: entrou, repassado, investido, saldo. Doze meses em barras, divisão de cada real, origem (clientes) e destino (time), renovações próximas. |
| `/entradas` | Cada pagamento recebido ou previsto, com quanto dele já virou repasse. |
| `/repasses` | Quanto cada integrante recebeu, o que está em aberto e quanto do ganho ficou com o estúdio. Valores lançados à mão. |
| `/investimentos` | Compromissos (assinaturas e parcelamentos, pela próxima cobrança) separados do que pesou no mês. |
| `/cadastros` | Clientes e time, com o acumulado de todos os tempos. |
| `/configuracoes` | Conexão, exportar/importar, tema, dados de exemplo. |

## Comprovantes por e-mail

Toda segunda-feira cada integrante recebe um comprovante dos repasses da semana
anterior (segunda a domingo); todo dia 1º, um do mês que fechou. **Quem não
recebeu nada no período não recebe e-mail.**

O envio vive em [`Sistema/api/comprovantes.js`](Sistema/api/comprovantes.js) — o
único pedaço do sistema que roda fora do navegador. Precisa ser assim por dois
motivos sem contorno: horário marcado (um site estático só acorda quando alguém
o abre) e segredo (a chave de envio não pode ir no código do navegador).

### Ligar

1. Rode [`db/migracao-comprovantes.sql`](Sistema/db/migracao-comprovantes.sql) no Supabase.
2. Crie conta no [Resend](https://resend.com), verifique o domínio `5k9.studio`
   (registros DNS na GoDaddy, mesmo procedimento dos subdomínios) e gere uma
   API key.
3. Na Vercel, projeto do Gestor → **Settings → Environment Variables**:

| Variável | O que é |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE` | chave **service_role** — passa por cima do RLS, nunca no navegador |
| `RESEND_API_KEY` | chave da API do Resend |
| `EMAIL_REMETENTE` | `5K9 Studio <financeiro@5k9.studio>` |
| `CRON_SECRET` | qualquer texto longo aleatório; autentica o disparo |

4. Confira que cada integrante tem e-mail preenchido em **Cadastros**.
5. Faça deploy. A Vercel lê o `crons` do `vercel.json` e agenda sozinha.

### Testar sem esperar segunda-feira

`simular=1` calcula tudo e devolve o que sairia, **sem enviar nada**:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" "https://gestor.5k9.studio/api/comprovantes?simular=1&tipo=semanal&inicio=2026-08-03&fim=2026-08-09"
```

Tire o `simular=1` para enviar de verdade aquele período.

### Detalhes que valem saber

**O cron roda todo dia, não só segunda.** O plano Hobby da Vercel permite uma
execução diária; a função é que decide se hoje é dia de enviar. `0 12 * * *` é
meio-dia UTC, ou 9h de Brasília — o Brasil não tem horário de verão desde 2019,
então a conta é fixa. Toda decisão de data usa o fuso `America/Sao_Paulo`
explicitamente: sem isso, um disparo de madrugada cobriria a semana errada.

**O `vercel.json` reescreve tudo para o `index.html`, menos `/api/`.** A regra
usa `/((?!api/).*)` por causa disso. Na prática é cinto e suspensório: a Vercel
resolve funções antes de aplicar rewrites, então `/(.*)` também funcionaria. Se
algum dia a validação do deploy reclamar desse padrão, voltar para `/(.*)` é
seguro. (JSON não aceita comentários, e uma chave `//` extra já derrubou um
deploy no 5K9 Forms — por isso a explicação está aqui.)

**Comprovante repetido é pior que comprovante atrasado.** O registro em
`comprovantes_enviados` é gravado **antes** do envio, e a garantia real é o
índice único `(integrante_id, tipo, inicio, fim)` — não a consulta prévia, que
teria uma janela entre verificar e gravar. Se o envio falhar depois do registro,
ele é desfeito para a próxima execução tentar de novo.

**O e-mail ignora o design system, de propósito.** Cliente de e-mail não é
navegador: o Gmail remove `<style>` do topo, ninguém suporta custom properties
(todo `var(--accent)` viraria vazio) e o suporte a grid/flex é irregular. Por
isso o layout é em `<table>`, toda cor é literal e não há imagem remota — quase
todo cliente bloqueia imagens por padrão, e um comprovante que abre sem
cabeçalho parece falso. O tema é claro mesmo com o painel sendo escuro:
comprovante é encaminhado para contador e às vezes impresso, e o modo escuro do
Gmail reprocessa cores de um jeito impossível de prever.

**Só entram repasses pagos.** Previsto não é comprovante.

## Decisões que valem saber

**Dinheiro em centavos, sempre.** Todo valor circula como inteiro
(`valor_centavos`). Em ponto flutuante, somar cem repasses faz o total do painel
divergir da soma das linhas por alguns centavos — o erro que ninguém acha e todo
mundo desconfia. A divisão por 100 acontece só na hora de mostrar
(`lib/formato.js`).

**Regime de caixa, não de competência.** Um lançamento entra no mês em que o
dinheiro se move. Entrada prevista e repasse previsto ficam fora dos totais
realizados e aparecem em linha própria.

**Assinatura anual não vira despesa mensal.** R$ 1.200 cobrados em março saem
R$ 1.200 em março e zero nos outros onze meses. A média existe como
`custoFixoMensalizado()`, apresentada à parte para planejamento — nunca somada
ao caixa realizado (`lib/calculo.js`).

**Compra parcelada pesa por parcela.** Um monitor de R$ 4.200 em 6x tira
R$ 700 do caixa por seis meses, não R$ 4.200 de uma vez. O que fica gravado é o
total e o número de vezes; a parcela é derivada, com a sobra da divisão na
última — R$ 1.000 em 3x são 333,33 + 333,33 + **333,34**, e a soma bate com o
total ao centavo. Parcelamento fica fora do custo fixo mensalizado, porque
acaba; para "quanto já está comprometido", há o indicador de parcelas em aberto.

**Repasse é lançado à mão.** O sistema não calcula divisão: cada projeto tem um
acordo próprio e quem decide é o time. O que o sistema garante é que o combinado
fique registrado, datado e somado.

**Retenção é transferência, não despesa.** Parte do que é alocado a um
integrante pode ficar com o estúdio — R$ 2.000 para o Time1 com R$ 150 retidos
significam R$ 1.850 saindo da conta e R$ 150 permanecendo em casa. Por isso
"repassado ao time" mostra o **líquido**: contar o bruto faria o mesmo real sair
duas vezes, uma como pagamento e outra depois como investimento comprado com
ele. A retenção fica fora de `saiu` e de `saldo` (`lib/calculo.js`).

**A reserva do estúdio é uma etiqueta, não um segundo caixa.** Ela é o retido
acumulado menos o investido acumulado, e o dinheiro retido nunca saiu da conta —
está dentro do saldo. Pode ficar negativa, e isso é informação: significa que os
investimentos passaram do que foi separado e o excedente veio do lucro geral.

**Cancelar assinatura não reescreve o passado.** O banco guarda `encerrado_em`
(quando parou), não um booleano — assim os meses anteriores continuam calculando
certo depois do cancelamento.

**Excluir cadastro não apaga dinheiro.** Remover um cliente deixa as entradas
dele como "sem cliente" (`on delete set null`); remover um integrante mantém o
histórico de repasses. Feio e recuperável, nessa ordem.

## Estrutura

```
Sistema/
  index.html          entrada única; carrega tokens antes de tudo
  app.js              roteador SPA (History API)
  store.js            escolhe o adaptador e expõe as cinco coleções
  theme.js            claro/escuro (mesma chave do Forms: 5k9_theme)
  db/
    schema.sql                 rodar uma vez, num projeto Supabase novo
    migracao-parcelas.sql      compras parceladas — rodar em bancos já criados
    migracao-retencao.sql      retenção para o estúdio — idem
    migracao-comprovantes.sql  registro de e-mails enviados — idem
  api/
    comprovantes.js         função agendada (Vercel Cron) — roda fora do navegador
    local.js          adaptador localStorage
    remoto.js         adaptador Supabase (import preguiçoso da lib)
  lib/
    formato.js        moeda, datas, escape
    calculo.js        todas as agregações do fluxo de caixa
    rotas.js  ui.js   navegação e ajudantes de filtro
  components/
    topnav.js  pageshell.js  campos.js  drawer.js  toast.js  menu.js
  pages/
    gestor.css        vocabulário .gs- compartilhado
    painel.js  entradas.js  repasses.js  investimentos.js
    cadastros.js  configuracoes.js  login.js
  ds/                 design system entregue pelo estúdio — não editar
  tokens.css          camada base (dark-first)
  tokens-bridge.css   traduz os nomes semânticos para os tokens da marca
```

Nenhum componente novo usa cor literal: tudo é `var(--token)`. É o que faz o
tema claro funcionar sem ninguém revisar.
