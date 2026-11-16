#!/usr/bin/env bash
# EXPERIMENTAL: boots a PowerPC G4 (mpc7455, Power Macintosh 'mac99' machine) under qemu-system-ppc.
# Not part of the x86_64 UTM build. See docs/G4.md. Nothing here has been verified to boot HomeCoffee.
# Usage: scripts/run-mac99.sh <disk-image> [extra qemu args...]
#   Env: RAM_MB (default 512), CPU (default mpc7455), KERNEL / INITRD (optional direct-boot paths).
set -euo pipefail

DISK="${1:-}"
[ -n "$DISK" ] || { echo 'usage: scripts/run-mac99.sh <disk-image> [extra qemu args...]' >&2; exit 1; }
[ -f "$DISK" ] || { echo "disk image not found: $DISK" >&2; exit 1; }
shift

QEMU="${QEMU:-qemu-system-ppc}"
command -v "$QEMU" >/dev/null 2>&1 || { echo "$QEMU not installed (apt install qemu-system-ppc)" >&2; exit 1; }

RAM_MB="${RAM_MB:-512}"
CPU="${CPU:-mpc7455}"

ARGS=(
  -M mac99
  -cpu "$CPU"
  -m "$RAM_MB"
  -drive "file=$DISK,format=raw,media=disk"
  -device sysbus-ide
  -nic user,model=sungem
  -serial stdio
  -display none
)

# Optional direct kernel boot (skips the Open Firmware disk boot).
if [ -n "${KERNEL:-}" ]; then
  ARGS+=(-kernel "$KERNEL")
  [ -n "${INITRD:-}" ] && ARGS+=(-initrd "$INITRD")
  ARGS+=(-append "root=/dev/sda2 console=ttyS0 console=tty0")
fi

echo "[run-mac99] machine=mac99 cpu=$CPU ram=${RAM_MB}M disk=$DISK"
exec "$QEMU" "${ARGS[@]}" "$@"
