# Seção SKILLS nas configurações de IA

- **Data:** 2026-08-20
- **Solicitação:** "adicionar seção de SKILLS nas configurações de IA. campo aberto que o dev irá colar a skill que será utilizada por ele nas resoluções dos chamados"
- **Status:** concluído

## O que foi feito

### Backend (`smart-ai-flow/`)
1. **`prisma/schema.prisma`**: campo `skills String?` em `PlatformSettings`,
   com migração `20260820120000_platform_skills`
   (`ALTER TABLE "PlatformSettings" ADD COLUMN "skills" TEXT`).
2. **`src/domain/skill.ts`** (novo): `MAX_SKILL_CHARS` (20.000) e
   `buildSkillSection()`, que monta o bloco anexado ao system prompt. Devolve
   string vazia quando não há skill — sem skill configurada, o prompt fica
   idêntico ao de antes.
3. **`src/infra/settingsRepository.ts`**: `skills` na interface e no mapeamento.
   O `updateSettings` já converte string vazia em `null`, então esvaziar o campo
   remove a skill sem código novo.
4. **`src/http/schemas.ts`**: `skills` opcional em `UpdateSettingsSchema`, com
   teto e mensagem de erro legível.
5. **`src/http/routes.ts`**: `skills` no `GET /settings` e no `PATCH /settings`,
   em texto claro — não é segredo, e o dev precisa reler o que colou para editar.
6. **`src/agents/analyzer.ts` e `proposer.ts`**: `system: SYSTEM + buildSkillSection(skills)`.
7. **`tests/skill.test.ts`** (novo): 5 casos — ausência, texto em branco,
   delimitação, ressalva de formato e preservação do texto colado.

### Frontend (`web/`)
8. **`components/settings/fields.tsx`**: novo `TextAreaField` — monoespaçado,
   redimensionável, com contador de caracteres que fica vermelho ao passar do teto.
9. **`components/settings/SkillsSection.tsx`** (novo): a seção, com placeholder
   de exemplo, aviso de que a skill é global e vai em todo card, e **botão de
   salvar próprio**.
10. **`app/settings/ai/page.tsx`**: carrega `skills` junto das demais settings e
    renderiza a nova seção abaixo da seção de IA.
11. **`lib/api.ts`**: `skills` em `PlatformSettingsView` e `PlatformSettingsPatch`.

### Documentação
12. **README**: a seção "Skills: ensinando o método do time à IA", com a tabela
    que separa `CLAUDE.md` (como é o código) / RAG (o código) / skill (o método),
    e menção ao passo em "Configurar a plataforma".

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/prisma/schema.prisma` | campo `skills` |
| `smart-ai-flow/prisma/migrations/20260820120000_platform_skills/migration.sql` | novo |
| `smart-ai-flow/src/domain/skill.ts` | novo |
| `smart-ai-flow/src/infra/settingsRepository.ts` | `skills` na interface e no mapeamento |
| `smart-ai-flow/src/http/schemas.ts` | validação com teto de 20k |
| `smart-ai-flow/src/http/routes.ts` | `skills` no GET e no PATCH |
| `smart-ai-flow/src/agents/analyzer.ts` | skill no system prompt |
| `smart-ai-flow/src/agents/proposer.ts` | skill no system prompt |
| `smart-ai-flow/tests/skill.test.ts` | novo |
| `web/components/settings/fields.tsx` | novo `TextAreaField` |
| `web/components/settings/SkillsSection.tsx` | novo |
| `web/app/settings/ai/page.tsx` | carrega e renderiza a seção |
| `web/lib/api.ts` | tipos |
| `README.md` | seção Skills |

## Decisões
- **A skill vai no _system_ prompt, não no material de contexto.** Ela é
  instrução de método ("o que checar, em que ordem"), da mesma natureza das
  regras do agente — no meio do contexto competiria com o código do RAG como se
  fosse mais um trecho para analisar.
- **Bloco delimitado, com o formato de saída declarado como soberano.** A skill
  é texto humano e pode, sem má intenção, pedir "responda em markdown" — o que
  quebraria o `parseAgentOutput`. O bloco diz explicitamente que o JSON do
  agente vence, e há teste cobrindo essa frase.
- **Teto de 20.000 caracteres.** A skill entra em *toda* análise e *toda*
  proposta: sem limite, um texto gigante custa tokens em cada card e empurra o
  RAG para fora da janela de contexto. O contador na UI é informativo; quem
  barra é o backend.
- **Botão de salvar próprio.** Mexer na skill é atividade separada de trocar
  provider ou chave; um único save arrastaria junto alterações que o dev tenha
  começado e desistido no topo da página.
- **Um campo, texto livre, sem estrutura imposta** — foi o que o pedido descreve
  ("campo aberto"). Nada de lista de skills, upload de arquivo ou parser de
  formato; se quiser vários procedimentos, cola vários no mesmo campo.
- **Global, não por usuário.** A seção foi para a tela de IA, como pedido, e essa
  tela é de admin (`PATCH /settings` recusa não-admin com 403) — ver Pendências.

## Verificação
- `npm run typecheck` (backend) — sem erros.
- `npm test` (backend) — 5 arquivos, 30 testes, todos passando.
- `npx eslint` nos arquivos tocados do front — sem apontamentos.
- `npm run build` (web) — build completo, 12 rotas geradas.
- Não rodei a stack no Docker nem exercitei a tela no navegador.

## Pendências
- **Escopo da skill: global (admin) × por dev.** O pedido diz "a skill que será
  utilizada **por ele**", o que sugere algo pessoal, mas pediu a seção em
  Configurações → IA, que é admin-only. Entreguei global: um dev comum vê a tela
  de IA apenas se for admin, e a skill vale para todos. Se a intenção era
  pessoal, o caminho é o mesmo campo no model `User` e a seção em
  **Minha conta** — mudança pequena, é só dizer.
- A migração é aplicada por `npx prisma migrate deploy`, que já roda no
  `CMD` do `Dockerfile` do backend: em Docker basta
  `docker compose up -d --build backend`. Fora do Docker, rode a migração antes.
- `.env.example` e `docker-compose.yml` aparecem modificados no working tree por
  alteração local sua (`SMART_DESKTOP_PATH`), anterior a esta solicitação — não
  toquei neles.
