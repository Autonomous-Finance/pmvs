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
    expect(readme).toContain("PMVS specifies a prediction-market vault");
    expect(readme).toContain(
      "It issues fungible ERC-20 **vault shares** to investors and holds prediction-market **outcome positions**",
    );
    expect(readme).toContain("A per-vault Strategy Safe holds working collateral and Gnosis Conditional Tokens Framework");
    expect(readme).toContain("It does not hold the outcome positions");
    expect(readme).toContain("position/gnosis-ctf/1");
    expect(readme).toContain("Each vault share is a pro-rata unit of declared net asset value");
    expect(readme).toContain("The custody perimeter includes every account whose cash");
    expect(readme).toContain("ERC-20 defines balances, transfers, and allowances");
    expect(readme).toContain("PMVS does not require a Boring Vault interface");
    expect(readme).toContain("is not a fork of, or API-compatible with");
    expect(readme).toContain("The reference share-vault has no ERC-1155 receiver hooks");
    expect(readme).toContain("Current Polymarket Combo positions are also ERC-1155 tokens");
    expect(readme).not.toContain("PMVS extends the modular");

    const ctfProfile = await Bun.file("profiles/position-gnosis-ctf-1.md").text();
    expect(ctfProfile).toContain("abi.encodePacked(address oracle, bytes32 questionId, uint256 outcomeSlotCount)");
    expect(ctfProfile).toContain("CTHelpers.getCollectionId(parentCollectionId, conditionId, indexSet)");
    expect(ctfProfile).toContain("abi.encodePacked(address collateralToken, bytes32 collectionId)");
    expect(ctfProfile).toContain("without filtering by emitting contract");

    const m1 = await Bun.file("pmvs-m1.md").text();
    expect(m1).toContain("Do not restrict the query by emitting contract");
    expect(m1).toContain("The venue profile's contract list classifies candidates; it does not limit discovery");

    const polymarketProfile = await Bun.file("profiles/venue-polymarket-1.md").text();
    expect(polymarketProfile).toContain("This profile does not cover Polymarket Combo positions");
    expect(polymarketProfile).toContain("UNSUPPORTED_POSITION_FORMAT");
    expect(polymarketProfile).toContain("A PositionManager `setApprovalForAll` approval does not prove");
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
