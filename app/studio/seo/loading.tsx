export default function StudioSeoLoading() {
  return (
    <div
      className="seo-loading"
      style={{
        minHeight: "calc(100vh - 60px)",
        background: "#0b1020",
        padding: "14px 12px",
      }}
    >
      <div
        style={{
          width: "min(100%, calc(100vw - 24px))",
          margin: "0 auto",
          minHeight: "calc(100vh - 88px)",
          borderRadius: 16,
          border: "1px solid #2a3547",
          background: "#101b31",
        }}
      />
    </div>
  );
}
