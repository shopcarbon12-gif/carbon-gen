#!/usr/bin/env bash
# Run INSIDE the Ubuntu VirtualBox guest (Terminal).
# Fixes missing shared clipboard: ensures VBoxClient clipboard integration runs and adds GNOME autostart.
# Prereq: Oracle Guest Additions from Devices -> Insert Guest Additions CD (see docs/virtualbox-linux-cursor-flutter-android-guide.html Phase E).
set -euo pipefail

if ! lsmod 2>/dev/null | grep -q '^vboxguest'; then
  echo "vboxguest kernel module not loaded — you are probably not in a VirtualBox VM, or Guest Additions are broken."
  echo "Install Guest Additions from the host menu (Insert Guest Additions CD), then: sudo ./VBoxLinuxAdditions.run && sudo reboot"
  exit 1
fi

VC="$(command -v VBoxClient || true)"
if [[ -z "$VC" ]]; then
  echo "VBoxClient not found in PATH. Reinstall Guest Additions from the host (Phase E in the carbon-gen VirtualBox guide)."
  exit 1
fi

if dpkg -l 2>/dev/null | grep -qE '^ii\s+virtualbox-guest-(utils|x11|dkms)'; then
  echo "WARN: Ubuntu packages virtualbox-guest-* are installed. They often mismatch the host VirtualBox version and break clipboard/resize."
  echo "Remove them, then reinstall from Insert Guest Additions CD — see guide section E.6b."
  echo ""
fi

if pgrep -f "VBoxClient --clipboard" >/dev/null 2>&1; then
  echo "VBoxClient --clipboard already running (PID(s): $(pgrep -f 'VBoxClient --clipboard' | tr '\n' ' '))"
else
  echo "Starting VBoxClient --clipboard in the background..."
  nohup "$VC" --clipboard >/dev/null 2>&1 &
  sleep 1
  if pgrep -f "VBoxClient --clipboard" >/dev/null 2>&1; then
    echo "Started OK."
  else
    echo "Failed to start. Try from a graphical session (not SSH-only). If on Wayland, log out and try 'Ubuntu on Xorg' from the login gear menu."
    exit 1
  fi
fi

AUTOSTART_DIR="${HOME}/.config/autostart"
DESKTOP="${AUTOSTART_DIR}/virtualbox-clipboard.desktop"
mkdir -p "$AUTOSTART_DIR"
cat > "$DESKTOP" << 'EOF'
[Desktop Entry]
Type=Application
Name=VirtualBox Clipboard
Exec=/usr/bin/VBoxClient --clipboard
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF
echo "Wrote autostart: $DESKTOP"
echo ""
echo "Host check (on Windows): VM Settings -> General -> Advanced -> Shared Clipboard = Bidirectional."
echo "Test: copy text on Windows, paste in Ubuntu (and reverse). If it still fails on Wayland, use Xorg session at login."
