#!/usr/bin/env bash
# Ejecuta un único comando explícito de operador tras validar el guard dentro
# del lock global del repositorio. No agenda publicaciones ni hace git push.
set -euo pipefail

usage() {
  printf '%s\n' 'uso: with-publication-lock.sh --config /ruta/config-privada.json -- comando-operador [argumentos...]' >&2
  exit 64
}

[[ $# -ge 4 && "$1" == '--config' && "$3" == '--' ]] || usage
config=$2
shift 3
[[ $# -ge 1 && "$config" = /* ]] || usage

# No se evalúa texto de shell: los argumentos recibidos forman exactamente un
# único argv de operador. El guard se ejecuta una vez ya adquirido el lock.
git_common_dir=$(git rev-parse --git-common-dir 2>/dev/null) || { printf '%s\n' 'PUBLICATION_LOCK_GIT_REQUIRED' >&2; exit 65; }
if [[ "$git_common_dir" != /* ]]; then git_common_dir=$(cd "$git_common_dir" && pwd -P); fi
lock_dir="$git_common_dir/locks"
lock_file="$lock_dir/publicacion.lock"
mkdir -p -- "$lock_dir"
chmod 700 -- "$lock_dir"

exec 9>"$lock_file"
flock 9
node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/release-guard.mjs" --config "$config"
"$@"
