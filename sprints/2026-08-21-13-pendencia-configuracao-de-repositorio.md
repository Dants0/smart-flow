# Pendência: como o dev configura o repositório dele

- **Data:** 2026-08-21
- **Solicitação:** "documente isso como uma pendência porque vou conversar com o tech lead a respeito"
- **Status:** **em aberto** — decisão de arquitetura, não implementada
- **Para a conversa com o tech lead**

## Estado atual (conferido no código)

A configuração do working copy é **de ops, não de produto**: arquivo `.env` +
recriação de container. Não existe tela para isso.

**1. `.env` na raiz do projeto:**

```env
SMART_DESKTOP_PATH=C:/controle de versão/smart_desktop
SMART_WEB_PATH=C:/smart_web/smart_web
```

**2. `docker-compose.yml` monta esses caminhos nos containers:**

| Serviço | Montagem | Modo |
|---|---|---|
| `backend` | `${SMART_DESKTOP_PATH}` → `/smart_desktop` | leitura **e escrita** (aplica diff, commita, faz push) |
| `backend` | `${SMART_WEB_PATH}` → `/smart_web` | leitura e escrita |
| `pb-insight` | `${SMART_DESKTOP_PATH}` → `/smart_desktop` | **somente leitura** (`:ro`), só indexa |

**3. O backend lê o caminho de dentro do container** (`infra/repos.ts`):
`process.env.SMART_DESKTOP_PATH` vale `/smart_desktop`, não o caminho do
Windows. O caminho do host existe só no `.env`, para o Docker saber o que montar.

**4. Toda mudança exige `docker compose up -d --build backend`** — volume não
muda com container em execução.

Sem caminho configurado, o compose cai em `./.empty` e o Monitor mostra
**Código · <sistema>** indisponível: a esteira analisa normalmente, mas não
aplica diff nem versiona.

O que é por usuário, pela interface, são **só as credenciais** (Jira e Bitbucket,
em Configurações → Minha conta).

## Por que isso é um problema

1. **Dev novo não se configura sozinho.** Precisa editar `.env` e reiniciar
   containers — não é algo que se peça a quem só quer usar a esteira.
2. **Instância compartilhada não funciona de verdade.** Todos operariam sobre o
   clone da máquina que hospeda, com os arquivos sujos de uma pessoa só. Hoje
   assumimos "uma instância por dev", o que não escala para o time.
3. **Bloqueia o Auto Mode.** Dois cards em paralelo no mesmo working copy se
   atropelam, e a plataforma não pode criar nem trocar branch com a árvore suja
   — hoje ela recusa, de propósito.

## A restrição técnica que limita as saídas

**Mudar o caminho no banco não resolve sozinho.** Quem monta a pasta é o Docker;
um caminho que não está montado não existe dentro do container. Qualquer solução
tem que lidar com isso.

## Opções

### A. Montar um diretório-pai e escolher a subpasta pela tela
Monta-se, por exemplo, `C:/` ou a pasta que contém os dois repositórios, e o
admin aponta o subdiretório em Configurações → Serviços.

- ✅ Vira configuração de produto; sem restart para trocar de repo.
- ❌ **Expõe mais disco ao container** do que o necessário — o backend passa a
  ter escrita numa árvore maior. É decisão de segurança, não de conveniência.
- ❌ Não resolve concorrência nem criação de branch.
- Esforço: baixo (campo em settings + validação de caminho).

### B. `git worktree` por card, a partir de um clone gerenciado pela plataforma
A plataforma mantém um clone próprio e cria um worktree isolado por card, na
branch do chamado.

- ✅ Resolve **três dívidas de uma vez**: configuração, concorrência entre cards
  e criação/troca de branch (hoje impossível na árvore do dev).
- ✅ Nunca toca no working copy de ninguém — o dev puxa a branch quando quiser.
- ❌ Muda o modelo mental: o código alterado deixa de aparecer na árvore do dev
  automaticamente; ele passa a receber a alteração **pela branch/PR**.
- ❌ Precisa de espaço em disco e de política de limpeza dos worktrees.
- ❌ Exige credencial de clone da plataforma (ou reaproveitar a do dev).
- Esforço: médio-alto.

### C. Backend fora do Docker
Sem montagem, o caminho é livre e configurável.

- ✅ Simples, resolve a configuração.
- ❌ Joga fora o "sobe com um comando" que a instalação tem hoje.
- ❌ Não resolve concorrência nem branch.

## Recomendação

**Opção B.** É a única que paga as três dívidas juntas e a única compatível com
o Auto Mode: rodar a esteira ponta a ponta sem clique exige isolamento por card
e criação de branch, e nenhuma das outras dá isso.

Um caminho intermediário razoável: **A agora, B quando o Auto Mode entrar** — com
a ressalva de que A cria um hábito (backend escrevendo direto na árvore do dev)
que B depois desfaz.

## Perguntas que dependem do tech lead

1. **Instância por dev ou compartilhada?** É a pergunta que decide tudo. Hoje o
   desenho assume uma por dev.
2. **É aceitável a plataforma manter um clone próprio** do smart_desktop e do
   smart_web, com credencial própria ou do dev?
3. **Qual o limite de exposição de disco ao container?** A opção A depende disso.
4. **O dev aceita receber a alteração pela branch** em vez de vê-la na própria
   árvore? É a mudança de hábito que a opção B implica.
5. Se compartilhada: **quem hospeda**, e quem responde pelo working copy?

## Referências no repositório

- `smart-ai-flow/src/infra/repos.ts` — de onde vêm os caminhos hoje
- `docker-compose.yml` — as montagens
- [2026-08-21-08](2026-08-21-08-aceitar-aplica-o-codigo.md) — as cinco lacunas do
  Auto Mode, das quais esta é a de número 3
