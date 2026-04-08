import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "铁道车辆智能调度与监控系统",
  description: "Railway Intelligent Dispatch & Monitoring System V3.3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
