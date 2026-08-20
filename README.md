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
2. **Jira** *(admin)* — a URL da instância (ex.: `https://portalcliente.pixeon.com`).
3. **Minha conta** — **seu** usuário e senha do Jira. São pessoais: é com eles
   que a plataforma descobre os chamados atribuídos a você.

Nada disso vive em arquivo de configuração: tudo é editável pela interface e
vale na hora, sem reiniciar nada.

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
2. A IA analisa e propõe um diff. O card caminha sozinho até **REVISÃO**.
3. Você revisa o diff, aplica (ou não) e resolve. **Descreva o que aplicou de
   fato** — é esse texto que alimenta a base de conhecimento e melhora as
   análises seguintes.

Chamados atribuídos a você no Jira aparecem como aviso no topo do board, com
um botão para virar card. Nada é criado ou analisado sem o seu clique.

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

- **A IA propõe, o dev aplica.** O backend tem acesso somente-leitura ao
  código e nunca toca no controle de versão.
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
