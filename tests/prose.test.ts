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
    expect(readme).toContain("A common modular layout keeps these token layers in different contracts");
    expect(readme).toContain("A strategy custody wallet holds trading collateral and outcome positions");
    expect(readme).toContain("share-vault controls ERC-20 supply");
    expect(readme).toContain("position/gnosis-ctf/1");
    expect(readme).toContain("Each vault share is a pro-rata unit of declared net asset value");
    expect(readme).toContain("The custody perimeter includes every account whose cash");
    expect(readme).toContain("ERC-20 defines balances, transfers, and allowances");
    expect(readme).toContain("does not require or claim compatibility with a Boring Vault interface");
    expect(readme).toContain("two layouts are not interchangeable");
    expect(readme).toContain("Current Polymarket Combo positions are also ERC-1155 tokens");
    expect(readme).toContain("pUSD is the vault accounting and venue wrapper asset");
    expect(readme).toContain("Standard CTF positions use USDC.e");
    expect(readme).toContain("L2 and L3 claims are unavailable in this version");
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

  test("keeps L1 narrow, cumulative, and distinct from record validation", async () => {
    const readme = await Bun.file("README.md").text();
    const settlement = await Bun.file("pmvs-settlement.md").text();
    const m1 = await Bun.file("pmvs-m1.md").text();
    const ctfProfile = await Bun.file("profiles/position-gnosis-ctf-1.md").text();
    const venueProfile = await Bun.file("profiles/venue-polymarket-1.md").text();

    expect(readme).toContain("L1, evidence-bound settlement");
    expect(readme).toContain("no end-to-end deployment-level L1 verifier");
    expect(readme).toContain("does not reproduce the complete NAV or PPS calculation");
    expect(readme).toContain("nor a diagnostic profile result is a conformance result");
    expect(readme).not.toContain("L1, settlement-complete");

    expect(settlement).toContain("complete custody-perimeter");
    expect(settlement).toContain("Record validity or diagnostic profile validation is");
    expect(settlement).toContain("not enough. The branch-specific pre-action record");
    expect(settlement).toContain("failed settlement policy prevents L1 and every higher level");
    expect(settlement).not.toContain("evidence-only pre-settlement valuation");

    expect(m1).toContain("record-valid or diagnostic-only valuation cannot support L1");
    expect(m1).toContain("Passing one of them is not a PMVS conformance result");
    expect(ctfProfile).toContain("cannot support an L1 evidence-bound settlement or any higher level");

    expect(venueProfile).toContain("requires the caller to select `diagnostic` or `settlement` scope");
    expect(venueProfile).toContain("It is nonconforming and cannot support L1");
    expect(venueProfile).not.toMatch(/L2 settlement(?:-bearing)?/);
  });

  test("states the fixed retirement wrapper boundary", async () => {
    const readme = await Bun.file("README.md").text();
    expect(readme).toContain("The wrapper executes no residual or recovery resolution");
    expect(readme).toContain("VaultRetired(bytes32 indexed subjectId)");
    expect(readme).toContain("independent verifier proves that every resolution predates finalization");
    expect(readme).not.toContain("wrapper rechecks those obligations");
  });

  test("defines non-circular component activation and post-action evidence", async () => {
    const core = await Bun.file("pmvs-core.md").text();
    const anchor = await Bun.file("profiles/anchor-evm-1.md").text();
    const schemaReadme = await Bun.file("schemas/README.md").text();

    expect(core).toContain(
      "PMVSComponentsUpdated(bytes32,uint64,address,uint64,bytes32)",
    );
    expect(core).toContain(
      "PMVSActivationCondition(bytes32 idHash,address target,bytes32 callDataHash,bytes32 expectedReturnDataHash)",
    );
    expect(core).toContain(
      "PMVSComponentActivation(uint256 chainId,address shareToken,bytes32 subjectId,uint64 streamSequence,bytes32 streamPrev,uint64 nonce,bool expectedActiveExists",
    );
    expect(core).toContain("deliberately omits `recordHash`");
    expect(core).toContain("transaction completion the activation boundary");
    expect(core).toContain("`UNEXECUTED_ACTIVATION`");
    expect(core).toContain("function pmvsActivationNonce() external view returns (uint64)");
    expect(core).toContain("the ERC-165 interface id `0x354fe243`");
    expect(core).toContain("anywhere in a component record's open objects");
    expect(core).not.toContain("state its activation transaction and log position");
    expect(core).not.toContain("before-finalization or in-finalization");

    expect(anchor).toContain("None of those future locators appears");
    expect(anchor).toContain("A revert restores the old anchor");
    expect(anchor).toContain("receipt verification compares four exact head sets");
    expect(anchor).toContain("claim that an import succeeded is not evidence");
    expect(schemaReadme).toContain("Future activation transaction, block, and log locators are invalid");
    expect(schemaReadme).toContain("valid `unexecuted`");
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
