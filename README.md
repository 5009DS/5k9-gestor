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
| `/repasses` | Quanto cada integrante recebeu e o que está em aberto. Valores lançados à mão. |
| `/investimentos` | Custos fixos (com a próxima cobrança) separados das compras pontuais. |
| `/cadastros` | Clientes e time, com o acumulado de todos os tempos. |
| `/configuracoes` | Conexão, exportar/importar, tema, dados de exemplo. |

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

**Repasse é lançado à mão.** O sistema não calcula divisão: cada projeto tem um
acordo próprio e quem decide é o time. O que o sistema garante é que o combinado
fique registrado, datado e somado.

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
    schema.sql        rodar uma vez no Supabase
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
