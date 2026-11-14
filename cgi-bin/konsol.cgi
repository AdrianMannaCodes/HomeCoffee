#!/bin/sh
# CGI for the Aqua Konsol: runs one command in the tracked working directory and prints output, then __PWD__ and the new directory.
# Restricted to loopback clients: this endpoint executes shell commands as root.
case "$REMOTE_ADDR" in
  127.0.0.1|::1|::ffff:127.0.0.1) ;;
  *) printf 'Status: 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nforbidden\n'; exit 0 ;;
esac
printf 'Content-Type: text/plain\r\n\r\n'
urldecode() { printf '%b' "$(printf '%s' "$1" | sed 's/+/ /g; s/%/\\x/g')"; }
body=""
if [ -n "$CONTENT_LENGTH" ] && [ "$CONTENT_LENGTH" -gt 0 ] 2>/dev/null; then
  body="$(head -c "$CONTENT_LENGTH")"
fi
cmd="$(urldecode "$(printf '%s' "$body" | sed -n 's/.*cmd=\([^&]*\).*/\1/p')")"
cwd="$(urldecode "$(printf '%s' "$body" | sed -n 's/.*cwd=\([^&]*\).*/\1/p')")"
[ -n "$cwd" ] && [ -d "$cwd" ] || cwd=/root
cd "$cwd" || exit 0
if [ -n "$cmd" ]; then
  case "$cmd" in
    cd|cd\ *) eval "$cmd" 2>&1 ;;
    *) eval "$cmd" 2>&1 ;;
  esac
fi
echo
echo "__PWD__$(pwd -P)"
