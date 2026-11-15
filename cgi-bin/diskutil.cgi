#!/bin/sh
# CGI: Disk Utility actions. Loopback only, POST only. Actions: verify, repair, perms, repair-perms, cleanup. Targets are validated against mounted filesystems.
case "$REMOTE_ADDR" in
  127.0.0.1|::1|::ffff:127.0.0.1) ;;
  *) printf 'Status: 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nforbidden\n'; exit 0 ;;
esac
fail() { printf 'Status: %s\r\nContent-Type: text/plain\r\n\r\n%s\n' "$1" "$2"; exit 0; }
[ "$REQUEST_METHOD" = POST ] || fail 405 "use POST"
action=""; disk=""
for kv in $(printf '%s' "$QUERY_STRING" | tr '&' ' '); do
  k=${kv%%=*}; v=${kv#*=}
  case "$k" in action) action=$v ;; disk) disk=$v ;; esac
done
case "$disk" in ''|*[!A-Za-z0-9_-]*) fail 400 "invalid disk id" ;; esac
mnt=$(df -kP 2>/dev/null | awk -v d="$disk" 'NR>1 {n=$6; sub(/.*\//,"",n); if (n=="") n="root"; if (n==d) {print $6; exit}}')
[ -n "$mnt" ] || fail 404 "disk not found"
case "$mnt" in /proc*|/sys*|/dev*) fail 403 "protected filesystem" ;; esac
printf 'Content-Type: text/plain; charset=utf-8\r\n\r\n'
case "$action" in
  verify)
    echo "Checking $mnt (read-only scan)."
    if [ -w "$mnt" ]; then echo "Filesystem is writable and mounted."; else echo "Filesystem is read-only."; fi
    df -kP "$mnt" 2>&1 | tail -1
    ;;
  repair)
    echo "Repair requires unmounting the filesystem. This build does not unmount live disks, so nothing was changed."
    ;;
  perms)
    echo "Checking ownership in $mnt/root and $mnt/opt/homecoffee:"
    for d in "$mnt/root" "$mnt/opt/homecoffee"; do
      [ -d "$d" ] && find "$d" -maxdepth 2 ! -user root 2>/dev/null | head -50 | sed 's/^/  not owned by root: /'
    done
    echo "Check complete."
    ;;
  repair-perms)
    for d in "$mnt/root" "$mnt/opt/homecoffee"; do
      [ -d "$d" ] || continue
      find "$d" -maxdepth 2 -type d -exec chmod u+rwx {} \; 2>/dev/null
      find "$d" -maxdepth 2 -type f -exec chmod u+rw {} \; 2>/dev/null
      echo "Repaired owner read and write bits under $d (maxdepth 2)."
    done
    ;;
  cleanup)
    removed=0
    for d in "$mnt/tmp" "$mnt/var/tmp"; do
      [ -d "$d" ] || continue
      n=$(find "$d" -mindepth 1 -maxdepth 1 -mtime +1 2>/dev/null | wc -l)
      find "$d" -mindepth 1 -maxdepth 1 -mtime +1 -exec rm -rf {} + 2>/dev/null
      removed=$((removed + n))
    done
    echo "Removed $removed item(s) older than one day from temp directories on $mnt."
    ;;
  *) echo "unknown action" ;;
esac
