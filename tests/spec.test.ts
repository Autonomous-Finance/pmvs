// SPDX-License-Identifier: CC0-1.0

import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import componentRecord from "../fixtures/components-genesis-record.json";
import ctfPositionRecord from "../fixtures/position-gnosis-ctf-1.json";
import envelopeSchema from "../schemas/pmvs-envelope-v1.schema.json";
import ctfPositionSchema from "../schemas/position-gnosis-ctf-1.schema.json";
import {
  PMVS_MERKLE_TAG,
  PMVS_ANCHOR_INTERFACE_ID,
  PMVS_ANCHOR_MIGRATED_EVENT_TOPIC,
  PMVS_ANCHOR_SELECTOR,
  PMVS_ACTIVATION_CONDITION_TYPEHASH,
  PMVS_AUTHORITY_RESOLVER_INTERFACE_ID,
  PMVS_COMPONENT_ACTIVATION_TYPEHASH,
  PMVS_COMPONENTS_UPDATED_EVENT_TOPIC,
  PMVS_HEAD_SELECTOR,
  PMVS_RETIREMENT_STATE_SELECTOR,
  PMVS_SUBJECT_FINALIZED_SELECTOR,
  PMVS_SUBJECT_ANCHOR_SELECTOR,
  PMVS_SUBJECT_ACTIVATION_NONCE_SELECTOR,
  PMVS_SUBJECT_COMPONENTS_SELECTOR,
  PMVS_SUBJECT_DISCOVERY_INTERFACE_ID,
  PMVS_RECORD_ANCHORED_EVENT_TOPIC,
  ZERO_HASH,
  WAD,
  aggregatePositionHoldings,
  assertAnchorAdvance,
  assertAnchorGenericCommit,
  assertAnchorHeadKind,
  assertAnchorInternalCoveredCommit,
  assertAnchorSubjectFinalizationTransition,
  assertComponentActivationReceipt,
  assertCtfPositionRecord,
  assertPriceAttemptPublication,
  assertRetirementState,
  assertSettlementArchiveLeg,
  assertSettlementReceiptAction,
  assertSettlementTiming,
  assertSortedUniqueBy,
  attestationDigest,
  bpsExitCostCap,
  canonicalize,
  componentActivationChecksHash,
  componentActivationCommitment,
  componentMigrationHash,
  compatibilityLeaf,
  compatibilityRoot,
  crossDisplayedBids,
  ctfCollectionId,
  ctfConditionId,
  ctfPositionId,
  ctfRedemptionPayout,
  depositSharesOut,
  finalRollFeeAssets,
  materialityWithinCaps,
  netPps,
  performanceFeeShares,
  PMVS_MAX_NESTING_DEPTH,
  parseCanonicalJson,
  parseInt256Decimal,
  parseUint256Decimal,
  pmvsMerkleLeaf,
  pmvsMerkleProof,
  pmvsMerkleRawRoot,
  pmvsMerkleRoot,
  recordHash,
  selectionHash,
  subjectId,
  valuationPps,
  verifyPmvsMerkleProof,
  watcherStreamId,
  withdrawAssetsOut,
  type PMVSComponentActivationReceiptEvidence,
  type PMVSAnchorTransitionHead,
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

    const sparse = Array(1);
    expect(() => canonicalize(sparse)).toThrow();

    const arrayWithProperty: unknown[] & { label?: string } = [];
    arrayWithProperty.label = "not-json";
    expect(() => canonicalize(arrayWithProperty)).toThrow();
  });

  test("sorts integer-looking keys by UTF-16 code units", () => {
    expect(canonicalize({ "2": "two", "10": "ten", a: "letter" })).toBe(
      '{"10":"ten","2":"two","a":"letter"}',
    );
  });

  test("rejects duplicate keys, BOMs, whitespace, and noncanonical escapes in raw bytes", () => {
    expect(parseCanonicalJson('{"a":"1","b":[true,null]}')).toEqual({ a: "1", b: [true, null] });
    expect(() => parseCanonicalJson('{"a":"1","a":"2"}')).toThrow();
    expect(() => parseCanonicalJson('{"a":"1", "b":"2"}')).toThrow();
    expect(() => parseCanonicalJson('{"a":"\\u0061"}')).toThrow();
    expect(() => parseCanonicalJson(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toThrow();
    expect(() => parseCanonicalJson(new Uint8Array([0xc3, 0x28]))).toThrow();
    let withinDepth = '"value"';
    for (let index = 0; index < PMVS_MAX_NESTING_DEPTH; index += 1) withinDepth = `[${withinDepth}]`;
    expect(() => parseCanonicalJson(withinDepth)).not.toThrow();
    expect(() => parseCanonicalJson(`[${withinDepth}]`)).toThrow();
  });

  test("enforces exact uint256 and int256 decimal bounds", () => {
    const uintMax = (1n << 256n) - 1n;
    const intMax = (1n << 255n) - 1n;
    const intMin = -(1n << 255n);
    expect(parseUint256Decimal(uintMax.toString())).toBe(uintMax);
    expect(() => parseUint256Decimal((uintMax + 1n).toString())).toThrow();
    expect(() => parseUint256Decimal("01")).toThrow();
    expect(parseInt256Decimal(intMax.toString())).toBe(intMax);
    expect(parseInt256Decimal(intMin.toString())).toBe(intMin);
    expect(() => parseInt256Decimal((intMax + 1n).toString())).toThrow();
    expect(() => parseInt256Decimal((intMin - 1n).toString())).toThrow();
    expect(() => parseInt256Decimal("-0")).toThrow();
  });
});

describe("machine schema", () => {
  test("accepts the signed component-genesis fixture", async () => {
    const hash = recordHash(componentRecord);
    expect(hash).toBe("0xb237866badf764dca6fad51c4692aeed31d0d860eafdd676aee88dbe54adc8d7");
    expect(componentRecord.activation.nonce).toBe("1");
    expect(componentRecord.activation.actionCommitment).toBe(
      "0x80fa675ea0ecf14f4710ad22c9901da753c161b89157a344a61538fc3583acef",
    );
    expect(componentRecord.activation.conditions.expectedActive).toBeNull();
    expect(componentRecord.portfolio.positionFormats).toEqual(["position/gnosis-ctf/1"]);
    expect(componentRecord.accountingAsset.address).toBe("0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb");
    expect(componentRecord.accountingAsset.unit).toBe("pusd-base-unit");
    expect(componentRecord.share.permit).toBe(true);
    expect(componentRecord.share.initialPps).toBe("1000000000000000000");
    expect(componentRecord.meta.fixture).toContain("not a deployment or conformance record");
    expect(componentRecord.contracts.map((component) => component.role)).toEqual([
      "accountant",
      "anchor",
      "settlement",
      "share-vault",
      "strategy-custody",
      "strategy-manager",
      "teller",
    ]);
    expect(componentRecord.capabilities.map((capability) => capability.id)).toEqual([
      "buffer-distribution",
      "buffer-to-strategy",
      "share-burn",
      "share-mint",
    ]);
    expect(() =>
      assertSortedUniqueBy(componentRecord.capabilities, (capability) => capability.id, "capabilities"),
    ).not.toThrow();
    expect(() =>
      assertSortedUniqueBy([...componentRecord.capabilities].reverse(), (capability) => capability.id, "capabilities"),
    ).toThrow();
    expect(() =>
      assertSortedUniqueBy(
        [componentRecord.capabilities[0], { ...componentRecord.capabilities[0], operation: "other-operation" }],
        (capability) => capability.id,
        "capabilities",
      ),
    ).toThrow();
    expect(componentRecord.interfaces.some((claim) => claim.id === "erc2612" && claim.supported)).toBe(
      true,
    );
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
      "0x02c5e61defd98aa679c4b3cffa8fdcecab22b5464c6cc8c3e2abbaf8dc6791f8075e68e37695b9410dfe4e40a51d8b6a7c82c0eb572848956b138ceb391dd33d1c",
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
    expect(validate({ ...envelope, attestation: { ...envelope.attestation, signature: "0x" } })).toBe(false);

    const { activation: _activation, ...recordWithoutActivation } = componentRecord;
    expect(validate({ ...envelope, record: recordWithoutActivation })).toBe(false);
    expect(validate({
      ...envelope,
      record: {
        ...componentRecord,
        activation: { ...componentRecord.activation, transactionHash: ZERO_HASH },
      },
    })).toBe(false);
    expect(validate({
      ...envelope,
      record: {
        ...componentRecord,
        activation: {
          ...componentRecord.activation,
          conditions: { ...componentRecord.activation.conditions, logIndex: "0" },
        },
      },
    })).toBe(false);
    expect(validate({
      ...envelope,
      record: {
        ...componentRecord,
        activation: { ...componentRecord.activation, nonce: "0" },
      },
    })).toBe(false);

    expect(validate({ ...envelope, record: { ...componentRecord, meta: { unsafeNumber: 1 } } })).toBe(false);
    const anchorTransition = {
      oldAnchor: "0x0000000000000000000000000000000000000001",
      newAnchor: "0x0000000000000000000000000000000000000002",
      continuingWatcherHeads: [{
        streamId: `0x${"aa".repeat(32)}`,
        sequence: "7",
        kind: "10",
        recordHash: `0x${"bb".repeat(32)}`,
      }],
    };
    expect(validate({
      ...envelope,
      record: { ...componentRecord, migration: { anchorTransition } },
    })).toBe(true);
    expect(validate({
      ...envelope,
      record: {
        ...componentRecord,
        migration: { anchorTransition: { ...anchorTransition, logIndex: "1" } },
      },
    })).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          extensions: [{ id: "test/number", critical: false, value: { unsafeNumber: 1 } }],
        },
      }),
    ).toBe(false);

    const maxUint64Record = {
      ...componentRecord,
      context: { ...componentRecord.context, sequence: "18446744073709551615" },
    };
    expect(validate({ ...envelope, record: maxUint64Record })).toBe(true);
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          context: { ...componentRecord.context, sequence: "18446744073709551616" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...componentRecord, generation: "18446744073709551616" },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...componentRecord, share: { ...componentRecord.share, decimals: "256" } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...componentRecord, share: { ...componentRecord.share, initialPps: "9".repeat(79) } },
      }),
    ).toBe(false);

    const { portfolio: _, ...recordWithoutPortfolio } = componentRecord;
    expect(validate({ ...envelope, record: recordWithoutPortfolio })).toBe(false);
    const { capabilities: __, ...recordWithoutCapabilities } = componentRecord;
    expect(validate({ ...envelope, record: recordWithoutCapabilities })).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          authorities: componentRecord.authorities.map((authority, index) =>
            index === 4 ? { ...authority, role: "settlement" } : authority
          ),
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          publication: { ...componentRecord.publication, graceSeconds: { receipt: false } },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          publication: {
            ...componentRecord.publication,
            cadence: { origin: "0", seconds: "0", evaluationWindowSeconds: "1", maxConsecutiveGaps: "0" },
          },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...componentRecord, portfolio: { ...componentRecord.portfolio, kind: "generic-vault" } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...componentRecord, portfolio: { ...componentRecord.portfolio, positionFormats: ["erc1155"] } },
      }),
    ).toBe(false);
    for (const invalidPositionFormat of [
      "position/gnosis-ctf/0",
      "position/Gnosis-ctf/1",
      "position/gnosis_ctf/1",
      "position/-gnosis-ctf/1",
      "position/gnosis--ctf/1",
      "position/gnosis-ctf-/1",
      "position/gnosis-ctf/01",
      "position/gnosis-ctf/1/extra",
    ]) {
      expect(
        validate({
          ...envelope,
          record: {
            ...componentRecord,
            portfolio: { ...componentRecord.portfolio, positionFormats: [invalidPositionFormat] },
          },
        }),
      ).toBe(false);
    }
    expect(
      validate({
        ...envelope,
        record: { ...componentRecord, share: { ...componentRecord.share, economicUnit: "outcome-claim" } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          contracts: componentRecord.contracts.map((component) =>
            component.role === "strategy-manager" ? { ...component, role: "execution-operator" } : component
          ),
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          contracts: componentRecord.contracts.map((component) =>
            component.role === "strategy-custody" ? { ...component, role: "execution-custody" } : component
          ),
        },
      }),
    ).toBe(false);
    for (const requiredRole of [
      "accountant",
      "anchor",
      "settlement",
      "share-vault",
      "strategy-custody",
      "strategy-manager",
      "teller",
    ]) {
      expect(
        validate({
          ...envelope,
          record: {
            ...componentRecord,
            contracts: componentRecord.contracts.map((component) =>
              component.role === requiredRole
                ? { ...component, address: "0x0000000000000000000000000000000000000000" }
                : component
            ),
          },
        }),
      ).toBe(false);
    }

    const illustrativeRuntimeCodeHash = `0x${"6".repeat(64)}`;
    const illustrativeProxy = {
      implementation: "0x00000000000000000000000000000000000000a1",
      implementationCodeHash: `0x${"7".repeat(64)}`,
      admin: "0x00000000000000000000000000000000000000a2",
    };
    const withContractMutation = (role: string, mutation: Record<string, unknown>) => ({
      ...envelope,
      record: {
        ...componentRecord,
        contracts: componentRecord.contracts.map((component) =>
          component.role === role ? { ...component, ...mutation } : component
        ),
      },
    });

    expect(validate(withContractMutation("accountant", { proxy: illustrativeProxy }))).toBe(true);
    expect(
      validate(withContractMutation("accountant", { proxy: { ...illustrativeProxy, admin: null } })),
    ).toBe(true);
    expect(
      validate(withContractMutation("strategy-manager", { runtimeCodeHash: illustrativeRuntimeCodeHash })),
    ).toBe(false);
    expect(validate(withContractMutation("strategy-manager", { proxy: illustrativeProxy }))).toBe(false);
    expect(validate(withContractMutation("accountant", { runtimeCodeHash: ZERO_HASH }))).toBe(false);
    expect(
      validate(withContractMutation("accountant", {
        proxy: { ...illustrativeProxy, implementation: "0x0000000000000000000000000000000000000000" },
      })),
    ).toBe(false);
    expect(
      validate(withContractMutation("accountant", {
        proxy: { ...illustrativeProxy, implementation: "0x01" },
      })),
    ).toBe(false);
    expect(
      validate(withContractMutation("accountant", {
        proxy: { ...illustrativeProxy, implementationCodeHash: ZERO_HASH },
      })),
    ).toBe(false);
    expect(
      validate(withContractMutation("accountant", {
        proxy: { ...illustrativeProxy, implementationCodeHash: "0x01" },
      })),
    ).toBe(false);
    expect(
      validate(withContractMutation("accountant", {
        proxy: { ...illustrativeProxy, admin: "0x0000000000000000000000000000000000000000" },
      })),
    ).toBe(false);
    const { admin: _admin, ...proxyWithoutAdmin } = illustrativeProxy;
    expect(validate(withContractMutation("accountant", { proxy: proxyWithoutAdmin }))).toBe(false);

    const baseAuthority = componentRecord.authorities[0];
    const withAuthorityMutation = (mutation: Record<string, unknown>) => ({
      ...envelope,
      record: {
        ...componentRecord,
        authorities: componentRecord.authorities.map((authority, index) =>
          index === 0 ? { ...authority, ...mutation } : authority
        ),
      },
    });
    const eventOnlySource = {
      type: "onchain",
      contract: baseAuthority.source.contract,
      getter: null,
      eventTopic: `0x${"8".repeat(64)}`,
    };
    expect(validate(withAuthorityMutation({ source: eventOnlySource }))).toBe(true);
    expect(validate(withAuthorityMutation({
      source: { type: "attested", contract: null, getter: null, eventTopic: null },
    }))).toBe(true);
    expect(validate(withAuthorityMutation({ holder: "0x0000000000000000000000000000000000000000" }))).toBe(false);
    expect(validate(withAuthorityMutation({
      source: { ...eventOnlySource, contract: "0x0000000000000000000000000000000000000000" },
    }))).toBe(false);
    expect(validate(withAuthorityMutation({
      source: { ...eventOnlySource, contract: null },
    }))).toBe(false);
    expect(validate(withAuthorityMutation({
      source: { ...eventOnlySource, getter: null, eventTopic: null },
    }))).toBe(false);
    expect(validate(withAuthorityMutation({
      source: { ...eventOnlySource, getter: "", eventTopic: null },
    }))).toBe(false);
    expect(validate(withAuthorityMutation({
      source: { ...eventOnlySource, eventTopic: ZERO_HASH },
    }))).toBe(false);
    for (const invalidAttestedSource of [
      { type: "attested", contract: baseAuthority.source.contract, getter: null, eventTopic: null },
      { type: "attested", contract: null, getter: "settlementAuthority()", eventTopic: null },
      { type: "attested", contract: null, getter: null, eventTopic: `0x${"8".repeat(64)}` },
    ]) {
      expect(validate(withAuthorityMutation({ source: invalidAttestedSource }))).toBe(false);
    }
    expect(
      validate({
        ...envelope,
        record: {
          ...componentRecord,
          accountingAsset: {
            ...componentRecord.accountingAsset,
            address: "0x0000000000000000000000000000000000000000",
          },
        },
      }),
    ).toBe(false);
  });

  test("requires gross mark and venue exit cost in valuation outputs", () => {
    const position = {
      chainId: "137",
      positionContract: "0x4d97dcd97ec945f40cf65f87097ace5ea0476045",
      positionId: "1",
      holdings: [
        {
          custodyAccount: "0x0000000000000000000000000000000000000005",
          quantity: "1000000",
        },
      ],
      aggregateQuantity: "1000000",
      markMethod: "cross",
      filled: "1000000",
      unfilled: "0",
      unfilledMaximumPayout: "0",
      grossMark: "500000",
      venueExitCost: "25000",
      mark: "475000",
      maximumPayout: "1000000",
      materialityReference: "1000000",
      materialityBps: "0",
      observationHashes: [],
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
            reads: [
              {
                id: "cash-balance",
                role: "cash-balance",
                contract: componentRecord.accountingAsset.address,
                callData: "0x",
                returnData: "0x",
                decoded: "0",
                unit: componentRecord.accountingAsset.unit,
              },
            ],
          },
        ],
        venueState: { profile: "venue/polymarket/1", positions: [], books: [], responses: [] },
        capture: {
          startedAtMs: "1787328000000",
          endedAtMs: "1787328000001",
          maxSkewMs: "1",
          maxVenueResponseLagMs: "5000",
          maxCaptureAgeMs: "300000",
          validUntil: "1787328300",
        },
      },
      outputs: {
        perPosition: [position],
        cashLines: [
          {
            id: "settlement-buffer",
            amount: "0",
            unit: componentRecord.accountingAsset.unit,
            evidenceReadIds: ["cash-balance"],
          },
        ],
        overlayLines: [],
        liabilityLines: [],
        exclusionLines: [],
        aggregateUnfilledMaximumPayout: "0",
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
        signature: `0x${"0".repeat(130)}`,
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
    const { grossMark: __grossMark, ...positionWithoutGrossMark } = position;
    expect(
      validate({
        ...envelope,
        record: { ...record, outputs: { ...record.outputs, perPosition: [positionWithoutGrossMark] } },
      }),
    ).toBe(false);

    const { positionContract: __, ...positionWithoutAssetContract } = position;
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          outputs: { ...record.outputs, perPosition: [positionWithoutAssetContract] },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          inputs: {
            ...record.inputs,
            chainState: [{
              ...record.inputs.chainState[0],
              reads: [{ ...record.inputs.chainState[0].reads[0], unit: "" }],
            }],
          },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          inputs: {
            ...record.inputs,
            capture: { ...record.inputs.capture, validUntil: "18446744073709551616" },
          },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          method: { ...record.method, parameters: { unsafeNumber: 1 } },
        },
      }),
    ).toBe(false);
  });

  test("requires closed settlement-receipt accounting evidence", () => {
    const archiveHash = `0x${"1".repeat(64)}`;
    const valuationRecord = `0x${"2".repeat(64)}`;
    const record = {
      schema: "pmvs/settlement-receipt",
      schemaVersion: "1",
      subject: componentRecord.subject,
      components: componentRecord.components,
      context: {
        stream: "subject",
        kind: "receipt",
        sequence: "2",
        prev: ZERO_HASH,
        producedAt: "1787328100",
        epoch: "1",
      },
      action: {
        type: "normal-roll",
        recordKind: "settlement-archive",
        recordHash: archiveHash,
      },
      transaction: {
        hash: ZERO_HASH,
        blockNumber: "1",
        blockHash: ZERO_HASH,
        transactionIndex: "0",
        events: [],
      },
      observed: {
        priceAttempt: "1",
        valuationRecord,
        grossPps: "1000000",
        validUntil: "1787328300",
        executionTimestamp: "1787328100",
        ppsFinal: "1000000",
        feeSharesMinted: "0",
        finalFeeAssets: "0",
        sourceAssets: "1000000",
        encumberedBefore: "250000",
        freeBefore: "750000",
        totalSupplyBefore: "1000000000000000000",
        totalSupplyAfter: "1000000000000000000",
        reserveBuckets: [
          {
            id: "withdrawal-claim-reserve",
            asset: componentRecord.accountingAsset.address,
            before: "10",
            after: "9",
          },
        ],
        fundingSources: [
          {
            account: "0x0000000000000000000000000000000000000005",
            assetBalanceBefore: "1000000",
            encumberedBefore: "250000",
            freeBefore: "750000",
          },
        ],
        assetBalances: [
          {
            account: "0x0000000000000000000000000000000000000005",
            asset: componentRecord.accountingAsset.address,
            before: "1000000",
            after: "999999",
          },
        ],
      },
      retirement: { triggered: false, reason: null },
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
        signature: `0x${"0".repeat(130)}`,
      },
      locations: ["ar://illustrative-receipt"],
    };
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(envelopeSchema);
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);

    const { validUntil: _, ...withoutValidUntil } = record.observed;
    expect(validate({ ...envelope, record: { ...record, observed: withoutValidUntil } })).toBe(false);
    const { priceAttempt: _priceAttempt, ...withoutPriceAttempt } = record.observed;
    expect(validate({ ...envelope, record: { ...record, observed: withoutPriceAttempt } })).toBe(false);
    expect(
      validate({ ...envelope, record: { ...record, observed: { ...record.observed, priceAttempt: "0" } } }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          observed: { ...record.observed, priceAttempt: "18446744073709551616" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          observed: {
            ...record.observed,
            reserveBuckets: [{ ...record.observed.reserveBuckets[0], before: 10 }],
          },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          observed: { ...record.observed, executionTimestamp: "18446744073709551616" },
        },
      }),
    ).toBe(false);
    const { action: _action, ...withoutAction } = record;
    expect(validate({ ...envelope, record: withoutAction })).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...withoutAction,
          archiveHash,
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          action: { ...record.action, recordKind: "winddown-opened" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          context: { ...record.context, epoch: "0" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, action: { ...record.action, recordHash: ZERO_HASH } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, observed: { ...record.observed, valuationRecord: ZERO_HASH } },
      }),
    ).toBe(false);

    const zeroNavRecord = {
      ...record,
      action: {
        type: "zero-nav",
        recordKind: "winddown-opened",
        recordHash: `0x${"3".repeat(64)}`,
      },
      observed: {
        ...record.observed,
        grossPps: "0",
        ppsFinal: "0",
        feeSharesMinted: "0",
        finalFeeAssets: "0",
      },
    };
    expect(validate({ ...envelope, record: zeroNavRecord }), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...envelope,
        record: { ...zeroNavRecord, action: { ...zeroNavRecord.action, recordKind: "settlement-archive" } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...zeroNavRecord,
          observed: { ...zeroNavRecord.observed, grossPps: "1" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...zeroNavRecord,
          observed: { ...zeroNavRecord.observed, ppsFinal: "1" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...zeroNavRecord,
          observed: { ...zeroNavRecord.observed, feeSharesMinted: "1" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...zeroNavRecord,
          observed: { ...zeroNavRecord.observed, finalFeeAssets: "1" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...zeroNavRecord,
          retirement: { triggered: true, reason: "zero-nav" },
        },
      }),
    ).toBe(false);
  });

  test("requires a complete zero-price tuple and positive epoch on a winddown-opened action record", () => {
    const record = {
      schema: "pmvs/winddown-opened",
      schemaVersion: "1",
      subject: componentRecord.subject,
      components: componentRecord.components,
      context: {
        stream: "subject",
        kind: "winddown-opened",
        sequence: "2",
        prev: ZERO_HASH,
        producedAt: "1787328100",
        epoch: "1",
      },
      priceAttempt: "1",
      grossPps: "0",
      valuationRecord: `0x${"5".repeat(64)}`,
      validUntil: "1787328300",
      reason: "authenticated zero NAV",
      openedAt: "1787328100",
      gates: {},
      openPositionsPlan: "Preserve positions while recovery is assessed.",
      pendingRequestsPlan: "Keep requests pending and allow cancellation.",
      reversalRule: null,
      supersedesUnexecuted: null,
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
        signature: `0x${"0".repeat(130)}`,
      },
      locations: ["ar://illustrative-winddown"],
    };
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(envelopeSchema);
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...envelope,
        record: { ...record, supersedesUnexecuted: `0x${"4".repeat(64)}` },
      }),
      JSON.stringify(validate.errors),
    ).toBe(true);
    const { supersedesUnexecuted: _supersedes, ...withoutSupersedesUnexecuted } = record;
    expect(validate({ ...envelope, record: withoutSupersedesUnexecuted })).toBe(false);
    expect(validate({ ...envelope, record: { ...record, supersedesUnexecuted: "0x01" } })).toBe(false);
    expect(validate({ ...envelope, record: { ...record, supersedesUnexecuted: ZERO_HASH } })).toBe(false);
    const { priceAttempt: _priceAttempt, ...withoutPriceAttempt } = record;
    expect(validate({ ...envelope, record: withoutPriceAttempt })).toBe(false);
    expect(validate({ ...envelope, record: { ...record, priceAttempt: "0" } })).toBe(false);
    expect(
      validate({ ...envelope, record: { ...record, priceAttempt: "18446744073709551616" } }),
    ).toBe(false);
    const { grossPps: _grossPps, ...withoutGrossPps } = record;
    expect(validate({ ...envelope, record: withoutGrossPps })).toBe(false);
    expect(validate({ ...envelope, record: { ...record, grossPps: "1" } })).toBe(false);
    const { valuationRecord: _valuationRecord, ...withoutValuationRecord } = record;
    expect(validate({ ...envelope, record: withoutValuationRecord })).toBe(false);
    expect(validate({ ...envelope, record: { ...record, valuationRecord: ZERO_HASH } })).toBe(false);
    const { validUntil: _validUntil, ...withoutValidUntil } = record;
    expect(validate({ ...envelope, record: withoutValidUntil })).toBe(false);
    expect(validate({ ...envelope, record: { ...record, validUntil: "0" } })).toBe(false);
    expect(
      validate({ ...envelope, record: { ...record, validUntil: "18446744073709551616" } }),
    ).toBe(false);
    const { epoch: _, ...withoutEpoch } = record.context;
    expect(validate({ ...envelope, record: { ...record, context: withoutEpoch } })).toBe(false);
    expect(
      validate({ ...envelope, record: { ...record, context: { ...record.context, epoch: "0" } } }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, context: { ...record.context, epoch: "18446744073709551616" } },
      }),
    ).toBe(false);
  });

  test("rejects context.epoch on a subject-only retirement-final record", () => {
    const record = {
      schema: "pmvs/retirement-final",
      schemaVersion: "1",
      subject: componentRecord.subject,
      components: componentRecord.components,
      context: {
        stream: "subject",
        kind: "retirement-final",
        sequence: "2",
        prev: ZERO_HASH,
        producedAt: "1787328100",
      },
      scope: "subject",
      reason: "governance-closure",
      lastArchiveHash: ZERO_HASH,
      finalSupply: "0",
      pendingRequests: "0",
      outstandingClaims: "0",
      claimFunding: "0",
      residualPositions: [],
      residualCash: [],
      feeAccruals: [],
      liabilities: [],
      recovery: { status: "none", rightsCount: "0", manifestHash: null },
      migration: null,
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
        signature: `0x${"0".repeat(130)}`,
      },
      locations: ["ar://illustrative-retirement"],
    };
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(envelopeSchema);
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({
      ...envelope,
      record: { ...record, context: { ...record.context, epoch: "1" } },
    })).toBe(false);
  });

  test("binds claim deadlines to the settlement request-liveness profile", () => {
    const settlement = {
      settlementProfile: "settlement/epoch-merkle/1",
      settlementVersion: "1",
      priceAttempt: "1",
      grossPps: "1000000",
      ppsFinal: "1000000",
      highWaterMark: "1000000",
      feeRate: "0",
      validUntil: "1787328300",
      valuationRecord: `0x${"5".repeat(64)}`,
      merkleProfile: "pmvs-merkle/1",
      requestLiveness: "operator-dependent",
      claimDeadline: null,
    };
    const record = {
      schema: "pmvs/settlement-archive",
      schemaVersion: "1",
      subject: componentRecord.subject,
      components: componentRecord.components,
      context: {
        stream: "subject",
        kind: "settlement-archive",
        sequence: "1",
        prev: ZERO_HASH,
        producedAt: "1787328000",
        epoch: "1",
      },
      settlement,
      deposit: { requestIds: [], root: ZERO_HASH, totalAssets: "0", totalShares: "0", claims: [] },
      withdraw: { requestIds: [], root: ZERO_HASH, totalShares: "0", totalAssets: "0", claims: [] },
      excluded: [],
      supersedesUnexecuted: null,
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
        signature: `0x${"0".repeat(130)}`,
      },
      locations: ["ar://illustrative-settlement"],
    };
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(envelopeSchema);
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...envelope, record: { ...record, winddownPin: null } })).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          schema: "pmvs/retirement-pin",
          schemaVersion: "1",
          subject: componentRecord.subject,
          components: componentRecord.components,
          context: {
            stream: "subject",
            kind: "retirement-pin",
            sequence: "2",
            prev: ZERO_HASH,
            producedAt: "1787328100",
          },
          grossPps: "1000000",
          netPps: "1000000",
          highWaterMark: "1000000",
          feeRate: "0",
          firstEpoch: "1",
          reserveAssets: "0",
          residualReserveAssets: "0",
          residualPolicy: "legacy illustrative pin",
          extensions: [],
          meta: {},
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, settlement: { ...settlement, requestLiveness: "bounded", claimDeadline: "1787414400" } },
      }),
    ).toBe(true);
    expect(
      validate({
        ...envelope,
        record: { ...record, settlement: { ...settlement, requestLiveness: "bounded", claimDeadline: null } },
      }),
    ).toBe(false);
    expect(
      validate({ ...envelope, record: { ...record, settlement: { ...settlement, claimDeadline: "1787414400" } } }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, settlement: { ...settlement, validUntil: "0" } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, settlement: { ...settlement, feeRate: WAD.toString() } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, settlement: { ...settlement, grossPps: "0" } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, settlement: { ...settlement, ppsFinal: "0" } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, settlement: { ...settlement, valuationRecord: ZERO_HASH } },
      }),
    ).toBe(false);
    expect(
      validate({ ...envelope, record: { ...record, supersedesUnexecuted: ZERO_HASH } }),
    ).toBe(false);
    const { priceAttempt: _priceAttempt, ...withoutPriceAttempt } = settlement;
    expect(validate({ ...envelope, record: { ...record, settlement: withoutPriceAttempt } })).toBe(false);
    expect(
      validate({ ...envelope, record: { ...record, settlement: { ...settlement, priceAttempt: "0" } } }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          settlement: { ...settlement, priceAttempt: "18446744073709551616" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          settlement: { ...settlement, requestLiveness: "bounded", claimDeadline: "0" },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, deposit: { ...record.deposit, requestIds: ["1", "1"] } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: { ...record, deposit: { ...record.deposit, requestIds: ["0"] } },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          withdraw: {
            ...record.withdraw,
            claims: [{
              requestId: "1",
              owner: owners[0],
              queuedEpoch: "1",
              settlementEpoch: "1",
              queuedShares: "1",
              assets: "1",
              dustFloorApplied: true,
              leafIndex: "0",
              proof: [],
            }],
          },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...envelope,
        record: {
          ...record,
          withdraw: {
            ...record.withdraw,
            claims: [{
              requestId: "1",
              owner: owners[0],
              queuedEpoch: "1",
              settlementEpoch: "1",
              queuedShares: "1",
              assets: "1",
              dustFloorApplied: false,
              leafIndex: "0",
              proof: Array(257).fill(ZERO_HASH),
            }],
          },
        },
      }),
    ).toBe(false);
    const { validUntil: _, ...withoutValidUntil } = settlement;
    expect(validate({ ...envelope, record: { ...record, settlement: withoutValidUntil } })).toBe(false);
  });
});

describe("Gnosis CTF position profile", () => {
  test("matches the published condition, collection, position, and payout vector", () => {
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(ctfPositionSchema);
    expect(validate(ctfPositionRecord), JSON.stringify(validate.errors)).toBe(true);
    expect(() => assertCtfPositionRecord(ctfPositionRecord)).not.toThrow();

    expect(
      ctfConditionId(
        ctfPositionRecord.oracle as `0x${string}`,
        ctfPositionRecord.questionId as `0x${string}`,
        BigInt(ctfPositionRecord.outcomeSlotCount),
      ),
    ).toBe(ctfPositionRecord.conditionId as Hex);
    expect(
      ctfCollectionId(
        ctfPositionRecord.parentCollectionId as `0x${string}`,
        ctfPositionRecord.conditionId as `0x${string}`,
        BigInt(ctfPositionRecord.indexSet),
      ),
    ).toBe(ctfPositionRecord.collectionId as Hex);
    expect(
      ctfCollectionId(
        ctfPositionRecord.collectionId as `0x${string}`,
        ctfPositionRecord.conditionId as `0x${string}`,
        1n,
      ),
    ).toBe("0x14aead8433171c75d34c2304b901d3a4090bf1a7f0792ff3986bca09a56dd969");
    expect(
      ctfPositionId(
        ctfPositionRecord.collateralToken as `0x${string}`,
        ctfPositionRecord.collectionId as `0x${string}`,
      ),
    ).toBe(BigInt(ctfPositionRecord.positionId));
    expect(
      ctfRedemptionPayout(
        BigInt(ctfPositionRecord.quantity),
        BigInt(ctfPositionRecord.indexSet),
        [0n, 1n, 0n],
        1n,
      ),
    ).toBe(1_000_000n);

    const maxSlotPayouts = Array<bigint>(256).fill(0n);
    maxSlotPayouts[255] = 1n;
    expect(ctfRedemptionPayout(7n, 1n << 255n, maxSlotPayouts, 1n)).toBe(7n);
  });

  test("rejects malformed profile fields and invalid payout inputs", () => {
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(ctfPositionSchema);
    for (const outcomeSlotCount of ["1", "03", "257"]) {
      expect(validate({ ...ctfPositionRecord, outcomeSlotCount })).toBe(false);
    }
    expect(validate({ ...ctfPositionRecord, quantity: "0" })).toBe(false);
    expect(() => assertCtfPositionRecord({ ...ctfPositionRecord, outcomeSlotCount: "2", indexSet: "3" })).toThrow();
    expect(() => assertCtfPositionRecord({ ...ctfPositionRecord, outcomeSlotCount: "2", indexSet: "4" })).toThrow();
    expect(() => assertCtfPositionRecord({
      ...ctfPositionRecord,
      chainId: (1n << 256n).toString(),
    })).toThrow();
    expect(() => assertCtfPositionRecord({ ...ctfPositionRecord, conditionId: ZERO_HASH })).toThrow();
    expect(() => assertCtfPositionRecord({ ...ctfPositionRecord, collectionId: ZERO_HASH })).toThrow();
    expect(() => assertCtfPositionRecord({ ...ctfPositionRecord, positionId: "0" })).toThrow();
    expect(() => assertCtfPositionRecord({
      ...ctfPositionRecord,
      custodyAccount: "0x0000000000000000000000000000000000000000",
    })).toThrow();
    expect(
      validate({
        ...ctfPositionRecord,
        custodyAccount: "0x0000000000000000000000000000000000000000",
      }),
    ).toBe(false);
    expect(validate({ ...ctfPositionRecord, undeclared: "field" })).toBe(false);
    expect(() =>
      ctfConditionId(
        ctfPositionRecord.oracle as `0x${string}`,
        ctfPositionRecord.questionId as `0x${string}`,
        1n,
      ),
    ).toThrow();
    expect(() => ctfRedemptionPayout(1n, 0n, [0n, 1n], 1n)).toThrow();
    expect(() => ctfRedemptionPayout(1n, 3n, [0n, 1n], 1n)).toThrow();
    expect(() => ctfRedemptionPayout(1n, 1n, [0n, 1n], 2n)).toThrow();
    expect(() => ctfRedemptionPayout((1n << 256n) - 1n, 1n, [2n, 0n], 2n)).toThrow();
    expect(() =>
      ctfConditionId(
        "0x00000000000000000000000000000000000000A1" as `0x${string}`,
        ctfPositionRecord.questionId as `0x${string}`,
        3n,
      ),
    ).toThrow();
    expect(() =>
      ctfCollectionId(
        ctfPositionRecord.parentCollectionId as `0x${string}`,
        ctfPositionRecord.conditionId as `0x${string}`,
        0n,
      ),
    ).toThrow();
    expect(() =>
      ctfCollectionId(
        "0x01" as `0x${string}`,
        ctfPositionRecord.conditionId as `0x${string}`,
        BigInt(ctfPositionRecord.indexSet),
      ),
    ).toThrow();
  });
});

describe("component activation commitments", () => {
  const shareToken = "0x4aff8269a587643f68aa8e58c5ad93d9423e8624" as const;
  const oldAnchor = "0x0000000000000000000000000000000000000001" as const;
  const settlement = "0x0000000000000000000000000000000000000002" as const;
  const newAnchor = "0x0000000000000000000000000000000000000003" as const;
  const activeHash = `0x${"33".repeat(32)}` as const;
  const streamPrev = `0x${"22".repeat(32)}` as const;
  const returnHash = `0x${"11".repeat(32)}` as const;
  const checks = [{
    id: "settlement-paused",
    target: settlement,
    callData: "0x12345678" as const,
    expectedReturnDataHash: returnHash,
  }];
  const migration = { mode: "same-anchor" };
  const activationInput = {
    chainId: 137n,
    shareToken,
    subjectId: subjectId(137n, shareToken),
    streamSequence: 4n,
    streamPrev,
    nonce: 2n,
    expectedActive: { recordHash: activeHash, generation: 0n, anchor: oldAnchor },
    newGeneration: 1n,
    newAnchor: oldAnchor,
    validFromBlock: 10n,
    validThroughBlock: 20n,
    migration,
    checks,
  };

  test("freezes the type hashes and non-circular commitment vectors", () => {
    expect(PMVS_ACTIVATION_CONDITION_TYPEHASH).toBe(
      "0xf4efdc987c7a892232dc714e8dbdb048305d54d3f2b907ca3c92ec826d1847b5",
    );
    expect(PMVS_COMPONENT_ACTIVATION_TYPEHASH).toBe(
      "0x563f159cebc787ed3f208d852ac1b05e8d669fdf8e03cdfcaa9abb3ba8cf4dce",
    );
    expect(PMVS_COMPONENTS_UPDATED_EVENT_TOPIC).toBe(
      "0x59aea3a41f3d49292c360c978eec343e43c6fd1b81850fc5a64abab4c5b72b5d",
    );
    expect(PMVS_RECORD_ANCHORED_EVENT_TOPIC).toBe(
      "0x2bc1fcf7c7f5907d51622e4599ff7a71931862b13293a137ec5ce7e1133033ce",
    );
    expect(PMVS_ANCHOR_MIGRATED_EVENT_TOPIC).toBe(
      "0x848c56a330b809071e57a84b2ee99edce23aa8e8b0120338fda2947c1e281a4a",
    );
    expect(componentActivationChecksHash(checks)).toBe(
      "0xd2fc7f12fd8de5c06d28a3affe1dd9d54529b95210fab89136db1670f5850d30",
    );
    expect(componentMigrationHash(migration)).toBe(
      "0x86d0987a15890e51bce9830d9addccbdfc665c011e5593f46247de7523b53103",
    );
    expect(componentActivationCommitment(activationInput)).toBe(
      "0xaa7f7d29c88a4a364c4d096f30d7810bea2c16a83c44ff87dfcc9354ac85f912",
    );
    expect(componentMigrationHash(null)).toBe(ZERO_HASH);
  });

  test("rejects stale, malformed, or replayable activation intents", () => {
    expect(() => componentActivationCommitment({
      ...activationInput,
      validFromBlock: 21n,
    })).toThrow("window is reversed");
    expect(() => componentActivationCommitment({
      ...activationInput,
      checks: [checks[0], checks[0]],
    })).toThrow("strictly increasing keys");
    expect(() => componentActivationCommitment({
      ...activationInput,
      newGeneration: 2n,
    })).toThrow("increase by one");
    expect(() => componentActivationCommitment({
      ...activationInput,
      migration: null,
    })).toThrow("requires migration data");
    expect(() => componentActivationCommitment({
      ...activationInput,
      expectedActive: null,
    })).toThrow("sequence zero");
    expect(() => componentActivationCommitment({
      ...activationInput,
      subjectId: ZERO_HASH,
    })).toThrow("does not match chain and share token");
  });

  test("binds canonical post-action receipt evidence and exact-next nonce", () => {
    const recordHashValue = `0x${"44".repeat(32)}` as const;
    const actionCommitment = componentActivationCommitment(activationInput);
    const receipt: PMVSComponentActivationReceiptEvidence = {
      transactionHash: `0x${"55".repeat(32)}`,
      receiptBlockHash: `0x${"66".repeat(32)}`,
      canonicalBlockHash: `0x${"66".repeat(32)}`,
      receiptBlockNumber: 100n,
      receiptTransactionIndex: 1n,
      currentBlockNumber: 105n,
      status: "success",
      removed: false,
      anchorTransactionHash: `0x${"77".repeat(32)}`,
      anchorReceiptBlockHash: `0x${"88".repeat(32)}`,
      canonicalAnchorBlockHash: `0x${"88".repeat(32)}`,
      anchorReceiptBlockNumber: 99n,
      anchorReceiptTransactionIndex: 2n,
      anchorStatus: "success",
      anchorRemoved: false,
      anchorPosition: { blockNumber: 99n, transactionIndex: 2n, logIndex: 3n },
      activationPosition: { blockNumber: 100n, transactionIndex: 1n, logIndex: 4n },
      anchorEventCount: 1n,
      anchorEvent: {
        emitter: oldAnchor,
        topic0: PMVS_RECORD_ANCHORED_EVENT_TOPIC,
        subjectId: activationInput.subjectId,
        streamId: ZERO_HASH,
        sequence: 4n,
        kind: 4,
        recordHash: recordHashValue,
      },
      componentsUpdatedEventCount: 1n,
      emitter: shareToken,
      topic0: PMVS_COMPONENTS_UPDATED_EVENT_TOPIC,
      recordHash: recordHashValue,
      generation: 1n,
      anchor: oldAnchor,
      nonce: 2n,
      actionCommitment,
      priorActivationNonce: 1n,
      preState: {
        recordHash: activeHash,
        generation: 0n,
        anchor: oldAnchor,
        nonce: 1n,
      },
      anchorHead: { sequence: 4n, kind: 4, recordHash: recordHashValue },
      postState: {
        recordHash: recordHashValue,
        generation: 1n,
        anchor: oldAnchor,
        nonce: 2n,
      },
      governanceAuthorized: true,
      conditionsPassed: true,
      noOrdinaryCoveredAction: true,
      anchorTransition: null,
    };
    const expected = {
      subjectId: activationInput.subjectId,
      shareToken,
      recordHash: recordHashValue,
      sequence: 4n,
      generation: 1n,
      anchor: oldAnchor,
      nonce: 2n,
      actionCommitment,
      expectedActive: activationInput.expectedActive,
      continuingWatcherHeads: [] as readonly PMVSAnchorTransitionHead[],
      validFromBlock: 10n,
      validThroughBlock: 100n,
      confirmationDepth: 6n,
      receipt,
    };
    expect(() => assertComponentActivationReceipt(expected)).not.toThrow();

    const failures: Array<[string, (candidate: PMVSComponentActivationReceiptEvidence) => void]> = [
      ["reverted receipt", (candidate) => { candidate.status = "reverted"; }],
      ["orphaned block", (candidate) => { candidate.canonicalBlockHash = ZERO_HASH; }],
      ["zero transaction hash", (candidate) => { candidate.transactionHash = ZERO_HASH; }],
      ["orphaned anchor", (candidate) => { candidate.canonicalAnchorBlockHash = ZERO_HASH; }],
      ["removed anchor", (candidate) => { candidate.anchorRemoved = true; }],
      ["event outside receipt", (candidate) => { candidate.receiptTransactionIndex = 2n; }],
      ["anchor event outside receipt", (candidate) => { candidate.anchorReceiptTransactionIndex = 1n; }],
      ["conflicting canonical block at one height", (candidate) => {
        candidate.anchorReceiptBlockNumber = 100n;
        candidate.anchorReceiptTransactionIndex = 0n;
        candidate.anchorPosition = { blockNumber: 100n, transactionIndex: 0n, logIndex: 3n };
      }],
      ["conflicting transaction at one position", (candidate) => {
        candidate.anchorReceiptBlockNumber = 100n;
        candidate.anchorReceiptBlockHash = candidate.receiptBlockHash;
        candidate.canonicalAnchorBlockHash = candidate.canonicalBlockHash;
        candidate.anchorReceiptTransactionIndex = 1n;
        candidate.anchorPosition = { blockNumber: 100n, transactionIndex: 1n, logIndex: 3n };
      }],
      ["wrong anchor event", (candidate) => { candidate.anchorEvent.recordHash = activeHash; }],
      ["activation before anchor", (candidate) => {
        candidate.anchorPosition = { blockNumber: 101n, transactionIndex: 0n, logIndex: 0n };
      }],
      ["duplicate event", (candidate) => { candidate.componentsUpdatedEventCount = 2n; }],
      ["wrong emitter", (candidate) => { candidate.emitter = settlement; }],
      ["wrong topic", (candidate) => { candidate.topic0 = ZERO_HASH; }],
      ["wrong record", (candidate) => { candidate.recordHash = activeHash; }],
      ["replayed nonce", (candidate) => { candidate.priorActivationNonce = 2n; }],
      ["wrong pre-state", (candidate) => { candidate.preState.recordHash = recordHashValue; }],
      ["wrong anchor head", (candidate) => { candidate.anchorHead = null; }],
      ["wrong post-state", (candidate) => { candidate.postState.generation = 2n; }],
      ["unauthorized", (candidate) => { candidate.governanceAuthorized = false; }],
      ["failed condition", (candidate) => { candidate.conditionsPassed = false; }],
      ["covered action", (candidate) => { candidate.noOrdinaryCoveredAction = false; }],
    ];
    for (const [_name, mutate] of failures) {
      const candidate = structuredClone(receipt);
      mutate(candidate);
      expect(() => assertComponentActivationReceipt({ ...expected, receipt: candidate })).toThrow();
    }
    expect(() => assertComponentActivationReceipt({
      ...expected,
      confirmationDepth: 7n,
    })).toThrow("not sufficiently confirmed");
    expect(() => assertComponentActivationReceipt({
      ...expected,
      validThroughBlock: 99n,
    })).toThrow("outside the committed window");
    expect(() => assertComponentActivationReceipt({
      ...expected,
      validFromBlock: 101n,
      validThroughBlock: 200n,
    })).toThrow("outside the committed window");
    expect(() => assertComponentActivationReceipt({
      ...expected,
      validFromBlock: 100n,
      validThroughBlock: 100n,
    })).not.toThrow();

    const genesisReceipt = structuredClone(receipt);
    genesisReceipt.generation = 0n;
    genesisReceipt.nonce = 1n;
    genesisReceipt.priorActivationNonce = 0n;
    genesisReceipt.preState = {
      recordHash: ZERO_HASH,
      generation: 0n,
      anchor: "0x0000000000000000000000000000000000000000",
      nonce: 0n,
    };
    genesisReceipt.anchorEvent.sequence = 0n;
    genesisReceipt.anchorHead = { sequence: 0n, kind: 4, recordHash: recordHashValue };
    genesisReceipt.postState = {
      recordHash: recordHashValue,
      generation: 0n,
      anchor: oldAnchor,
      nonce: 1n,
    };
    const genesisExpected = {
      ...expected,
      sequence: 0n,
      generation: 0n,
      nonce: 1n,
      expectedActive: null,
      receipt: genesisReceipt,
    };
    expect(() => assertComponentActivationReceipt(genesisExpected)).not.toThrow();
    genesisReceipt.preState.recordHash = activeHash;
    expect(() => assertComponentActivationReceipt(genesisExpected)).toThrow(
      "genesis requires empty discovery pre-state",
    );
  });

  test("requires one atomic and complete old-to-new anchor transition", () => {
    const recordHashValue = `0x${"44".repeat(32)}` as const;
    const watcherHead: PMVSAnchorTransitionHead = {
      streamId: `0x${"aa".repeat(32)}`,
      sequence: 7n,
      kind: 10,
      recordHash: `0x${"bb".repeat(32)}`,
    };
    const subjectHead: PMVSAnchorTransitionHead = {
      streamId: ZERO_HASH,
      sequence: 4n,
      kind: 4,
      recordHash: recordHashValue,
    };
    const expectedHeads = [subjectHead, watcherHead] as const;
    const actionCommitment = componentActivationCommitment({
      ...activationInput,
      newAnchor,
    });
    const transactionHash = `0x${"55".repeat(32)}` as const;
    const blockHash = `0x${"66".repeat(32)}` as const;
    const migratedEvents = expectedHeads.map((head, index) => ({
      ...head,
      subjectId: activationInput.subjectId,
      oldAnchor,
      emitter: newAnchor,
      topic0: PMVS_ANCHOR_MIGRATED_EVENT_TOPIC,
      transactionHash,
      position: { blockNumber: 100n, transactionIndex: 1n, logIndex: BigInt(index + 1) },
    }));
    const receipt: PMVSComponentActivationReceiptEvidence = {
      transactionHash,
      receiptBlockHash: blockHash,
      canonicalBlockHash: blockHash,
      receiptBlockNumber: 100n,
      receiptTransactionIndex: 1n,
      currentBlockNumber: 105n,
      status: "success",
      removed: false,
      anchorTransactionHash: `0x${"77".repeat(32)}`,
      anchorReceiptBlockHash: `0x${"88".repeat(32)}`,
      canonicalAnchorBlockHash: `0x${"88".repeat(32)}`,
      anchorReceiptBlockNumber: 99n,
      anchorReceiptTransactionIndex: 2n,
      anchorStatus: "success",
      anchorRemoved: false,
      anchorPosition: { blockNumber: 99n, transactionIndex: 2n, logIndex: 3n },
      activationPosition: { blockNumber: 100n, transactionIndex: 1n, logIndex: 4n },
      anchorEventCount: 1n,
      anchorEvent: {
        emitter: oldAnchor,
        topic0: PMVS_RECORD_ANCHORED_EVENT_TOPIC,
        subjectId: activationInput.subjectId,
        streamId: ZERO_HASH,
        sequence: 4n,
        kind: 4,
        recordHash: recordHashValue,
      },
      componentsUpdatedEventCount: 1n,
      emitter: shareToken,
      topic0: PMVS_COMPONENTS_UPDATED_EVENT_TOPIC,
      recordHash: recordHashValue,
      generation: 1n,
      anchor: newAnchor,
      nonce: 2n,
      actionCommitment,
      priorActivationNonce: 1n,
      preState: {
        recordHash: activeHash,
        generation: 0n,
        anchor: oldAnchor,
        nonce: 1n,
      },
      anchorHead: { sequence: 4n, kind: 4, recordHash: recordHashValue },
      postState: {
        recordHash: recordHashValue,
        generation: 1n,
        anchor: newAnchor,
        nonce: 2n,
      },
      governanceAuthorized: true,
      conditionsPassed: true,
      noOrdinaryCoveredAction: true,
      anchorTransition: {
        oldAnchor,
        newAnchor,
        transactionHash,
        blockHash,
        blockNumber: 100n,
        transactionIndex: 1n,
        frozenOldHeads: structuredClone(expectedHeads),
        importedNewHeads: structuredClone(expectedHeads),
        postImportHeads: structuredClone(expectedHeads),
        migratedEvents,
      },
    };
    const expected = {
      subjectId: activationInput.subjectId,
      shareToken,
      recordHash: recordHashValue,
      sequence: 4n,
      generation: 1n,
      anchor: newAnchor,
      nonce: 2n,
      actionCommitment,
      expectedActive: activationInput.expectedActive,
      continuingWatcherHeads: [watcherHead],
      validFromBlock: 10n,
      validThroughBlock: 100n,
      confirmationDepth: 6n,
      receipt,
    };
    expect(() => assertComponentActivationReceipt(expected)).not.toThrow();

    const mutations: Array<(candidate: PMVSComponentActivationReceiptEvidence) => void> = [
      (candidate) => { candidate.anchorTransition!.frozenOldHeads = [subjectHead]; },
      (candidate) => { candidate.anchorTransition!.importedNewHeads[1].recordHash = activeHash; },
      (candidate) => { candidate.anchorTransition!.postImportHeads = [subjectHead]; },
      (candidate) => { candidate.anchorTransition!.migratedEvents = [migratedEvents[0]]; },
      (candidate) => { candidate.anchorTransition!.migratedEvents[1].transactionHash = activeHash; },
      (candidate) => { candidate.anchorTransition!.oldAnchor = newAnchor; },
      (candidate) => { candidate.anchorTransition!.transactionHash = activeHash; },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(receipt);
      mutate(candidate);
      expect(() => assertComponentActivationReceipt({ ...expected, receipt: candidate })).toThrow();
    }
  });
});

describe("identity and attestation", () => {
  test("matches the published anchor, retirement, and discovery selectors", () => {
    expect(PMVS_ANCHOR_SELECTOR).toBe("0x25678da7");
    expect(PMVS_HEAD_SELECTOR).toBe("0x0b804aca");
    expect(PMVS_RETIREMENT_STATE_SELECTOR).toBe("0xa951d032");
    expect(PMVS_SUBJECT_FINALIZED_SELECTOR).toBe("0x2991cbd8");
    expect(PMVS_ANCHOR_INTERFACE_ID).toBe("0x07760cb5");
    expect(PMVS_AUTHORITY_RESOLVER_INTERFACE_ID).toBe("0xcfa1a519");
    expect(PMVS_SUBJECT_ANCHOR_SELECTOR).toBe("0x5847c21e");
    expect(PMVS_SUBJECT_COMPONENTS_SELECTOR).toBe("0xdede8119");
    expect(PMVS_SUBJECT_ACTIVATION_NONCE_SELECTOR).toBe("0xb3d6a144");
    expect(PMVS_SUBJECT_DISCOVERY_INTERFACE_ID).toBe("0x354fe243");
  });

  test("requires every maintained retirement counter to be zero", () => {
    const ready = {
      finalSupply: 0n,
      pendingRequests: 0n,
      outstandingClaims: 0n,
      claimFunding: 0n,
    };
    expect(() => assertRetirementState(ready)).not.toThrow();

    for (const field of [
      "finalSupply",
      "pendingRequests",
      "outstandingClaims",
      "claimFunding",
    ] as const) {
      expect(() => assertRetirementState({ ...ready, [field]: 1n })).toThrow(
        "must be zero for retirement",
      );
      expect(() => assertRetirementState({ ...ready, [field]: -1n })).toThrow(
        "is out of range",
      );
    }
  });

  test("matches the subject id vector", () => {
    expect(subjectId(137n, "0x4aff8269a587643f68aa8e58c5ad93d9423e8624")).toBe(
      "0x119eba4ba90359458811e719965925e255c3537b907914b6428f775c8d297892",
    );
    expect(() =>
      subjectId(137n, "0x4Aff8269a587643f68aa8e58c5ad93d9423e8624" as `0x${string}`),
    ).toThrow();
    expect(() => subjectId(137n, "0x0000000000000000000000000000000000000000")).toThrow();
  });

  test("derives and enforces the watcher stream from its canonical signer", () => {
    const signer: Address = "0x00000000000000000000000000000000000000c3";
    const otherSigner: Address = "0x00000000000000000000000000000000000000d4";
    const streamId = watcherStreamId(signer);
    expect(streamId).toBe("0xf71b53d325b7c1bf2d5fe03f1a0c39b2c1c70622d6c9210f3473cfefa800c91a");
    const watcherGenesis = {
      streamId,
      watcherSigner: signer,
      kind: 10,
      persistedSubjectFinalized: false,
      sequence: 0n,
      recordPrev: ZERO_HASH,
      previousAnchor: ZERO_HASH,
      recordHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
    };
    expect(() => assertAnchorAdvance(null, watcherGenesis)).not.toThrow();
    const watcherContinuation = {
      ...watcherGenesis,
      sequence: 1n,
      recordPrev: watcherGenesis.recordHash,
      previousAnchor: watcherGenesis.recordHash,
      recordHash: "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex,
    };
    expect(() =>
      assertAnchorAdvance(
        { sequence: 0n, kind: 10, recordHash: watcherGenesis.recordHash },
        watcherContinuation,
      ),
    ).not.toThrow();
    expect(() =>
      assertAnchorAdvance(
        { sequence: 0n, kind: 4, recordHash: watcherGenesis.recordHash },
        watcherContinuation,
      ),
    ).toThrow("stored record kind does not match the stream");
    expect(() => assertAnchorAdvance(null, { ...watcherGenesis, watcherSigner: otherSigner })).toThrow(
      "watcher stream id does not match its signer",
    );
    expect(() =>
      assertAnchorAdvance(null, {
        ...watcherGenesis,
        streamId: "0x9999999999999999999999999999999999999999999999999999999999999999",
      }),
    ).toThrow("watcher stream id does not match its signer");
    expect(() => assertAnchorAdvance(null, { ...watcherGenesis, watcherSigner: null })).toThrow(
      "watcher stream requires its signer",
    );
    expect(() =>
      assertAnchorAdvance(null, {
        ...watcherGenesis,
        watcherSigner: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrow("watcher signer must be nonzero");
    expect(() =>
      assertAnchorAdvance(null, {
        ...watcherGenesis,
        watcherSigner: "0x00000000000000000000000000000000000000C3",
      }),
    ).toThrow("watcher signer must be a lowercase address");
    expect(() =>
      assertAnchorAdvance(null, {
        ...watcherGenesis,
        streamId: ZERO_HASH,
        kind: 4,
      }),
    ).toThrow("subject-stream records cannot declare a watcher signer");
  });

  test("enforces an exact, nonzero anchor-chain advance", () => {
    const hashA: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const hashB: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
    const genesis = {
      streamId: ZERO_HASH,
      watcherSigner: null,
      kind: 4,
      persistedSubjectFinalized: false,
      sequence: 0n,
      recordPrev: ZERO_HASH,
      previousAnchor: ZERO_HASH,
      recordHash: hashA,
    };
    expect(() => assertAnchorAdvance(null, genesis)).not.toThrow();
    expect(() => assertAnchorAdvance(null, { ...genesis, kind: 1 })).toThrow(
      "subject-stream genesis must be a components record",
    );
    expect(() => assertAnchorAdvance(null, { ...genesis, kind: 7 })).toThrow(
      "subject-stream genesis must be a components record",
    );
    expect(() =>
      assertAnchorAdvance(null, {
        ...genesis,
        streamId: "0x9999999999999999999999999999999999999999999999999999999999999999",
        kind: 4,
      }),
    ).toThrow("only watcher records can advance a watcher stream");

    const head = { sequence: 0n, kind: 4, recordHash: hashA };
    const next = { ...genesis, kind: 1, sequence: 1n, recordPrev: hashA, previousAnchor: hashA, recordHash: hashB };
    expect(() => assertAnchorAdvance(head, next)).not.toThrow();
    expect(() => assertAnchorHeadKind(head, 4)).not.toThrow();
    expect(() => assertAnchorHeadKind(head, 2)).toThrow();
    expect(() => assertAnchorAdvance(head, { ...next, sequence: 2n })).toThrow();
    expect(() => assertAnchorAdvance(head, { ...next, recordPrev: ZERO_HASH })).toThrow();
    expect(() => assertAnchorAdvance(head, { ...next, previousAnchor: ZERO_HASH })).toThrow();
    expect(() => assertAnchorAdvance(null, { ...genesis, recordHash: ZERO_HASH })).toThrow();
    expect(() =>
      assertAnchorAdvance(
        { sequence: 0n, kind: 1, recordHash: hashA },
        next,
      ),
    ).toThrow("stored subject-stream genesis must be a components record");
    expect(() =>
      assertAnchorAdvance(
        { sequence: 0n, kind: 10, recordHash: hashA },
        next,
      ),
    ).toThrow("stored record kind does not match the stream");
    expect(() =>
      assertAnchorAdvance(null, {
        ...genesis,
        persistedSubjectFinalized: "false" as never,
      }),
    ).toThrow("persisted subject-finalized state must be a boolean");

    const maxUint64 = (1n << 64n) - 1n;
    const penultimateHead = { sequence: maxUint64 - 1n, kind: 4, recordHash: hashA };
    expect(() =>
      assertAnchorAdvance(penultimateHead, {
        ...next,
        sequence: maxUint64,
        recordPrev: hashA,
        previousAnchor: hashA,
        recordHash: hashB,
      }),
    ).not.toThrow();
    expect(() =>
      assertAnchorAdvance(
        { sequence: maxUint64, kind: 4, recordHash: hashA },
        { ...next, sequence: maxUint64, recordPrev: hashA, previousAnchor: hashA, recordHash: hashB },
      ),
    ).toThrow();
    expect(() => assertAnchorAdvance(head, { ...next, sequence: maxUint64 + 1n })).toThrow();
  });

  test("rejects reserved record kind 6 in attestations and anchor heads", () => {
    const hash = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const validMessage = {
      recordHash: hash,
      kind: 4,
      subjectId: hash,
      streamId: ZERO_HASH,
      sequence: 0n,
      prev: ZERO_HASH,
      previousAnchor: ZERO_HASH,
    } as const;
    expect(() =>
      attestationDigest(
        137n,
        "0x0000000000000000000000000000000000000001",
        { ...validMessage, kind: 6 },
      ),
    ).toThrow("record kind is out of range");
    expect(() => assertAnchorHeadKind({ sequence: 0n, kind: 6, recordHash: hash }, 4)).toThrow(
      "stored record kind is out of range",
    );
    expect(() => assertAnchorHeadKind({ sequence: 0n, kind: 4, recordHash: hash }, 6)).toThrow(
      "expected record kind is out of range",
    );
    expect(() =>
      assertAnchorAdvance(null, {
        streamId: ZERO_HASH,
        watcherSigner: null,
        kind: 6,
        persistedSubjectFinalized: false,
        sequence: 0n,
        recordPrev: ZERO_HASH,
        previousAnchor: ZERO_HASH,
        recordHash: hash,
      }),
    ).toThrow("record kind is out of range");
    expect(() =>
      assertAnchorAdvance(
        { sequence: 0n, kind: 6, recordHash: hash },
        {
          streamId: ZERO_HASH,
          watcherSigner: null,
          kind: 1,
          persistedSubjectFinalized: false,
          sequence: 1n,
          recordPrev: hash,
          previousAnchor: hash,
          recordHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
        },
      ),
    ).toThrow("stored record kind is out of range");
  });

  test("authorizes registry and atomic generic commits by mode and protected kind", () => {
    const caller = "0x00000000000000000000000000000000000000a1";
    const wrapper = "0x00000000000000000000000000000000000000b2";
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    for (const kind of [2, 5]) {
      expect(() =>
        assertAnchorGenericCommit({ mode: "registry", kind, caller, coveredWrapper: null }),
      ).not.toThrow();
    }
    expect(() =>
      assertAnchorGenericCommit({ mode: "registry", kind: 7, caller, coveredWrapper: wrapper }),
    ).toThrow("registry mode cannot commit retirement-final records");

    for (const kind of [2, 5, 7]) {
      expect(() =>
        assertAnchorGenericCommit({ mode: "atomic", kind, caller: wrapper, coveredWrapper: wrapper }),
      ).not.toThrow();
      expect(() =>
        assertAnchorGenericCommit({ mode: "atomic", kind, caller, coveredWrapper: wrapper }),
      ).toThrow("registered covered wrapper");
      expect(() =>
        assertAnchorGenericCommit({ mode: "atomic", kind, caller, coveredWrapper: null }),
      ).toThrow("no registered covered wrapper");
      expect(() =>
        assertAnchorGenericCommit({ mode: "atomic", kind, caller, coveredWrapper: zeroAddress }),
      ).toThrow("covered wrapper must be nonzero");
      expect(() =>
        assertAnchorGenericCommit({
          mode: "atomic",
          kind,
          caller,
          coveredWrapper: "0x00000000000000000000000000000000000000B2",
        }),
      ).toThrow("covered wrapper must be a lowercase address");
    }

    for (const mode of ["registry", "atomic"] as const) {
      for (const kind of [1, 3, 4, 8, 9, 10]) {
        expect(() =>
          assertAnchorGenericCommit({ mode, kind, caller, coveredWrapper: null }),
        ).not.toThrow();
      }
    }
    expect(() =>
      assertAnchorGenericCommit({ mode: "atomic", kind: 6, caller, coveredWrapper: wrapper }),
    ).toThrow("record kind is out of range");
    expect(() =>
      assertAnchorGenericCommit({ mode: "registry", kind: 6, caller, coveredWrapper: null }),
    ).toThrow("record kind is out of range");
    expect(() =>
      assertAnchorGenericCommit({ mode: "atomic", kind: 1, caller: zeroAddress, coveredWrapper: null }),
    ).toThrow("commit caller must be nonzero");
  });

  test("models protected internal commits without opening an external bypass", () => {
    for (const kind of [2, 5, 7]) {
      expect(() => assertAnchorInternalCoveredCommit({ mode: "atomic", kind })).not.toThrow();
      expect(() => assertAnchorInternalCoveredCommit({ mode: "registry", kind })).toThrow(
        "requires atomic mode",
      );
    }
    for (const kind of [1, 3, 4, 8, 9, 10]) {
      expect(() => assertAnchorInternalCoveredCommit({ mode: "atomic", kind })).toThrow(
        "requires a protected record kind",
      );
    }
    expect(() => assertAnchorInternalCoveredCommit({ mode: "atomic", kind: 6 })).toThrow(
      "record kind is out of range",
    );
  });

  test("sets subject-finalized state only in the successful protected retirement transition", () => {
    const caller: Address = "0x00000000000000000000000000000000000000a1";
    const wrapper: Address = "0x00000000000000000000000000000000000000b2";
    const genericRetirement = {
      mode: "atomic",
      path: "generic",
      caller: wrapper,
      coveredWrapper: wrapper,
      streamId: ZERO_HASH,
      kind: 7,
      before: false,
      after: true,
      transactionSucceeded: true,
    } as const;

    expect(() => assertAnchorSubjectFinalizationTransition(genericRetirement)).not.toThrow();
    expect(() =>
      assertAnchorSubjectFinalizationTransition({
        ...genericRetirement,
        path: "internal-covered",
        caller: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertAnchorSubjectFinalizationTransition({ ...genericRetirement, after: false }),
    ).toThrow("must set subject-finalized state");
    expect(() =>
      assertAnchorSubjectFinalizationTransition({ ...genericRetirement, mode: "registry" }),
    ).toThrow("registry mode cannot commit retirement-final records");
    expect(() =>
      assertAnchorSubjectFinalizationTransition({ ...genericRetirement, caller }),
    ).toThrow("registered covered wrapper");
    expect(() =>
      assertAnchorSubjectFinalizationTransition({
        ...genericRetirement,
        streamId: watcherStreamId(caller),
      }),
    ).toThrow("only on the subject stream");
    expect(() =>
      assertAnchorSubjectFinalizationTransition({ ...genericRetirement, kind: 2 }),
    ).toThrow("only a successful protected retirement transition");

    expect(() =>
      assertAnchorSubjectFinalizationTransition({
        ...genericRetirement,
        before: true,
        after: true,
      }),
    ).toThrow("only through a subject-stream correction");
    expect(() =>
      assertAnchorSubjectFinalizationTransition({
        ...genericRetirement,
        kind: 8,
        before: true,
        after: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertAnchorSubjectFinalizationTransition({
        ...genericRetirement,
        kind: 8,
        before: true,
        after: false,
      }),
    ).toThrow("cannot be cleared");

    expect(() =>
      assertAnchorSubjectFinalizationTransition({
        ...genericRetirement,
        after: false,
        transactionSucceeded: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertAnchorSubjectFinalizationTransition({
        ...genericRetirement,
        after: true,
        transactionSucceeded: false,
      }),
    ).toThrow("reverted anchor transaction cannot change");
  });

  test("keeps kind 7 on the subject stream and corrections-only after subject finalization", () => {
    const hashA: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const hashB: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
    const hashC: Hex = "0x3333333333333333333333333333333333333333333333333333333333333333";
    const hashD: Hex = "0x4444444444444444444444444444444444444444444444444444444444444444";
    const watcherSigner: Address = "0x00000000000000000000000000000000000000c3";
    const watcherStream = watcherStreamId(watcherSigner);
    const retirement = {
      streamId: ZERO_HASH,
      watcherSigner: null,
      kind: 7,
      persistedSubjectFinalized: false,
      sequence: 1n,
      recordPrev: hashA,
      previousAnchor: hashA,
      recordHash: hashB,
    };
    const componentsHead = { sequence: 0n, kind: 4, recordHash: hashA };
    expect(() => assertAnchorAdvance(componentsHead, retirement)).not.toThrow();
    expect(() =>
      assertAnchorAdvance(null, {
        ...retirement,
        streamId: watcherStream,
        watcherSigner,
        sequence: 0n,
        recordPrev: ZERO_HASH,
        previousAnchor: ZERO_HASH,
      }),
    ).toThrow(
      "only watcher records can advance a watcher stream",
    );

    const retirementHead = { sequence: 1n, kind: 7, recordHash: hashB };
    const firstCorrection = {
      ...retirement,
      kind: 8,
      persistedSubjectFinalized: true,
      sequence: 2n,
      recordPrev: hashB,
      previousAnchor: hashB,
      recordHash: hashC,
    };
    expect(() => assertAnchorAdvance(retirementHead, firstCorrection)).not.toThrow();
    for (const kind of [1, 2, 3, 4, 5, 7, 9]) {
      expect(() => assertAnchorAdvance(retirementHead, { ...firstCorrection, kind })).toThrow(
        "only subject-stream corrections can advance a finalized subject",
      );
    }

    expect(() =>
      assertAnchorAdvance(
        { sequence: 2n, kind: 8, recordHash: hashC },
        {
          ...firstCorrection,
          sequence: 3n,
          recordPrev: hashC,
          previousAnchor: hashC,
          recordHash: hashD,
        },
      ),
    ).not.toThrow();
    expect(() =>
      assertAnchorAdvance(
        { sequence: 2n, kind: 8, recordHash: hashC },
        {
          ...firstCorrection,
          kind: 1,
          sequence: 3n,
          recordPrev: hashC,
          previousAnchor: hashC,
          recordHash: hashD,
        },
      ),
    ).toThrow("only subject-stream corrections can advance a finalized subject");
    expect(() => assertAnchorAdvance(null, { ...retirement, kind: 10 })).toThrow(
      "watcher records cannot advance the subject stream",
    );
    expect(() =>
      assertAnchorAdvance(null, {
        ...retirement,
        streamId: watcherStream,
        watcherSigner,
        kind: 10,
        persistedSubjectFinalized: true,
        sequence: 0n,
        recordPrev: ZERO_HASH,
        previousAnchor: ZERO_HASH,
      }),
    ).toThrow("only subject-stream corrections can advance a finalized subject");
  });

  test("uses persisted final state, not correction kind, as the terminal gate", () => {
    const correctionHash: Hex = "0x4444444444444444444444444444444444444444444444444444444444444444";
    const valuationHash: Hex = "0x5555555555555555555555555555555555555555555555555555555555555555";
    const activeSubjectAfterCorrection = {
      streamId: ZERO_HASH,
      watcherSigner: null,
      kind: 1,
      persistedSubjectFinalized: false,
      sequence: 4n,
      recordPrev: correctionHash,
      previousAnchor: correctionHash,
      recordHash: valuationHash,
    };
    expect(() =>
      assertAnchorAdvance(
        { sequence: 3n, kind: 8, recordHash: correctionHash },
        activeSubjectAfterCorrection,
      ),
    ).not.toThrow();
    expect(() =>
      assertAnchorAdvance(
        { sequence: 3n, kind: 8, recordHash: correctionHash },
        { ...activeSubjectAfterCorrection, persistedSubjectFinalized: true },
      ),
    ).toThrow("only subject-stream corrections can advance a finalized subject");
    expect(() =>
      assertAnchorAdvance(
        { sequence: 3n, kind: 1, recordHash: correctionHash },
        {
          ...activeSubjectAfterCorrection,
          kind: 8,
          persistedSubjectFinalized: true,
        },
      ),
    ).toThrow("requires a retirement or correction head");
    expect(() =>
      assertAnchorAdvance(
        { sequence: 3n, kind: 4, recordHash: correctionHash },
        {
          ...activeSubjectAfterCorrection,
          kind: 8,
          persistedSubjectFinalized: true,
        },
      ),
    ).toThrow("requires a retirement or correction head");
    expect(() =>
      assertAnchorAdvance(null, {
        ...activeSubjectAfterCorrection,
        kind: 8,
        persistedSubjectFinalized: true,
        sequence: 0n,
        recordPrev: ZERO_HASH,
        previousAnchor: ZERO_HASH,
      }),
    ).toThrow("requires a retirement or correction head");
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

describe("compatibility Merkle commitments", () => {
  const leaves = owners.map((owner, index) =>
    compatibilityLeaf({ requestId: BigInt(index + 1), owner, amount: amounts[index], epoch: 7n }),
  );

  test("matches all leaf and root vectors", () => {
    expect(leaves).toEqual([
      "0xbaa954825ec8395047c72ef1147add579dc65b03d0bc4ff998ebf5b0678a9feb",
      "0xe0c95a7921186802ddabb1c1ad02e7e20dc714871bd416cf346de8f2cb0e0354",
      "0xdda630ba305851387c6b9c87d0c2494379125fc352f910dbb9fdc38d072c265e",
      "0x5928010a4f0e5614fb61395f269bbc8944e6fbf5691c2b87629df799097601a7",
    ]);
    expect(() => compatibilityLeaf({ requestId: 0n, owner: owners[0], amount: 1n, epoch: 7n })).toThrow();
    expect([0, 1, 2, 3, 4].map((count) => compatibilityRoot(leaves.slice(0, count)))).toEqual([
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
    expect(() => selectionHash([1n, 1n])).toThrow();
    expect(() => selectionHash([2n, 1n])).toThrow();
    expect(() => selectionHash([-1n])).toThrow();
    expect(() => selectionHash([0n])).toThrow();
    expect(() => selectionHash([1n << 256n])).toThrow();
  });

  test("rejects Merkle values that are not bytes32", () => {
    expect(() => compatibilityRoot(["0x01" as `0x${string}`])).toThrow();
    expect(() => compatibilityRoot([`0x${"AB".repeat(32)}` as `0x${string}`])).toThrow();
    expect(() => compatibilityRoot(Array(1) as `0x${string}`[])).toThrow();
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
    expect(() =>
      pmvsMerkleLeaf({
        chainId: 137n,
        settlementContract: "0x0000000000000000000000000000000000000001",
        leg: 0,
        epoch: 7n,
        requestId: 0n,
        owner: owners[0],
        amount: 1n,
      }),
    ).toThrow();
  });

  test("binds the leaf count despite odd duplication", () => {
    expect(pmvsMerkleRawRoot(leaves.slice(0, 3))).toBe(pmvsMerkleRawRoot([leaves[0], leaves[1], leaves[2], leaves[2]]));
    expect(pmvsMerkleRoot(leaves.slice(0, 3))).not.toBe(pmvsMerkleRoot([leaves[0], leaves[1], leaves[2], leaves[2]]));
  });

  test("builds and verifies proofs for every leaf and rejects mutated proofs", () => {
    const root = pmvsMerkleRoot(leaves);
    leaves.forEach((leaf, index) => {
      const proof = pmvsMerkleProof(leaves, index);
      expect(verifyPmvsMerkleProof(root, leaf, proof, BigInt(leaves.length), BigInt(index))).toBe(true);
    });

    const proof = pmvsMerkleProof(leaves, 0);
    expect(verifyPmvsMerkleProof(root, ZERO_HASH, proof, 4n, 0n)).toBe(false);
    expect(verifyPmvsMerkleProof(root, leaves[0], [ZERO_HASH, ...proof.slice(1)], 4n, 0n)).toBe(false);
    expect(verifyPmvsMerkleProof(root, leaves[0], proof, 3n, 0n)).toBe(false);
    expect(verifyPmvsMerkleProof(root, leaves[0], proof.slice(1), 4n, 0n)).toBe(false);
    expect(verifyPmvsMerkleProof(root, leaves[0], proof, 4n, 4n)).toBe(false);
    expect(verifyPmvsMerkleProof(root, leaves[0], proof, 0n, 0n)).toBe(false);
    expect(() => pmvsMerkleProof(leaves, -1)).toThrow();
    expect(() => verifyPmvsMerkleProof("0x01" as `0x${string}`, leaves[0], proof, 4n, 0n)).toThrow();
    expect(() => verifyPmvsMerkleProof(root, "0x01" as `0x${string}`, proof, 4n, 0n)).toThrow();
    expect(() =>
      verifyPmvsMerkleProof(root, leaves[0], ["0x01" as `0x${string}`], 4n, 0n),
    ).toThrow();
  });

  test("verifies one-leaf and odd-edge proofs with an explicit leaf index", () => {
    const one = leaves.slice(0, 1);
    expect(verifyPmvsMerkleProof(pmvsMerkleRoot(one), one[0], [], 1n, 0n)).toBe(true);

    const three = leaves.slice(0, 3);
    const root = pmvsMerkleRoot(three);
    three.forEach((leaf, index) => {
      expect(verifyPmvsMerkleProof(root, leaf, pmvsMerkleProof(three, index), 3n, BigInt(index))).toBe(true);
    });
    const oddProof = pmvsMerkleProof(three, 2);
    expect(oddProof[0]).toBe(three[2]);
    expect(verifyPmvsMerkleProof(root, three[2], [leaves[3], oddProof[1]], 3n, 2n)).toBe(false);
  });

  test("checks archive IDs, totals, epochs, roots, indices, and proofs together", () => {
    const inputAmounts = [10n, 11n, 12n];
    const outputAmounts = inputAmounts.map((amount) => amount * 10n ** 12n);
    const expectedClaims = inputAmounts.map((inputAmount, index) => ({
      requestId: BigInt(index + 1),
      owner: owners[index],
      queuedEpoch: 6n,
      settlementEpoch: 7n,
      inputAmount,
    }));
    const selectedLeaves = outputAmounts.map((amount, index) => pmvsMerkleLeaf({
      chainId: 137n,
      settlementContract: "0x0000000000000000000000000000000000000001",
      leg: 0,
      epoch: 7n,
      requestId: BigInt(index + 1),
      owner: owners[index],
      amount,
    }));
    const claims = selectedLeaves.map((_, index) => ({
      requestId: BigInt(index + 1),
      owner: owners[index],
      queuedEpoch: 6n,
      settlementEpoch: 7n,
      inputAmount: inputAmounts[index],
      outputAmount: outputAmounts[index],
      leafIndex: BigInt(index),
      proof: pmvsMerkleProof(selectedLeaves, index),
    }));
    const leg = {
      chainId: 137n,
      settlementContract: "0x0000000000000000000000000000000000000001" as const,
      leg: 0 as const,
      settlementEpoch: 7n,
      pps: WAD,
      assetDecimals: 6,
      requestIds: [1n, 2n, 3n],
      root: pmvsMerkleRoot(selectedLeaves),
      totalInput: 33n,
      totalOutput: outputAmounts[0] + outputAmounts[1] + outputAmounts[2],
      claims,
      expectedPps: WAD,
      expectedClaims,
    };
    expect(() => assertSettlementArchiveLeg(leg)).not.toThrow();
    expect(() => assertSettlementArchiveLeg({ ...leg, requestIds: [1n, 1n, 3n] })).toThrow();
    expect(() => assertSettlementArchiveLeg({ ...leg, totalOutput: leg.totalOutput + 1n })).toThrow();
    expect(() => assertSettlementArchiveLeg({ ...leg, root: ZERO_HASH })).toThrow();
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      claims: claims.map((claim, index) => index === 1 ? { ...claim, queuedEpoch: 8n } : claim),
    })).toThrow();
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      claims: claims.map((claim, index) => index === 2 ? { ...claim, leafIndex: 1n } : claim),
    })).toThrow();
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      claims: claims.map((claim, index) => index === 0
        ? { ...claim, owner: "0x0000000000000000000000000000000000000000" as const }
        : claim),
    })).toThrow();
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      settlementContract: "0x0000000000000000000000000000000000000000",
    })).toThrow();
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      claims: claims.map((claim, index) => index === 0 ? { ...claim, proof: claim.proof.slice(1) } : claim),
    })).toThrow();
    const wrongOutputAmounts = [outputAmounts[0] + 1n, outputAmounts[1], outputAmounts[2]];
    const wrongLeaves = wrongOutputAmounts.map((amount, index) => pmvsMerkleLeaf({
      chainId: leg.chainId,
      settlementContract: leg.settlementContract,
      leg: leg.leg,
      epoch: leg.settlementEpoch,
      requestId: BigInt(index + 1),
      owner: owners[index],
      amount,
    }));
    const wrongClaims = claims.map((claim, index) => ({
      ...claim,
      outputAmount: wrongOutputAmounts[index],
      proof: pmvsMerkleProof(wrongLeaves, index),
    }));
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      root: pmvsMerkleRoot(wrongLeaves),
      totalOutput: wrongOutputAmounts.reduce((sum, value) => sum + value, 0n),
      claims: wrongClaims,
    })).toThrow();

    const rebuildArchive = (candidateClaims: typeof claims, settlementEpoch = leg.settlementEpoch) => {
      const candidateLeaves = candidateClaims.map((claim) => pmvsMerkleLeaf({
        chainId: leg.chainId,
        settlementContract: leg.settlementContract,
        leg: leg.leg,
        epoch: settlementEpoch,
        requestId: claim.requestId,
        owner: claim.owner,
        amount: claim.outputAmount,
      }));
      return {
        settlementEpoch,
        requestIds: candidateClaims.map((claim) => claim.requestId),
        root: pmvsMerkleRoot(candidateLeaves),
        totalInput: candidateClaims.reduce((sum, claim) => sum + claim.inputAmount, 0n),
        totalOutput: candidateClaims.reduce((sum, claim) => sum + claim.outputAmount, 0n),
        claims: candidateClaims.map((claim, index) => ({
          ...claim,
          settlementEpoch,
          leafIndex: BigInt(index),
          proof: pmvsMerkleProof(candidateLeaves, index),
        })),
      };
    };

    const bobForAlice = rebuildArchive(claims.map((claim, index) => index === 0
      ? { ...claim, owner: owners[1] }
      : claim));
    expect(() => assertSettlementArchiveLeg({ ...leg, ...bobForAlice })).toThrow(
      "claim owner does not match the authenticated request fact",
    );

    const changedRequestId = rebuildArchive(claims.map((claim, index) => index === 2
      ? { ...claim, requestId: 4n }
      : claim));
    expect(() => assertSettlementArchiveLeg({ ...leg, ...changedRequestId })).toThrow(
      "request id does not match the authenticated request fact",
    );

    const changedQueuedEpoch = rebuildArchive(claims.map((claim, index) => index === 0
      ? { ...claim, queuedEpoch: 5n }
      : claim));
    expect(() => assertSettlementArchiveLeg({ ...leg, ...changedQueuedEpoch })).toThrow(
      "claim epoch does not match the authenticated request or settlement fact",
    );

    const changedSettlementEpoch = rebuildArchive(claims, 8n);
    expect(() => assertSettlementArchiveLeg({ ...leg, ...changedSettlementEpoch })).toThrow(
      "claim epoch does not match the authenticated request or settlement fact",
    );

    const changedInput = rebuildArchive(claims.map((claim, index) => index === 0
      ? {
          ...claim,
          inputAmount: 20n,
          outputAmount: depositSharesOut(20n, WAD, leg.assetDecimals),
        }
      : claim));
    expect(() => assertSettlementArchiveLeg({ ...leg, ...changedInput })).toThrow(
      "claim input does not match the authenticated request fact",
    );

    const changedPps = 2n * WAD;
    const repricedArchive = rebuildArchive(claims.map((claim) => ({
      ...claim,
      outputAmount: depositSharesOut(claim.inputAmount, changedPps, leg.assetDecimals),
    })));
    expect(() => assertSettlementArchiveLeg({ ...leg, ...repricedArchive, pps: changedPps })).toThrow(
      "settlement price does not match the authenticated context",
    );
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      expectedClaims: expectedClaims.slice(0, -1),
    })).toThrow("authenticated claim facts must match the request-id list");

    expect(() => assertSettlementArchiveLeg({
      ...leg,
      requestIds: [],
      claims: [],
      expectedClaims: [],
      root: ZERO_HASH,
      totalInput: 0n,
      totalOutput: 0n,
    })).not.toThrow();

    const withdrawLeaf = pmvsMerkleLeaf({
      chainId: 137n,
      settlementContract: leg.settlementContract,
      leg: 1,
      epoch: 7n,
      requestId: 1n,
      owner: owners[0],
      amount: 2n,
    });
    expect(() => assertSettlementArchiveLeg({
      ...leg,
      leg: 1,
      requestIds: [1n],
      root: pmvsMerkleRoot([withdrawLeaf]),
      totalInput: 2n * 10n ** 12n,
      totalOutput: 2n,
      expectedClaims: [{
        requestId: 1n,
        owner: owners[0],
        queuedEpoch: 7n,
        settlementEpoch: 7n,
        inputAmount: 2n * 10n ** 12n,
      }],
      claims: [{
        requestId: 1n,
        owner: owners[0],
        queuedEpoch: 7n,
        settlementEpoch: 7n,
        inputAmount: 2n * 10n ** 12n,
        outputAmount: 2n,
        leafIndex: 0n,
        proof: [],
      }],
    })).not.toThrow();
  });

  test("rejects Merkle values that are not bytes32", () => {
    expect(() => pmvsMerkleRoot(["0x01" as `0x${string}`])).toThrow();
    expect(() => pmvsMerkleRoot(Array(1) as `0x${string}`[])).toThrow();
  });
});

describe("settlement receipt actions", () => {
  const archiveHash = `0x${"1".repeat(64)}` as `0x${string}`;
  const winddownHash = `0x${"2".repeat(64)}` as `0x${string}`;
  const valuationRecord = `0x${"3".repeat(64)}` as `0x${string}`;
  const otherHash = `0x${"4".repeat(64)}` as `0x${string}`;
  const validUntil = 1_787_328_300n;
  const normal = {
    action: {
      type: "normal-roll",
      recordKind: "settlement-archive",
      recordHash: archiveHash,
    } as const,
    receiptEpoch: 7n,
    referencedRecord: {
      recordKind: "settlement-archive" as const,
      recordHash: archiveHash,
      epoch: 7n,
      priceAttempt: 2n,
      grossPps: WAD,
      ppsFinal: WAD,
      valuationRecord,
      validUntil,
    },
    epochArchiveHash: archiveHash,
    epochActionRecordHash: ZERO_HASH,
    observedPriceAttempt: 2n,
    authenticatedPriceAttempt: 2n,
    selectedPriceAttempt: 2n,
    observedGrossPps: WAD,
    observedPpsFinal: WAD,
    observedValuationRecord: valuationRecord,
    observedValidUntil: validUntil,
    observedExecutionTimestamp: validUntil,
    canonicalExecutionTimestamp: validUntil,
    authenticatedGrossPps: WAD,
    authenticatedPpsFinal: WAD,
    authenticatedValuationRecord: valuationRecord,
    authenticatedValidUntil: validUntil,
    depositSelectionCount: 2n,
    withdrawSelectionCount: 1n,
    feeSharesMinted: 5n,
    finalFeeAssets: 0n,
    totalSupplyBefore: 100n,
    totalSupplyAfter: 105n,
    authenticatedZeroNavEffects: null,
    retirementTriggered: false,
    retirementReason: null,
  };
  const zeroNav = {
    ...normal,
    action: {
      type: "zero-nav",
      recordKind: "winddown-opened",
      recordHash: winddownHash,
    } as const,
    referencedRecord: {
      recordKind: "winddown-opened" as const,
      recordHash: winddownHash,
      epoch: 7n,
      priceAttempt: 2n,
      grossPps: 0n,
      valuationRecord,
      validUntil,
    },
    epochArchiveHash: ZERO_HASH,
    epochActionRecordHash: winddownHash,
    observedGrossPps: 0n,
    observedPpsFinal: 0n,
    authenticatedGrossPps: 0n,
    authenticatedPpsFinal: 0n,
    depositSelectionCount: 0n,
    withdrawSelectionCount: 0n,
    feeSharesMinted: 0n,
    finalFeeAssets: 0n,
    totalSupplyAfter: normal.totalSupplyBefore,
    authenticatedZeroNavEffects: {
      requestState: { before: archiveHash, after: archiveHash },
      claimState: { before: valuationRecord, after: valuationRecord },
      reserveState: { before: winddownHash, after: winddownHash },
      assetBalanceState: { before: otherHash, after: otherHash },
      feeState: { before: archiveHash, after: archiveHash },
    },
  };
  type ReceiptInput = Parameters<typeof assertSettlementReceiptAction>[0];
  const withMalformedAction = (action: unknown): ReceiptInput => ({
    ...normal,
    action: action as ReceiptInput["action"],
  });

  test("selects the getter and price gate named by the receipt action", () => {
    expect(() => assertSettlementReceiptAction(normal)).not.toThrow();
    expect(() => assertSettlementReceiptAction(zeroNav)).not.toThrow();

    expect(() => assertSettlementReceiptAction(withMalformedAction({
      type: "normal-roll",
      recordKind: "winddown-opened",
      recordHash: archiveHash,
    }))).toThrow("referenced record kind");
    expect(() => assertSettlementReceiptAction(withMalformedAction({
      type: "unknown",
      recordKind: "settlement-archive",
      recordHash: archiveHash,
    }))).toThrow("unknown settlement receipt action");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, recordKind: "winddown-opened" },
    })).toThrow("referenced record kind");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      action: { ...normal.action, recordHash: otherHash },
    })).toThrow("referenced record");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, recordHash: otherHash },
    })).toThrow("referenced record");
    expect(() => assertSettlementReceiptAction({ ...normal, epochArchiveHash: otherHash })).toThrow(
      "selected epoch getter",
    );
    expect(() => assertSettlementReceiptAction({ ...zeroNav, epochActionRecordHash: archiveHash })).toThrow(
      "selected epoch getter",
    );
    expect(() => assertSettlementReceiptAction({ ...normal, epochActionRecordHash: otherHash })).toThrow(
      "zero-NAV action getter empty",
    );
    expect(() => assertSettlementReceiptAction({ ...zeroNav, epochArchiveHash: otherHash })).toThrow(
      "archive getter empty",
    );
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, epoch: 8n },
    })).toThrow("receipt epoch");
    expect(() => assertSettlementReceiptAction({ ...normal, receiptEpoch: 0n })).toThrow("positive");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      receiptEpoch: undefined as unknown as bigint,
    })).toThrow("must be a bigint");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      authenticatedPpsFinal: Number.NaN as unknown as bigint,
    })).toThrow("must be a bigint");
    expect(() => assertSettlementReceiptAction({ ...normal, receiptEpoch: 1n << 64n })).toThrow("out of range");
    expect(() => assertSettlementReceiptAction({ ...normal, observedPriceAttempt: 1n })).toThrow(
      "receipt price attempt",
    );
    expect(() => assertSettlementReceiptAction({ ...normal, selectedPriceAttempt: 1n })).toThrow(
      "selected on-chain price attempt",
    );
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, priceAttempt: 1n },
    })).toThrow("referenced-record price attempt");
    expect(() => assertSettlementReceiptAction({ ...normal, observedPriceAttempt: 0n })).toThrow("positive");
    expect(() => assertSettlementReceiptAction({ ...normal, authenticatedPriceAttempt: 0n })).toThrow("positive");
    expect(() => assertSettlementReceiptAction({ ...normal, selectedPriceAttempt: 0n })).toThrow("positive");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, priceAttempt: 0n },
    })).toThrow("positive");
    expect(() => assertSettlementReceiptAction({ ...normal, observedPriceAttempt: 1n << 64n })).toThrow(
      "out of range",
    );
    expect(() => assertSettlementReceiptAction({ ...normal, authenticatedPriceAttempt: 1n << 64n })).toThrow(
      "out of range",
    );
    expect(() => assertSettlementReceiptAction({ ...normal, selectedPriceAttempt: 1n << 64n })).toThrow(
      "out of range",
    );
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, priceAttempt: 1n << 64n },
    })).toThrow("out of range");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      observedValuationRecord: otherHash,
    })).toThrow("valuation record");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, valuationRecord: otherHash },
    })).toThrow("valuation record");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      observedValidUntil: validUntil + 1n,
    })).toThrow("price expiry");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, validUntil: validUntil + 1n },
    })).toThrow("price expiry");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, grossPps: WAD + 1n },
    })).toThrow("gross price");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      referencedRecord: { ...normal.referencedRecord, ppsFinal: WAD + 1n },
    })).toThrow("final price");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      observedExecutionTimestamp: validUntil - 1n,
    })).toThrow("canonical settlement block");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      observedExecutionTimestamp: validUntil + 1n,
      canonicalExecutionTimestamp: validUntil + 1n,
    })).toThrow("settlement execution is stale");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      observedGrossPps: 0n,
      authenticatedGrossPps: 0n,
      referencedRecord: { ...normal.referencedRecord, grossPps: 0n },
    })).toThrow("must be positive");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      observedPpsFinal: 0n,
      authenticatedPpsFinal: 0n,
      referencedRecord: { ...normal.referencedRecord, ppsFinal: 0n },
    })).toThrow("must be positive");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      observedGrossPps: 1n,
    })).toThrow("receipt prices");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      referencedRecord: { ...zeroNav.referencedRecord, grossPps: 1n },
    })).toThrow("referenced-record gross price");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      observedGrossPps: 1n,
      authenticatedGrossPps: 1n,
      referencedRecord: { ...zeroNav.referencedRecord, grossPps: 1n },
    })).toThrow("must be zero");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      observedPpsFinal: 1n,
      authenticatedPpsFinal: 1n,
    })).toThrow("must be zero");
  });

  test("cross-binds every zero-NAV price-attempt tuple field", () => {
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      observedPriceAttempt: 3n,
    })).toThrow("receipt price attempt");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      referencedRecord: { ...zeroNav.referencedRecord, priceAttempt: 3n },
    })).toThrow("referenced-record price attempt");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      observedValuationRecord: otherHash,
    })).toThrow("receipt valuation record");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      referencedRecord: { ...zeroNav.referencedRecord, valuationRecord: otherHash },
    })).toThrow("referenced-record valuation record");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      observedGrossPps: 1n,
    })).toThrow("receipt prices");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      referencedRecord: { ...zeroNav.referencedRecord, grossPps: 1n },
    })).toThrow("referenced-record gross price");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      observedValidUntil: validUntil + 1n,
    })).toThrow("receipt price expiry");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      referencedRecord: { ...zeroNav.referencedRecord, validUntil: validUntil + 1n },
    })).toThrow("referenced-record price expiry");
  });

  test("keeps every authenticated zero-NAV state family unchanged", () => {
    expect(() => assertSettlementReceiptAction({ ...zeroNav, depositSelectionCount: 1n })).toThrow(
      "cannot select requests",
    );
    expect(() => assertSettlementReceiptAction({ ...zeroNav, withdrawSelectionCount: 1n })).toThrow(
      "cannot select requests",
    );
    expect(() => assertSettlementReceiptAction({ ...zeroNav, feeSharesMinted: 1n })).toThrow(
      "cannot charge fees",
    );
    expect(() => assertSettlementReceiptAction({ ...zeroNav, finalFeeAssets: 1n })).toThrow(
      "cannot charge fees",
    );
    expect(() => assertSettlementReceiptAction({ ...zeroNav, totalSupplyAfter: 99n })).toThrow(
      "cannot mint or burn shares",
    );
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      authenticatedZeroNavEffects: null,
    })).toThrow("requires authenticated no-effect evidence");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      authenticatedZeroNavEffects: {} as ReceiptInput["authenticatedZeroNavEffects"],
    })).toThrow("every closed state family");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      authenticatedZeroNavEffects: {
        ...zeroNav.authenticatedZeroNavEffects,
        requestState: {
          ...zeroNav.authenticatedZeroNavEffects.requestState,
          extra: archiveHash,
        },
      } as ReceiptInput["authenticatedZeroNavEffects"],
    })).toThrow("only before and after digests");
    for (const stateFamily of [
      "requestState",
      "claimState",
      "reserveState",
      "assetBalanceState",
      "feeState",
    ] as const) {
      expect(() => assertSettlementReceiptAction({
        ...zeroNav,
        authenticatedZeroNavEffects: {
          ...zeroNav.authenticatedZeroNavEffects,
          [stateFamily]: {
            ...zeroNav.authenticatedZeroNavEffects[stateFamily],
            after: stateFamily === "assetBalanceState" ? archiveHash : otherHash,
          },
        },
      })).toThrow(`changed ${stateFamily}`);
    }
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      authenticatedZeroNavEffects: {
        ...zeroNav.authenticatedZeroNavEffects,
        requestState: { before: ZERO_HASH, after: ZERO_HASH },
      },
    })).toThrow("snapshot digests must be nonzero");
    expect(() => assertSettlementReceiptAction({
      ...normal,
      authenticatedZeroNavEffects: zeroNav.authenticatedZeroNavEffects,
    })).toThrow("cannot carry zero-NAV no-effect evidence");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      retirementTriggered: true,
      retirementReason: "zero-nav",
    })).toThrow("cannot finalize retirement");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      retirementReason: "zero-nav",
    })).toThrow("cannot finalize retirement");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      retirementTriggered: undefined as unknown as boolean,
    })).toThrow("must be a boolean");
    expect(() => assertSettlementReceiptAction({
      ...zeroNav,
      action: { ...zeroNav.action, recordHash: ZERO_HASH },
      referencedRecord: { ...zeroNav.referencedRecord, recordHash: ZERO_HASH },
      epochActionRecordHash: ZERO_HASH,
    })).toThrow("must be nonzero");
  });
});

describe("settlement price attempts", () => {
  const firstPublication = {
    currentAttempt: 0n,
    candidateAttempt: 1n,
    previousValidUntil: null,
    publicationTimestamp: 1_787_328_000n,
    epochProcessed: false,
    successfulActionExists: false,
  };
  const retryPublication = {
    ...firstPublication,
    currentAttempt: 1n,
    candidateAttempt: 2n,
    previousValidUntil: 1_787_328_300n,
    publicationTimestamp: 1_787_328_301n,
  };

  test("starts at one and advances only after the immutable prior attempt expires", () => {
    expect(() => assertPriceAttemptPublication(firstPublication)).not.toThrow();
    expect(() => assertPriceAttemptPublication(retryPublication)).not.toThrow();
    expect(() => assertPriceAttemptPublication({ ...firstPublication, candidateAttempt: 2n })).toThrow(
      "must be one",
    );
    expect(() => assertPriceAttemptPublication({ ...firstPublication, previousValidUntil: 1n })).toThrow(
      "previous expiry",
    );
    expect(() => assertPriceAttemptPublication({ ...retryPublication, candidateAttempt: 1n })).toThrow(
      "advance by one",
    );
    expect(() => assertPriceAttemptPublication({ ...retryPublication, candidateAttempt: 3n })).toThrow(
      "advance by one",
    );
    expect(() => assertPriceAttemptPublication({ ...retryPublication, previousValidUntil: null })).toThrow(
      "requires the previous attempt",
    );
    expect(() => assertPriceAttemptPublication({ ...retryPublication, previousValidUntil: 0n })).toThrow(
      "must be positive",
    );
    expect(() => assertPriceAttemptPublication({
      ...retryPublication,
      publicationTimestamp: retryPublication.previousValidUntil,
    })).toThrow("has not expired");
    expect(() => assertPriceAttemptPublication({
      ...retryPublication,
      publicationTimestamp: retryPublication.previousValidUntil - 1n,
    })).toThrow("has not expired");
  });

  test("rejects publication after processing or a successful branch action and at uint64 exhaustion", () => {
    expect(() => assertPriceAttemptPublication({ ...firstPublication, epochProcessed: true })).toThrow(
      "processed epoch",
    );
    expect(() => assertPriceAttemptPublication({ ...firstPublication, successfulActionExists: true })).toThrow(
      "successful epoch action",
    );
    expect(() => assertPriceAttemptPublication({
      ...firstPublication,
      epochProcessed: undefined as unknown as boolean,
    })).toThrow("must be a boolean");
    expect(() => assertPriceAttemptPublication({
      ...firstPublication,
      successfulActionExists: "false" as unknown as boolean,
    })).toThrow("must be a boolean");
    expect(() => assertPriceAttemptPublication({ ...firstPublication, candidateAttempt: 0n })).toThrow("positive");
    expect(() => assertPriceAttemptPublication({ ...firstPublication, candidateAttempt: 1n << 64n })).toThrow(
      "out of range",
    );
    expect(() => assertPriceAttemptPublication({
      ...retryPublication,
      currentAttempt: (1n << 64n) - 1n,
      candidateAttempt: (1n << 64n) - 1n,
    })).toThrow("exhausted");
  });
});

describe("settlement arithmetic", () => {
  test("derives capture expiry and bounded claim deadlines exactly", () => {
    const timing = {
      captureEndedAtMs: 1_787_328_000_001n,
      maxCaptureAgeMs: 300_000n,
      validUntil: 1_787_328_300n,
      observedExecutionTimestamp: 1_787_328_300n,
      canonicalExecutionTimestamp: 1_787_328_300n,
      requestLiveness: "bounded" as const,
      claimRemedyDelay: 86_400n,
      claimDeadline: 1_787_414_700n,
    };
    expect(() => assertSettlementTiming(timing)).not.toThrow();
    expect(() => assertSettlementTiming({
      ...timing,
      observedExecutionTimestamp: timing.validUntil - 1n,
    })).toThrow("canonical settlement block");
    expect(() => assertSettlementTiming({
      ...timing,
      observedExecutionTimestamp: timing.validUntil + 1n,
      canonicalExecutionTimestamp: timing.validUntil + 1n,
    })).toThrow("settlement execution is stale");
    expect(() => assertSettlementTiming({ ...timing, validUntil: timing.validUntil + 1n })).toThrow();
    expect(() => assertSettlementTiming({ ...timing, claimDeadline: timing.claimDeadline - 1n })).toThrow();
    expect(() => assertSettlementTiming({
      ...timing,
      requestLiveness: "operator-dependent",
      claimRemedyDelay: null,
      claimDeadline: null,
    })).not.toThrow();
    expect(() => assertSettlementTiming({
      ...timing,
      requestLiveness: "operator-dependent",
      claimRemedyDelay: null,
    })).toThrow();
  });

  test("aggregates custody balances before crossing one shared order book", () => {
    const positionContract = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
    const custodyA = "0x0000000000000000000000000000000000000005";
    const custodyB = "0x0000000000000000000000000000000000000006";
    const aggregated = aggregatePositionHoldings([
      { chainId: 137n, positionContract, positionId: 1n, custodyAccount: custodyB, quantity: 4n },
      { chainId: 137n, positionContract, positionId: 1n, custodyAccount: custodyA, quantity: 6n },
    ]);
    expect(aggregated).toEqual([
      {
        chainId: 137n,
        positionContract,
        positionId: 1n,
        holdings: [
          { custodyAccount: custodyA, quantity: 6n },
          { custodyAccount: custodyB, quantity: 4n },
        ],
        aggregateQuantity: 10n,
      },
    ]);
    expect(
      crossDisplayedBids(
        aggregated[0].aggregateQuantity,
        [
          { price: 9n, quantity: 7n },
          { price: 1n, quantity: 3n },
        ],
        10n,
      ),
    ).toEqual({ filled: 10n, unfilled: 0n, grossMark: 6n });
    expect(() => crossDisplayedBids(1n, [{ price: 11n, quantity: 1n }], 10n)).toThrow();
  });

  test("defines zero-supply PPS and rejects unallocated assets", () => {
    expect(valuationPps(0n, 0n, 6, 18, WAD)).toBe(WAD);
    expect(() => valuationPps(1n, 0n, 6, 18, WAD)).toThrow();
  });

  test("treats exact materiality-cap equality as admissible", () => {
    expect(materialityWithinCaps(10n, 100n, 100n, 1000n)).toBe(true);
    expect(materialityWithinCaps(11n, 100n, 100n, 1000n)).toBe(false);
    expect(() => materialityWithinCaps(
      10n,
      100n,
      100n,
      1000n,
      "false" as unknown as boolean,
    )).toThrow("must be a boolean");
  });

  test("floors share conversions and caps final-roll fees by prior free reserves", () => {
    expect(depositSharesOut(1n, 3n * WAD, 6)).toBe(333333333333n);
    expect(withdrawAssetsOut(333333333333n, 3n * WAD, 6)).toBe(0n);
    expect(
      finalRollFeeAssets({
        withdrawShares: 10n * WAD,
        grossPps: 12n * 10n ** 17n,
        finalPps: 11n * 10n ** 17n,
        assetDecimals: 6,
        sourceAssets: 10_000_000n,
        encumberedBefore: 8_000_000n,
        withdrawTotalAssets: 1_500_000n,
      }),
    ).toBe(500_000n);
  });

  test("floors the pinned venue exit-cost cap and rejects an unlimited zero setting", () => {
    expect(bpsExitCostCap(50_000_000n, 500n)).toBe(2_500_000n);
    expect(bpsExitCostCap(1n, 500n)).toBe(0n);
    expect(() => bpsExitCostCap(1n, 0n)).toThrow();
    expect(() => bpsExitCostCap(1n << 256n, 500n)).toThrow();
  });

  test("matches fee vectors and keeps two ceiling stages", () => {
    expect(netPps(11n * 10n ** 17n, WAD, 2n * 10n ** 17n)).toBe(108n * 10n ** 16n);
    expect(performanceFeeShares(11n * 10n ** 17n, WAD, 2n * 10n ** 17n, 1000n * WAD)).toBe(
      18518518518518518519n,
    );
    expect(performanceFeeShares(WAD + 1n, WAD, 1n, 100n * WAD)).toBe(100n);
    expect(() => performanceFeeShares(
      WAD + 1n,
      WAD,
      1n,
      100n * WAD,
      "false" as unknown as boolean,
    )).toThrow("must be a boolean");
    expect(() => performanceFeeShares(WAD, WAD, -1n, 100n * WAD)).toThrow();
    expect(() => netPps(WAD + 1n, 0n, WAD)).toThrow();
    expect(() => performanceFeeShares(WAD + 1n, 0n, WAD, 100n * WAD)).toThrow();
  });
});
