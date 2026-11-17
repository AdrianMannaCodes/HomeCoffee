# HomeCoffee on Infinite Mac

The nightly build publishes HomeCoffee-InfiniteMac.img, a raw HFS+ volume named HomeCoffee, to the nightly release:
https://github.com/AdrianMannaCodes/HomeCoffee/releases/download/nightly/HomeCoffee-InfiniteMac.img

Builder: scripts/build-infinitemac-disk.sh. It needs root, hfsprogs (mkfs.hfsplus, fsck.hfsplus), and util-linux (mount).

## What the image contains
- HomeCoffee/Aqua/: the web desktop from ui/aqua.
- HomeCoffee/Assets/ and HomeCoffee/Docs/: copies of assets/ and docs/.
- HomeCoffee/Read Me.txt: describes the disk.

This is a data disk. It is not bootable, and it does not contain a Mac OS X system.

## Disk size
- Default is 64 MB (IMG_SIZE_MB=64). Keep it there for iPad and mobile Safari.
- The builder warns above 128 MB. Larger images use more memory when the emulator loads them and are more likely to hit iOS Safari memory limits.

## iPad and mobile Safari (unverified)
Infinite Mac is designed to run on mobile as well as desktop. Adrian is testing on an iPad 8th generation (4:3 display). Points to check on that device:
- Emulator performance: the reported constraints are that iOS WebKit does not allow JIT-style executable memory, so DingusPPC or PearPC would run as an interpreter there. That is slower and more sensitive to memory. These constraints are reported, not verified in this repo.
- Memory: keep disk images small and avoid loading the image more than once. Close other Safari tabs before starting a session.
- Aqua layout: the 4:3 display, the dock, and touch hit targets have not been checked in this repo yet. Viewport meta, dock overflow, and touch sizing are open items.
- Mounting: drag-and-drop may not be available from Safari on iPad. Use the custom disk URL option if it works there.

## Compatibility status (unverified)
- Infinite Mac supports early Mac OS X (10.0 to 10.4) through PearPC and DingusPPC, per the author's 2025 write-up.
- The image is a bare HFS+ volume with an Apple Partition Map. The map is written by the builder and checked for the ER and PM signatures and the Apple_HFS type. Whether Infinite Mac accepts it is unverified.
- BlueSCSI image naming (for example HD20_512.hda or SCSI ID names) and how DingusPPC maps a secondary disk are not confirmed in this repo. Check the Infinite Mac and DingusPPC docs before relying on a filename.
- The Aqua page needs a modern browser. Stock Mac OS X 10.0 to 10.4 has none, so the web UI will not run on those hosts.
- Nothing here has been tested in Infinite Mac or on an iPad.

## Mounting in Infinite Mac
1. Open https://infinitemac.org/run and choose a Mac OS X entry (10.1 and 10.3 are best supported, per the author).
2. Option A, custom disk URL: paste the release URL above into the disk URL field. The host must allow cross-origin reads from GitHub releases. This is unverified.
3. Option B, drag and drop: download the .img file and drag it onto the Infinite Mac window. Drag-and-drop works for disk images. Whether a bare HFS+ volume is accepted is unverified. On iPad, use Option A first.
4. Once mounted, open the HomeCoffee volume in the Finder and read Read Me.txt.

If the disk does not mount, check the Infinite Mac debug output (Debug Mode in the custom instance dialog) and record the message.

## Building locally
```
sudo apt-get install -y hfsprogs util-linux
sudo bash scripts/build-infinitemac-disk.sh
```
Output: build/HomeCoffee-InfiniteMac.img. Set IMG_SIZE_MB to change the size (default 64, keep at or below 128).

## CI
.github/workflows/build-utm.yml runs the builder after the UTM zip step, uploads the image and its SHA-256 as artifacts, and publishes both to the nightly release.

## Open questions
- Does Infinite Mac accept a bare HFS+ volume, or does it need an Apple Partition Map?
- Does the URL-based import work with a GitHub release asset URL, and from iPad Safari?
- Is a Mac OS X browser needed for Aqua, or should the disk carry a native Mac OS X launcher instead?
- Does the Aqua UI render cleanly at 4:3 on iPad (viewport, dock, touch targets)? Not yet checked.
- What BlueSCSI or DingusPPC naming and layout does a secondary disk need? Not confirmed.
