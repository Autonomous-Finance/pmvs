// SPDX-License-Identifier: CC0-1.0

import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { privateKeyToAccount } from "viem/accounts";
import componentRecord from "../fixtures/components-genesis-record.json";
import envelopeSchema from "../schemas/pmvs-envelope-v1.schema.json";
import {
  PMVS_MERKLE_TAG,
  ZERO_HASH,
  WAD,
  attestationDigest,
  bpsExitCostCap,
  canonicalize,
  legacyLeaf,
  legacyRoot,
  netPps,
  performanceFeeShares,
  pmvsMerkleLeaf,
  pmvsMerkleRawRoot,
  pmvsMerkleRoot,
  recordHash,
  selectionHash,
  subjectId,
} from "../src/reference";

const owners = [
  "0x00000000000000000000000000000000000000a1",
  "0x00000000000000000000000000000000000000b2",
  "0x00000000000000000000000000000000000000c3",
  "0x00000000000000000000000000000000000000d4",
] as const;
const amounts = [250000000000000000000n, 1000000n, 123456789012345678n, 1n];

describe("PMVS-JCS/1", () => {
  test("matches the canonicalization vector", () => {
    const value = {
      outputs: { "ünicode": ["true-string", true, null], pps: "1100000000000000000" },
      schemaVersion: "1",
      subject: { shareToken: "0x4aff8269a587643f68aa8e58c5ad93d9423e8624", chainId: "137" },
      context: { sequence: "42", kind: "roll", prev: ZERO_HASH, epoch: "7" },
      schema: "pmvs/valuation-record",
    };
    const expected =
      '{"context":{"epoch":"7","kind":"roll","prev":"0x0000000000000000000000000000000000000000000000000000000000000000","sequence":"42"},"outputs":{"pps":"1100000000000000000","ünicode":["true-string",true,null]},"schema":"pmvs/valuation-record","schemaVersion":"1","subject":{"chainId":"137","shareToken":"0x4aff8269a587643f68aa8e58c5ad93d9423e8624"}}';
    expect(canonicalize(value)).toBe(expected);
    expect(recordHash(value)).toBe("0x12cff343cf51e23a8963e06de305bdfab292fccc199639c9f8bea4992d26fe5c");
  });

  test("rejects host-language numbers and unpaired surrogates", () => {
    expect(() => canonicalize({ amount: 1 })).toThrow();
    expect(() => canonicalize({ text: "\ud800" })).toThrow();
    expect(() => canonicalize(new Date(0))).toThrow();
  });

  test("sorts integer-looking keys by UTF-16 code units", () => {
    expect(canonicalize({ "2": "two", "10": "ten", a: "letter" })).toBe(
      '{"10":"ten","2":"two","a":"letter"}',
    );
  });
});

describe("machine schema", () => {
  test("accepts the signed component-genesis fixture", async () => {
    const hash = recordHash(componentRecord);
    expect(hash).toBe("0x6c7f5186cde84439db366e139deb853565417469af140e11224f1d480238e19a");
    const account = privateKeyToAccount(`0x${"1".padStart(64, "0")}`);
    const signature = await account.signTypedData({
      domain: {
        name: "PMVS-Attestation",
        version: "1",
        chainId: 137n,
        verifyingContract: "0x0000000000000000000000000000000000000001",
      },
      types: {
        Attestation: [
          { name: "recordHash", type: "bytes32" },
          { name: "kind", type: "uint8" },
          { name: "subjectId", type: "bytes32" },
          { name: "streamId", type: "bytes32" },
          { name: "sequence", type: "uint64" },
          { name: "prev", type: "bytes32" },
          { name: "previousAnchor", type: "bytes32" },
        ],
      },
      primaryType: "Attestation",
      message: {
        recordHash: hash,
        kind: 4,
        subjectId: componentRecord.subjectId as `0x${string}`,
        streamId: ZERO_HASH,
        sequence: 0n,
        prev: componentRecord.context.prev as `0x${string}`,
        previousAnchor: ZERO_HASH,
      },
    });
    expect(signature).toBe(
      "0x7a2241cf28d675c5bea5a76eef0f6c2395a38879a946ec802d8ea8469efb93197e226a7441ffbfaaf03762ff7c67b6c225f6e053d5af91a575d003e5b632b53c1c",
    );
    const envelope = {
      record: componentRecord,
      attestation: {
        recordHash: hash,
        scheme: "eip712-ecdsa",
        verifyingContract: "0x0000000000000000000000000000000000000001",
        streamId: ZERO_HASH,
        previousAnchor: ZERO_HASH,
        signer: account.address.toLowerCase(),
        signature,
      },
      locations: ["ar://illustrative-fixture"],
    };
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(envelopeSchema);
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...envelope, undeclared: true })).toBe(false);
  });

  test("requires gross mark and venue exit cost in valuation outputs", () => {
    const position = {
      tokenId: "1",
      markMethod: "cross",
      filled: "1000000",
      unfilled: "0",
      grossMark: "500000",
      venueExitCost: "25000",
      mark: "475000",
      maximumPayout: "1000000",
      venueReferenceMark: null,
    };
    const record = {
      schema: "pmvs/valuation-record",
      schemaVersion: "1",
      subject: componentRecord.subject,
      components: componentRecord.components,
      context: {
        stream: "subject",
        kind: "valuation",
        sequence: "1",
        prev: ZERO_HASH,
        producedAt: "1787328000",
        valuationTime: "1787328000",
        epoch: "1",
        slot: null,
      },
      method: {
        id: "pmvs-m1",
        engine: "fixture",
        engineVersion: "1.0.0",
        sourceCommit: "illustrative",
        artifactHash: ZERO_HASH,
        parameters: {},
      },
      inputs: {
        chainState: [
          {
            chainId: "137",
            blockNumber: "1",
            blockHash: ZERO_HASH,
            blockTimestamp: "1787328000",
            reads: [],
          },
        ],
        venueState: { profile: "venue/polymarket/1", positions: [], books: [], responses: [] },
        capture: { startedAtMs: "1787328000000", endedAtMs: "1787328000001", maxSkewMs: "1" },
      },
      outputs: {
        perPosition: [position],
        cashValue: "0",
        overlayValue: "0",
        positionsValue: "475000",
        grossAssets: "475000",
        liabilities: "0",
        navSigned: "475000",
        nav: "475000",
        navDeficit: "0",
        totalSupply: "1000000000000000000",
        pps: "475000",
        referencePps: null,
      },
      extensions: [],
      meta: {},
    };
    const envelope = {
      record,
      attestation: {
        recordHash: ZERO_HASH,
        scheme: "eip712-ecdsa",
        verifyingContract: "0x0000000000000000000000000000000000000001",
        streamId: ZERO_HASH,
        previousAnchor: ZERO_HASH,
        signer: "0x0000000000000000000000000000000000000001",
        signature: "0x",
      },
      locations: ["ar://illustrative-valuation"],
    };
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(envelopeSchema);
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    const { venueExitCost: _, ...incompletePosition } = position;
    const incomplete = {
      ...envelope,
      record: { ...record, outputs: { ...record.outputs, perPosition: [incompletePosition] } },
    };
    expect(validate(incomplete)).toBe(false);
  });
});

describe("identity and attestation", () => {
  test("matches the subject id vector", () => {
    expect(subjectId(137n, "0x4aff8269a587643f68aa8e58c5ad93d9423e8624")).toBe(
      "0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892",
    );
  });

  test("matches the EIP-712 digest and signature vector", async () => {
    const verifyingContract = "0x0000000000000000000000000000000000000001";
    const message = {
      recordHash: "0x63b263cd41b1160c1a92be6a17df1a1de6ae9e5f0a9a11b6ad2b6fe9f8a9c9d1",
      kind: 1,
      subjectId: "0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892",
      streamId: ZERO_HASH,
      sequence: 42n,
      prev: ZERO_HASH,
      previousAnchor: ZERO_HASH,
    } as const;
    expect(attestationDigest(137n, verifyingContract, message)).toBe(
      "0x47b5d61b55a851f50606886d2fbbb057c903c228c39a509b9c7f434ac0fea6fd",
    );
    expect(attestationDigest(1n, verifyingContract, message)).toBe(
      "0xc9d93048d77596c629cdd52444444edba7eb2a2b6c9172fdfbec2e4e7bc2d5db",
    );
    expect(attestationDigest(137n, verifyingContract, { ...message, previousAnchor: message.recordHash })).not.toBe(
      attestationDigest(137n, verifyingContract, message),
    );
    const account = privateKeyToAccount(`0x${"1".padStart(64, "0")}`);
    const signature = await account.signTypedData({
      domain: { name: "PMVS-Attestation", version: "1", chainId: 137n, verifyingContract },
      types: {
        Attestation: [
          { name: "recordHash", type: "bytes32" },
          { name: "kind", type: "uint8" },
          { name: "subjectId", type: "bytes32" },
          { name: "streamId", type: "bytes32" },
          { name: "sequence", type: "uint64" },
          { name: "prev", type: "bytes32" },
          { name: "previousAnchor", type: "bytes32" },
        ],
      },
      primaryType: "Attestation",
      message,
    });
    expect(signature).toBe(
      "0x33ce3af8909e6a4828d38a30f291a18c3bcfde53f916df764aaaaf2ac069370d541bf653c721d8196d57ff4e271cbc123b9be996b579a93fbb1a028d2cb717ed1b",
    );
  });
});

describe("legacy Zeit commitments", () => {
  const leaves = owners.map((owner, index) =>
    legacyLeaf({ requestId: BigInt(index + 1), owner, amount: amounts[index], epoch: 7n }),
  );

  test("matches all leaf and root vectors", () => {
    expect(leaves).toEqual([
      "0xbaa954825ec8395047c72ef1147add579dc65b03d0bc4ff998ebf5b0678a9feb",
      "0xe0c95a7921186802ddabb1c1ad02e7e20dc714871bd416cf346de8f2cb0e0354",
      "0xdda630ba305851387c6b9c87d0c2494379125fc352f910dbb9fdc38d072c265e",
      "0x5928010a4f0e5614fb61395f269bbc8944e6fbf5691c2b87629df799097601a7",
    ]);
    expect([0, 1, 2, 3, 4].map((count) => legacyRoot(leaves.slice(0, count)))).toEqual([
      ZERO_HASH,
      leaves[0],
      "0x878e7da2f65f70b23b49f40f32411a8e23f01e56a421dabedb8d464dd545953d",
      "0xd7c85455641afe8fe037a3b54faffd2a668c485f06db51ecdba88f329abfc468",
      "0xa41524fd008f5c3eba4ffbd27870441729f6a92713ee620a2da01dc855136092",
    ]);
  });

  test("matches selection hashes", () => {
    expect(selectionHash([1n, 2n, 3n])).toBe(
      "0x62e243217b24f0adeab63b697d9c38d64bd4cbf540c9915772ddc377b45b411c",
    );
    expect(selectionHash([])).toBe("0x569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd");
  });
});

describe("pmvs-merkle/1", () => {
  const leaves = owners.map((owner, index) =>
    pmvsMerkleLeaf({
      chainId: 137n,
      settlementContract: "0x0000000000000000000000000000000000000001",
      leg: 0,
      epoch: 7n,
      requestId: BigInt(index + 1),
      owner,
      amount: amounts[index],
    }),
  );

  test("matches domain-separated vectors", () => {
    expect(PMVS_MERKLE_TAG).toBe("0x71df0d2930a2279d0a8f0e38b7a9f5ceadeed5d0b250f4eaf38541b6fd7bf8ed");
    expect(leaves).toEqual([
      "0xe3828f4a0e565bd31934728c919720da50e3b04fcbb420acd383553630020347",
      "0x7738c2cfac6cdd7016602440c642ba8df866083d503fbba24b2efca819263674",
      "0x2a874628b9362eef99979257cbfa686e5e87fcf459947420b0148543c3d4bd1f",
      "0xe0c39d2f2648281792cfac2ffccf0e477763ffc4f6001ced2945a43142b0b03e",
    ]);
    expect([0, 1, 2, 3, 4].map((count) => pmvsMerkleRoot(leaves.slice(0, count)))).toEqual([
      ZERO_HASH,
      "0x327bf84a9831b47cbdb17b933faf58d4d97dd740f09e62829a51044c6927e5ce",
      "0xd550b747cd129527e35a6bf8dc52efd0855c2f883e715f6d38ffc33cd2439481",
      "0x50fae70f5d14d28d9a0f99890dc162a0bc85367e3c8d398f7e00b8c1883b07db",
      "0xfba7ece31939e2cbf77a8f6b0dbeae5087f7df283828fcb463f42f59dd41e033",
    ]);
  });

  test("binds the leaf count despite odd duplication", () => {
    expect(pmvsMerkleRawRoot(leaves.slice(0, 3))).toBe(pmvsMerkleRawRoot([leaves[0], leaves[1], leaves[2], leaves[2]]));
    expect(pmvsMerkleRoot(leaves.slice(0, 3))).not.toBe(pmvsMerkleRoot([leaves[0], leaves[1], leaves[2], leaves[2]]));
  });
});

describe("settlement arithmetic", () => {
  test("floors the pinned venue exit-cost cap and rejects an unlimited zero setting", () => {
    expect(bpsExitCostCap(50_000_000n, 500n)).toBe(2_500_000n);
    expect(bpsExitCostCap(1n, 500n)).toBe(0n);
    expect(() => bpsExitCostCap(1n, 0n)).toThrow();
  });

  test("matches fee vectors and keeps two ceiling stages", () => {
    expect(netPps(11n * 10n ** 17n, WAD, 2n * 10n ** 17n)).toBe(108n * 10n ** 16n);
    expect(performanceFeeShares(11n * 10n ** 17n, WAD, 2n * 10n ** 17n, 1000n * WAD)).toBe(
      18518518518518518519n,
    );
    expect(performanceFeeShares(WAD + 1n, WAD, 1n, 100n * WAD)).toBe(100n);
    expect(() => performanceFeeShares(WAD, WAD, -1n, 100n * WAD)).toThrow();
  });
});
