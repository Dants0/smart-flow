# 08 — Garantia de cobertura do ws_objects (verificada, não presumida)

> Entregue em 2026-07-24, em resposta a uma pergunta direta e correta do
> usuário: "o que me garante que mapeou tudo da pasta ws_objects?". Resposta
> honesta na hora: nada garantia isso automaticamente — e a verificação
> encontrou uma lacuna real (3 arquivos `.srx` nunca lidos). Corrigido e agora
> com um método reproduzível para reconfirmar a cobertura a qualquer momento.

## O que garantia (e o que não garantia) antes desta entrada

`FsSourceFileProvider` varre recursivamente `ws_objects` e só enfileira
arquivos cuja extensão está em `EXTENSION_TO_TYPE` (`domain/value-objects/pb-object-type.ts`).
Qualquer extensão **fora** dessa lista é **silenciosamente ignorada** — nunca
chega a ser lida, e não aparece no contador `Ignorados` do relatório de
ingestão (que só conta falhas de parsing de arquivos que *foram* lidos).

Ou seja: `Ignorados: 0` no relatório **não** significa "cobertura completa" —
significa "nenhum arquivo dos que tentamos ler falhou". Um tipo de objeto
nunca cadastrado no mapa de extensões passaria despercebido para sempre, sem
nenhum sinal de alerta.

## Verificação real (2026-07-24)

```powershell
Get-ChildItem 'C:\controle de versão\smart_desktop\ws_objects' -Recurse -File |
  Group-Object Extension | Sort-Object Count -Descending
```

Resultado — 11 extensões distintas no repo inteiro:

| Extensão | Contagem | Reconhecida antes? |
|---|---:|---|
| `.srd` | 9.019 | ✅ |
| `.srw` | 3.107 | ✅ |
| `.srf` | 1.788 | ✅ |
| `.sru` | 1.351 | ✅ |
| `.srs` | 246 | ✅ |
| `.srm` | 241 | ✅ |
| `.sra` | 85 | ✅ |
| `.srj` | 61 | ✅ |
| `.srq` | 26 | ✅ |
| `.srp` | 4 | ✅ |
| **`.srx`** | **3** | **❌ — não reconhecida** |

Soma das 10 reconhecidas: **15.928** — batia exatamente com `objectCount` do
último `npm run ingest` antes desta entrada. Ou seja: tudo que era lido,
virava objeto (0 perdas de parsing) — mas 3 arquivos nunca entravam na conta.

### O que são os 3 `.srx`

Inspecionados diretamente (leitura, não git):

```
agenda50/agenda50.pbl.src/p_u_nv_html.srx
agenda50/ag_conf/ag_conf.pbl.src/p_u_nv_html.srx
aplgen50/fatgen50/fatgen50.pbl.src/p_u_nv_fature.srx
```

Formato: `global type p_u_nv_html from NonVisualObject` com uma propriedade
`ProxyName = "u_nv_html"` — é um **Proxy Object** do PowerBuilder (wrapper de
acesso remoto/COM/EJB para um UserObject real). Tipo raro — só esses 3 em
toda a base — mas real e antes completamente invisível.

## Correção

Adicionado `Proxy` a `PBObjectType`, `.srx` → `Proxy` em `EXTENSION_TO_TYPE`,
e `ProxyParser` (extração mínima — reaproveita `globalTypeDeclaration` já
existente, que captura corretamente `ancestor: "nonvisualobject"` sem
precisar de código novo para isso).

**Reingestão de confirmação:** `objectCount` foi de 15.928 → **15.931**
(exatamente +3). A soma das 11 extensões agora bate 1:1 com o total ingerido.

## Como reconfirmar cobertura no futuro (método, não promessa)

Sempre que quiser reconfirmar que a ingestão está completa:

```powershell
# 1. Contar extensões reais no disco
Get-ChildItem 'C:\controle de versão\smart_desktop\ws_objects' -Recurse -File |
  Group-Object Extension | Sort-Object Count -Descending

# 2. Comparar a soma com objectCount do relatório de ingestão
npm run ingest    # ou GET /health depois de POST /ingest
```

Se a soma das extensões no disco bater com `objectCount`, a cobertura é
completa. Se não bater, alguma extensão nova apareceu no `ws_objects` (o
PowerBuilder às vezes introduz tipos de objeto novos) e precisa ser
registrada em `EXTENSION_TO_TYPE` + um parser, exatamente como feito aqui
para `.srx`.

## Decisões registradas

1. **Verificação com dado real, não afirmação.** A pergunta do usuário
   merecia uma contagem de arquivos de verdade, não uma resposta "sim, está
   tudo mapeado" sem evidência — e a verificação de fato encontrou uma
   lacuna real.
2. **`ProxyParser` mínimo, sem extração de `ProxyName`→objeto real.** Só 3
   arquivos em todo o repo; extrair o vínculo `ProxyName` como aresta de
   dependência seria engenharia desproporcional ao volume. Documentado como
   simplificação deliberada, não esquecimento.
3. **Nenhum mecanismo automático de alerta para extensão desconhecida foi
   adicionado** (ex.: logar "N arquivos com extensão não reconhecida
   ignorados" no relatório de ingestão) — deliberadamente fora de escopo
   agora, mas é a melhoria natural se isso importar de novo no futuro (ver
   Próximos passos).

## Próximos passos

- Considerar logar no relatório de ingestão quantos arquivos foram
  **encontrados mas ignorados por extensão desconhecida** (hoje é
  silencioso) — transformaria esta verificação manual em um sinal
  automático a cada `ingest`.
