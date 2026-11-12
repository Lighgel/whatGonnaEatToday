import type { Metadata } from "next";
import { Nav } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "FridayBite 周五吃啥",
  description: "周五吃啥",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-5">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.22em] text-[#c45c26]">FRIDAYBITE</p>
              <p className="text-lg font-semibold tracking-tight">今天吃哪家</p>
            </div>
            <Nav />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
