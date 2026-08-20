"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LuLoaderCircle } from "react-icons/lu";
import { getMe } from "@/lib/api";
import { getToken, type AuthUser } from "@/lib/auth";

/**
 * Envolve as telas autenticadas. O token vive no localStorage, então a checagem
 * só pode acontecer no client — daí o estado de "verificando" antes de liberar
 * o conteúdo (evita piscar a tela e disparar requests que já nasceriam 401).
 */
export function AuthGuard({ children }: { children: (user: AuthUser) => React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black">
        <LuLoaderCircle className="size-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return <>{children(user)}</>;
}
