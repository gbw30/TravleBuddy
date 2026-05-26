import {
  isLoginRoute,
  isProtectedApiRoute,
  isProtectedPageRoute,
} from "./auth-routes";

export type AuthRouteDecision =
  | {
      kind: "allow";
    }
  | {
      kind: "redirect";
      destination: string;
    }
  | {
      kind: "api-unauthorized";
    };

export function getAuthRouteDecision(
  pathname: string,
  isSignedIn: boolean,
  requestHref: string,
): AuthRouteDecision {
  if (isLoginRoute(pathname) && isSignedIn) {
    return {
      kind: "redirect",
      destination: "/dashboard",
    };
  }

  if (isProtectedApiRoute(pathname) && !isSignedIn) {
    return {
      kind: "api-unauthorized",
    };
  }

  if (isProtectedPageRoute(pathname) && !isSignedIn) {
    const loginUrl = new URL("/login", requestHref);
    loginUrl.searchParams.set("callbackUrl", requestHref);

    return {
      kind: "redirect",
      destination: loginUrl.toString(),
    };
  }

  return {
    kind: "allow",
  };
}

export function getTokenUserId(user: { id?: string } | null | undefined) {
  return user?.id ?? null;
}

export function getSessionUserId(token: { id?: unknown } | null | undefined) {
  return typeof token?.id === "string" ? token.id : null;
}
