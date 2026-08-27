import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FridayBite 周五吃啥",
  description: "从你自己的收藏里，按心情选出今天吃哪家",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="mx-auto min-h-screen max-w-3xl px-4 py-6">
          <header className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm tracking-wide text-[#c45c26]">FridayBite</p>
              <h1 className="text-2xl font-semibold">周五吃啥</h1>
            </div>
            <nav className="flex gap-4 text-sm">
              <Link href="/">现在吃什么</Link>
              <Link href="/places">我的店库</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
