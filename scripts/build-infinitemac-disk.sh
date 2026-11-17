#!/usr/bin/env bash
# Builds build/HomeCoffee-InfiniteMac.img: a device image with an Apple Partition Map (ER driver descriptor + PM map) and one HFS+ partition named "HomeCoffee" holding the Aqua UI, assets, docs and a Read Me. Classic emulators (PearPC, DingusPPC, SheepShaver) need the map; a bare superfloppy HFS+ volume is not recognised. Must run as root. See docs/INFINITE_MAC.md.
# Env: IMG_SIZE_MB (default 64, keep at or below 128 for iPad/mobile Safari), OUT_DIR (default <repo>/build).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/build}"
IMG="$OUT_DIR/HomeCoffee-InfiniteMac.img"
SIZE_MB="${IMG_SIZE_MB:-64}"
VOL="HomeCoffee"
MNT=""
LOOP=""

[[ "$SIZE_MB" =~ ^[0-9]+$ ]] || { echo "::error::IMG_SIZE_MB must be a whole number of MB (got $SIZE_MB)" >&2; exit 1; }
if [ "$SIZE_MB" -gt 128 ]; then
  echo "[infinitemac] warning: ${SIZE_MB} MB is above the 128 MB ceiling for iPad/mobile Safari; use 64 unless you have a reason" >&2
fi

[ "$(id -u)" -eq 0 ] || { echo 'build-infinitemac-disk.sh must run as root (losetup/mount)' >&2; exit 1; }
for t in truncate parted losetup lsblk mkfs.hfsplus mount umount fsck.hfsplus od grep sha256sum; do
  command -v "$t" >/dev/null 2>&1 || { echo "missing tool: $t (apt-get install parted hfsprogs util-linux)" >&2; exit 1; }
done

MNT="$(mktemp -d)"
cleanup() {
  if [ -n "$MNT" ] && mountpoint -q "$MNT"; then umount "$MNT" || true; fi
  if [ -n "$LOOP" ]; then losetup -d "$LOOP" 2>/dev/null || true; fi
  [ -n "$MNT" ] && rmdir "$MNT" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"
rm -f "$IMG"
echo "[infinitemac] creating ${SIZE_MB} MB raw image: $IMG"
truncate -s "${SIZE_MB}M" "$IMG"

echo "[infinitemac] writing Apple Partition Map (mac label)"
parted -s "$IMG" mklabel mac
parted -s "$IMG" mkpart "$VOL" hfs+ 1MiB 100%

echo "[infinitemac] attaching loop device with partitions"
LOOP="$(losetup -fP --show "$IMG")"
udevadm settle 2>/dev/null || true
# The HFS+ partition is the last partition on the loop device (the map entry itself is partition 1).
PART="$(lsblk -lnpo NAME "$LOOP" | grep -v "^$LOOP\$" | tail -n 1)"
[ -n "$PART" ] && [ -b "$PART" ] || { echo "::error::could not find HFS partition device under $LOOP" >&2; exit 1; }
echo "[infinitemac] HFS+ partition device: $PART"

echo "[infinitemac] formatting HFS+ volume '$VOL' on $PART"
mkfs.hfsplus -v "$VOL" "$PART"

echo "[infinitemac] mounting partition"
mount -t hfsplus -o rw "$PART" "$MNT"

DEST="$MNT/HomeCoffee"
mkdir -p "$DEST"
echo "[infinitemac] copying Aqua UI"
cp -R "$ROOT/ui/aqua" "$DEST/Aqua"
if [ -d "$ROOT/assets" ]; then
  echo "[infinitemac] copying assets"
  cp -R "$ROOT/assets" "$DEST/Assets"
fi
if [ -d "$ROOT/docs" ]; then
  echo "[infinitemac] copying docs"
  cp -R "$ROOT/docs" "$DEST/Docs"
fi

echo "[infinitemac] writing Read Me"
cat > "$DEST/Read Me.txt" <<'EOF'
HomeCoffee 1.0 for Mac OS X (Infinite Mac disk)

This volume is a data disk for classic Mac OS X hosts (10.0 to 10.4 in Infinite Mac).
It is not a bootable system disk.

Contents:
  Aqua/   Web desktop files (HTML, CSS, JavaScript) from ui/aqua.
  Assets/ Shared assets.
  Docs/   Project documentation, including INFINITE_MAC.md.

Aqua/ is a browser-based desktop. Mac OS X can open it only from a browser that
supports modern JavaScript, which the stock Mac OS X installs do not have. Use
the Docs/ folder to read the project notes from the Finder.

Built by scripts/build-infinitemac-disk.sh in the HomeCoffee repository.
EOF

sync
umount "$MNT"

echo "[infinitemac] checking HFS+ partition"
fsck.hfsplus -f "$PART" || { echo '::error::fsck.hfsplus reported errors on the partition' >&2; exit 1; }
losetup -d "$LOOP"
LOOP=""

echo "[infinitemac] verifying Apple Partition Map"
# Driver Descriptor Map signature 'ER' at block 0 (bytes 0-1).
SIG0="$(od -A n -t x1 -N 2 "$IMG" | tr -d ' \n')"
[ "$SIG0" = "4552" ] || { echo "::error::block 0 is not a driver descriptor map (got $SIG0, want 4552 'ER')" >&2; exit 1; }
# Partition map entry signature 'PM' at block 1 (byte 512).
SIG1="$(dd if="$IMG" bs=1 skip=512 count=2 2>/dev/null | od -A n -t x1 | tr -d ' \n')"
[ "$SIG1" = "504d" ] || { echo "::error::block 1 is not a partition map entry (got $SIG1, want 504d 'PM')" >&2; exit 1; }
grep -a -q 'Apple_HFS' "$IMG" || { echo '::error::Apple_HFS partition type not found in the image' >&2; exit 1; }

BYTES=$(stat -c %s "$IMG")
echo "[infinitemac] wrote $IMG (${BYTES} bytes), APM with HFS+ partition verified"
echo "[infinitemac] done"
