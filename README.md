# HomeCoffee 1.0 (Kofi / Домокофе)

A Red Star OS 3.0-inspired Aqua Linux desktop packaged as a UTM bundle. Inspired by Homebrew.

Status: early scaffold. No disk image or .utm.zip release has been built yet.

## Layout
- daemon/home-collab.js: Home collab daemon. Connection address is IP:PORT plus a 4-digit PIN, default port 7420/tcp.
- scripts/gen-config-plist.js: UTM config.plist generator (aarch64 or x86_64, 512 MB default, no hardware acceleration for iPad TCG use).
- scripts/yezik-validate.js: Yezik orthography and grammar checker, based on the Yezik rules.
- scripts/build-rootfs.sh, scripts/make-utm.sh: skeletons for the rootfs image and the .utm bundle.
- docs/: ARCHITECTURE, APPS (16 apps with proposed Yezik labels), YEZIK, STATUS.
- tests/: unit and socket tests for the daemon, plus Yezik validator tests.

## Targets
- iPad (4:3, e.g. 1024x768 logical, retina scaling) and Mac (16:9 and 16:10). Resolution and scaling settings are planned, not implemented yet.

## Yezik
Slogan: "Lagogo, Lanostalga". go = time, gogo = day. Kofi is the Yezik name for HomeCoffee.
