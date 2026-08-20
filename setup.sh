#!/usr/bin/env sh
# Setup inicial da plataforma. Cria o .env e gera os segredos desta instalação.
#   Uso:  ./setup.sh
set -e

if [ -f .env ]; then
  echo "'.env' já existe — nada foi alterado."
  echo "Para regerar os segredos, apague o arquivo e rode de novo."
  echo "  ATENÇÃO: trocar ENCRYPTION_KEY invalida as senhas do Jira já salvas."
  exit 0
fi

# base64url: sem +, / ou = pra não atrapalhar o parsing do .env
secret() {
  openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'
}

cp .env.example .env

JWT=$(secret 48)
ENC=$(secret 32)

# `sed -i` difere entre GNU e BSD/macOS; arquivo temporário funciona nos dois.
sed -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" \
    -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENC|" \
    .env > .env.tmp && mv .env.tmp .env

echo "'.env' criado com segredos novos."
echo ""
echo "Próximos passos:"
echo "  1. (opcional) edite .env e preencha SMART_DESKTOP_PATH"
echo "  2. docker compose up -d --build"
echo "  3. abra http://localhost:3000 e crie o usuário administrador"
