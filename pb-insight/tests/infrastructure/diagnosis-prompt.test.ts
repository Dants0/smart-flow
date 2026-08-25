import { describe, expect, it } from "vitest";
import { buildDiagnosisPrompt } from "../../src/infrastructure/llm/diagnosis-prompt.js";

describe("buildDiagnosisPrompt", () => {
  it("inclui o contexto de código e o texto do chamado literalmente", () => {
    const prompt = buildDiagnosisPrompt({
      objectContext: "CONTEUDO_DO_CODIGO_X",
      ticketText: "DESCRICAO_DO_CHAMADO_Y",
    });
    expect(prompt).toContain("CONTEUDO_DO_CODIGO_X");
    expect(prompt).toContain("DESCRICAO_DO_CHAMADO_Y");
  });

  it("pede o formato estruturado de resposta validado no teste-minimo", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y" });
    expect(prompt).toContain("Causa raiz:");
    expect(prompt).toContain("Correção sugerida:");
    expect(prompt).toContain("Evidência (trecho do código):");
    expect(prompt).toContain("Confiança (Alta / Média / Baixa) e por quê:");
  });

  it("instrui a declarar incerteza em vez de arriscar palpite sem embasamento", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y" });
    expect(prompt.toLowerCase()).toContain("declare quais outros objetos");
  });

  it("não menciona evidência visual quando não há imagens", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y" });
    expect(prompt).not.toContain("EVIDÊNCIA VISUAL");
  });

  it("avisa sobre a(s) imagem(ns) anexada(s) quando presentes", () => {
    const prompt = buildDiagnosisPrompt({
      objectContext: "x",
      ticketText: "y",
      images: [
        { mediaType: "image/png", base64Data: "a" },
        { mediaType: "image/png", base64Data: "b" },
      ],
    });
    expect(prompt).toContain("EVIDÊNCIA VISUAL");
    expect(prompt).toContain("2 imagem(ns) anexada(s)");
  });

  it("não menciona comentário do tech lead quando não informado", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y" });
    expect(prompt).not.toContain("COMENTÁRIO DO TECH LEAD");
  });

  it("inclui o comentário do tech lead como pista a verificar, não fato dado", () => {
    const prompt = buildDiagnosisPrompt({
      objectContext: "x",
      ticketText: "y",
      techLeadComment: "SUGESTAO_DO_TECH_LEAD_Z",
    });
    expect(prompt).toContain("COMENTÁRIO DO TECH LEAD");
    expect(prompt).toContain("SUGESTAO_DO_TECH_LEAD_Z");
    expect(prompt.toLowerCase()).toContain("verifique");
  });

  it("ignora comentário do tech lead vazio/só espaço", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y", techLeadComment: "   " });
    expect(prompt).not.toContain("COMENTÁRIO DO TECH LEAD");
  });
});

describe("buildDiagnosisPrompt — seção Abrangência", () => {
  it("não pede abrangência quando não há ocorrências irmãs no contexto", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y" });
    expect(prompt).not.toContain("Abrangência");
  });

  it("não pede abrangência quando a contagem de irmãs é zero", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y", siblingCount: 0 });
    expect(prompt).not.toContain("Abrangência");
  });

  it("exige listar quais irmãs têm o mesmo defeito quando elas estão no contexto", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y", siblingCount: 5 });
    expect(prompt).toContain("Abrangência");
    expect(prompt).toContain("5 outra(s) ocorrência(s)");
    expect(prompt).toContain("MESMO defeito");
  });

  it("proíbe extrapolar para objetos ausentes do contexto", () => {
    const prompt = buildDiagnosisPrompt({ objectContext: "x", ticketText: "y", siblingCount: 3 });
    expect(prompt.toLowerCase()).toContain("não deduza nem invente arquivos");
  });
});
