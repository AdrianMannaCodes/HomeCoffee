#!/usr/bin/env bash
# Builds build/HomeCoffee-InfiniteMac.img: a raw HFS+ volume named "HomeCoffee" holding the Aqua UI, assets, docs and a Read Me for classic Mac OS X hosts. Must run as root (loop mount). See docs/INFINITE_MAC.md.
# Env: IMG_SIZE_MB (default 64), OUT_DIR (default <repo>/build).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/build}"
IMG="$OUT_DIR/HomeCoffee-InfiniteMac.img"
SIZE_MB="${IMG_SIZE_MB:-64}"
VOL="HomeCoffee"

[ "$(id -u)" -eq 0 ] || { echo 'build-infinitemac-disk.sh must run as root (loop mount)' >&2; exit 1; }
for t in truncate mkfs.hfsplus mount umount fsck.hfsplus sha256sum; do
  command -v "$t" >/dev/null 2>&1 || { echo "missing tool: $t (apt-get install hfsprogs util-linux coreutils)" >&2; exit 1; }
done

MNT="$(mktemp -d)"
cleanup() {
  if mountpoint -q "$MNT"; then umount "$MNT" || true; fi
  rmdir "$MNT" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"
rm -f "$IMG"
echo "[infinitemac] creating ${SIZE_MB} MB raw image: $IMG"
truncate -s "${SIZE_MB}M" "$IMG"
echo "[infinitemac] formatting HFS+ volume '$VOL'"
mkfs.hfsplus -v "$VOL" "$IMG"

echo "[infinitemac] mounting image"
mount -t hfsplus -o loop,rw "$IMG" "$MNT"

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

echo "[infinitemac] checking volume"
fsck.hfsplus -f "$IMG" || { echo '::error::fsck.hfsplus reported errors' >&2; exit 1; }

BYTES=$(stat -c %s "$IMG")
echo "[infinitemac] wrote $IMG (${BYTES} bytes)"
echo "[infinitemac] done"
