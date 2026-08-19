import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Marca da plataforma: três barras ascendentes, remetendo ao fluxo do
// Kanban (NOVO -> ... -> RESOLVIDO) e ao workflow icon usado no header.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          borderRadius: 7,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
          <div style={{ width: 5, height: 10, borderRadius: 1.5, background: "#71717a" }} />
          <div style={{ width: 5, height: 16, borderRadius: 1.5, background: "#a1a1aa" }} />
          <div style={{ width: 5, height: 22, borderRadius: 1.5, background: "#fafafa" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
