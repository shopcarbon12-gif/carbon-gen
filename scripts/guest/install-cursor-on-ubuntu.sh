#!/usr/bin/env bash
# Run INSIDE Ubuntu (the VirtualBox guest), in Terminal.
# Ensures Cursor .deb from your Windows D:\downloads (shared as "downloads") or ~/installers is installed.
set -euo pipefail

DEB_NAME="cursor-linux-x64.deb"
SEARCH_PATHS=(
  "/media/${USER}/sf_downloads/${DEB_NAME}"
  "/media/sf_downloads/${DEB_NAME}"
  "${HOME}/installers/${DEB_NAME}"
  "${HOME}/Downloads/${DEB_NAME}"
  "./${DEB_NAME}"
)

DEB=""
for p in "${SEARCH_PATHS[@]}"; do
  if [[ -f "$p" ]]; then
    DEB="$(realpath "$p")"
    break
  fi
done

if [[ -z "$DEB" ]]; then
  echo "Could not find ${DEB_NAME}."
  echo "Copy it from the host (D:\\downloads) via shared folder, or:"
  echo "  mkdir -p ~/installers && cp /media/\$USER/sf_downloads/${DEB_NAME} ~/installers/"
  echo "(If your share mounts as a different path, adjust.)"
  exit 1
fi

echo "Using: $DEB"
sudo apt-get update
sudo apt install -y "$DEB" || sudo apt install -f -y
echo ""
echo "Done. Open Cursor from the app menu (search: Cursor) or run: cursor"
echo "Note: This Cursor session on Windows cannot drive the Linux app; use Remote-SSH in Cursor if you want one editor on the VM."
