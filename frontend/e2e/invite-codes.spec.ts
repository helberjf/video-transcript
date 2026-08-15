import { expect, test } from "@playwright/test";

import { formatInviteCode, generateInviteCode, normalizeInviteCode } from "../lib/invite-codes";

/**
 * O codigo e gravado na forma canonica e so ganha hifens na exibicao. Se as
 * duas pontas divergirem, todo convite valido passa a ser recusado no cadastro.
 */
test.describe("codigos de convite", () => {
  test("codigo gerado sobrevive a normalizacao", () => {
    for (let index = 0; index < 50; index += 1) {
      const code = generateInviteCode();
      expect(normalizeInviteCode(code)).toBe(code);
    }
  });

  test("codigo formatado volta ao valor gravado", () => {
    const code = generateInviteCode();
    expect(normalizeInviteCode(formatInviteCode(code))).toBe(code);
  });

  test("aceita o que a pessoa digitar com hifen, espaco ou minuscula", () => {
    expect(normalizeInviteCode("wpjn-cg3p-r65n")).toBe("WPJNCG3PR65N");
    expect(normalizeInviteCode(" WPJN CG3P R65N ")).toBe("WPJNCG3PR65N");
    expect(normalizeInviteCode("WPJNCG3PR65N")).toBe("WPJNCG3PR65N");
  });

  test("nao usa caracteres ambiguos", () => {
    const code = generateInviteCode(200);
    expect(code).not.toMatch(/[IO01]/);
  });
});
