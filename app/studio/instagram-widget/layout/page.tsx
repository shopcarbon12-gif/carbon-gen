import Link from "next/link";
import { InstagramWidgetStudioForm } from "@/components/instagram-widget-studio";

export default function InstagramWidgetLayoutPage() {
  return (
    <div>
      <div style={{ padding: "12px 14px 0" }}>
        <Link href="/studio/images" style={{ color: "rgba(148, 163, 184, 0.95)", fontSize: "0.88rem" }}>
          ← Studio
        </Link>
      </div>
      <InstagramWidgetStudioForm />
    </div>
  );
}
