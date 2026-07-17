import { createSessionToken, verifySessionToken, hashPassword } from "../src/lib/server/authService";
import bcrypt from "bcryptjs";

async function main() {
  const u = { id: "admin-1", username: "CHAVES BRITES CORREA", role: "admin" as const, name: "Admin" };
  const tok = createSessionToken(u);
  const back = verifySessionToken(tok);
  console.log("1. Token valido reconstitui usuario:", back && back.id === u.id && back.role === "admin" ? "OK" : "FALHOU");

  const tampered = tok.slice(0, -3) + "xyz";
  console.log("2. Token adulterado rejeitado:", verifySessionToken(tampered) === null ? "OK" : "FALHOU");

  console.log("3. Token forjado rejeitado:", verifySessionToken("forjado.invalido") === null ? "OK" : "FALHOU");

  const h = await hashPassword("Cbc*12345");
  const okRight = await bcrypt.compare("Cbc*12345", h);
  const okWrong = await bcrypt.compare("senhaerrada", h);
  console.log("4. Hash bcrypt (certa valida, errada invalida):", okRight && !okWrong ? "OK" : "FALHOU");
  console.log("5. Hash nao e texto puro:", h !== "Cbc*12345" && h.startsWith("$2") ? "OK" : "FALHOU");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
