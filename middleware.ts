import { NextResponse } from "next/server";

// No-op middleware - site should work without auth
export default function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
