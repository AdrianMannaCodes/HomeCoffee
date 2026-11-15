#!/bin/sh
# CGI: mounted filesystem usage for Disk Utility, from df. Returns JSON with name, mount, total and used bytes.
printf 'Content-Type: application/json\r\n\r\n'
printf '{"ok":true,"disks":['
df -kP 2>/dev/null | awk 'NR>1 && $1 ~ /^\// {print $1"|"$6"|"$2"|"$3}' | while IFS='|' read -r dev mnt tot used; do
  case "$mnt" in /proc*|/sys*|/dev*|/run*|/tmp*) continue ;; esac
  name=${mnt##*/}; [ -n "$name" ] || name=root
  printf '{"id":"%s","name":"%s","mount":"%s","total":%s,"used":%s}\n' "$name" "$name" "$mnt" "$((tot*1024))" "$((used*1024))"
done | awk 'BEGIN{ORS=""} {if (NR>1) print ","; print $0}'
printf ']}\n'
