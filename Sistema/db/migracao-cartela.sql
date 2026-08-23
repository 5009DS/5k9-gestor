-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 GESTOR — a cartela, para os outros sistemas do estúdio lerem.
--
-- Rode UMA VEZ no SQL Editor do projeto Supabase DO GESTOR, depois do
-- schema.sql. É uma migração: não recria nada, só acrescenta a função.
--
-- ── Para que serve ────────────────────────────────────────────────────────
-- O Gestor é onde um cliente novo é cadastrado primeiro: ele entra na hora em
-- que assina, porque é aí que começa a haver dinheiro. Os outros sistemas
-- descobriam esse cliente depois, por alguém digitar o nome de novo — e nome
-- digitado duas vezes vira "Instituto Dr Tigre" num lugar e "Instituto Dr.
-- Tigre" no outro.
--
-- Esta função é a ponte: devolve a cartela para quem quiser copiar.
--
-- ── O QUE ELA EXPÕE, E O QUE NÃO ──────────────────────────────────────────
-- SÓ nome, empresa e cor dos clientes; nome, papel e cor dos integrantes.
--
-- Fora: documento, contato, e-mail, chave pix, notas internas e todo e
-- qualquer valor. Nada aqui permite descobrir quanto alguém ganha ou quanto um
-- cliente paga — que é a informação que o Gestor existe para guardar.
--
-- ── A DECISÃO QUE PRECISA SER CONSCIENTE ──────────────────────────────────
-- A função é liberada para o papel `anon`. Isso significa que quem tiver a
-- chave `anon` deste projeto — que é pública por natureza, vai no código do
-- navegador do próprio Gestor — consegue listar os NOMES dos clientes do
-- estúdio.
--
-- Não existe meio-termo técnico: qualquer chave que o navegador precise enviar
-- é pública, então "proteger com uma senha no código" seria teatro. A escolha
-- real é entre expor a lista de nomes ou exigir um segundo login.
--
-- Escolhemos expor, porque são nomes de clientes de um estúdio de design —
-- muitos deles já aparecem no portfólio — e porque a alternativa é obrigar
-- toda a equipe a manter duas sessões abertas para copiar um nome.
--
-- PARA FECHAR: troque a última linha por
--     grant execute on function cartela() to authenticated;
-- Aí o outro sistema precisará de sessão neste projeto para ler a cartela.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function cartela()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select jsonb_build_object(
        'clientes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', c.id, 'nome', c.nome, 'empresa', c.empresa, 'cor', c.cor
            ) order by c.nome)
            from clientes c), '[]'::jsonb),
        'integrantes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', i.id, 'nome', i.nome, 'papel', i.papel, 'cor', i.cor, 'ativo', i.ativo
            ) order by i.nome)
            from integrantes i
            where i.ativo is true), '[]'::jsonb)
    );
$$;

-- `security definer` roda com os privilégios de quem criou, passando por cima
-- do RLS — que aqui nega tudo para quem não tem sessão. É o que permite a
-- leitura sem login. `set search_path` é obrigatório em função definer: sem
-- ele, quem consegue criar um schema no caminho de busca planta uma tabela
-- `clientes` falsa e a função passa a ler dela com privilégio elevado.

revoke all on function cartela() from anon, public;
grant execute on function cartela() to anon, authenticated;
