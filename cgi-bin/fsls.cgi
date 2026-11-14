#!/bin/sh
# CGI for the Aqua Finder: lists a directory as JSON. Only /root and /opt/homecoffee trees are allowed.
printf 'Content-Type: application/json\r\n\r\n'
urldecode() { printf '%b' "$(printf '%s' "$1" | sed 's/+/ /g; s/%/\\x/g')"; }
jsonstr() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
raw="${QUERY_STRING#path=}"
req="$(urldecode "$raw")"
[ -n "$req" ] || req=/root
real="$(cd "$req" 2>/dev/null && pwd -P)"
if [ -z "$real" ]; then
  printf '{"ok":false,"error":"not found"}\n'; exit 0
fi
case "$real" in
  /root|/root/*|/opt/homecoffee|/opt/homecoffee/*) ;;
  *) printf '{"ok":false,"error":"forbidden"}\n'; exit 0 ;;
esac
printf '{"ok":true,"path":"%s","entries":[' "$(jsonstr "$real")"
first=1
for f in "$real"/* "$real"/.[!.]*; do
  [ -e "$f" ] || continue
  name="${f##*/}"
  if [ -d "$f" ]; then type=dir; size=0; else type=file; size=$(wc -c < "$f" 2>/dev/null || echo 0); fi
  [ $first -eq 1 ] || printf ','
  first=0
  printf '{"name":"%s","type":"%s","size":%s}' "$(jsonstr "$name")" "$type" "$size"
done
printf ']}\n'
