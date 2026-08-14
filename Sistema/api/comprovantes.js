/* ═══════════════════════════════════════════════════════════════════════════
   COMPROVANTES DE REPASSE — envio automático por e-mail.

   Roda na Vercel, disparada pelo cron declarado em vercel.json. É o único
   pedaço do 5K9 Gestor que executa FORA do navegador, e existe por dois
   motivos que não têm outra solução: horário marcado (um site estático só
   acorda quando alguém o abre) e segredo (a chave de envio não pode viver
   no código que vai para o navegador).

   ── O que faz ────────────────────────────────────────────────────────────
   Uma execução por dia. Ela mesma decide se hoje é dia de enviar:

     · segunda-feira  → comprovante SEMANAL da segunda a domingo anteriores
     · dia 1º         → comprovante MENSAL do mês que fechou

   Quando o dia 1º cai numa segunda, os dois saem: cobrem períodos
   diferentes e um não substitui o outro.

   Para cada integrante com repasse PAGO no período, monta e envia. Quem não
   recebeu nada no período não recebe e-mail — comprovante de nada é ruído, e
   ruído recorrente ensina a ignorar a caixa de entrada.

   ── Sem dependências, de propósito ───────────────────────────────────────
   Fala com o Supabase pela API REST e com o Resend por HTTP, tudo com fetch
   nativo. O resto do projeto não tem package.json nem passo de build, e
   introduzir npm aqui obrigaria o repositório inteiro a virar projeto Node
   por causa de um arquivo.

   CommonJS pelo mesmo motivo: sem package.json declarando "type": "module",
   é o que a Vercel entende sem configuração. A consequência é que os
   ajudantes de formatação estão duplicados do lib/formato.js — os do
   navegador são ESM e não dá para importá-los daqui sem arrastar
   configuração para o projeto todo. São vinte linhas; a alternativa custava
   mais.

   ── Variáveis de ambiente (Vercel → Settings → Environment Variables) ────
     SUPABASE_URL           https://xxxx.supabase.co
     SUPABASE_SERVICE_ROLE  chave service_role — SEGREDO, passa por cima do
                            RLS. Nunca no navegador, nunca no repositório.
     RESEND_API_KEY         chave da API do Resend — SEGREDO
     EMAIL_REMETENTE        5K9 Studio <financeiro@5k9.studio>
     CRON_SECRET            segredo que autentica o disparo (ver abaixo)
   ═══════════════════════════════════════════════════════════════════════════ */

const FUSO = 'America/Sao_Paulo';

// ── Ajudantes ────────────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (centavos) => BRL.format((Number(centavos) || 0) / 100);

const dataBR = (iso) => {
    const p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const liquido = (r) => (Number(r.valor_centavos) || 0) - (Number(r.retido_centavos) || 0);

/* Data de hoje no fuso de São Paulo, como 'AAAA-MM-DD'.
   O cron da Vercel dispara em UTC. Às 9h de Brasília já é meio-dia em UTC,
   mas o contrário também acontece: um disparo às 2h UTC ainda é o dia
   ANTERIOR aqui. Sem fixar o fuso, o comprovante "de segunda" sairia no
   domingo em parte do ano e cobriria a semana errada. */
const hojeLocal = () =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

/** 0 = domingo, 1 = segunda… Calculado sobre a data local, não sobre o UTC. */
const diaDaSemana = (iso) => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** Soma dias a uma data ISO, devolvendo ISO. Aritmética em UTC evita DST. */
const somarDias = (iso, dias) => {
    const [a, m, d] = iso.split('-').map(Number);
    const x = new Date(Date.UTC(a, m - 1, d + dias));
    return x.toISOString().slice(0, 10);
};

// ── Períodos ─────────────────────────────────────────────────────────────
/**
 * Quais comprovantes o dia de hoje pede.
 *
 * O período sempre termina ANTES de hoje. Enviar no dia 1º cobrindo o mês
 * que fechou (e não no dia 31 cobrindo o mês corrente) é o que garante que
 * um repasse lançado no último dia entre no comprovante certo.
 */
const periodosDe = (hoje) => {
    const lista = [];

    if (diaDaSemana(hoje) === 1) {
        lista.push({
            tipo: 'semanal',
            inicio: somarDias(hoje, -7),   // segunda passada
            fim:    somarDias(hoje, -1),   // domingo
        });
    }

    if (Number(hoje.slice(8, 10)) === 1) {
        const [ano, mes] = hoje.split('-').map(Number);
        const anoAnt = mes === 1 ? ano - 1 : ano;
        const mesAnt = mes === 1 ? 12 : mes - 1;
        const ultimo = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate();
        lista.push({
            tipo: 'mensal',
            inicio: `${anoAnt}-${String(mesAnt).padStart(2, '0')}-01`,
            fim:    `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${ultimo}`,
        });
    }

    return lista;
};

const rotuloPeriodo = (p) => {
    if (p.tipo === 'mensal') {
        const [ano, mes] = p.inicio.split('-').map(Number);
        return `${MESES[mes - 1]} de ${ano}`;
    }
    return `${dataBR(p.inicio)} a ${dataBR(p.fim)}`;
};

// ── Supabase (REST, com service_role) ────────────────────────────────────
const sb = async (caminho, opcoes = {}) => {
    const url = `${process.env.SUPABASE_URL}/rest/v1/${caminho}`;
    const r = await fetch(url, {
        ...opcoes,
        headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}`,
            'Content-Type': 'application/json',
            ...(opcoes.headers || {}),
        },
    });
    if (!r.ok) {
        const corpo = await r.text();
        const e = new Error(`Supabase ${r.status}: ${corpo.slice(0, 300)}`);
        e.status = r.status;
        e.corpo = corpo;
        throw e;
    }
    return r.status === 204 ? null : r.json();
};

// ── E-mail ───────────────────────────────────────────────────────────────
const enviarEmail = async ({ para, assunto, html }) => {
    const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: process.env.EMAIL_REMETENTE,
            to: [para],
            subject: assunto,
            html,
        }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
};

/* ── Corpo do e-mail ──────────────────────────────────────────────────────
   Aqui o design system NÃO se aplica, e a exceção é deliberada.

   Cliente de e-mail não é navegador: Gmail remove <style> do topo, ninguém
   suporta custom properties (todo var(--accent) viraria vazio), e grid e
   flex têm suporte irregular. Por isso o layout é em <table> e toda cor é
   literal — os mesmos valores da marca, escritos à mão.

   Claro, e não escuro como o painel: comprovante financeiro é lido em
   diagonal, encaminhado para contador e às vezes impresso. Além disso o
   modo escuro do Gmail reprocessa cores por conta própria e desmonta
   template escuro de um jeito impossível de prever.

   Sem imagem remota: quase todo cliente bloqueia por padrão, e um
   comprovante que abre sem cabeçalho parece falso. A marca é texto. */
const montarHTML = ({ integrante, periodo, repasses, entradas }) => {
    const totalLiquido = repasses.reduce((t, r) => t + liquido(r), 0);
    const totalBruto   = repasses.reduce((t, r) => t + (Number(r.valor_centavos) || 0), 0);
    const totalRetido  = repasses.reduce((t, r) => t + (Number(r.retido_centavos) || 0), 0);
    const houveRetencao = totalRetido > 0;

    const linhas = repasses.map((r, i) => {
        const entrada = entradas.find(e => e.id === r.entrada_id);
        const referencia = entrada?.projeto || r.nota || '—';
        const fundo = i % 2 ? '#FAFAFB' : '#FFFFFF';
        return `
        <tr>
            <td style="padding:12px 16px;background:${fundo};border-bottom:1px solid #EDEDF0;font-size:14px;color:#0A0A0D;white-space:nowrap;">
                ${dataBR(r.data)}
            </td>
            <td style="padding:12px 16px;background:${fundo};border-bottom:1px solid #EDEDF0;font-size:14px;color:#52525B;">
                ${esc(referencia)}
            </td>
            ${houveRetencao ? `
            <td align="right" style="padding:12px 16px;background:${fundo};border-bottom:1px solid #EDEDF0;font-size:14px;color:#52525B;white-space:nowrap;">
                ${moeda(r.valor_centavos)}
            </td>
            <td align="right" style="padding:12px 16px;background:${fundo};border-bottom:1px solid #EDEDF0;font-size:14px;color:#7F00E1;white-space:nowrap;">
                ${r.retido_centavos ? `− ${moeda(r.retido_centavos)}` : '—'}
            </td>` : ''}
            <td align="right" style="padding:12px 16px;background:${fundo};border-bottom:1px solid #EDEDF0;font-size:14px;font-weight:600;color:#0A0A0D;white-space:nowrap;">
                ${moeda(liquido(r))}
            </td>
        </tr>`;
    }).join('');

    const colunas = houveRetencao ? 5 : 3;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F2;padding:32px 16px;">
<tr><td align="center">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E4E4E8;">

    <!-- Cabeçalho -->
    <tr><td style="padding:28px 32px 24px;border-bottom:1px solid #EDEDF0;">
        <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#7F00E1;text-transform:uppercase;">5K9 Studio</div>
        <div style="margin-top:10px;font-size:22px;font-weight:600;color:#0A0A0D;letter-spacing:-0.3px;">
            Comprovante de repasse
        </div>
        <div style="margin-top:4px;font-size:14px;color:#71717A;">
            ${periodo.tipo === 'mensal' ? 'Mês de' : 'Semana de'} ${rotuloPeriodo(periodo)}
        </div>
    </td></tr>

    <!-- Total -->
    <tr><td style="padding:28px 32px;">
        <div style="font-size:13px;color:#71717A;">Olá, ${esc((integrante.nome || '').split(' ')[0])}. Você recebeu no período:</div>
        <div style="margin-top:8px;font-size:36px;font-weight:700;color:#0A0A0D;letter-spacing:-1px;">
            ${moeda(totalLiquido)}
        </div>
        <div style="margin-top:6px;font-size:13px;color:#71717A;">
            ${repasses.length} ${repasses.length === 1 ? 'repasse' : 'repasses'}
            ${houveRetencao ? `· ${moeda(totalBruto)} brutos, ${moeda(totalRetido)} destinados ao estúdio` : ''}
        </div>
    </td></tr>

    <!-- Detalhamento -->
    <tr><td style="padding:0 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EDEDF0;border-radius:10px;overflow:hidden;">
            <tr>
                <th align="left" style="padding:10px 16px;background:#F6F6F8;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#71717A;">Data</th>
                <th align="left" style="padding:10px 16px;background:#F6F6F8;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#71717A;">Referência</th>
                ${houveRetencao ? `
                <th align="right" style="padding:10px 16px;background:#F6F6F8;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#71717A;">Bruto</th>
                <th align="right" style="padding:10px 16px;background:#F6F6F8;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#71717A;">Estúdio</th>` : ''}
                <th align="right" style="padding:10px 16px;background:#F6F6F8;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#71717A;">Recebido</th>
            </tr>
            ${linhas}
            <tr>
                <td colspan="${colunas - 1}" align="right" style="padding:14px 16px;background:#FFFFFF;font-size:14px;font-weight:600;color:#0A0A0D;">Total</td>
                <td align="right" style="padding:14px 16px;background:#FFFFFF;font-size:15px;font-weight:700;color:#0A0A0D;white-space:nowrap;">${moeda(totalLiquido)}</td>
            </tr>
        </table>
    </td></tr>

    ${houveRetencao ? `
    <tr><td style="padding:8px 32px 0;">
        <div style="padding:14px 16px;background:#F6F1FE;border-radius:10px;font-size:13px;color:#52525B;line-height:1.55;">
            <strong style="color:#7F00E1;">Sobre a coluna "Estúdio":</strong>
            é a parte do seu repasse destinada à reserva do estúdio, usada para
            investimentos em equipamento, ferramentas e estrutura. O valor em
            "Recebido" é o que foi efetivamente transferido para você.
        </div>
    </td></tr>` : ''}

    <!-- Rodapé -->
    <tr><td style="padding:24px 32px 28px;">
        <div style="font-size:12px;color:#A1A1AA;line-height:1.6;">
            Comprovante gerado automaticamente pelo 5K9 Gestor.
            Considera apenas repasses marcados como pagos no período.
            Encontrou divergência? Responda este e-mail.
        </div>
    </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
};

// ── Rotina principal ─────────────────────────────────────────────────────
const processar = async ({ hoje, simular, forcar }) => {
    const periodos = forcar ? [forcar] : periodosDe(hoje);
    const relatorio = { hoje, periodos: [], enviados: 0, pulados: 0, repetidos: 0, erros: [] };

    if (!periodos.length) {
        relatorio.mensagem = 'Hoje não é segunda-feira nem dia 1º — nada a enviar.';
        return relatorio;
    }

    const integrantes = await sb('integrantes?select=id,nome,email');

    for (const periodo of periodos) {
        const repasses = await sb(
            `repasses?select=*&status=eq.pago`
            + `&data=gte.${periodo.inicio}&data=lte.${periodo.fim}`
            + `&order=data.asc`);

        // Resolve o nome do projeto de uma vez, em vez de uma consulta por
        // linha: são poucas entradas e a rede é o custo dominante aqui.
        const ids = [...new Set(repasses.map(r => r.entrada_id).filter(Boolean))];
        const entradas = ids.length
            ? await sb(`entradas?select=id,projeto&id=in.(${ids.map(encodeURIComponent).join(',')})`)
            : [];

        const porPessoa = new Map();
        repasses.forEach(r => {
            if (!r.integrante_id) return;   // repasse órfão não tem para quem ir
            if (!porPessoa.has(r.integrante_id)) porPessoa.set(r.integrante_id, []);
            porPessoa.get(r.integrante_id).push(r);
        });

        const resumo = { ...periodo, rotulo: rotuloPeriodo(periodo), pessoas: [] };

        for (const integrante of integrantes) {
            const meus = porPessoa.get(integrante.id) || [];

            // A regra que você pediu: sem repasse no período, sem e-mail.
            if (!meus.length) { relatorio.pulados++; continue; }

            if (!integrante.email) {
                relatorio.erros.push(`${integrante.nome}: sem e-mail cadastrado`);
                continue;
            }

            const total = meus.reduce((t, r) => t + liquido(r), 0);
            const item = { nome: integrante.nome, email: integrante.email,
                           repasses: meus.length, total: moeda(total) };

            if (simular) { resumo.pessoas.push({ ...item, acao: 'enviaria' }); continue; }

            /* Grava ANTES de enviar. Se gravar depois e o envio der certo mas
               a gravação falhar, a próxima execução manda tudo de novo — e o
               erro que duplica comprovante é pior que o que atrasa um. Aqui,
               na pior das hipóteses, alguém deixa de receber e a falha fica
               registrada no relatório para reenvio manual. */
            try {
                await sb('comprovantes_enviados', {
                    method: 'POST',
                    headers: { Prefer: 'return=minimal' },
                    body: JSON.stringify({
                        integrante_id: integrante.id, tipo: periodo.tipo,
                        inicio: periodo.inicio, fim: periodo.fim,
                        email: integrante.email,
                        total_centavos: total, quantidade: meus.length,
                    }),
                });
            } catch (e) {
                // 23505 = violação do UNIQUE: este comprovante já saiu.
                if (e.status === 409 || /23505|duplicate key/i.test(e.corpo || '')) {
                    relatorio.repetidos++;
                    resumo.pessoas.push({ ...item, acao: 'já enviado antes' });
                    continue;
                }
                relatorio.erros.push(`${integrante.nome}: falha ao registrar — ${e.message}`);
                continue;
            }

            try {
                await enviarEmail({
                    para: integrante.email,
                    assunto: periodo.tipo === 'mensal'
                        ? `Comprovante de repasse — ${rotuloPeriodo(periodo)}`
                        : `Comprovante de repasse — semana de ${dataBR(periodo.inicio)}`,
                    html: montarHTML({ integrante, periodo, repasses: meus, entradas }),
                });
                relatorio.enviados++;
                resumo.pessoas.push({ ...item, acao: 'enviado' });
            } catch (e) {
                // Envio falhou depois do registro: desfaz, para a próxima
                // execução tentar de novo em vez de pular achando que já foi.
                await sb(`comprovantes_enviados?integrante_id=eq.${integrante.id}`
                       + `&tipo=eq.${periodo.tipo}&inicio=eq.${periodo.inicio}`,
                         { method: 'DELETE' }).catch(() => {});
                relatorio.erros.push(`${integrante.nome}: falha no envio — ${e.message}`);
                resumo.pessoas.push({ ...item, acao: 'falhou' });
            }
        }

        relatorio.periodos.push(resumo);
    }

    return relatorio;
};

// ── Entrada HTTP ─────────────────────────────────────────────────────────
module.exports = async (req, res) => {
    /* Sem esta trava, qualquer pessoa com a URL dispara envio para o time
       inteiro quantas vezes quiser. A Vercel manda o cabeçalho
       `Authorization: Bearer $CRON_SECRET` nos disparos do cron; exigimos o
       mesmo de quem chamar à mão. Sem CRON_SECRET configurado, recusa tudo:
       é mais seguro o comprovante não sair do que sair para qualquer um. */
    const esperado = process.env.CRON_SECRET;
    if (!esperado || req.headers.authorization !== `Bearer ${esperado}`) {
        return res.status(401).json({ erro: 'não autorizado' });
    }

    const faltando = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE', 'RESEND_API_KEY', 'EMAIL_REMETENTE']
        .filter(v => !process.env[v]);
    if (faltando.length) {
        return res.status(500).json({ erro: `variáveis de ambiente ausentes: ${faltando.join(', ')}` });
    }

    const url = new URL(req.url, 'http://local');
    const simular = url.searchParams.get('simular') === '1';

    /* Permite testar um período específico sem esperar a segunda-feira:
       ?tipo=semanal&inicio=2026-08-04&fim=2026-08-10
       Combinado com &simular=1, mostra o que sairia sem mandar nada. */
    const tipo = url.searchParams.get('tipo');
    const inicio = url.searchParams.get('inicio');
    const fim = url.searchParams.get('fim');
    const forcar = (tipo && inicio && fim) ? { tipo, inicio, fim } : null;

    try {
        const relatorio = await processar({ hoje: hojeLocal(), simular, forcar });
        return res.status(200).json({ ok: true, simulacao: simular, ...relatorio });
    } catch (e) {
        console.error('[comprovantes] falhou:', e);
        return res.status(500).json({ ok: false, erro: e.message });
    }
};

/* Expostos só para teste. A aritmética de datas é a parte que erra em
   silêncio — um comprovante que cobre a semana errada continua bonito e
   chega no horário — e sem poder chamá-la de fora não há como conferir a
   virada de ano, o mês de 28 dias e o dia 1º caindo numa segunda. */
module.exports._teste = { periodosDe, rotuloPeriodo, somarDias, diaDaSemana, montarHTML, moeda };
