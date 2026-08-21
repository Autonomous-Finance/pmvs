// SPDX-License-Identifier: CC0-1.0

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const proseFiles: string[] = [];
for await (const file of new Bun.Glob("**/*.md").scan({ cwd: ".", onlyFiles: true })) {
  if (!file.startsWith("node_modules/")) proseFiles.push(file);
}

describe("proposal prose", () => {
  test("contains no prohibited dash characters or stock AI wording", async () => {
    const problems: string[] = [];
    const stockTerms =
      /\b(delve|foster|leverage|utilize|facilitate|empower|streamline|robust|cutting-edge|comprehensive|seamless|pivotal|crucial|tapestry|game-changer|revolutionary|transformative|realm|beacon|multifaceted|meticulous|intricate|paramount|elevate|harness|ever-evolving)\b/i;
    const stockPhrases =
      /\b(at its core|the real question|what really matters|it(?:'s| is) worth noting|it is important to note|stands as|serves as|marks a pivotal|plays a vital role|underscores|highlights)\b/i;
    for (const file of proseFiles) {
      const lines = (await Bun.file(file).text()).split("\n");
      lines.forEach((line, index) => {
        if (/[—–]/.test(line)) problems.push(`${file}:${index + 1}: em or en dash`);
        if (stockTerms.test(line)) problems.push(`${file}:${index + 1}: stock term`);
        if (stockPhrases.test(line)) problems.push(`${file}:${index + 1}: stock phrase`);
      });
    }
    expect(problems).toEqual([]);
  });

  test("keeps the proposal framed as a vault standard", async () => {
    const text = (await Promise.all(proseFiles.map((file) => Bun.file(file).text()))).join("\n");
    expect(text).not.toMatch(
      /\bzeit(?:-(?:mono|epoch|legacy)|\s+(?:monorepo|contracts?|deployment|abi|archive|implementation))\b/i,
    );
    expect(text).not.toMatch(/\baudit(?:ing)?(?:\s+and\s+settlement)?\s+standard\b/i);
    expect(text).not.toContain("PMVS is an evidence standard");

    const readme = await Bun.file("README.md").text();
    expect(readme).toContain("# PMVS: Prediction Market Vault Standard");
    expect(readme).toContain("PMVS specifies an ERC-20 vault that holds prediction-market shares");
    expect(readme).toContain(
      "PMVS calls the market shares **outcome positions** and the investor token the **vault share**",
    );
    expect(readme).toContain("Each vault share is a fungible, pro-rata unit of declared net asset value");
    expect(readme).toContain("The custody perimeter includes every account whose cash");
    expect(readme).toContain("ERC-20 defines balances, transfers, and allowances");
    expect(readme).toContain("Boring Vault architecture");
  });

  test("resolves every relative Markdown link", async () => {
    const missing: string[] = [];
    const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
    for (const file of proseFiles) {
      const text = await Bun.file(file).text();
      for (const match of text.matchAll(linkPattern)) {
        const target = match[1].split("#", 1)[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const normalized = target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
        if (!existsSync(resolve(dirname(file), normalized))) missing.push(`${file}: ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
