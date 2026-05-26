import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { NextResponse } from "next/server";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  getAuthRouteDecision,
  getSessionUserId,
  getTokenUserId,
} from "@/lib/auth-policy";

type PrismaAdapterClient = Parameters<typeof PrismaAdapter>[0];

export const authConfig = {
  adapter: PrismaAdapter(db as unknown as PrismaAdapterClient),
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
  ],
  secret: env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const decision = getAuthRouteDecision(
        pathname,
        Boolean(auth?.user?.id),
        request.nextUrl.href,
      );

      if (decision.kind === "api-unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (decision.kind === "redirect") {
        return NextResponse.redirect(new URL(decision.destination, request.nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      const userId = getTokenUserId(user);

      if (userId) {
        token.id = userId;
      }

      return token;
    },
    session({ session, token }) {
      const userId = getSessionUserId(token);

      if (session.user && userId) {
        session.user.id = userId;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
