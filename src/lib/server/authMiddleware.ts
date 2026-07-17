// src/lib/server/authMiddleware.ts
// Middlewares de sessão e autorização para os endpoints /api/*.
// A sessão chega no header Authorization: Bearer <token> ou no cookie 'cbc_session'.

import type { Request, Response, NextFunction } from "express";
import { verifySessionToken, SessionUser } from "./authService";

// Aumenta o tipo Request do Express para carregar o usuário da sessão.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = (req as any).cookies?.cbc_session;
  if (cookie) return cookie;
  return null;
}

/** Exige uma sessão válida. Popula req.sessionUser. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = verifySessionToken(extractToken(req));
  if (!user) {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }
  req.sessionUser = user;
  next();
}

/** Exige papel admin (ou marketing, quando permitido). */
export function requireRole(...roles: Array<SessionUser["role"]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.sessionUser;
    if (!user) return res.status(401).json({ error: "Sessão inválida." });
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Você não tem permissão para esta operação." });
    }
    next();
  };
}
