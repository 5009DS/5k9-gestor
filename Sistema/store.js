/* ═══════════════════════════════════════════════════════════════════════════
   STORE — camada de dados do 5K9 Gestor.

   Escolhe o adaptador (Supabase ou localStorage) uma vez, no boot, e expõe
   a mesma API para as cinco coleções. As páginas nunca importam adaptador
   nenhum: pedem `store.entradas.listar()` e pronto.

   As coleções:
     clientes      — de onde o dinheiro vem
     integrantes   — para quem o dinheiro vai
     entradas      — cada pagamento recebido (ou previsto) de um cliente
     repasses      — cada valor efetivamente repassado a um integrante
     investimentos — custo fixo recorrente ou compra pontual do estúdio
   ═══════════════════════════════════════════════════════════════════════════ */

import { CONFIGURADO } from './lib/supabase-config.js';
import { local } from './db/local.js';
import { remoto } from './db/remoto.js';

const db = CONFIGURADO ? remoto : local;

/* ── Cache de leitura ────────────────────────────────────────────────────
   O painel monta uma tela inteira a partir das CINCO coleções ao mesmo
   tempo, e as páginas de lista pedem clientes/integrantes só para resolver
   nomes. Sem cache, uma navegação Painel → Entradas → Painel custa quinze
   consultas para os mesmos dados.

   30s é curto de propósito. O banco é compartilhado; o cache existe para
   não repetir a mesma consulta dentro de uma navegação, não para guardar
   estado. Toda escrita derruba a coleção afetada, então o que VOCÊ acabou
   de lançar aparece na hora — o atraso só pode existir para mudança feita
   por outra pessoa. */
const TTL = 30_000;
const cache = new Map();

const comCache = async (chave, buscar) => {
    const guardado = cache.get(chave);
    if (guardado && Date.now() - guardado.em < TTL) return guardado.dados;
    // Guarda a PROMESSA, não o resultado: o painel dispara as cinco
    // consultas em paralelo e duas telas pedindo o mesmo compartilham a ida.
    const promessa = buscar();
    cache.set(chave, { dados: promessa, em: Date.now() });
    try { return await promessa; }
    catch (e) { cache.delete(chave); throw e; }
};

const COLECOES = ['clientes', 'integrantes', 'entradas', 'repasses', 'investimentos'];

const colecao = (nome) => ({
    listar:  ()  => comCache(nome, () => db.listar(nome)),
    salvar:  async (registro) => {
        const linha = await db.salvar(nome, registro);
        cache.delete(nome);
        return linha;
    },
    excluir: async (id) => {
        await db.excluir(nome, id);
        cache.delete(nome);
    },
    substituir: async (linhas) => {
        await db.substituir(nome, linhas);
        cache.delete(nome);
    },
});

// ── Sessão ──────────────────────────────────────────────────────────────
// Em modo local não existe login: `usuario` fica null e o app trata isso
// como acesso aberto. Em modo remoto, null significa "precisa entrar".
let usuario = null;
const ouvintes = [];

export const store = {
    modo: db.modo,
    exigeLogin: CONFIGURADO,

    iniciarSessao: async () => {
        usuario = await db.sessao();
        if (db.aoMudarSessao) {
            await db.aoMudarSessao(async () => {
                usuario = await db.sessao();
                cache.clear();
                ouvintes.forEach(fn => fn(usuario));
            });
        }
        return usuario;
    },
    aoMudarSessao: (fn) => ouvintes.push(fn),
    usuario: () => usuario,

    entrar: async (email, senha) => {
        const r = await db.entrar(email, senha);
        if (!r.error) usuario = await db.sessao();
        return r;
    },
    sair: async () => {
        usuario = null;
        cache.clear();
        if (db.sair) await db.sair();
    },

    // ── Coleções ────────────────────────────────────────────────────────
    clientes:      colecao('clientes'),
    integrantes:   colecao('integrantes'),
    entradas:      colecao('entradas'),
    repasses:      colecao('repasses'),
    investimentos: colecao('investimentos'),

    /** Tudo de uma vez, em paralelo — é o que o painel consome. */
    tudo: async () => {
        const [clientes, integrantes, entradas, repasses, investimentos] =
            await Promise.all(COLECOES.map(c => store[c].listar()));
        return { clientes, integrantes, entradas, repasses, investimentos };
    },

    limparCache: () => cache.clear(),

    /** Exportação/importação de segurança (ver pages/configuracoes.js). */
    exportar: async () => {
        const dados = await store.tudo();
        return { versao: 1, exportado_em: new Date().toISOString(), ...dados };
    },
    importar: async (pacote) => {
        for (const c of COLECOES) {
            if (Array.isArray(pacote[c])) await store[c].substituir(pacote[c]);
        }
        cache.clear();
    },
};
