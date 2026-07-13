import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeSpend Register",
    short_name: "SafeSpend",
    description: "A payday-aware checkbook register with automatic Plaid variance alerts.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#102a43",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
