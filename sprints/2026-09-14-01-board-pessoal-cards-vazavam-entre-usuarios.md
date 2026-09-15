# O board era de todo mundo: cards vazavam entre usuários

- **Data:** 2026-09-14
- **Solicitação:** "encontrei um bug real, outros usuários que são criados a partir do admin conseguem ver os cards de qualquer um... Eu criei aqui o fulano.detal e loguei na conta dele e está aparecendo os cards do usuário guilherme.dantas"
- **Status:** concluído

## O que existia antes

`GET /cards` só recortava por dono quando a **tela** pedia: o botão "Meus cards"
mandava `?mine=true`, e a rota fazia `if (q.mine === 'true') filters.createdById
= currentUserId(req)`. Sem o parâmetro, a query ia sem `where` de dono e trazia a
esteira inteira. Conta recém-criada pelo admin, na primeira abertura, já caía no
board com os cards de outra pessoa — foi o que apareceu na conta `fulano.detal`.

Havia um segundo furo, maior, que o filtro da lista não cobriria mesmo se
estivesse certo: **nenhuma das 15 rotas de `/cards/:id` conferia dono.** Elas
faziam `findCardById(id)` e checavam só se o card existia. Com um id em mãos —
que o board vazado entregava de graça — qualquer conta autenticada lia o chamado
completo, o trace, o diff, o histórico e o chat (`GET /cards/:id`,
`/chat`, `/versioning`, `/jira-comment`), e também **escrevia**: `apply` e
`accept` gravam no working copy do SMART Desktop, `commit` e `pull-request`
publicam no Bitbucket com a credencial de quem clicou.

`DELETE /cards/:id` era a única exceção — já dizia "só quem criou o card (ou um
admin)". A regra existia no codebase; só não valia para ver.

Vazavam junto dois endpoints periféricos: `GET /cards/modules` listava os
sistemas de todo mundo (o seletor de filtro revelava a existência de cards de
sistemas em que o dev não tem nenhum), e `/jira/pending` filtrava o aviso
"atribuído a você" contra **todas** as jiraKeys já viradas card — card de outra
pessoa fazia o aviso sumir do dev sem ele nunca saber por quê.

## O que foi feito

A regra virou domínio, em `domain/cardVisibility.ts`, e passou a valer nos dois
caminhos que antes divergiam:

- **`podeVerCard(card, viewer)`** — dono ou admin. É o que `loadVisibleCard` usa
  em **todas** as rotas de `/cards/:id`, leitura e escrita. Nenhuma delas chama
  `findCardById` direto: sobrou uma única chamada no arquivo, dentro do helper.
- **`recorteDeDono(viewer, pediuMine)`** — o `createdById` que a listagem usa.
  Para o dev sai sempre o próprio id, peça ele ou não; `undefined` (sem recorte)
  só acontece para admin.

`loadVisibleCard` responde **404, não 403**, para quem não é dono. Um 403
confirmaria que aquele id existe, e a diferença entre as duas respostas é
suficiente pra varrer a esteira alheia mesmo com o board filtrado.

Na tela, o botão "Meus cards" passou a aparecer só para o admin: o board do dev
já é só dele, e um filtro que nunca muda nada na tela só faz duvidar do que está
sendo visto.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/domain/cardVisibility.ts` | novo — `podeVerCard` e `recorteDeDono`, com o porquê de cada caso |
| `smart-ai-flow/src/http/routes.ts` | `viewerOf` + `loadVisibleCard` nas 15 rotas de `/cards/:id`; recorte por dono em `GET /cards` e `/cards/modules`; `/jira/pending` conta só os cards do próprio dev |
| `smart-ai-flow/src/infra/cardRepository.ts` | `findUsedModules` e `findAllJiraKeys` aceitam `createdById` |
| `smart-ai-flow/tests/cardVisibility.test.ts` | novo — 8 casos da regra |
| `web/components/BoardFilters.tsx` | `showMine`: o botão "Meus cards" só para o admin |
| `web/app/page.tsx` | passa `showMine={user.isAdmin}` |

## Decisões

- **Admin enxerga a esteira inteira.** Não foi invenção: é a régua que
  `DELETE /cards/:id` já aplicava ("só quem criou o card, ou um admin"), e o
  admin é quem cria as contas e responde pela plataforma. A mudança foi fazer
  essa mesma régua valer para *ver*, não só para apagar.
- **404 em vez de 403.** Ver acima — 403 é uma confirmação de existência, e aqui
  ela é justamente o que não pode vazar.
- **Card sem `createdById` fica só com o admin.** Há 1 no banco, anterior ao
  multiusuário. Não há a quem atribuí-lo, e sumir do board de todo mundo é pior
  do que aparecer para quem administra. O teste cobre explicitamente o
  `undefined === undefined` que daria a esteira órfã a qualquer conta.
- **O recorte é do servidor, não da tela.** `?mine=false` vindo de um dev não
  muda nada — verificado no ar.

## Verificação

Stack reconstruída (`docker compose up -d --build backend web`) e as duas contas
testadas contra a API real, com JWT assinado a partir do `JWT_SECRET` — sem tocar
na senha de ninguém:

| | admin (`guilherme.dantas`) | dev (`fulano.detal`) |
|---|---|---|
| `GET /cards` | 6 cards | **0 cards** |
| `GET /cards?mine=true` | 5 (os dele) | 0 |
| `GET /cards?mine=false` | — | 0 (o recorte não se desliga) |
| `GET /cards/<id do admin>` | 200 | **404** |
| `/chat`, `/versioning`, `/jira-comment` | 200 / 400 / 200 | **404** |
| `POST /apply`, `/accept`, `/retry`, `/revert` | — | **404** |
| `DELETE /cards/<id>` | — | **404** (os 6 cards continuam no banco) |
| `GET /cards/modules` | `["atende","smartdesktop"]` | `[]` |

`npm test` no backend: 21 arquivos, 209 testes, tudo verde. `tsc --noEmit` limpo
nos dois projetos.

## Pendências

- **A conferência da UI ficou com o solicitante.** Os testes de ponta a ponta
  foram na API; não tenho a senha do `fulano.detal` pra reproduzir a tela.
- **`GET /settings` e `GET /monitor` continuam abertos a qualquer autenticado.**
  Não expõem card, mas expõem configuração da plataforma e o custo agregado de IA
  dos últimos 30 dias. Ficou fora do escopo desta correção, de propósito.
- Continuam valendo as pendências de `2026-08-28-03`: `POST /auth/reset-password`
  é público e troca a senha de qualquer conta. **Enquanto ela existir, a
  separação por usuário feita aqui vale só contra engano, não contra má-fé** —
  quem alcança a rede interna troca a senha do admin e vê tudo.
