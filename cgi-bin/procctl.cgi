#!/bin/sh
# CGI: process control for Activity Monitor. Loopback only. Supports action=kill with a numeric pid. Refuses PID 1 and the CGI's own process.
case "$REMOTE_ADDR" in
  127.0.0.1|::1|::ffff:127.0.0.1) ;;
  *) printf 'Status: 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{"ok":false,"error":"forbidden"}\n'; exit 0 ;;
esac
json_err() { printf 'Status: %s\r\nContent-Type: application/json\r\n\r\n{"ok":false,"error":"%s"}\n' "$1" "$2"; exit 0; }
[ "$REQUEST_METHOD" = POST ] || json_err 405 "use POST"
action=""; pid=""
for kv in $(printf '%s' "$QUERY_STRING" | tr '&' ' '); do
  k=${kv%%=*}; v=${kv#*=}
  case "$k" in action) action=$v ;; pid) pid=$v ;; esac
done
[ "$action" = kill ] || json_err 400 "unknown action"
case "$pid" in ''|*[!0-9]*) json_err 400 "pid must be numeric" ;; esac
[ "$pid" -gt 1 ] || json_err 403 "refusing to signal init"
[ "$pid" -ne $$ ] || json_err 403 "refusing to signal this request"
[ -d "/proc/$pid" ] || json_err 404 "no such process"
kill -TERM "$pid" 2>/dev/null || json_err 500 "could not signal process"
sleep 1
if [ -d "/proc/$pid" ]; then kill -KILL "$pid" 2>/dev/null; fi
printf 'Content-Type: application/json\r\n\r\n{"ok":true,"pid":%s}\n' "$pid"
