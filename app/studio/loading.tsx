export default function StudioLoading() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 58px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(760px, 94vw)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(14, 9, 24, 0.72)",
          padding: 18,
          display: "grid",
          gap: 12,
          color: "rgba(248, 250, 252, 0.96)",
        }}
      >
        <div style={{ fontSize: "0.96rem", fontWeight: 700, letterSpacing: "0.01em" }}>
          Loading workspace...
        </div>
        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.2)" }} />
        <div
          style={{
            width: "62%",
            height: 10,
            borderRadius: 999,
            background: "rgba(255,255,255,0.2)",
          }}
        />
      </div>
    </div>
  );
}
