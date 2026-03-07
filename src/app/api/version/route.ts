import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
    const buildId = (await fs.readFile(buildIdPath, "utf8")).trim();
    return NextResponse.json({ version: buildId });
  } catch {
    return NextResponse.json({ version: "unknown" });
  }
}
