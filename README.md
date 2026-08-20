# SMART AI Flow

Esteira de IA (estilo Kanban) para resolução assistida de chamados do **SMART
Desktop** (PowerBuilder/PFC). Tira o fluxo do "chat no terminal" e o transforma
em algo visual, centralizado e auditável — com o **dev sempre no controle**.

```
NOVO            ANALISE          DESENVOLVIMENTO     REVISAO            RESOLVIDO
(dev cola   ->  (IA: causa   ->  (IA: diff        -> (dev aplica,   -> (dev confirma
 o chamado)      raiz +           proposto +          testa e            que o cenário
                 raciocínio)      justificativa)      ajusta)            não ocorre)
   dev             IA                 IA                 dev                dev
```

Só os estágios de **IA** rodam automáticos. A esteira para em REVISÃO e espera
o dev — a IA nunca fecha um chamado sozinha.

---

## Instalação

Precisa apenas de **Docker Desktop**. Nenhuma outra dependência.

### 1. Clonar e gerar os segredos

```bash
git clone https://github.com/Dants0/smart-flow.git
cd smart-flow
```

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

**Linux / macOS:**
```bash
./setup.sh
```

O script cria o `.env` com um `JWT_SECRET` e uma `ENCRYPTION_KEY` **únicos da
sua instalação** (assinam a sessão e cifram sua senha do Jira). Ele não
sobrescreve um `.env` existente.

### 2. Subir a stack

```bash
docker compose up -d --build
```

O primeiro build leva alguns minutos. Depois disso:

| Serviço | Endereço | Papel |
|---|---|---|
| Plataforma | http://localhost:3000 | interface (é por aqui que você usa) |
| API | http://localhost:3333 | backend da esteira |
| app_trace | http://localhost:8070 | análise de log de trace |
| PB Insight | http://localhost:4500 | RAG sobre o codebase |
| Postgres | localhost:5432 | banco |

### 3. Criar o usuário administrador

Abra **http://localhost:3000**. Na primeira vez a tela pede a criação do
administrador — o primeiro usuário cadastrado vira admin automaticamente.

### 4. Configurar a plataforma

Já dentro da aplicação, em **Configurações**:

1. **IA** *(admin)* — chave da Anthropic ou da OpenAI, e qual provider usar.
   Sem isso a análise não roda.
2. **IA → Skills** *(admin)* — campo aberto onde o dev cola o procedimento que o
   time segue pra resolver chamado. Opcional, mas é o jeito mais barato de
   melhorar a análise (ver abaixo).
3. **Jira** *(admin)* — a URL da instância (ex.: `https://portalcliente.pixeon.com`).
4. **Minha conta** — **seu** usuário e senha do Jira. São pessoais: é com eles
   que a plataforma descobre os chamados atribuídos a você.

Nada disso vive em arquivo de configuração: tudo é editável pela interface e
vale na hora, sem reiniciar nada.

---

## Skills: ensinando o método do time à IA

Em **Configurações → IA → Skills** existe um campo aberto. O que for colado ali
entra no prompt da **ANALISE** e do **DESENVOLVIMENTO** de todo card, junto do
`CLAUDE.md` do módulo e do código trazido pelo PB Insight.

A divisão de trabalho entre os três é o que importa:

| Fonte | Responde |
|---|---|
| `modules/<modulo>/CLAUDE.md` | como é o **código** daquele módulo |
| PB Insight (RAG) | o **código em si**, no estado atual |
| **Skill** | como o **time trabalha** — o método |

Por isso a skill rende quando descreve procedimento, não código: "confirmar com
pbtrace antes de olhar a DataWindow", "checar a constraint no banco primeiro",
"validar sempre nos dois bancos", "nunca mexer no `w_main_frame`".

Detalhes que valem saber:

- É **global** — vale para todos os módulos e para todos os devs, e vai em
  **todo card**. Coisa específica de um módulo rende mais no `CLAUDE.md` dele.
- **Custa tokens em cada análise.** O limite é de 20.000 caracteres, e o campo
  mostra o contador.
- Esvaziar o campo e salvar **remove** a skill; a esteira volta a rodar como antes.
- A skill não muda o formato de resposta dos agentes: se o texto colado pedir
  markdown ou explicação em prosa, o contrato JSON do agente prevalece.

---

## PB Insight: indexando o codebase

O PB Insight é o que dá à IA acesso ao **código real** do SMART Desktop — sem
ele, a análise é feita só com o texto do chamado, e o card exibe um aviso de
"análise sem contexto de código".

Ele precisa de duas coisas: o repositório do SMART Desktop na sua máquina, e
uma indexação inicial.

**1.** Aponte o caminho no `.env` (use barras normais, mesmo no Windows):

```env
SMART_DESKTOP_PATH=C:/controle de versão/smart_desktop
```

**2.** Recrie o container e rode a indexação:

```bash
docker compose up -d pb-insight
docker compose exec pb-insight npm run ingest
```

Leva ~1 minuto e produz um índice de ~16 mil objetos. O resultado fica num
volume Docker, então sobrevive a `docker compose down` e a rebuilds.

**Repita o `ingest` depois de atualizar o repositório do SMART Desktop** — o
Monitor de Recursos avisa quando o índice está com mais de 7 dias.

---

## Uso no dia a dia

1. **Novo card** — cole o texto do chamado, ou digite a chave do Jira
   (`SMART-12345`) e clique no botão do Jira para puxar descrição e anexos.
   O card pede o **sistema** (SMART Desktop ou SMART Web), não o módulo:
   descobrir se o chamado é do ATENDE, AGENDA, MWSUS ou CADGF virou parte da
   análise — o briefing dos quatro vai junto no prompt.
2. A IA analisa e propõe um diff. O card caminha sozinho até **REVISÃO**.
3. Você revisa o diff. Se quiser, **"Aplicar o diff no código"** manda a IA
   escrever a alteração no seu working copy (ver abaixo) — ou aplique na mão,
   como sempre.
4. Resolva o card. **Descreva o que aplicou de fato** — é esse texto que
   alimenta a base de conhecimento e melhora as análises seguintes.

Chamados atribuídos a você no Jira aparecem como aviso no topo do board, com
um botão para virar card. Nada é criado ou analisado sem o seu clique.

---

## Aplicar o diff no código

Em **REVISÃO**, o botão **"Aplicar o diff no código"** escreve a proposta no
working copy apontado por `SMART_DESKTOP_PATH`. É a única operação da
plataforma que altera arquivo — e ela roda **só nesse clique**, nunca dentro do
pipeline.

O que está garantido:

- **Ou aplica inteiro, ou não aplica nada.** Um `patch --dry-run` roda antes;
  diff que não encaixa no working copy é recusado com o motivo, sem tocar em
  arquivo nenhum.
- **Backup de cada arquivo alterado**, num volume próprio (`applied_backups`).
  O card mostra o que foi alterado e um botão **Desfazer alteração**.
- **Nada de controle de versão.** O backend não commita, não cria branch e não
  reverte nada no seu repositório: a mudança aparece como alteração local sua.
  Continue conferindo com o `diff` do seu VCS antes de subir qualquer coisa.
- **Nada fora do working copy.** Caminho absoluto ou com `..` no diff é
  recusado.

Aceitar a proposta e mandar aplicar são **dois botões separados**, de propósito:
são duas decisões diferentes.

O Monitor de Recursos mostra **Código (working copy)** — se aparecer
indisponível, o `SMART_DESKTOP_PATH` não está configurado ou está montado
somente-leitura, e o botão de aplicar vai recusar. O resto da esteira funciona
normalmente nesse caso.

---

## Operação

```bash
docker compose ps                    # o que está no ar
docker compose logs -f backend       # acompanhar a esteira
docker compose down                  # parar (preserva dados)
docker compose down -v               # parar E APAGAR cards e índice
docker compose up -d --build         # aplicar mudanças de código
```

O **Monitor de Recursos** (dentro de Configurações) mostra o status ao vivo de
todos os serviços, a fila de processamento e o consumo de IA dos últimos 30 dias.

Quem checa é o **backend**, de dentro da rede do compose — por isso ele usa o
nome do serviço (`http://trace-api:8070`, `http://pb-insight:4500`) e não
`localhost`, que ali seria o próprio container. O compose já passa esses
endereços em `TRACE_SERVICE_URL` e `PB_INSIGHT_URL`; só sobrescreva no `.env` se
os microserviços rodarem em outra máquina. Rodando o backend fora do Docker
(`npm run dev`), sem essas variáveis, o padrão volta a ser `localhost`.

### Acessar de outra máquina

O endereço da API é embutido no build do frontend. Para acessar de outro
computador da rede, edite o `.env`:

```env
NEXT_PUBLIC_API_URL=http://192.168.0.10:3333   # IP desta máquina
```

E refaça o build: `docker compose up -d --build web`.

---

## Arquitetura

| Pasta | O que é |
|---|---|
| `smart-ai-flow/` | Backend da esteira — Fastify + Prisma. Máquina de estados, orquestrador e a fila de jobs |
| `web/` | Interface — Next.js. Board Kanban e configurações |
| `pb-insight/` | RAG sobre o codebase PowerBuilder + base de chamados resolvidos |
| `app_trace/` | Microserviço Go que interpreta logs de trace de banco/PowerBuilder |

**Decisões que valem saber:**

- **A IA propõe, o dev decide.** A esteira para em REVISÃO e nunca fecha um
  chamado sozinha. Se o dev mandar, a IA escreve o diff no working copy — mas
  só nesse clique, e **nunca no controle de versão**: nada de commit, branch ou
  revert. A mudança aparece como alteração local do dev, que continua sendo
  quem decide o que vai pro repositório.
- **As chaves de IA vivem só no backend.** Nenhum dev usa a própria chave, e
  todo consumo é registrado (Monitor de Recursos → Consumo de IA).
- **As credenciais do Jira são por usuário** e guardadas cifradas — é o que
  faz `currentUser()` resolver para a pessoa certa.
- **O pipeline roda numa fila**, fora do request HTTP. Se o backend cair no
  meio de uma análise, o job é retomado no próximo start.

---

## Desenvolvimento

Para mexer no código sem Docker, cada projeto roda isolado:

```bash
docker compose up -d db trace-api    # infra
cd smart-ai-flow && npm install && npm run dev     # backend  :3333
cd pb-insight    && npm install && npm run serve   # RAG      :4500
cd web           && npm install && npm run dev     # front    :3000
```

Neste modo cada projeto usa o próprio `.env` (veja os `.env.example`), e o
backend precisa de `DATABASE_URL`, `JWT_SECRET` e `ENCRYPTION_KEY`.

```bash
cd smart-ai-flow && npm test         # testes do domínio
cd pb-insight    && npm test         # testes do parser e do grafo
```
