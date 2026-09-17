"use client";

import { useEffect, useState } from "react";
import { LuCircleCheckBig, LuDatabase, LuLoaderCircle, LuPlug } from "react-icons/lu";
import {
  getSettings,
  testMw20Connection,
  updateSettings,
  type Mw20Engine,
  type PlatformSettingsPatch,
} from "@/lib/api";
import { SaveBar, SelectField, SettingsSection, TextField } from "@/components/settings/fields";

/**
 * Conexão com o banco MW20 — é onde mora a tabela `usr` que valida a credencial
 * do MW desenv de cada dev. Global e só do admin; cada dev cadastra o próprio
 * login em Minha conta.
 */
export default function MwSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [engine, setEngine] = useState<Mw20Engine | "">("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setEngine(s.mw20Engine ?? "");
        setHost(s.mw20Host ?? "");
        setPort(s.mw20Port ? String(s.mw20Port) : "");
        setDatabase(s.mw20Database ?? "");
        setUser(s.mw20User ?? "");
        setPasswordSet(s.mw20PasswordSet);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  const portaInvalida = port.trim() !== "" && !/^\d{1,5}$/.test(port.trim());

  async function handleSave() {
    if (portaInvalida) {
      setError("porta precisa ser um número");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const patch: PlatformSettingsPatch = {
        mw20Engine: engine,
        mw20Host: host.trim(),
        mw20Port: port.trim() ? Number(port.trim()) : null,
        mw20Database: database.trim(),
        mw20User: user.trim(),
      };
      if (password) patch.mw20Password = password;
      const s = await updateSettings(patch);
      setPasswordSet(s.mw20PasswordSet);
      setPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const r = await testMw20Connection();
      setTestResult(`Conectou e leu a tabela usr em ${r.latencyMs} ms.`);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "falha ao testar");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <LuLoaderCircle className="size-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <SettingsSection
      icon={LuDatabase}
      title="MW desenv"
      description="Conexão com o banco MW20. A plataforma só lê a tabela usr (login, senha e status) para conferir a credencial do MW desenv que cada dev cadastra em Minha conta. Use um usuário de banco com permissão só de leitura."
    >
      <SelectField
        label="Banco"
        value={engine}
        onChange={(v) => setEngine(v as Mw20Engine | "")}
        options={[
          { value: "", label: "— escolha —" },
          { value: "sqlserver", label: "SQL Server" },
          { value: "oracle", label: "Oracle" },
        ]}
      />
      <TextField label="Host" value={host} onChange={setHost} placeholder="servidor-do-mw20" />
      <TextField
        label="Porta"
        value={port}
        onChange={setPort}
        placeholder={engine === "oracle" ? "1521" : "1433"}
        hint="Em branco, usa a porta padrão do banco."
      />
      <TextField
        label={engine === "oracle" ? "Service name" : "Nome do banco"}
        value={database}
        onChange={setDatabase}
        placeholder="MW20"
      />
      <TextField label="Usuário do banco" value={user} onChange={setUser} />
      <TextField
        label="Senha do banco"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={passwordSet ? "•••••••• (já configurada — deixe em branco pra manter)" : ""}
        hint="Guardada cifrada no banco da plataforma."
      />

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex w-fit items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {testing ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuPlug className="size-4" />}
            Testar conexão
          </button>
          <span className="text-xs text-zinc-400">usa a configuração salva</span>
        </div>
        {testResult && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <LuCircleCheckBig className="size-3.5" />
            {testResult}
          </p>
        )}
        {testError && <p className="text-xs text-red-600 dark:text-red-400">{testError}</p>}
      </div>
    </SettingsSection>
  );
}
