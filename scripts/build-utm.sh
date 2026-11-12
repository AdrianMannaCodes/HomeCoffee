#!/usr/bin/env bash
# Builds HomeCoffee.utm: an Alpine-based raw disk image (EFI + root) plus UTM config.
# Must run as root (sudo) on a Linux host. Env: ARCH (x86_64|aarch64, default x86_64), DISK_GB (default 4).
# Output: build/HomeCoffee.utm/{config.plist,Data/disk.img} (unzipped bundle folder).
# qemu-user emulation is only used when ARCH differs from the host (never for x86_64 on an x86_64 runner).
set -eEuxo pipefail

ARCH="${ARCH:-x86_64}"
DISK_GB="${DISK_GB:-4}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$REPO/build"
BUNDLE="$BUILD/HomeCoffee.utm"
IMG="$BUILD/disk.img"
MNT="$BUILD/mnt"
LOOP=""
HOST_ARCH="$(uname -m)"

log() { echo "[build-utm] $*"; }
step() { echo; echo "[build-utm] ===== STEP $1: $2 ====="; }
on_err() { echo "::error::build-utm.sh failed at line $1 (exit $?)" >&2; }
trap 'on_err $LINENO' ERR

step 0 "preflight (arch=$ARCH host=$HOST_ARCH disk=${DISK_GB}G)"
if [ "$(id -u)" -ne 0 ]; then
  echo '::error::must run as root: use sudo bash scripts/build-utm.sh' >&2
  exit 1
fi

case "$ARCH" in
  x86_64)  EFI_TARGET=x86_64-efi; QEMU_BIN=""; UTM_TARGET=q35 ;;
  aarch64) EFI_TARGET=arm64-efi; QEMU_BIN=qemu-aarch64-static; UTM_TARGET=virt ;;
  *) echo "unsupported ARCH: $ARCH" >&2; exit 1 ;;
esac

# Emulation is needed only for a foreign guest arch.
NEED_QEMU=0
if [ -n "$QEMU_BIN" ] && [ "$ARCH" != "$HOST_ARCH" ]; then NEED_QEMU=1; fi
log "emulation needed: $NEED_QEMU"

mkdir -p "$BUILD" "$MNT"

# Return 0 and print the path if $1 is a real, executable ELF file (symlinks followed).
is_usable_elf() {
  local real
  real="$(readlink -f "$1" 2>/dev/null || true)"
  if [ -z "$real" ] || [ ! -f "$real" ]; then
    log "  candidate $1: not a regular file (resolved to '${real:-nothing}')"
    return 1
  fi
  if [ ! -x "$real" ]; then
    log "  candidate $real: not executable"
    return 1
  fi
  if [ "$(head -c 4 "$real" | od -An -c | tr -d ' ')" != '177ELF' ]; then
    log "  candidate $real: not an ELF binary"
    return 1
  fi
  echo "$real"
}

# Resolve a usable static qemu-user binary (PATH, /usr/bin, then multiarch standalone download).
# Only called for a foreign guest arch.
resolve_qemu() {
  local name="$1" cand found dest code
  log "resolving $name"
  for cand in "$(command -v "$name" 2>/dev/null || true)" "/usr/bin/$name"; do
    [ -n "$cand" ] || continue
    if found="$(is_usable_elf "$cand")"; then
      log "found usable emulator: $found"
      echo "$found"
      return 0
    fi
  done
  log "no usable $name installed; trying multiarch standalone download"
  dest="$BUILD/bin/$name"
  mkdir -p "$BUILD/bin"
  code="$(curl -sSL --retry 3 -w '%{http_code}' -o "$dest" \
    "https://github.com/multiarch/qemu-user-static/releases/download/v7.2.0-1/$name" || true)"
  log "download HTTP status: ${code:-none}, size: $(stat -c %s "$dest" 2>/dev/null || echo 0) bytes"
  if [ "${code:-}" != "200" ]; then
    echo "::error::could not download $name (HTTP ${code:-none})" >&2
    return 1
  fi
  chmod +x "$dest"
  if found="$(is_usable_elf "$dest")"; then
    echo "$found"
    return 0
  fi
  echo "::error::downloaded $name is not a usable ELF binary" >&2
  return 1
}

step 1 "loop device nodes"
for i in 0 1 2 3 4 5 6 7; do
  [ -e "/dev/loop$i" ] || mknod "/dev/loop$i" b 7 "$i" || true
done

step 2 "fetch Alpine minirootfs for $ARCH"
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

step 3 "create raw disk and partitions (EFI 256M + ROOT rest)"
rm -f "$IMG"
truncate -s "${DISK_GB}G" "$IMG"
sgdisk -Z -n1:0:+256M -t1:EF00 -c1:EFI -n2:0:0 -t2:8300 -c2:ROOT "$IMG"
LOOP="$(losetup --find --show -P "$IMG")"
log "loop device: $LOOP"
cleanup() { set +e; umount -R "$MNT" 2>/dev/null; [ -n "$LOOP" ] && losetup -d "$LOOP" 2>/dev/null; }
trap cleanup EXIT
udevadm settle 2>/dev/null || true
sleep 1

step 4 "locate partition nodes (kernel first, kpartx fallback)"
PART1="${LOOP}p1"; PART2="${LOOP}p2"
if [ ! -e "$PART1" ] || [ ! -e "$PART2" ]; then
  log "partition nodes missing for $LOOP; trying partprobe then kpartx"
  partprobe "$LOOP" 2>/dev/null || true
  sleep 2
  if [ ! -e "$PART1" ] || [ ! -e "$PART2" ]; then
    kpartx -av "$LOOP"
    sleep 2
    LOOPNAME="$(basename "$LOOP")"
    PART1="/dev/mapper/${LOOPNAME}p1"; PART2="/dev/mapper/${LOOPNAME}p2"
  fi
fi
log "partitions: $PART1 $PART2"
[ -e "$PART1" ] && [ -e "$PART2" ] || { echo "::error::partition nodes not found (checked $PART1, $PART2)" >&2; exit 1; }

step 5 "format and mount"
mkfs.vfat -F32 -n EFI "$PART1"
mkfs.ext4 -q -L ROOT "$PART2"
mount "$PART2" "$MNT"
mkdir -p "$MNT/boot/efi"
mount "$PART1" "$MNT/boot/efi"

step 6 "unpack minirootfs"
tar -xzf "$BUILD/$MINI" -C "$MNT"
cp /etc/resolv.conf "$MNT/etc/resolv.conf"

step 7 "emulator setup"
if [ "$NEED_QEMU" -eq 1 ]; then
  QEMU_PATH="$(resolve_qemu "$QEMU_BIN")"
  log "using emulator: $QEMU_PATH"
  mkdir -p "$MNT/usr/bin"
  cp -L "$QEMU_PATH" "$MNT/usr/bin/$QEMU_BIN"
  chmod +x "$MNT/usr/bin/$QEMU_BIN"
else
  log "skipped: native $ARCH build on $HOST_ARCH host, no qemu needed"
fi

step 8 "bind pseudo-filesystems into chroot"
mkdir -p "$MNT/proc" "$MNT/sys" "$MNT/dev"
mount -t proc proc "$MNT/proc" || { echo '::error::mount proc failed' >&2; exit 1; }
mount -t sysfs sys "$MNT/sys" || { echo '::error::mount sysfs failed' >&2; exit 1; }
mount -t devtmpfs devtmpfs "$MNT/dev" || mount --bind /dev "$MNT/dev" || { echo '::error::mount dev failed' >&2; exit 1; }
mkdir -p "$MNT/dev/pts"
mount -t devpts devpts "$MNT/dev/pts" 2>/dev/null || true

step 9 "install Alpine packages in chroot"
chroot "$MNT" /bin/sh -c 'apk update && apk add --no-cache \
  alpine-base linux-lts linux-firmware-none mkinitfs grub grub-efi efibootmgr \
  openrc xorg-server xinit xf86-video-fbdev openbox font-dejavu nodejs'
echo homecoffee > "$MNT/etc/hostname"

step 10 "copy HomeCoffee project into image"
mkdir -p "$MNT/opt/homecoffee"
cp -r "$REPO/daemon" "$REPO/ui" "$REPO/lang" "$REPO/docs" "$MNT/opt/homecoffee/"

step 11 "console config: inittab (tty1 autologin + ttyS0), GRUB console args"
cat > "$MNT/etc/inittab" <<'INITTAB'
# /etc/inittab for HomeCoffee (written by scripts/build-utm.sh)
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default
tty1::respawn:/sbin/getty -n -l /bin/sh 38400 tty1
tty2::respawn:/sbin/getty 38400 tty2
tty3::respawn:/sbin/getty 38400 tty3
tty4::respawn:/sbin/getty 38400 tty4
ttyS0::respawn:/sbin/getty -L 115200 ttyS0 vt100
::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
INITTAB

cat > "$MNT/etc/default/grub" <<'GRUBDEF'
GRUB_DEFAULT=0
GRUB_TIMEOUT=2
GRUB_DISTRIBUTOR="HomeCoffee"
GRUB_CMDLINE_LINUX_DEFAULT="console=tty0 console=ttyS0,115200 quiet"
GRUB_CMDLINE_LINUX=""
GRUB_TERMINAL="console serial"
GRUB_SERIAL_COMMAND="serial --unit=0 --speed=115200"
GRUB_DISABLE_OS_PROBER=true
GRUBDEF

# mkinitfs must include virtio block + ext4 so the root partition is found under UTM's virtio disk.
mkdir -p "$MNT/etc/mkinitfs"
echo 'features="ata base ext4 scsi virtio vfat"' > "$MNT/etc/mkinitfs/mkinitfs.conf"

step 12 "fstab, initramfs, GRUB EFI ($EFI_TARGET)"
cat > "$MNT/etc/fstab" <<'FSTAB'
LABEL=ROOT  /          ext4  defaults,noatime  0 1
LABEL=EFI   /boot/efi  vfat  defaults          0 2
FSTAB
KVER="$(ls "$MNT/lib/modules" | head -1)"
[ -n "$KVER" ] || { echo '::error::no kernel modules found in image' >&2; exit 1; }
log "kernel version: $KVER"
chroot "$MNT" /bin/sh -c "mkinitfs -o /boot/initramfs-lts $KVER"
chroot "$MNT" /bin/sh -c "grub-install --target=$EFI_TARGET --efi-directory=/boot/efi --removable --no-nvram"
chroot "$MNT" /bin/sh -c 'grub-mkconfig -o /boot/grub/grub.cfg'
log "grub.cfg linux line:"
grep -n 'linux ' "$MNT/boot/grub/grub.cfg" || log 'warning: no linux line in grub.cfg'

step 13 "services: devfs/udev-free dev nodes, bootmisc, syslog, networking, hwclock"
chroot "$MNT" /bin/sh -c 'rc-update add devfs sysinit; rc-update add dmesg sysinit; rc-update add bootmisc boot; rc-update add syslog boot; rc-update add networking boot; rc-update add hwclock boot' || log 'warning: rc-update returned non-zero'

step 14 "unmount and detach"
for d in dev/pts dev sys proc; do umount "$MNT/$d" 2>/dev/null || true; done
umount "$MNT/boot/efi"
umount "$MNT"
if [ "$PART1" != "${LOOP}p1" ]; then kpartx -d "$LOOP" || true; fi
losetup -d "$LOOP"
LOOP=""
trap - EXIT

step 15 "assemble unzipped UTM bundle at $BUNDLE (target $UTM_TARGET)"
mkdir -p "$BUNDLE/Data"
mv "$IMG" "$BUNDLE/Data/disk.img"
cat > "$BUNDLE/config.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>ConfigurationVersion</key><integer>4</integer>
  <key>Backend</key><string>QEMU</string>
  <key>Information</key><dict>
    <key>Name</key><string>HomeCoffee</string>
    <key>UUID</key><string>6F1C2A9E-3B7D-4E21-9C55-52ED5A0A1234</string>
    <key>IconCustom</key><false/>
  </dict>
  <key>System</key><dict>
    <key>Architecture</key><string>$ARCH</string>
    <key>Target</key><string>$UTM_TARGET</string>
    <key>CPU</key><string>default</string>
    <key>CPUCount</key><integer>2</integer>
    <key>MemorySize</key><integer>512</integer>
    <key>JITSizeMB</key><integer>0</integer>
    <key>UEFIBoot</key><true/>
    <key>HardwareAcceleration</key><false/>
  </dict>
  <key>QEMU</key><dict>
    <key>TPM</key><false/>
    <key>UsbBusSupport</key><false/>
    <key>RNGDevice</key><true/>
  </dict>
  <key>Drives</key><array>
    <dict>
      <key>ImageType</key><string>disk</string>
      <key>Interface</key><string>virtio</string>
      <key>ImagePath</key><string>disk.img</string>
      <key>ReadOnly</key><false/>
    </dict>
  </array>
  <key>Networks</key><array>
    <dict>
      <key>Mode</key><string>shared</string>
      <key>Hardware</key><string>virtio-net-pci</string>
    </dict>
  </array>
  <key>Displays</key><array>
    <dict>
      <key>Hardware</key><string>virtio-ramfb</string>
      <key>DynamicResolution</key><true/>
      <key>Hidpi</key><false/>
    </dict>
  </array>
  <key>Sound</key><array>
    <dict><key>Hardware</key><string>intel-hda</string></dict>
  </array>
</dict>
</plist>
PLIST

step 16 "done"
log "bundle ready (unzipped): $BUNDLE"
ls -lh "$BUNDLE" "$BUNDLE/Data"
