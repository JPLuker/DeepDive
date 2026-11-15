#!/usr/bin/env bash
# Write the Flatpak manifest for one built .deb (Tauri's recommended
# route: repackage the .deb rather than build Rust inside flatpak-builder).
#
#   tools/flatpak-manifest.sh <path/to/DeepDive-...deb> > flatpak/io.github.jpluker.deepdive.yml
#
# The id, desktop file and icon all take the app id, which Flatpak
# requires. The desktop file keeps the deb's MimeType line, which is what
# routes deepdive://callback back in after Spotify sign-in.
set -euo pipefail
DEB="${1:?path to .deb}"
ID="io.github.jpluker.deepdive"
cat <<YAML
id: ${ID}
runtime: org.gnome.Platform
runtime-version: '47'
sdk: org.gnome.Sdk
command: deepdive
finish-args:
  - --socket=wayland
  - --socket=fallback-x11
  - --device=dri
  - --share=ipc
  - --share=network
modules:
  - name: deepdive
    buildsystem: simple
    sources:
      - type: file
        path: $(realpath "$DEB")
        dest-filename: deepdive.deb
    build-commands:
      - ar -x deepdive.deb
      - mkdir -p root && tar -xf data.tar.* -C root
      - install -Dm755 "\$(find root/usr/bin -maxdepth 1 -type f | head -n1)" /app/bin/deepdive
      - |
        desktop="\$(find root/usr/share/applications -name '*.desktop' | head -n1)"
        sed -e 's/^Exec=.*/Exec=deepdive %u/' -e 's/^Icon=.*/Icon=${ID}/' "\$desktop" > ${ID}.desktop
        install -Dm644 ${ID}.desktop /app/share/applications/${ID}.desktop
      - |
        for png in root/usr/share/icons/hicolor/*/apps/*.png; do
          size="\$(basename "\$(dirname "\$(dirname "\$png")")")"
          install -Dm644 "\$png" "/app/share/icons/hicolor/\$size/apps/${ID}.png"
        done
YAML
