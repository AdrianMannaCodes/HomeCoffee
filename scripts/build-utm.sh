#!/usr/bin/env bash
# Builds HomeCoffee.utm: an Alpine-based raw disk image (EFI + root) plus UTM config.
# Runs as root on a Linux host (GitHub Actions ubuntu-latest). Env: ARCH (aarch64|x86_64), DISK_GB (default 4).
# Output: build/HomeCoffee.utm/{config.plist,Data/disk.img}
set -euo pipefail

ARCH="${ARCH:-aarch64}"
DISK_GB="${DISK_GB:-4}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$REPO/build"
BUNDLE="$BUILD/HomeCoffee.utm"
IMG="$BUILD/disk.img"
MNT="$BUILD/mnt"

case "$ARCH" in
  aarch64) EFI_TARGET=arm64-efi; QEMU_BIN=qemu-aarch64-static ;;
  x86_64)  EFI_TARGET=x86_64-efi; QEMU_BIN="" ;;   # native on x86_64 runners, no emulation needed
  *) echo "unsupported ARCH: $ARCH" >&2; exit 1 ;;
esac

log() { echo "[build-utm] $*"; }
mkdir -p "$BUILD" "$MNT"

# 1. Resolve the Alpine minirootfs for this arch from the official index.
ALPINE_BASE="https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/$ARCH"
YAML="$BUILD/latest-releases.yaml"
log "fetching $ALPINE_BASE/latest-releases.yaml"
curl -fsSL --retry 3 -o "$YAML" "$ALPINE_BASE/latest-releases.yaml"
# The file lists entries as "- file: alpine-minirootfs-X.Y.Z-ARCH.tar.gz" under an alpine-minirootfs title.
MINI="$(awk '/^- title: Mini root filesystem/{f=1} f && /file:/{print $NF; exit}' "$YAML")"
if [ -z "$MINI" ]; then
  MINI="$(grep -o 'alpine-minirootfs-[0-9.]*-'"$ARCH"'\.tar\.gz' "$YAML" | head -1 || true)"
fi
[ -n "$MINI" ] || { echo '::error::could not find minirootfs filename in latest-releases.yaml' >&2; exit 1; }
log "minirootfs: $MINI"
curl -fsSL --retry 3 -o "$BUILD/$MINI" "$ALPINE_BASE/$MINI"

# 2. Create the raw disk: GPT with EFI (FAT32, 256 MB) and root (ext4, rest).
rm -f "$IMG"
truncate -s "${DISK_GB}G" "$IMG"
sgdisk -Z -n1:0:+256M -t1:EF00 -c1:EFI -n2:0:0 -t2:8300 -c2:ROOT "$IMG" >/dev/null
LOOP="$(losetup --show -Pf "$IMG")"
trap 'set +e; umount -R "$MNT" 2>/dev/null; losetup -d "$LOOP" 2>/dev/null' EXIT
mkfs.vfat -F32 -n EFI "${LOOP}p1" >/dev/null
mkfs.ext4 -q -L ROOT "${LOOP}p2"
mount "${LOOP}p2" "$MNT"
mkdir -p "$MNT/boot/efi"
mount "${LOOP}p1" "$MNT/boot/efi"

# 3. Unpack minirootfs and prepare chroot. Copy the qemu-user binary in for a foreign arch.
tar -xzf "$BUILD/$MINI" -C "$MNT"
cp /etc/resolv.conf "$MNT/etc/resolv.conf"
if [ -n "$QEMU_BIN" ] && [ "$ARCH" != "$(uname -m)" ]; then
  QEMU_PATH="$(command -v "$QEMU_BIN" || true)"
  [ -n "$QEMU_PATH" ] || { echo "::error::$QEMU_BIN not found; install qemu-user-static" >&2; exit 1; }
  cp "$QEMU_PATH" "$MNT/usr/bin/"
fi
for d in proc sys dev; do mount --rbind "/$d" "$MNT/$d"; done

# 4. Install packages inside the chroot.
log "installing packages in chroot"
chroot "$MNT" /bin/sh -c 'apk update && apk add --no-cache \
  alpine-base linux-lts linux-firmware-none mkinitfs grub grub-efi efibootmgr \
  openrc xorg-server xinit xf86-video-fbdev openbox font-dejavu nodejs'
echo homecoffee > "$MNT/etc/hostname"

# 5. Copy the HomeCoffee project into the image.
mkdir -p "$MNT/opt/homecoffee"
cp -r "$REPO/daemon" "$REPO/ui" "$REPO/lang" "$REPO/docs" "$MNT/opt/homecoffee/"

# 6. fstab, initramfs, and GRUB EFI install.
cat > "$MNT/etc/fstab" <<'FSTAB'
LABEL=ROOT  /          ext4  defaults,noatime  0 1
LABEL=EFI   /boot/efi  vfat  defaults          0 2
FSTAB
KVER="$(ls "$MNT/lib/modules" | head -1)"
[ -n "$KVER" ] || { echo '::error::no kernel modules found in image' >&2; exit 1; }
chroot "$MNT" /bin/sh -c "mkinitfs -o /boot/initramfs-lts $KVER"
chroot "$MNT" /bin/sh -c "grub-install --target=$EFI_TARGET --efi-directory=/boot/efi --removable --no-nvram"
chroot "$MNT" /bin/sh -c 'grub-mkconfig -o /boot/grub/grub.cfg'

# 7. Enable base services.
chroot "$MNT" /bin/sh -c 'rc-update add devfs sysinit; rc-update add networking boot; rc-update add hwclock boot' || log "warning: rc-update returned non-zero"

# 8. Clean up mounts (EXIT trap also covers failures).
for d in dev sys proc; do umount -R "$MNT/$d" 2>/dev/null || true; done
umount "$MNT/boot/efi"
umount "$MNT"
losetup -d "$LOOP"
trap - EXIT

# 9. Assemble the UTM bundle: config.plist plus Data/disk.img.
mkdir -p "$BUNDLE/Data"
mv "$IMG" "$BUNDLE/Data/disk.img"
node "$REPO/scripts/gen-config-plist.js" "$ARCH" > "$BUNDLE/config.plist"
log "bundle ready: $BUNDLE"
ls -lh "$BUNDLE" "$BUNDLE/Data"
