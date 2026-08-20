import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empacota só o necessário pra rodar (server + deps usadas), em vez de exigir
  // o node_modules inteiro na imagem — corta a imagem de ~1GB para ~200MB.
  output: "standalone",
};

export default nextConfig;
