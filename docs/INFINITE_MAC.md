# HomeCoffee on Infinite Mac

The nightly build publishes HomeCoffee-InfiniteMac.img, a raw HFS+ volume named HomeCoffee, to the nightly release:
https://github.com/AdrianMannaCodes/HomeCoffee/releases/download/nightly/HomeCoffee-InfiniteMac.img

Builder: scripts/build-infinitemac-disk.sh. It needs root, hfsprogs (mkfs.hfsplus, fsck.hfsplus), and util-linux (mount).

## What the image contains
- HomeCoffee/Aqua/: the web desktop from ui/aqua.
- HomeCoffee/Assets/ and HomeCoffee/Docs/: copies of assets/ and docs/.
- HomeCoffee/Read Me.txt: describes the disk.

This is a data disk. It is not bootable, and it does not contain a Mac OS X system.

## Compatibility status (unverified)
- Infinite Mac supports early Mac OS X (10.0 to 10.4) through PearPC and DingusPPC, per the author's 2025 write-up.
- The image is a bare HFS+ volume with no Apple Partition Map. I have not confirmed that Infinite Mac accepts a bare volume as a custom disk. It may need an Apple Partition Map wrapper.
- The Aqua page needs a modern browser. Stock Mac OS X 10.0 to 10.4 has none, so the web UI will not run on those hosts.
- Nothing here has been tested in Infinite Mac.

## Mounting in Infinite Mac
1. Open https://infinitemac.org/run and choose a Mac OS X entry (10.1 and 10.3 are best supported, per the author).
2. Option A, custom disk URL: paste the release URL above into the disk URL field. The host must allow cross-origin reads from GitHub releases. This is unverified.
3. Option B, drag and drop: download the .img file and drag it onto the Infinite Mac window. Drag-and-drop works for disk images. Whether a bare HFS+ volume is accepted is unverified.
4. Once mounted, open the HomeCoffee volume in the Finder and read Read Me.txt.

If the disk does not mount, check the Infinite Mac debug output (Debug Mode in the custom instance dialog) and record the message.

## Building locally
```
sudo apt-get install -y hfsprogs util-linux
sudo bash scripts/build-infinitemac-disk.sh
```
Output: build/HomeCoffee-InfiniteMac.img. Set IMG_SIZE_MB to change the size (default 64).

## CI
.github/workflows/build-utm.yml runs the builder after the UTM zip step, uploads the image and its SHA-256 as artifacts, and publishes both to the nightly release.

## Open questions
- Does Infinite Mac accept a bare HFS+ volume, or does it need an Apple Partition Map?
- Does the URL-based import work with a GitHub release asset URL?
- Is a Mac OS X browser needed for Aqua, or should the disk carry a native Mac OS X launcher instead?
