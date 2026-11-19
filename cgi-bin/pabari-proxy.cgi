#!/bin/sh
# Pabari proxy: fetches an http(s) page for the Pabari iframe and drops X-Frame-Options and frame-ancestors CSP so it can be shown. Loopback clients only; private and local hosts are refused.
case "$REMOTE_ADDR" in
  127.0.0.1|::1|::ffff:127.0.0.1) ;;
  *) printf 'Status: 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{"ok":false,"error":"forbidden"}\n'; exit 0 ;;
esac
fail() { printf 'Status: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\n' "$1" "$2"; exit 0; }
urldecode() { printf '%b' "$(printf '%s' "$1" | sed 's/+/ /g; s/%/\\x/g')"; }

url=""
for kv in $(printf '%s' "$QUERY_STRING" | tr '&' ' '); do
  k=${kv%%=*}; v=${kv#*=}
  case "$k" in url) url=$(urldecode "$v") ;; esac
done

[ -n "$url" ] || fail 400 'missing url'
case "$url" in
  http://*|https://*) ;;
  *) fail 400 'only http and https are allowed' ;;
esac
case "$url" in *[[:space:]]*|*\'*|*\"*|*\`*|*\$*) fail 400 'invalid characters in url' ;; esac

# Host part: refuse localhost, loopback, link-local and private ranges.
hostport=${url#*://}; hostport=${hostport%%/*}; host=${hostport%%:*}; host=${host##*@}
case "$host" in
  ''|localhost|*.localhost|0.0.0.0|127.*|10.*|192.168.*|169.254.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|\[*|::1) fail 403 'host not allowed' ;;
esac

command -v curl >/dev/null 2>&1 || fail 502 'proxy unavailable: curl is not installed'

tmp="/tmp/pabari-$$"
trap 'rm -f "$tmp.h" "$tmp.b"' EXIT
curl -sS -L --max-redirs 5 --max-time 20 --max-filesize 5242880 -A 'Mozilla/5.0 (HomeCoffee Pabari)' -D "$tmp.h" -o "$tmp.b" "$url" 2>/dev/null || fail 502 'could not load page'

ctype=$(awk 'BEGIN{IGNORECASE=1} /^content-type:/{sub(/\r$/,""); sub(/^[^:]*: */,""); t=$0} END{print t}' "$tmp.h")
[ -n "$ctype" ] || ctype='application/octet-stream'

# Keep only safe headers; the frame-blocking ones are never forwarded.
printf 'Content-Type: %s\r\n' "$ctype"
printf 'Cache-Control: no-store\r\n'
printf 'X-Content-Type-Options: nosniff\r\n'
printf 'Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups\r\n'
printf '\r\n'

case "$ctype" in
  text/html*)
    # Add a base tag so relative resources resolve against the original site.
    esc=$(printf '%s' "$url" | sed 's/[&#\\]/\\&/g')
    sed "0,/<head[^>]*>/s#<head\([^>]*\)>#<head\1><base href=\"$esc\">#I" "$tmp.b" 2>/dev/null || cat "$tmp.b"
    ;;
  *)
    cat "$tmp.b"
    ;;
esac
