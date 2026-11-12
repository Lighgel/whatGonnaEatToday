import { networkInterfaces } from "os";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const port = Number(process.env.PORT || 3000);
  const lan: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const item of addrs ?? []) {
      const v4 = item.family === "IPv4";
      if (v4 && !item.internal) lan.push(`http://${item.address}:${port}`);
    }
  }
  return NextResponse.json({
    ok: true,
    port,
    lan,
    desktop: process.env.FRIDAYBITE_DESKTOP === "1",
  });
}
