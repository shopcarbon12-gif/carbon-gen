export default function CollectionMappingLoading() {
  return (
    <div
      className="collection-mapping-loading"
      style={{
        minHeight: "calc(100vh - 60px)",
        background: "#0b1020",
        padding: "16px 12px",
      }}
    >
      <div
        style={{
          width: "min(100%, calc(100vw - 24px))",
          margin: "0 auto",
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            height: 148,
            borderRadius: 12,
            border: "1px solid #2a3547",
            background: "#101b31",
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "340px minmax(0, 1fr)",
            gap: 12,
          }}
        >
          <div
            style={{
              minHeight: 520,
              borderRadius: 12,
              border: "1px solid #2a3547",
              background: "#101b31",
            }}
          />
          <div
            style={{
              minHeight: 520,
              borderRadius: 12,
              border: "1px solid #2a3547",
              background: "#101b31",
            }}
          />
        </div>
      </div>
    </div>
  );
}
