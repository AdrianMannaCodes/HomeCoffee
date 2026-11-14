#!/bin/sh
# CGI for Aqua file operations: read, write, mkdir, delete, upload, download. Loopback clients only; paths limited to /root and /opt/homecoffee.
case "$REMOTE_ADDR" in
  127.0.0.1|::1|::ffff:127.0.0.1) ;;
  *) printf 'Status: 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{"ok":false,"error":"forbidden"}\n'; exit 0 ;;
esac
MAX_BYTES=26214400
urldecode() { printf '%b' "$(printf '%s' "$1" | sed 's/+/ /g; s/%/\\x/g')"; }
jsonstr() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
fail() { printf 'Status: %s\r\nContent-Type: application/json\r\n\r\n{"ok":false,"error":"%s"}\n' "$1" "$(jsonstr "$2")"; exit 0; }
mimetype() {
  case "$1" in
    html|htm) echo 'text/html; charset=utf-8' ;;
    txt|md|log) echo 'text/plain; charset=utf-8' ;;
    rtf) echo 'application/rtf' ;;
    json) echo 'application/json' ;;
    png) echo 'image/png' ;;
    jpg|jpeg) echo 'image/jpeg' ;;
    gif) echo 'image/gif' ;;
    pdf) echo 'application/pdf' ;;
    *) echo 'application/octet-stream' ;;
  esac
}

action=""; path=""
for kv in $(printf '%s' "$QUERY_STRING" | tr '&' ' '); do
  k=${kv%%=*}; v=${kv#*=}
  case "$k" in
    action) action=$(urldecode "$v") ;;
    path) path=$(urldecode "$v") ;;
  esac
done

case "$path" in /*) ;; *) fail 400 "path must be absolute" ;; esac
case "$path" in *..*) fail 403 "forbidden" ;; esac
parent="${path%/*}"; [ -n "$parent" ] || parent=/
name="${path##*/}"
case "$name" in ''|.|..) fail 400 "invalid name" ;; esac
case "$name" in *\"*|*\\*) fail 400 "invalid name" ;; esac
realparent=$(cd "$parent" 2>/dev/null && pwd -P) || fail 404 "not found"
case "$realparent" in
  /root|/root/*|/opt/homecoffee|/opt/homecoffee/*) ;;
  *) fail 403 "forbidden" ;;
esac
target="$realparent/$name"
[ -L "$target" ] && fail 403 "symlinks are not allowed"

# Writes the request body to target atomically, enforcing the size cap.
store() {
  case "$CONTENT_LENGTH" in ''|*[!0-9]*) len=-1 ;; *) len=$CONTENT_LENGTH ;; esac
  [ "$len" -le "$MAX_BYTES" ] || fail 413 "file too large"
  tmp="$target.part.$$"
  if [ "$len" -ge 0 ]; then head -c "$len" > "$tmp"; else head -c "$MAX_BYTES" > "$tmp"; fi
  if [ $? -ne 0 ]; then rm -f "$tmp"; fail 500 "write failed"; fi
  size=$(wc -c < "$tmp")
  if [ "$size" -gt "$MAX_BYTES" ]; then rm -f "$tmp"; fail 413 "file too large"; fi
  mv "$tmp" "$target" || { rm -f "$tmp"; fail 500 "write failed"; }
  printf 'Content-Type: application/json\r\n\r\n{"ok":true,"path":"%s","bytes":%s}\n' "$(jsonstr "$target")" "$size"
}

case "$action" in
  read)
    [ "$REQUEST_METHOD" = GET ] || fail 405 "use GET"
    [ -f "$target" ] || fail 404 "not a file"
    size=$(wc -c < "$target")
    [ "$size" -le "$MAX_BYTES" ] || fail 413 "file too large"
    printf 'Content-Type: text/plain; charset=utf-8\r\n\r\n'
    cat "$target"
    ;;
  download)
    [ "$REQUEST_METHOD" = GET ] || fail 405 "use GET"
    [ -f "$target" ] || fail 404 "not a file"
    size=$(wc -c < "$target")
    printf 'Content-Type: %s\r\nContent-Length: %s\r\nContent-Disposition: attachment; filename="%s"\r\n\r\n' "$(mimetype "${name##*.}")" "$size" "$name"
    cat "$target"
    ;;
  write)
    [ "$REQUEST_METHOD" = POST ] || fail 405 "use POST"
    [ -d "$target" ] && fail 400 "is a directory"
    store
    ;;
  upload)
    [ "$REQUEST_METHOD" = POST ] || fail 405 "use POST"
    [ -e "$target" ] && fail 409 "already exists"
    store
    ;;
  mkdir)
    [ "$REQUEST_METHOD" = POST ] || fail 405 "use POST"
    [ -e "$target" ] && fail 409 "already exists"
    mkdir "$target" || fail 500 "could not create folder"
    printf 'Content-Type: application/json\r\n\r\n{"ok":true,"path":"%s"}\n' "$(jsonstr "$target")"
    ;;
  delete)
    [ "$REQUEST_METHOD" = POST ] || fail 405 "use POST"
    if [ -d "$target" ]; then
      rmdir "$target" 2>/dev/null || fail 409 "folder is not empty"
    elif [ -f "$target" ]; then
      rm -f "$target" || fail 500 "could not delete"
    else
      fail 404 "not found"
    fi
    printf 'Content-Type: application/json\r\n\r\n{"ok":true,"path":"%s"}\n' "$(jsonstr "$target")"
    ;;
  *)
    fail 400 "unknown action"
    ;;
esac
