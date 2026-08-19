# 12 — Dependentes agregados quando o nome do objeto colide entre PBLs

> Entregue em 2026-07-24, em resposta a um relato direto do usuário: pediu o
> contexto de `d_lmc02tab` e a ferramenta só trouxe o uso em `agenda50`,
> omitindo o uso real em `atende50/repac50` — mesmo nome, PBL diferente.

## O bug

`id` de `PBObject` é `${library}/${name}` justamente porque nomes de objeto
colidem entre PBLs (ver `domain/entities/pb-object.ts`). `findByName` já
retorna corretamente a lista completa de matches. Mas
`QueryObjectContextUseCase.execute` (usado por `npm run context`, por
`GET /objects/:name/context` e pelo motor de diagnóstico) pegava só
`matches[0]` como `root` e calculava `dependents`/`related` **apenas para
esse objeto**. A colisão de nome era sinalizada em `ambiguities` (uma string
opaca com os IDs), mas os dependentes do 2º, 3º... match nunca apareciam no
resultado — sumiam silenciosamente.

Caso real: `d_lmc02tab` existe em `agenda50/agenda50.pbl.src/` e em
`atende50/repac50.pbl.src/`. Consultar o contexto retornava só quem usa a
versão de `agenda50`.

## Correção

`dependentsOf` e a expansão `related` (saltos de dependência) agora rodam
para **todos** os matches do nome, não só o primeiro — `matches[0]` continua
sendo o `root` exibido (mantém o formato da API), mas os arrays de
`dependents`/`related` são a união entre todas as versões do nome. `visited`
é inicializado com os IDs de todos os matches, para não tratar um match como
"relacionado" do outro.

Ancestral (`current.ancestor`) continua resolvendo só a partir do `root` —
não é o mesmo tipo de ambiguidade (herança de classe, não "quem usa este
objeto"), e não era o que o usuário relatou; deliberadamente fora de escopo
aqui.

Teste de regressão em `tests/use-cases/ingest-and-query.test.ts` reproduz a
topologia (dois `d_dup.srd` em PBLs diferentes, cada um referenciado por uma
janela diferente) e confirma que `dependents` contém as duas.

## Decisão registrada

Não mudei o formato da resposta HTTP (`root` continua um único objeto) — só
o conteúdo agregado de `dependents`/`related`. Uma resposta com múltiplos
`root`s seria mais "correta" para o caso ambíguo, mas quebraria o contrato
atual da API por um ganho marginal; `ambiguities` já sinaliza que há mais de
um objeto por trás do nome, e agora os efeitos (quem chama) vêm completos.
