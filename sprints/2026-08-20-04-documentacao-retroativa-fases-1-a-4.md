# Documentação retroativa das fases 1 a 4

- **Data:** 2026-08-20
- **Solicitação:** "documenta as fases 1 a 4 retroativamente"
- **Status:** concluído

## O que foi feito
1. Levantado o histórico completo do repositório (5 commits, de `65ac7bb` a
   `8214ae6`): mensagens, `--stat` de cada commit, diffs dos arquivos-chave,
   nomes das migrações Prisma e os comentários de decisão deixados no código.
2. Escritos quatro registros retroativos, um por fase:
   - `2026-08-19-01-fase-1-monorepo-e-esteira-base.md`
   - `2026-08-19-02-fase-2-configuracao-pela-interface.md`
   - `2026-08-20-01-fase-3-multiusuario-fila-e-docker.md`
   - `2026-08-20-02-fase-4-rede-do-compose-e-monitor.md`
3. Renumerado `2026-08-20-01-documentacao-de-sprints.md` → `-03-` e ajustado seu
   texto, já que as fases 3 e 4 aconteceram antes dele no mesmo dia.
4. Adicionado um índice em `sprints/README.md` e a marcação de registros
   retroativos na convenção.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `sprints/2026-08-19-01-fase-1-monorepo-e-esteira-base.md` | novo |
| `sprints/2026-08-19-02-fase-2-configuracao-pela-interface.md` | novo |
| `sprints/2026-08-20-01-fase-3-multiusuario-fila-e-docker.md` | novo |
| `sprints/2026-08-20-02-fase-4-rede-do-compose-e-monitor.md` | novo |
| `sprints/2026-08-20-03-documentacao-de-sprints.md` | renomeado de `-01-` e revisado |
| `sprints/2026-08-20-04-documentacao-retroativa-fases-1-a-4.md` | novo — este registro |
| `sprints/README.md` | índice + nota sobre registros retroativos |

## Decisões
- **Mapa fase → commit.** Só dois commits carregam o número da fase (`feat: fase 3`
  e `feat: fase 4`). As fases 1 e 2 foram atribuídas pelo conteúdo:
  | Fase | Commit(s) | Conteúdo |
  |---|---|---|
  | 1 | `65ac7bb`, `7697598` | monorepo + esteira base (backend, web, app_trace, pb-insight) |
  | 2 | `9d8af03` ("projeto") | `PlatformSettings` e configuração pela interface |
  | 3 | `323105a` | autenticação, fila de jobs, custo, monitor, Docker |
  | 4 | `8214ae6` | endereço dos microserviços na rede do compose |
  Se a numeração real que você usou for outra, é só dizer que eu renomeio.
- **Fonte = git, não memória.** Cada registro cita commit e contagem de arquivos,
  e as justificativas foram tiradas dos comentários do próprio código
  (`jobQueue.ts`, `crypto.ts`, `settingsRepository.ts`, `monitor.ts`), não inferidas.
- **Registros retroativos ficam marcados como tais**, para não passarem por
  documentação escrita na hora do trabalho.
- **Datados pela data do commit**, não pela data em que foram escritos — o índice
  serve como linha do tempo do projeto.
- Uma seção **"Pendências desta fase (resolvidas depois)"** encadeia cada fase na
  seguinte, mostrando o que motivou a próxima.

## Pendências
- Nenhuma. Os documentos das fases anteriores do PB Insight (`pb-insight/docs/01`
  a `15`) permanecem onde estão — são de outro escopo e já estavam documentados.
