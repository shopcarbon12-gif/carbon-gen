"use client";

export default function LogoutButton() {
  async function onLogout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
}
  return (
    <button
      onClick={onLogout}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #ddd",
        cursor: "pointer",
      }}
    >
      Logout
    </button>
  );
}
