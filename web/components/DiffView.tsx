function lineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  }
  if (line.startsWith("@@")) {
    return "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300";
  }
  return "text-zinc-500 dark:text-zinc-400";
}

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-5 dark:border-zinc-800 dark:bg-zinc-950">
      {lines.map((line, i) => (
        <div key={i} className={`px-1 ${lineClass(line)}`}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}
