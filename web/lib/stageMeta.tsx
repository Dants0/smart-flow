import {
  LuInbox,
  LuBrain,
  LuCode,
  LuEye,
  LuCircleCheckBig,
  LuTriangleAlert,
  LuGitPullRequest,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import type { Stage } from "./types";

interface StageMeta {
  icon: IconType;
  label: string;
  dot: string; // bg color for the little status dot
  chip: string; // bg + text color for badges
  header: string; // column header text color
}

export const STAGE_META: Record<Stage, StageMeta> = {
  NOVO: {
    icon: LuInbox,
    label: "Novo",
    dot: "bg-zinc-400",
    chip: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    header: "text-zinc-600 dark:text-zinc-400",
  },
  ANALISE: {
    icon: LuBrain,
    label: "Análise",
    dot: "bg-blue-500",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    header: "text-blue-600 dark:text-blue-400",
  },
  DESENVOLVIMENTO: {
    icon: LuCode,
    label: "Desenvolvimento",
    dot: "bg-purple-500",
    chip: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    header: "text-purple-600 dark:text-purple-400",
  },
  REVISAO: {
    icon: LuEye,
    label: "Revisão",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    header: "text-amber-600 dark:text-amber-400",
  },
  VERSIONAMENTO: {
    icon: LuGitPullRequest,
    label: "Versionamento",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    header: "text-sky-600 dark:text-sky-400",
  },
  RESOLVIDO: {
    icon: LuCircleCheckBig,
    label: "Resolvido",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    header: "text-emerald-600 dark:text-emerald-400",
  },
  ERRO: {
    icon: LuTriangleAlert,
    label: "Erro",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    header: "text-red-600 dark:text-red-400",
  },
};
