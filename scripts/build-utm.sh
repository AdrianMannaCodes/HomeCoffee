#!/usr/bin/env bash
# Builds HomeCoffee.utm: an Alpine-based raw disk image (EFI + root) plus UTM config.
# Must run as root (sudo) on a Linux host. Env: ARCH (aarch64|x86_64), DISK_GB (default 4).
# Output: build/HomeCoffee.utm/{config.plist,Data/disk.img}
set -eEuxo pipefail

ARCH="${ARCH:-aarch64}"
DISK_GB="${DISK_GB:-4}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$REPO/build"
BUNDLE="$BUILD/HomeCoffee.utm"
IMG="$BUILD/disk.img"
MNT="$BUILD/mnt"
LOOP=""

on_err() { echo "::error::build-utm.sh failed at line $1 (exit $?)" >&2; }
trap 'on_err $LINENO' ERR

if [ "$(id -u)" -ne 0 ]; then
  echo '::error::must run as root: use sudo bash scripts/build-utm.sh' >&2
  exit 1
fi

case "$ARCH" in
  aarch64) EFI_TARGET=arm64-efi; QEMU_BIN=qemu-aarch64-static ;;
  x86_64)  EFI_TARGET=x86_64-efi; QEMU_BIN="" ;;
  *) echo "unsupported ARCH: $ARCH" >&2; exit 1 ;;
esac

log() { echo "[build-utm] $*"; }
mkdir -p "$BUILD" "$MNT"

# Resolve a usable static qemu-user binary to a real, executable ELF file.
# Order: PATH, /usr/bin, then the multiarch standalone release.
# Symlinks are followed (readlink -f) so the copy is the actual binary, not a dangling link.
resolve_qemu() {
  local name="$1" p real dest
  for p in "$(command -v "$name" 2>/dev/null || true)" "/usr/bin/$name"; do
    [ -n "$p" ] || continue
    real="$(readlink -f "$p" 2>/dev/null || true)"
    if [ -n "$real" ] && [ -f "$real" ] && [ -x "$real" ] && [ "$(head -c 4 "$real" | od -An -c | tr -d ' ')" = '177ELF' ]; then
      echo "$real"; return 0
    fi
    log "ignoring $p (resolved: ${real:-none}; not a usable ELF file)"
  done
  log "$name not usable; downloading standalone static binary"
  dest="$BUILD/bin/$name"
  mkdir -p "$BUILD/bin"
  curl -fsSL --retry 3 -o "$dest" \
    "https://github.com/multiarch/qemu-user-static/releases/download/v7.2.0-1/$name"
  chmod +x "$dest"
  if [ "$(head -c 4 "$dest" | od -An -c | tr -d ' ')" != '177ELF' ]; then
    echo "::error::downloaded $name is not an ELF binary" >&2
    return 1
  fi
  echo "$dest"
}

# Make sure loop device nodes exist (some runners only have loop0..7 pre-created).
for i in 0 1 2 3 4 5 6 7; do
  [ -e "/dev/loop$i" ] || mknod "/dev/loop$i" b 7 "$i" || true
done

# 1. Resolve the Alpine minirootfs for this arch.
ALPINE_BASE="https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/$ARCH"
YAML="$BUILD/latest-releases.yaml"
log "fetching $ALPINE_BASE/latest-releases.yaml"
curl -fsSL --retry 3 -o "$YAML" "$ALPINE_BASE/latest-releases.yaml"
MINI="$(awk '/^- title: Mini root filesystem/{f=1} f && /file:/{print $NF; exit}' "$YAML")"
if [ -z "$MINI" ]; then
  MINI="$(grep -o "alpine-minirootfs-[0-9.]*-$ARCH\\.tar\\.gz" "$YAML" | head -1 || true)"
fi
[ -n "$MINI" ] || { echo '::error::could not find minirootfs filename in latest-releases.yaml' >&2; exit 1; }
log "minirootfs: $MINI"
curl -fsSL --retry 3 -o "$BUILD/$MINI" "$ALPINE_BASE/$MINI"

# 2. Raw disk: GPT with EFI (FAT32, 256 MB) and root (ext4, rest).
rm -f "$IMG"
truncate -s "${DISK_GB}G" "$IMG"
sgdisk -Z -n1:0:+256M -t1:EF00 -c1:EFI -n2:0:0 -t2:8300 -c2:ROOT "$IMG"
LOOP="$(losetup --find --show -P "$IMG")"
log "loop device: $LOOP"
cleanup() { set +e; umount -R "$MNT" 2>/dev/null; [ -n "$LOOP" ] && losetup -d "$LOOP" 2>/dev/null; }
trap cleanup EXIT
udevadm settle 2>/dev/null || true
sleep 1
# Partition nodes: prefer the kernel's (losetup -P). If absent, map them with kpartx.
if [ ! -e "${LOOP}p1" ] || [ ! -e "${LOOP}p2" ]; then
  log "partition nodes missing for $LOOP; trying partprobe then kpartx"
  partprobe "$LOOP" 2>/dev/null || true
  sleep 2
  if [ ! -e "${LOOP}p1" ] || [ ! -e "${LOOP}p2" ]; then
    kpartx -av "$LOOP"
    sleep 2
    LOOPNAME="$(basename "$LOOP")"
    if [ -e "/dev/mapper/${LOOPNAME}p1" ]; then
      PART1="/dev/mapper/${LOOPNAME}p1"; PART2="/dev/mapper/${LOOPNAME}p2"
    fi
  fi
fi
PART1="${PART1:-${LOOP}p1}"
PART2="${PART2:-${LOOP}p2}"
[ -e "$PART1" ] && [ -e "$PART2" ] || { echo "::error::partition nodes not found for $LOOP (checked $PART1, $PART2)" >&2; exit 1; }
mkfs.vfat -F32 -n EFI "$PART1"
mkfs.ext4 -q -L ROOT "$PART2"
mount "$PART2" "$MNT"
mkdir -p "$MNT/boot/efi"
mount "$PART1" "$MNT/boot/efi"

# 3. Unpack minirootfs and prepare chroot.
tar -xzf "$BUILD/$MINI" -C "$MNT"
cp /etc/resolv.conf "$MNT/etc/resolv.conf"
if [ -n "$QEMU_BIN" ] && [ "$ARCH" != "$(uname -m)" ]; then
  QEMU_PATH="$(resolve_qemu "$QEMU_BIN")"
  log "using emulator: $QEMU_PATH"
  mkdir -p "$MNT/usr/bin"
  cp -L "$QEMU_PATH" "$MNT/usr/bin/$QEMU_BIN"
  chmod +x "$MNT/usr/bin/$QEMU_BIN"
fi
# Bind the pseudo-filesystems into the chroot. Each mount reports its own error.
mkdir -p "$MNT/proc" "$MNT/sys" "$MNT/dev"
mount -t proc proc "$MNT/proc" || { echo '::error::mount proc failed' >&2; exit 1; }
mount -t sysfs sys "$MNT/sys" || { echo '::error::mount sysfs failed' >&2; exit 1; }
mount -t devtmpfs devtmpfs "$MNT/dev" || mount --bind /dev "$MNT/dev" || { echo '::error::mount dev failed' >&2; exit 1; }
mkdir -p "$MNT/dev/pts"
mount -t devpts devpts "$MNT/dev/pts" 2>/dev/null || true

# 4. Install packages in the chroot.
log "installing packages in chroot"
chroot "$MNT" /bin/sh -c 'apk update && apk add --no-cache \
  alpine-base linux-lts linux-firmware-none mkinitfs grub grub-efi efibootmgr \
  openrc xorg-server xinit xf86-video-fbdev openbox font-dejavu nodejs'
echo homecoffee > "$MNT/etc/hostname"

# 5. Copy the HomeCoffee project into the image.
mkdir -p "$MNT/opt/homecoffee"
cp -r "$REPO/daemon" "$REPO/ui" "$REPO/lang" "$REPO/docs" "$MNT/opt/homecoffee/"

# 6. fstab, initramfs, GRUB EFI.
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
chroot "$MNT" /bin/sh -c 'rc-update add devfs sysinit; rc-update add networking boot; rc-update add hwclock boot' || log 'warning: rc-update returned non-zero'

# 8. Unmount and detach (EXIT trap also covers failures).
for d in dev/pts dev sys proc; do umount "$MNT/$d" 2>/dev/null || true; done
umount "$MNT/boot/efi"
umount "$MNT"
if [ "$PART1" != "${LOOP}p1" ]; then kpartx -d "$LOOP" || true; fi
losetup -d "$LOOP"
LOOP=""
trap - EXIT

# 9. Assemble the UTM bundle. config.plist is written inline (the earlier generator script was never committed).
mkdir -p "$BUNDLE/Data"
mv "$IMG" "$BUNDLE/Data/disk.img"
cat > "$BUNDLE/config.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict><key>ConfigurationVersion</key><integer>4</integer><key>Backend</key><string>QEMU</string><key>Information</key><dict><key>Name</key><string>Red Star OS 3.0 (Aqua)</string><key>UUID</key><string>6F1C2A9E-3B7D-4E21-9C55-52ED5A0A1234</string><key>IconCustom</key><false/></dict><key>System</key><dict><key>Architecture</key><string>$ARCH</string><key>Target</key><string>virt</string><key>CPU</key><string>default</string><key>CPUCount</key><integer>2</integer><key>MemorySize</key><integer>512</integer><key>JITSizeMB</key><integer>0</integer><key>UEFIBoot</key><true/><key>HardwareAcceleration</key><false/></dict><key>QEMU</key><dict><key>TPM</key><false/><key>UsbBusSupport</key><false/><key>RNGDevice</key><true/></dict><key>Drives</key><array><dict><key>ImageType</key><string>disk</string><key>Interface</key><string>virtio</string><key>ImagePath</key><string>disk.img</string><key>ReadOnly</key><false/></dict></array><key>Networks</key><array><dict><key>Mode</key><string>shared</string><key>Hardware</key><string>virtio-net-pci</string></dict></array><key>Displays</key><array><dict><key>Hardware</key><string>virtio-gpu-pci</string><key>DynamicResolution</key><true/><key>Hidpi</key><false/></dict></array><key>Sound</key><array><dict><key>Hardware</key><string>intel-hda</string></dict></array></dict>
</plist>
PLIST
log "bundle ready: $BUNDLE"
ls -lh "$BUNDLE" "$BUNDLE/Data"
