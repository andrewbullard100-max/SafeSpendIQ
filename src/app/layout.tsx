import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SafeSpend Register", template: "%s | SafeSpend" },
  description: "A modern checkbook register that reserves recurring bills by payday and texts you when Plaid finds undocumented spending.",
  applicationName: "SafeSpend Register",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SafeSpend" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#102a43",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ServiceWorkerRegister />{children}</body></html>;
}
