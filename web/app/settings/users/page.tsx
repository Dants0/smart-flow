"use client";

import { useCallback, useEffect, useState } from "react";
import { LuLoaderCircle, LuTrash2, LuUserPlus, LuUsers, LuShield } from "react-icons/lu";
import { createUser, deleteUser, listUsers } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import { TextField, SettingsSection, FieldGroup } from "@/components/settings/fields";

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUsers(await listUsers());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao carregar usuários");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, sem external store pra subscrever
    refresh();
  }, [refresh]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await createUser({ username, displayName, password, isAdmin });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setIsAdmin(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao criar usuário");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteUser(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao apagar");
    }
  }

  return (
    <SettingsSection
      icon={LuUsers}
      title="Usuários"
      description="Cada dev tem sua própria conta e suas próprias credenciais do Jira. Só administradores veem e alteram esta tela."
    >
      {users === null ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <LuLoaderCircle className="size-4 animate-spin" />
          Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {u.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {u.displayName}
                  </span>
                  {u.isAdmin && (
                    <span className="flex items-center gap-0.5 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white dark:bg-white dark:text-zinc-900">
                      <LuShield className="size-2.5" />
                      admin
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-zinc-400">
                  {u.username}
                  {u.jiraPasswordSet ? " · Jira configurado" : " · Jira pendente"}
                </p>
              </div>
              <button
                onClick={() => handleDelete(u.id)}
                title="Apagar usuário"
                className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
              >
                <LuTrash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <FieldGroup title="Novo usuário">
        <TextField label="Usuário" value={username} onChange={setUsername} placeholder="nome.sobrenome" />
        <TextField label="Nome de exibição" value={displayName} onChange={setDisplayName} placeholder="Nome Sobrenome" />
        <TextField
          label="Senha inicial"
          type="password"
          value={password}
          onChange={setPassword}
          hint="Mínimo 8 caracteres. O usuário pode trocar depois em Minha conta."
        />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="size-4 rounded border-zinc-300"
          />
          Administrador (pode alterar configuração global e gerenciar usuários)
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={creating || !username || !displayName || password.length < 8}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {creating ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuUserPlus className="size-4" />}
            Criar usuário
          </button>
          {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </FieldGroup>
    </SettingsSection>
  );
}
