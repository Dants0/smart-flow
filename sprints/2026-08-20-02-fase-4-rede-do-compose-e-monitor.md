# Fase 4 — Endereço dos microserviços na rede do compose

- **Data:** 2026-08-20
- **Solicitação:** corrigir app_trace e PB Insight aparecendo OFFLINE no Monitor de Recursos com os dois serviços no ar
- **Status:** concluído
- **Commit:** `8214ae6` ("feat: fase 4") — 4 arquivos, +67/−6
- **Registro reconstruído retroativamente a partir do histórico git** (ver `2026-08-20-04`)

## Causa raiz
Quem faz o health check é o **backend**, de dentro da rede do compose. Os
endereços default (`http://localhost:8070`, `http://127.0.0.1:4500`) apontavam
para o **próprio container do backend**, nunca alcançando os microserviços — daí
os dois OFFLINE. Pior: o valor loopback já estava **gravado na linha de
settings** de quem rodou antes de o backend virar container, então mudar apenas
o default não consertaria instalações existentes.

## O que foi feito
1. **`docker-compose.yml`**: passa `TRACE_SERVICE_URL=http://trace-api:8070` e
   `PB_INSIGHT_URL=http://pb-insight:4500` ao backend (sobrescrevíveis pelo
   `.env`), e adiciona `depends_on` de `trace-api` e `pb-insight`.
2. **`settingsRepository.ts`**: os defaults passam a vir do ambiente, com
   fallback loopback preservado para quem sobe o backend fora do Docker
   (`npm run dev`).
3. **`repairLoopbackUrls`**: no `ensureRow`, reescreve a URL gravada **apenas**
   se ainda for loopback **e** o ambiente disser qual é a certa — uma URL
   apontada para outra máquina na tela de Configurações é escolha deliberada e
   fica intacta.
4. **`monitor.ts`**: PB Insight no ar sem índice deixou de exibir "indexado há
   20685d" (efeito de ler `ingestedAt` na época zero). Agora reporta
   `no ar, sem índice — rode o ingest`, que é o que o dev precisa saber: a
   análise sai sem grounding até lá.
5. **README**: seção explicando por que o backend usa o nome do serviço e não
   `localhost`, e quando sobrescrever no `.env`.

## Decisões
- **Topologia vem do ambiente, preferência vem do banco.** Endereço de
  microserviço é deploy, não escolha de usuário — por isso `.env`/compose, e não
  a tela de Configurações.
- **Reparo conservador**: migrar cegamente as URLs quebraria quem roda os
  microserviços em outra máquina. O reparo só toca o que é comprovadamente
  loopback herdado.

## Pendências
- Nenhuma.
