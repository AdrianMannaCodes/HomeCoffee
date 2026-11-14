#!/usr/bin/env bash
# Builds HomeCoffee.utm: an Alpine-based raw disk image (EFI + root) with the full GUI desktop, plus UTM config.
# Must run as root (sudo) on a Linux host. Env: ARCH (x86_64|aarch64, default x86_64), DISK_GB (default 2).
# Output: build/HomeCoffee.utm/{config.plist,Data/disk.img} (unzipped bundle folder).
# config.plist follows UTM's Configuration/*.swift decoders (ConfigurationVersion 4, singular Display/Drive/Network keys).
# qemu-user emulation is only used when ARCH differs from the host (never for x86_64 on an x86_64 runner).
set -eEuxo pipefail

ARCH="${ARCH:-x86_64}"
DISK_GB="${DISK_GB:-2}"
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
  x86_64)  EFI_TARGET=x86_64-efi; QEMU_BIN=""; UTM_TARGET=q35; UTM_DISPLAY=VGA; UTM_NET=e1000; UTM_SOUND=intel-hda; ROOT_DEV=/dev/vda2 ;;
  aarch64) EFI_TARGET=arm64-efi; QEMU_BIN=qemu-aarch64-static; UTM_TARGET=virt; UTM_DISPLAY=virtio-ramfb; UTM_NET=virtio-net-pci; UTM_SOUND=intel-hda; ROOT_DEV=/dev/vda2 ;;
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
ROOT_LABEL="$(e2label "$PART2")"
log "partition 2 ext4 label: '$ROOT_LABEL'"
[ "$ROOT_LABEL" = "ROOT" ] || { echo "::error::partition 2 label is '$ROOT_LABEL', expected ROOT" >&2; exit 1; }
tune2fs -l "$PART2" | grep -E 'Filesystem (magic|volume name|features)' || true
mount "$PART2" "$MNT"
mkdir -p "$MNT/boot/efi"
mount "$PART1" "$MNT/boot/efi"

step 6 "unpack minirootfs"
tar -xzf "$BUILD/$MINI" -C "$MNT"
# Build-time resolver: the host copy so apk can reach the mirrors from inside the chroot.
# The image gets its own static resolv.conf in step 14.
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

# Enable the Alpine community repository explicitly. Browsers and some GUI tools live there, and the minirootfs
# does not always ship it uncommented.
ALPINE_BRANCH="$(awk -F/ '/alpine\/(v[0-9.]+|latest-stable)/{for(i=1;i<=NF;i++) if($i ~ /^(v[0-9.]+|latest-stable)$/){print $i; exit}}' "$MNT/etc/apk/repositories" 2>/dev/null || true)"
[ -n "$ALPINE_BRANCH" ] || ALPINE_BRANCH=latest-stable
printf '%s\n%s\n' "https://dl-cdn.alpinelinux.org/alpine/$ALPINE_BRANCH/main" "https://dl-cdn.alpinelinux.org/alpine/$ALPINE_BRANCH/community" > "$MNT/etc/apk/repositories"
log "apk repositories: $ALPINE_BRANCH main + community"

step 9 "install Alpine GUI desktop packages in chroot (Xorg, input/video drivers, eudev, openbox, busybox httpd, nodejs, ALSA); no apk cache kept"
# busybox-extras provides httpd (CGI support for the Finder and Konsol endpoints).
chroot "$MNT" /bin/sh -c 'apk update && apk add --no-cache \
  alpine-base linux-lts linux-firmware-none mkinitfs grub grub-efi efibootmgr \
  openrc eudev xorg-server xinit xf86-video-fbdev xf86-video-vesa \
  xf86-input-libinput xf86-input-evdev xsetroot \
  openbox font-dejavu nodejs \
  busybox-extras \
  alsa-utils alsa-lib'

# Kiosk browser: Midori first, then Surf. Each apk add is run with its output visible in the build log,
# and a candidate only counts when its binary is actually present in the image.
BROWSER_PKG=""
for pkg in midori surf; do
  log "apk add $pkg (candidate browser)"
  if chroot "$MNT" /bin/sh -c "apk add --no-cache $pkg"; then
    if chroot "$MNT" /bin/sh -c "command -v $pkg" >/dev/null 2>&1; then
      BROWSER_PKG="$pkg"
      log "browser installed and verified: $pkg"
      break
    fi
    log "apk reported success for $pkg but the binary is missing"
  else
    log "apk add $pkg failed"
  fi
done
if [ -z "$BROWSER_PKG" ]; then
  echo '::error::neither midori nor surf could be installed from Alpine' >&2
  exit 1
fi
echo "$BROWSER_PKG" > "$MNT/root/.hc-browser"
echo homecoffee > "$MNT/etc/hostname"

step 10 "copy HomeCoffee project into image"
mkdir -p "$MNT/opt/homecoffee"
cp -r "$REPO/daemon" "$REPO/ui" "$REPO/lang" "$REPO/docs" "$REPO/cgi-bin" "$MNT/opt/homecoffee/"
chmod 0755 "$MNT"/opt/homecoffee/cgi-bin/*.cgi

step 11 "console config: inittab (tty1 autologin root + ttyS0), root .profile starts X on tty1, .xinitrc"
cat > "$MNT/etc/inittab" <<'INITTAB'
# /etc/inittab for HomeCoffee (written by scripts/build-utm.sh)
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default
# tty1: autologin root. login is respawned, so if X exits the root shell comes back and tty1 never locks.
tty1::respawn:/bin/login -f root
tty2::respawn:/sbin/getty 38400 tty2
tty3::respawn:/sbin/getty 38400 tty3
tty4::respawn:/sbin/getty 38400 tty4
ttyS0::respawn:/sbin/getty -L 115200 ttyS0 vt100
::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
INITTAB

# Places used by the Aqua Finder sidebar.
mkdir -p "$MNT/root/Documents" "$MNT/root/Applications"

# Root profile: on tty1 with no DISPLAY, start the desktop once per boot. Plain shell on any other tty.
cat > "$MNT/root/.profile" <<'PROFILE'
# HomeCoffee: auto-start the X desktop on tty1 only.
if [ "$(tty)" = "/dev/tty1" ] && [ -z "$DISPLAY" ] && [ -x /usr/bin/xinit ] && [ ! -f /tmp/.hc-x-started ]; then
  touch /tmp/.hc-x-started
  /usr/bin/xinit /root/.xinitrc -- :0 vt1 >/var/log/hc-xinit.log 2>&1
  echo "X session ended (see /var/log/hc-xinit.log). You are in a shell; type xinit to restart the desktop."
fi
PROFILE

# ~/.xinitrc: serve /opt/homecoffee on 8080, then run the Aqua desktop fullscreen in a browser kiosk on top of openbox.
cat > "$MNT/root/.xinitrc" <<'XINITRC'
#!/bin/sh
# ~/.xinitrc for HomeCoffee: openbox window manager, busybox httpd on 8080, browser kiosk on the Aqua desktop.
xsetroot -solid "#3a6ea5" 2>/dev/null || true

# Window manager runs in the background so kiosk windows get decorations and focus handling.
openbox >/var/log/hc-openbox.log 2>&1 &

# ALSA: unmute master and PCM outputs at 80% so audio plays on boot.
amixer sset Master unmute 80% >/dev/null 2>&1 || true
amixer sset PCM unmute 80% >/dev/null 2>&1 || true

# Static site plus CGI (Finder and Konsol) on port 8080. -h sets the document root.
httpd -p 8080 -h /opt/homecoffee >/var/log/hc-httpd.log 2>&1 &

# HomeCoffee daemon, if present.
if command -v node >/dev/null 2>&1 && [ -f /opt/homecoffee/daemon/home-collab.js ]; then
  node /opt/homecoffee/daemon/home-collab.js >/var/log/hc-daemon.log 2>&1 &
fi

# Collab bridge: localhost relay (127.0.0.1:7421) used by the Aqua Messenger window, if present.
if command -v node >/dev/null 2>&1 && [ -f /opt/homecoffee/daemon/collab-bridge.js ]; then
  node /opt/homecoffee/daemon/collab-bridge.js >/var/log/hc-bridge.log 2>&1 &
fi

# Wait until httpd answers before opening the browser.
i=0
while [ $i -lt 30 ]; do
  wget -q -O /dev/null http://localhost:8080/ui/aqua/index.html 2>/dev/null && break
  i=$((i+1)); sleep 1
done

URL="http://localhost:8080/ui/aqua/index.html?display=ipad8"
# The build records the installed kiosk browser in /root/.hc-browser: midori or surf only.
BROWSER_PKG="$(cat /root/.hc-browser 2>/dev/null || true)"
case "$BROWSER_PKG" in
  midori) BROWSER_CMD="midori -e Fullscreen -a $URL" ;;
  surf) BROWSER_CMD="surf -F $URL" ;;
  *)
    echo "no kiosk browser recorded in /root/.hc-browser (got '$BROWSER_PKG')" >>/var/log/hc-browser.log
    exit 1 ;;
esac

# Kiosk loop: if the browser exits, relaunch it so the desktop never goes dark.
while true; do
  $BROWSER_CMD >/var/log/hc-browser.log 2>&1
  sleep 2
done
XINITRC
chmod 0755 "$MNT/root/.xinitrc"

# Boot fix: root is pinned to the virtio disk partition (UTM exposes it as vda, partition 2) with an explicit ext4 type.
# panic=0 is intentionally NOT set: Alpine init exits ("Attempted to kill init") instead of opening a recovery shell when panic= is set.
# Verbose (no 'quiet') so boot errors are visible. GRUB menu stays visible for 3 seconds.
cat > "$MNT/etc/default/grub" <<GRUBDEF
GRUB_DEFAULT=0
GRUB_TIMEOUT=3
GRUB_TIMEOUT_STYLE=menu
GRUB_DISTRIBUTOR="HomeCoffee"
GRUB_CMDLINE_LINUX_DEFAULT="root=$ROOT_DEV rootfstype=ext4 rw console=tty0 console=ttyS0,115200"
GRUB_CMDLINE_LINUX=""
GRUB_TERMINAL="console serial"
GRUB_SERIAL_COMMAND="serial --unit=0 --speed=115200"
GRUB_DISABLE_OS_PROBER=true
GRUBDEF

# mkinitfs must include virtio block + ext4 so the root partition is found under UTM's virtio disk.
mkdir -p "$MNT/etc/mkinitfs"
echo 'features="ata base ext4 scsi virtio vfat"' > "$MNT/etc/mkinitfs/mkinitfs.conf"

step 12 "trim: apk cache, docs, man pages, non-English locales, unused driver families"
chroot "$MNT" /bin/sh -c 'rm -rf /var/cache/apk/* /usr/share/man /usr/share/doc /usr/share/info /usr/share/gtk-doc' || true
find "$MNT/usr/share/locale" -mindepth 1 -maxdepth 1 ! -name 'en*' -exec rm -rf {} + 2>/dev/null || true
# Unused driver families for a VM with virtio/VGA/e1000/intel-hda. Block, virtio, ext4, DRM/fb, sound kept.
for fam in drivers/net/wireless drivers/bluetooth drivers/media drivers/staging drivers/isdn drivers/nfc drivers/infiniband net/wireless net/bluetooth; do
  for d in "$MNT"/lib/modules/*/kernel/$fam; do [ -d "$d" ] && rm -rf "$d"; done
done
for d in "$MNT"/lib/modules/*; do
  [ -d "$d" ] && chroot "$MNT" /bin/sh -c "depmod -a $(basename "$d")" || true
done
du -sh "$MNT" 2>/dev/null || true

step 13 "fstab, initramfs, GRUB EFI ($EFI_TARGET)"
cat > "$MNT/etc/fstab" <<'FSTAB'
LABEL=ROOT  /          ext4  defaults,noatime  0 1
LABEL=EFI   /boot/efi  vfat  defaults          0 2
FSTAB
KVER="$(ls "$MNT/lib/modules" | head -1)"
[ -n "$KVER" ] || { echo '::error::no kernel modules found in image' >&2; exit 1; }
log "kernel version: $KVER"
chroot "$MNT" /bin/sh -c "mkinitfs -o /boot/initramfs-lts $KVER"
ls -l "$MNT/boot/initramfs-lts" || { echo '::error::initramfs not created' >&2; exit 1; }
INITRD_LIST="$(zcat "$MNT/boot/initramfs-lts" | cpio -t 2>/dev/null || true)"
for m in virtio_blk ext4; do
  echo "$INITRD_LIST" | grep -q "$m" || { echo "::error::initramfs is missing $m module" >&2; exit 1; }
done
log "initramfs contains virtio_blk and ext4"
chroot "$MNT" /bin/sh -c "grub-install --target=$EFI_TARGET --efi-directory=/boot/efi --removable --no-nvram"
ls -l "$MNT/boot/efi/EFI/BOOT/" || { echo '::error::ESP has no EFI/BOOT directory after grub-install' >&2; exit 1; }
chroot "$MNT" /bin/sh -c 'grub-mkconfig -o /boot/grub/grub.cfg'
log "grub.cfg linux line:"
grep -n 'linux ' "$MNT/boot/grub/grub.cfg" || log 'warning: no linux line in grub.cfg'
grep -q "root=$ROOT_DEV" "$MNT/boot/grub/grub.cfg" || { echo "::error::grub.cfg does not pass root=$ROOT_DEV" >&2; exit 1; }

step 14 "networking (DHCP on eth0), image resolver fallback, services"
# Network: loopback plus DHCP on the first NIC. udhcpc (busybox) runs under the networking service at boot.
cat > "$MNT/etc/network/interfaces" <<'NETIF'
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet dhcp
NETIF
# Static fallback resolvers for the image: QEMU user-mode DNS first, then a public resolver.
# The DHCP client rewrites this file on boot when the lease carries DNS servers.
printf 'nameserver 10.0.2.3\nnameserver 1.1.1.1\n' > "$MNT/etc/resolv.conf"
chroot "$MNT" /bin/sh -c 'rc-update add devfs sysinit; rc-update add dmesg sysinit; rc-update add udev sysinit; rc-update add udev-trigger sysinit; rc-update add bootmisc boot; rc-update add syslog boot; rc-update add networking boot; rc-update add hwclock boot' || log 'warning: rc-update returned non-zero'

step 15 "clear apk cache, zero free space, unmount and detach"
rm -rf "$MNT/var/cache/apk"/* 2>/dev/null || true
# Fill free space with zeros so the raw image compresses well; ignore 'no space left' on the fill file.
dd if=/dev/zero of="$MNT/zero.fill" bs=1M 2>/dev/null || true
sync
rm -f "$MNT/zero.fill"
sync
for d in dev/pts dev sys proc; do umount "$MNT/$d" 2>/dev/null || true; done
umount "$MNT/boot/efi"
umount "$MNT"
if [ "$PART1" != "${LOOP}p1" ]; then kpartx -d "$LOOP" || true; fi
losetup -d "$LOOP"
LOOP=""
trap - EXIT

step 16 "assemble UTM bundle at $BUNDLE (target $UTM_TARGET, display $UTM_DISPLAY)"
mkdir -p "$BUNDLE/Data"
mv "$IMG" "$BUNDLE/Data/disk.img"
# Keys and structure follow UTM's decoders. PS2Controller is on so the keyboard works without manual tweaks.
cat > "$BUNDLE/config.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>ConfigurationVersion</key><integer>4</integer>
  <key>Backend</key><string>QEMU</string>
  <key>Information</key>
  <dict>
    <key>Name</key><string>HomeCoffee</string>
    <key>UUID</key><string>6F1C2A9E-3B7D-4E21-9C55-52ED5A0A1234</string>
    <key>IconCustom</key><false/>
  </dict>
  <key>System</key>
  <dict>
    <key>Architecture</key><string>$ARCH</string>
    <key>Target</key><string>$UTM_TARGET</string>
    <key>CPU</key><string>default</string>
    <key>CPUFlagsAdd</key><array/>
    <key>CPUFlagsRemove</key><array/>
    <key>CPUCount</key><integer>2</integer>
    <key>ForceMulticore</key><false/>
    <key>MemorySize</key><integer>512</integer>
    <key>JITCacheSize</key><integer>0</integer>
  </dict>
  <key>QEMU</key>
  <dict>
    <key>DebugLog</key><false/>
    <key>UEFIBoot</key><true/>
    <key>RNGDevice</key><true/>
    <key>BalloonDevice</key><false/>
    <key>TPMDevice</key><false/>
    <key>Hypervisor</key><false/>
    <key>TSO</key><false/>
    <key>RTCLocalTime</key><false/>
    <key>PS2Controller</key><true/>
    <key>InterruptRemapping</key><true/>
    <key>MemoryLock</key><true/>
    <key>AdditionalArguments</key><array/>
  </dict>
  <key>Input</key>
  <dict>
    <key>UsbBusSupport</key><string>3.0</string>
    <key>UsbSharing</key><false/>
    <key>MaximumUsbShare</key><integer>3</integer>
  </dict>
  <key>Sharing</key>
  <dict>
    <key>DirectoryShareMode</key><string>None</string>
    <key>DirectoryShareReadOnly</key><false/>
    <key>ClipboardSharing</key><false/>
  </dict>
  <key>Drive</key>
  <array>
    <dict>
      <key>ImageName</key><string>disk.img</string>
      <key>ImageType</key><string>Disk</string>
      <key>Interface</key><string>VirtIO</string>
      <key>InterfaceVersion</key><integer>1</integer>
      <key>Identifier</key><string>6F1C2A9E-0000-4E21-9C55-000000000001</string>
      <key>ReadOnly</key><false/>
    </dict>
  </array>
  <key>Display</key>
  <array>
    <dict>
      <key>Hardware</key><string>$UTM_DISPLAY</string>
      <key>DynamicResolution</key><true/>
      <key>UpscalingFilter</key><string>Linear</string>
      <key>DownscalingFilter</key><string>Linear</string>
      <key>NativeResolution</key><false/>
    </dict>
  </array>
  <key>Network</key>
  <array>
    <dict>
      <key>Mode</key><string>Emulated</string>
      <key>Hardware</key><string>$UTM_NET</string>
      <key>MacAddress</key><string>52:54:00:12:34:56</string>
      <key>IsolateFromHost</key><false/>
      <key>PortForward</key><array/>
    </dict>
  </array>
  <key>Serial</key>
  <array>
    <dict>
      <key>Mode</key><string>Terminal</string>
      <key>Target</key><string>Auto</string>
    </dict>
  </array>
  <key>Sound</key>
  <array>
    <dict>
      <key>Hardware</key><string>$UTM_SOUND</string>
    </dict>
  </array>
</dict>
</plist>
PLIST
plutil -lint "$BUNDLE/config.plist" 2>/dev/null || python3 -c "import plistlib,sys; plistlib.load(open(sys.argv[1],'rb')); print('config.plist parses')" "$BUNDLE/config.plist"

step 17 "done"
log "bundle ready (unzipped): $BUNDLE"
ls -lh "$BUNDLE" "$BUNDLE/Data"
