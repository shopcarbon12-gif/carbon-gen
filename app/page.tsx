import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Carbon Gen</h1>

      <p style={{ marginTop: 8 }}>
        <Link href="/login">Login</Link> to start generating product images.
      </p>

      <p style={{ marginTop: 8 }}>
        Or go straight to the generator: <Link href="/generate">Generate</Link>
      </p>

      <p style={{ marginTop: 8 }}>
        Full workspace: <Link href="/studio">Studio</Link>
      </p>
    </div>
  );
}
