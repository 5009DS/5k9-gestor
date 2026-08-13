/* ═══════════════════════════════════════════════════════════════════════════
   ADAPTADOR LOCAL — localStorage.

   Usado enquanto lib/supabase-config.js estiver vazio. Mesma interface do
   adaptador remoto (listar/salvar/excluir/limpar), então o store não sabe
   qual dos dois está em uso e as páginas nunca precisam perguntar.

   Limite conhecido e assumido: os dados vivem NESTE navegador. Não são do
   time, não sobrevivem a uma limpeza de cache e não têm histórico. Por isso
   a topnav mostra o aviso de modo local, e Configurações oferece exportar
   em JSON — é a única cópia de segurança que existe aqui.
   ═══════════════════════════════════════════════════════════════════════════ */

const CHAVE = (colecao) => `5k9_gestor_${colecao}`;

const ler = (colecao) => {
    try { return JSON.parse(localStorage.getItem(CHAVE(colecao))) || []; }
    catch { return []; }
};

const gravar = (colecao, linhas) =>
    localStorage.setItem(CHAVE(colecao), JSON.stringify(linhas));

export const local = {
    modo: 'local',

    // Sem banco não há sessão. O app trata `null` como "modo aberto" e
    // pula a tela de login inteira (ver app.js).
    sessao: async () => null,

    listar: async (colecao) => ler(colecao),

    /**
     * Insere ou atualiza pelo id. Devolve a linha gravada.
     *
     * `criado_em` só é carimbado na inserção: reescrever a data a cada
     * edição faria toda a base parecer criada hoje e quebraria a ordenação
     * de "lançamentos recentes".
     */
    salvar: async (colecao, registro) => {
        const linhas = ler(colecao);
        const id = registro.id || crypto.randomUUID();
        const i = linhas.findIndex(l => l.id === id);
        const linha = {
            ...(i > -1 ? linhas[i] : { criado_em: new Date().toISOString() }),
            ...registro,
            id,
        };
        if (i > -1) linhas[i] = linha; else linhas.unshift(linha);
        gravar(colecao, linhas);
        return linha;
    },

    excluir: async (colecao, id) => {
        gravar(colecao, ler(colecao).filter(l => l.id !== id));
    },

    /** Troca a coleção inteira de uma vez — usado pela importação de JSON. */
    substituir: async (colecao, linhas) => {
        gravar(colecao, linhas);
        return linhas;
    },
};
