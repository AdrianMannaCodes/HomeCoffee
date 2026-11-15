#!/bin/sh
# CGI: live system stats for Activity Monitor. Returns JSON: cpu percent, memory bytes, and top processes.
printf 'Content-Type: application/json\r\n\r\n'
cpu1=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5+$6}' /proc/stat 2>/dev/null)
sleep 1
cpu2=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5+$6}' /proc/stat 2>/dev/null)
cpu=$(printf '%s\n%s\n' "$cpu1" "$cpu2" | awk 'NR==1{t1=$1;i1=$2} NR==2{dt=$1-t1; di=$2-i1; if (dt>0) printf "%.1f", (dt-di)*100/dt; else print "0"}')
[ -n "$cpu" ] || cpu=0
mem=$(awk '/^MemTotal:/{t=$2*1024} /^MemAvailable:/{a=$2*1024} END{printf "%d %d", t, t-a}' /proc/meminfo 2>/dev/null)
total=${mem%% *}; used=${mem##* }
[ -n "$total" ] || { total=0; used=0; }
printf '{"ok":true,"cpu":%s,"mem":{"total":%s,"used":%s},"procs":[' "$cpu" "$total" "$used"
first=1
for d in /proc/[0-9]*; do
  pid=${d#/proc/}
  [ -r "$d/status" ] || continue
  name=$(awk '/^Name:/{print $2; exit}' "$d/status" 2>/dev/null)
  uid=$(awk '/^Uid:/{print $2; exit}' "$d/status" 2>/dev/null)
  rss=$(awk '/^VmRSS:/{print $2*1024; exit}' "$d/status" 2>/dev/null)
  [ -n "$name" ] || continue
  case "$name" in *\"*|*\\*) continue ;; esac
  user=$(awk -F: -v u="$uid" '$3==u{print $1; exit}' /etc/passwd 2>/dev/null)
  [ -n "$user" ] || user=$uid
  [ $first -eq 1 ] || printf ','
  first=0
  printf '{"pid":%s,"name":"%s","user":"%s","cpu":0,"mem":%s}' "$pid" "$name" "$user" "${rss:-0}"
done
printf ']}\n'
