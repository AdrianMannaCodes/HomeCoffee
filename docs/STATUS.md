# STATUS (Nov 12, 2026)

Done (files exist, not yet run end to end):
- daemon/home-collab.js: room daemon, default port 7420, PIN lockout, IP:PORT PIN format.
- scripts/yezik-validate.js: Yezik checker. Its tests pass under the sandbox JS runtime.
- scripts/gen-config-plist.js: UTM config generator. Output not yet checked against a UTM release.
- docs/APPS.json: 16 apps with proposed Yezik labels. Terminal is Konsol, because Terminal contains r.

Not done:
- Home app UI and built-in chat client.
- Aqua theme, Mac OS X 10.4 cursor, Red Star 3.0 wallpaper (no file supplied; licensing unconfirmed).
- Resolution and aspect-ratio scaling (4:3 iPad, 16:9 / 16:10 Mac).
- Rootfs packages and services. build-rootfs.sh is a skeleton.
- The other apps.
- Built .utm.zip release. Not built.

Open questions:
- Slaydęs (slides app) is in the Yezik spec but not the 16-app list.
- Tiger 10.4 vs Snow Leopard 10.6 look.
- Yezik labels are proposals; the vocabulary charts were not provided.
