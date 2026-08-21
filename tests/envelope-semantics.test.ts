// SPDX-License-Identifier: CC0-1.0

import { describe, expect, test } from "bun:test";
import {
  encodePacked,
  keccak256,
  type Address,
  type Hex,
} from "viem";

import componentFixture from "../fixtures/components-genesis-record.json";
import {
  CoreEnvelopeSemanticError,
  type CoreEnvelopeSemanticErrorCode,
  type CoreEnvelopeVerificationContext,
  type CoreRecordKind,
  type CoreRetirementFinalizationCheck,
  type CoreUnexecutedSupersessionCheck,
  verifyCoreEnvelopeSemantics,
} from "../src/envelope-semantics";
import {
  ZERO_HASH,
  canonicalize,
  componentActivationCommitment,
  recordHash,
  subjectId,
} from "../src/reference";

type TestJsonObject = Record<string, unknown>;

type TestSubject = {
  chainId: string;
  shareToken: string;
};

type TestSubjectContext = {
  stream: string;
  kind: string;
  sequence: string;
  prev: string;
  producedAt: string;
  producer?: string;
  valuationTime?: string;
  epoch?: string;
  slot?: string | null;
};

type TestSubjectContextFields = Pick<
  TestSubjectContext,
  "valuationTime" | "epoch" | "slot"
>;

type TestExtension = {
  id: string;
  critical: boolean;
  value: unknown;
};

type TestSubjectRecord = TestJsonObject & {
  schema: string;
  schemaVersion: string;
  subject: TestSubject;
  components: string;
  context: TestSubjectContext;
  extensions: TestExtension[];
  meta: TestJsonObject;
};

type TestChainState = TestJsonObject & {
  chainId: string;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: string;
  reads: TestJsonObject[];
};

type TestValuationRecord = TestSubjectRecord & {
  method: TestJsonObject;
  inputs: TestJsonObject & {
    chainState: TestChainState[];
    venueState: TestJsonObject;
    capture: TestJsonObject;
  };
  outputs: TestJsonObject & {
    perPosition: TestJsonObject[];
    cashLines: TestJsonObject[];
    totalSupply: string;
  };
};

type TestSettlementLeg = TestJsonObject & {
  requestIds: string[];
  root: string;
  totalAssets: string;
  totalShares: string;
  claims: TestJsonObject[];
};

type TestSettlementRecord = TestSubjectRecord & {
  settlement: TestJsonObject & { priceAttempt: string };
  deposit: TestSettlementLeg;
  withdraw: TestSettlementLeg;
  excluded: TestJsonObject[];
  supersedesUnexecuted: string | null;
};

type TestReceiptRecord = TestSubjectRecord & {
  action: TestJsonObject;
  transaction: TestJsonObject;
  observed: TestJsonObject & {
    sourceAssets: string;
    reserveBuckets: TestJsonObject[];
    fundingSources: TestJsonObject[];
    assetBalances: TestJsonObject[];
  };
  retirement: TestJsonObject;
};

type TestWinddownRecord = TestSubjectRecord & {
  openedAt: string;
  priceAttempt: string;
  supersedesUnexecuted: string | null;
};

type TestResolution = {
  action: string;
  timing: string;
  beneficiary: string | null;
  evidenceHash: string | null;
};

type TestResidualPosition = TestJsonObject & {
  id: string;
  quantity: string;
  resolution: TestResolution;
};

type TestResidualCash = TestJsonObject & {
  id: string;
  chainId: string;
  resolution: TestResolution;
};

type TestFeeAccrual = TestJsonObject & {
  id: string;
  amount: string;
  resolution: TestResolution;
};

type TestLiability = TestJsonObject & {
  id: string;
  amount: string;
  resolution: TestResolution;
};

type TestRecovery = {
  status: string;
  rightsCount: string;
  manifestHash: string | null;
};

type TestFinalRecord = TestSubjectRecord & {
  scope: string;
  reason: string;
  finalSupply: string;
  pendingRequests: string;
  outstandingClaims: string;
  claimFunding: string;
  residualPositions: TestResidualPosition[];
  residualCash: TestResidualCash[];
  feeAccruals: TestFeeAccrual[];
  liabilities: TestLiability[];
  recovery: TestRecovery;
  migration: TestJsonObject | null;
};

type TestCorrectionRecord = TestSubjectRecord & {
  changesSettlementBearingOutput: boolean;
};

type TestGapRecord = TestSubjectRecord;

type TestWatcherRecord = TestJsonObject & {
  schema: string;
  schemaVersion: string;
  subject: TestSubject;
  components: string;
  context: TestSubjectContext & {
    producer: string;
    observationTime: string;
  };
  window: TestJsonObject & { expectedSamples: string };
  sampling: TestJsonObject;
  venueState: TestJsonObject & { responses: TestJsonObject[] };
  extensions: TestExtension[];
  meta: TestJsonObject;
};

type TestProxy = {
  implementation: string;
  implementationCodeHash: string;
  admin: string | null;
};

type TestContract = TestJsonObject & {
  role: string;
  chainId: string;
  address: string;
  accountType: string;
  runtimeCodeHash: string;
  proxy: TestProxy | null;
};

type TestAuthority = TestJsonObject & {
  role: string;
  source: {
    type: string;
    contract: string | null;
    getter: string | null;
    eventTopic: string | null;
  };
};

type TestActivationCheck = {
  id: string;
  target: Address;
  callData: Hex;
  expectedReturnDataHash: Hex;
};

type TestComponentsRecord = TestSubjectRecord & {
  subjectId: string;
  generation: string;
  supersedes: string;
  activation: TestJsonObject & {
    nonce: string;
    actionCommitment: string;
    transactionHash?: string;
    conditions: TestJsonObject & {
      expectedActive: {
        recordHash: string;
        generation: string;
        anchor: string;
      } | null;
      validFromBlock: string;
      validThroughBlock: string;
      checks: TestActivationCheck[];
      logIndex?: string;
    };
  };
  share: TestJsonObject & {
    decimals: string;
    initialPps: string;
    transferFee: boolean;
  };
  accountingAsset: TestJsonObject & { address: string };
  portfolio: TestJsonObject & {
    custodyModel: string;
    positionFormats: string[];
  };
  profiles: Record<string, string | null> & { requestLiveness: string };
  contracts: TestContract[];
  authorities: TestAuthority[];
  profileParameters: TestJsonObject;
  migration: TestJsonObject | null;
};

type TestRecord =
  | TestValuationRecord
  | TestSettlementRecord
  | TestReceiptRecord
  | TestComponentsRecord
  | TestWinddownRecord
  | TestFinalRecord
  | TestCorrectionRecord
  | TestGapRecord
  | TestWatcherRecord;

const HASH_A = `0x${"11".repeat(32)}` as Hex;
const HASH_B = `0x${"22".repeat(32)}` as Hex;
const HASH_C = `0x${"33".repeat(32)}` as Hex;
const ACTIVE_COMPONENTS = `0x${"44".repeat(32)}` as Hex;
const VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000001" as Address;
const SIGNER = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf" as Address;
const ACCOUNT_A = "0x0000000000000000000000000000000000000001" as Address;
const ACCOUNT_B = "0x0000000000000000000000000000000000000002" as Address;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const SIGNATURE = `0x${"00".repeat(65)}` as Hex;
const UINT256_MAX = (2n ** 256n - 1n).toString();
const UINT256_OVERFLOW = (2n ** 256n).toString();
const INT256_MAX = (2n ** 255n - 1n).toString();
const INT256_MIN = (-(2n ** 255n)).toString();
const INT256_POSITIVE_OVERFLOW = (2n ** 255n).toString();
const INT256_NEGATIVE_OVERFLOW = (-(2n ** 255n) - 1n).toString();
const SUPPORTED_PROFILE_IDS: ReadonlySet<string> = new Set([
  "settlement/epoch-merkle/1",
  "anchor/evm/1",
  "operator-dependent",
  "pmvs-m1",
  "venue/polymarket/1",
  "storage/arweave/1",
  "position/gnosis-ctf/1",
]);

const KIND_BY_SCHEMA: Record<string, CoreRecordKind> = {
  "pmvs/valuation-record": 1,
  "pmvs/settlement-archive": 2,
  "pmvs/settlement-receipt": 3,
  "pmvs/components": 4,
  "pmvs/winddown-opened": 5,
  "pmvs/retirement-final": 7,
  "pmvs/correction": 8,
  "pmvs/gap": 9,
  "pmvs/watcher-observation": 10,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function subjectRecord(
  schema: string,
  kind: string,
  contextFields: TestSubjectContextFields = {},
): TestSubjectRecord {
  return {
    schema,
    schemaVersion: "1",
    subject: clone(componentFixture.subject),
    components: ACTIVE_COMPONENTS,
    context: {
      stream: "subject",
      kind,
      sequence: "1",
      prev: HASH_A,
      producedAt: "1",
      ...contextFields,
    },
    extensions: [],
    meta: {},
  };
}

function valuationRecord(navSigned = "0"): TestValuationRecord {
  return {
    ...subjectRecord("pmvs/valuation-record", "valuation", {
      valuationTime: "1",
      epoch: "1",
      slot: null,
    }),
    method: {
      id: "pmvs-m1",
      engine: "test",
      engineVersion: "1",
      sourceCommit: "test",
      artifactHash: HASH_B,
      parameters: {},
    },
    inputs: {
      chainState: [{
        chainId: "137",
        blockNumber: "1",
        blockHash: HASH_B,
        blockTimestamp: "1",
        reads: [],
      }],
      venueState: { profile: "venue/test/1", responses: [] },
      capture: {
        startedAtMs: "1",
        endedAtMs: "2",
        maxSkewMs: "1",
        maxVenueResponseLagMs: "1",
        maxCaptureAgeMs: "1",
        validUntil: "2",
      },
    },
    outputs: {
      perPosition: [],
      cashLines: [],
      overlayLines: [],
      liabilityLines: [],
      exclusionLines: [],
      aggregateUnfilledMaximumPayout: "0",
      cashValue: "0",
      overlayValue: "0",
      positionsValue: "0",
      grossAssets: "0",
      liabilities: "0",
      navSigned,
      nav: "0",
      navDeficit: "0",
      totalSupply: "0",
      pps: "0",
      referencePps: null,
    },
  };
}

function settlementRecord(): TestSettlementRecord {
  return {
    ...subjectRecord("pmvs/settlement-archive", "settlement-archive", { epoch: "1" }),
    settlement: {
      settlementProfile: "settlement/epoch-merkle/1",
      settlementVersion: "1",
      priceAttempt: "1",
      grossPps: "1",
      ppsFinal: "1",
      highWaterMark: "0",
      feeRate: "0",
      validUntil: "2",
      valuationRecord: HASH_B,
      merkleProfile: "pmvs-merkle/1",
      requestLiveness: "operator-dependent",
      claimDeadline: null,
    },
    deposit: {
      requestIds: [],
      root: ZERO_HASH,
      totalAssets: "0",
      totalShares: "0",
      claims: [],
    },
    withdraw: {
      requestIds: [],
      root: ZERO_HASH,
      totalShares: "0",
      totalAssets: "0",
      claims: [],
    },
    excluded: [],
    supersedesUnexecuted: null,
  };
}

function receiptRecord(): TestReceiptRecord {
  return {
    ...subjectRecord("pmvs/settlement-receipt", "receipt", { epoch: "1" }),
    action: {
      type: "normal-roll",
      recordKind: "settlement-archive",
      recordHash: HASH_B,
    },
    transaction: {
      hash: HASH_B,
      blockNumber: "1",
      blockHash: HASH_C,
      transactionIndex: "0",
      events: [],
    },
    observed: {
      valuationRecord: HASH_C,
      priceAttempt: "1",
      grossPps: "1",
      validUntil: "2",
      executionTimestamp: "1",
      ppsFinal: "1",
      feeSharesMinted: "0",
      finalFeeAssets: "0",
      sourceAssets: "0",
      encumberedBefore: "0",
      freeBefore: "0",
      totalSupplyBefore: "0",
      totalSupplyAfter: "0",
      reserveBuckets: [],
      fundingSources: [],
      assetBalances: [],
    },
    retirement: { triggered: false, reason: null },
  };
}

function winddownRecord(): TestWinddownRecord {
  return {
    ...subjectRecord("pmvs/winddown-opened", "winddown-opened", { epoch: "1" }),
    reason: "test",
    openedAt: "1",
    priceAttempt: "1",
    grossPps: "0",
    valuationRecord: HASH_B,
    validUntil: "2",
    gates: {},
    openPositionsPlan: "preserve",
    pendingRequestsPlan: "preserve",
    reversalRule: null,
    supersedesUnexecuted: null,
  };
}

function finalRecord(): TestFinalRecord {
  return {
    ...subjectRecord("pmvs/retirement-final", "retirement-final"),
    scope: "subject",
    reason: "governance-closure",
    lastArchiveHash: HASH_B,
    finalSupply: "0",
    pendingRequests: "0",
    outstandingClaims: "0",
    claimFunding: "0",
    residualPositions: [],
    residualCash: [],
    feeAccruals: [],
    liabilities: [],
    recovery: {
      status: "none",
      rightsCount: "0",
      manifestHash: null,
    },
    migration: null,
  };
}

function correctionRecord(): TestCorrectionRecord {
  return {
    ...subjectRecord("pmvs/correction", "correction"),
    targetHash: HASH_B,
    reasonCode: "clerical",
    explanation: "test",
    changesSettlementBearingOutput: false,
    replacement: null,
    onchainEffect: "none",
    remediation: "none",
  };
}

function gapRecord(): TestGapRecord {
  return {
    ...subjectRecord("pmvs/gap", "gap", { slot: "1" }),
    reason: "operator_unavailable",
    explanation: "test",
  };
}

function watcherRecord(): TestWatcherRecord {
  return {
    schema: "pmvs/watcher-observation",
    schemaVersion: "1",
    subject: clone(componentFixture.subject),
    components: ACTIVE_COMPONENTS,
    context: {
      stream: "watcher",
      producer: SIGNER,
      kind: "watcher-observation",
      sequence: "1",
      prev: HASH_A,
      producedAt: "1",
      observationTime: "1",
    },
    window: {
      id: "test",
      seedCommit: HASH_B,
      seedReveal: "0x",
      expectedSamples: "0",
    },
    sampling: {
      tokenSelectionRule: "test",
      candidateTokens: [],
      selectedTokens: [],
    },
    venueState: {
      profile: "venue/test/1",
      books: [],
      responses: [],
    },
    extensions: [],
    meta: {},
  };
}

function componentsRecord(): TestComponentsRecord {
  return clone(componentFixture);
}

function contractForRole(record: TestComponentsRecord, role: string): TestContract {
  const contract = record.contracts.find((candidate) => candidate.role === role);
  if (!contract) throw new Error(`missing test contract role ${role}`);
  return contract;
}

function authorityForRole(record: TestComponentsRecord, role: string): TestAuthority {
  const authority = record.authorities.find((candidate) => candidate.role === role);
  if (!authority) throw new Error(`missing test authority role ${role}`);
  return authority;
}

function refreshComponentActivationCommitment(
  record: TestComponentsRecord,
): TestComponentsRecord {
  const anchor = contractForRole(record, "anchor").address as Address;
  const expectedActive = record.activation.conditions.expectedActive === null
    ? null
    : {
      recordHash: record.activation.conditions.expectedActive.recordHash as Hex,
      generation: BigInt(record.activation.conditions.expectedActive.generation),
      anchor: record.activation.conditions.expectedActive.anchor as Address,
    };
  record.activation.actionCommitment = componentActivationCommitment({
    chainId: BigInt(record.subject.chainId),
    shareToken: record.subject.shareToken as Address,
    subjectId: record.subjectId as Hex,
    streamSequence: BigInt(record.context.sequence),
    streamPrev: record.context.prev as Hex,
    nonce: BigInt(record.activation.nonce),
    expectedActive,
    newGeneration: BigInt(record.generation),
    newAnchor: anchor,
    validFromBlock: BigInt(record.activation.conditions.validFromBlock),
    validThroughBlock: BigInt(record.activation.conditions.validThroughBlock),
    migration: record.migration,
    checks: record.activation.conditions.checks,
  });
  return record;
}

function laterComponentsRecord(): TestComponentsRecord {
  const record = componentsRecord();
  record.components = ACTIVE_COMPONENTS;
  record.context.sequence = "1";
  record.context.prev = HASH_A;
  record.generation = "1";
  record.supersedes = ACTIVE_COMPONENTS;
  record.migration = {};
  record.activation.nonce = "2";
  record.activation.conditions.expectedActive = {
    recordHash: ACTIVE_COMPONENTS,
    generation: "0",
    anchor: VERIFYING_CONTRACT,
  };
  return refreshComponentActivationCommitment(record);
}

const ALL_RECORDS: Array<[string, () => TestRecord, CoreRecordKind, Hex]> = [
  ["valuation", valuationRecord, 1, ACTIVE_COMPONENTS],
  ["settlement archive", settlementRecord, 2, ACTIVE_COMPONENTS],
  ["settlement receipt", receiptRecord, 3, ACTIVE_COMPONENTS],
  ["component generation", componentsRecord, 4, ZERO_HASH],
  ["winddown", winddownRecord, 5, ACTIVE_COMPONENTS],
  ["retirement final", finalRecord, 7, ACTIVE_COMPONENTS],
  ["correction", correctionRecord, 8, ACTIVE_COMPONENTS],
  ["gap", gapRecord, 9, ACTIVE_COMPONENTS],
  ["watcher", watcherRecord, 10, ACTIVE_COMPONENTS],
];

type PackageOptions = {
  locations?: string[];
  expectedComponents?: Hex;
  componentAnchor?: Address;
  supportedExtensionIds?: ReadonlySet<string>;
  supportedProfileIds?: ReadonlySet<string>;
};

function packageRecord(record: TestRecord, options: PackageOptions = {}) {
  const {
    locations = ["ar://a"],
    expectedComponents = ACTIVE_COMPONENTS,
    componentAnchor = VERIFYING_CONTRACT,
    supportedExtensionIds = new Set<string>(),
    supportedProfileIds = SUPPORTED_PROFILE_IDS,
  } = options;
  const rawRecordBytes = canonicalize(record);
  const derivedRecordHash = recordHash(record);
  const derivedSubjectId = subjectId(
    BigInt(record.subject.chainId),
    record.subject.shareToken as Address,
  );
  const sequence = BigInt(record.context.sequence);
  const signer = (record.context.stream === "watcher" ? record.context.producer : SIGNER) as Address;
  const streamId = record.context.stream === "watcher"
    ? keccak256(encodePacked(["string", "address"], ["PMVS:WATCHER:1", signer]))
    : ZERO_HASH;
  const previousAnchor = sequence === 0n ? ZERO_HASH : record.context.prev as Hex;
  const kind = KIND_BY_SCHEMA[record.schema];
  if (kind === undefined) throw new Error(`unknown test schema ${record.schema}`);
  const envelope = {
    record,
    attestation: {
      recordHash: derivedRecordHash,
      scheme: "eip712-ecdsa",
      verifyingContract: VERIFYING_CONTRACT,
      streamId,
      previousAnchor,
      signer,
      signature: SIGNATURE,
    },
    locations,
  };
  const expected: CoreEnvelopeVerificationContext = {
    chainId: BigInt(record.subject.chainId),
    subjectId: derivedSubjectId,
    streamId,
    kind,
    sequence,
    prev: record.context.prev as Hex,
    components: expectedComponents,
    componentAnchor,
    supportedExtensionIds,
    supportedProfileIds,
    recordHash: derivedRecordHash,
    previousAnchor,
    verifyingContract: VERIFYING_CONTRACT,
    signer,
    signatureScheme: 0,
    signatureHash: keccak256(SIGNATURE),
    verifyComponentGraph: () => true,
    verifyComponentProfiles: () => true,
    verifyComponentActivation: () => ({ status: "activated" }),
    verifyUnexecutedSupersession: () => true,
    verifyRetirementFinalization: () => true,
    verifyAuthentication: () => true,
    verifyAnchorState: () => true,
  };
  return { envelope, rawRecordBytes, expected };
}

function verify(
  record: TestRecord,
  expectedComponents: Hex = ACTIVE_COMPONENTS,
  supportedExtensionIds: ReadonlySet<string> = new Set<string>(),
  supportedProfileIds: ReadonlySet<string> = SUPPORTED_PROFILE_IDS,
) {
  const packaged = packageRecord(record, {
    expectedComponents,
    supportedExtensionIds,
    supportedProfileIds,
  });
  return verifyCoreEnvelopeSemantics(
    packaged.envelope,
    packaged.rawRecordBytes,
    packaged.expected,
  );
}

function expectCode(action: () => unknown, code: CoreEnvelopeSemanticErrorCode): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CoreEnvelopeSemanticError);
    expect((error as CoreEnvelopeSemanticError).code).toBe(code);
  }
}

describe("record-level Core envelope semantics", () => {
  test.each(ALL_RECORDS)("accepts a valid %s record", (_name, build, kind, components) => {
    const packaged = packageRecord(build(), { expectedComponents: components });
    let authenticationCalls = 0;
    let anchorCalls = 0;
    let componentGraphCalls = 0;
    let componentProfileCalls = 0;
    let componentActivationCalls = 0;
    let supersessionCalls = 0;
    let retirementFinalizationCalls = 0;
    packaged.expected.verifyComponentGraph = () => {
      componentGraphCalls += 1;
      return true;
    };
    packaged.expected.verifyComponentProfiles = () => {
      componentProfileCalls += 1;
      return true;
    };
    packaged.expected.verifyComponentActivation = (check) => {
      componentActivationCalls += 1;
      expect(check.requiredActivation.eventRecordHash).toBe(packaged.expected.recordHash);
      return { status: "activated" };
    };
    packaged.expected.verifyUnexecutedSupersession = (check) => {
      supersessionCalls += 1;
      expect(check.kind).toBe(kind as CoreUnexecutedSupersessionCheck["kind"]);
      return true;
    };
    packaged.expected.verifyRetirementFinalization = (check) => {
      retirementFinalizationCalls += 1;
      expect(check.kind).toBe(7);
      return true;
    };
    packaged.expected.verifyAuthentication = (check) => {
      authenticationCalls += 1;
      expect(check.chainId).toBe(packaged.expected.chainId);
      expect(check.recordHash).toBe(packaged.expected.recordHash);
      expect(check.kind).toBe(kind);
      return true;
    };
    packaged.expected.verifyAnchorState = (check) => {
      anchorCalls += 1;
      expect(check.chainId).toBe(packaged.expected.chainId);
      expect(check.signatureHash).toBe(packaged.expected.signatureHash);
      expect(check.kind).toBe(kind);
      return true;
    };

    const result = verifyCoreEnvelopeSemantics(
      packaged.envelope,
      packaged.rawRecordBytes,
      packaged.expected,
    );
    expect(result.kind).toBe(kind);
    expect(result.recordHash).toBe(packaged.expected.recordHash);
    expect(result.terminalEffect).toBe(kind === 7 ? "subject" : null);
    expect(result.componentEffect).toBe(kind === 4 ? "activated" : null);
    expect(result.componentStatus).toBe(kind === 4 ? "activated" : null);
    expect(authenticationCalls).toBe(1);
    expect(anchorCalls).toBe(1);
    expect(componentGraphCalls).toBe(kind === 4 ? 1 : 0);
    expect(componentProfileCalls).toBe(kind === 4 ? 1 : 0);
    expect(componentActivationCalls).toBe(kind === 4 ? 1 : 0);
    expect(supersessionCalls).toBe(kind === 2 || kind === 5 ? 1 : 0);
    expect(retirementFinalizationCalls).toBe(kind === 7 ? 1 : 0);
  });

  test("enforces subject-stream component genesis while allowing watcher genesis", () => {
    const nonComponentGenesis = valuationRecord();
    nonComponentGenesis.context.sequence = "0";
    nonComponentGenesis.context.prev = ZERO_HASH;
    expectCode(() => verify(nonComponentGenesis), "CORE_BINDING_MISMATCH");

    const laterRecordWithoutActiveComponents = valuationRecord();
    laterRecordWithoutActiveComponents.components = ZERO_HASH;
    expectCode(
      () => verify(laterRecordWithoutActiveComponents, ZERO_HASH),
      "CORE_BINDING_MISMATCH",
    );

    const nonzeroGenesisComponents = componentsRecord();
    nonzeroGenesisComponents.components = HASH_B;
    expectCode(
      () => verify(nonzeroGenesisComponents, HASH_B),
      "CORE_BINDING_MISMATCH",
    );

    const nonzeroGenesisSupersedes = componentsRecord();
    nonzeroGenesisSupersedes.supersedes = HASH_B;
    expectCode(
      () => verify(nonzeroGenesisSupersedes, ZERO_HASH),
      "CORE_BINDING_MISMATCH",
    );

    const watcherGenesis = watcherRecord();
    watcherGenesis.context.sequence = "0";
    watcherGenesis.context.prev = ZERO_HASH;
    expect(() => verify(watcherGenesis)).not.toThrow();

    watcherGenesis.components = ZERO_HASH;
    expectCode(
      () => verify(watcherGenesis, ZERO_HASH),
      "CORE_BINDING_MISMATCH",
    );
  });

  test("binds later component generations to the independently supplied active predecessor", () => {
    expect(() => verify(laterComponentsRecord())).not.toThrow();

    const selfConsistentButWrong = laterComponentsRecord();
    selfConsistentButWrong.components = HASH_B;
    selfConsistentButWrong.supersedes = HASH_B;
    expectCode(
      () => verify(selfConsistentButWrong, ACTIVE_COMPONENTS),
      "CORE_BINDING_MISMATCH",
    );

    const wrongSupersedes = laterComponentsRecord();
    wrongSupersedes.supersedes = HASH_B;
    expectCode(
      () => verify(wrongSupersedes, ACTIVE_COMPONENTS),
      "CORE_BINDING_MISMATCH",
    );

    const zeroPredecessor = laterComponentsRecord();
    zeroPredecessor.components = ZERO_HASH;
    zeroPredecessor.supersedes = ZERO_HASH;
    expectCode(
      () => verify(zeroPredecessor, ZERO_HASH),
      "CORE_BINDING_MISMATCH",
    );
  });

  test("binds unique component contract roles to trusted subject and anchor addresses", () => {
    const zeroAddress = componentsRecord();
    contractForRole(zeroAddress, "anchor").address = ZERO_ADDRESS;
    expectCode(() => verify(zeroAddress, ZERO_HASH), "INVALID_SCHEMA");

    const wrongShareVault = componentsRecord();
    contractForRole(wrongShareVault, "share-vault").address = ACCOUNT_B;
    expectCode(() => verify(wrongShareVault, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const wrongShareVaultChain = componentsRecord();
    contractForRole(wrongShareVaultChain, "share-vault").chainId = "1";
    expectCode(() => verify(wrongShareVaultChain, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const eoaShareVault = componentsRecord();
    contractForRole(eoaShareVault, "share-vault").accountType = "eoa";
    contractForRole(eoaShareVault, "share-vault").runtimeCodeHash = ZERO_HASH;
    expectCode(() => verify(eoaShareVault, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const wrongAnchor = componentsRecord();
    contractForRole(wrongAnchor, "anchor").address = ACCOUNT_B;
    expectCode(() => verify(wrongAnchor, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const wrongAnchorChain = componentsRecord();
    contractForRole(wrongAnchorChain, "anchor").chainId = "1";
    expectCode(() => verify(wrongAnchorChain, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const eoaAnchor = componentsRecord();
    contractForRole(eoaAnchor, "anchor").accountType = "eoa";
    contractForRole(eoaAnchor, "anchor").runtimeCodeHash = ZERO_HASH;
    expectCode(() => verify(eoaAnchor, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const duplicateAnchor = componentsRecord();
    const secondAnchor = clone(contractForRole(duplicateAnchor, "anchor"));
    secondAnchor.address = ACCOUNT_B;
    duplicateAnchor.contracts.splice(2, 0, secondAnchor);
    expectCode(() => verify(duplicateAnchor, ZERO_HASH), "CORE_BINDING_MISMATCH");
  });

  test("enforces account-type, runtime-code-hash, and proxy coherence", () => {
    const contractWithZeroCode = componentsRecord();
    contractForRole(contractWithZeroCode, "accountant").runtimeCodeHash = ZERO_HASH;
    expectCode(() => verify(contractWithZeroCode, ZERO_HASH), "INVALID_SCHEMA");

    const eoaWithCode = componentsRecord();
    contractForRole(eoaWithCode, "strategy-manager").runtimeCodeHash = HASH_A;
    expectCode(() => verify(eoaWithCode, ZERO_HASH), "INVALID_SCHEMA");

    const eoaProxy = componentsRecord();
    contractForRole(eoaProxy, "strategy-manager").proxy = {
      implementation: ACCOUNT_B,
      implementationCodeHash: HASH_B,
      admin: ACCOUNT_A,
    };
    expectCode(() => verify(eoaProxy, ZERO_HASH), "INVALID_SCHEMA");

    const zeroProxyImplementation = componentsRecord();
    contractForRole(zeroProxyImplementation, "accountant").proxy = {
      implementation: ZERO_ADDRESS,
      implementationCodeHash: HASH_B,
      admin: ACCOUNT_A,
    };
    expectCode(() => verify(zeroProxyImplementation, ZERO_HASH), "INVALID_SCHEMA");

    const coherentProxy = componentsRecord();
    contractForRole(coherentProxy, "accountant").proxy = {
      implementation: ACCOUNT_B,
      implementationCodeHash: HASH_B,
      admin: ACCOUNT_A,
    };
    expect(() => verify(coherentProxy, ZERO_HASH)).not.toThrow();

    const proxyWithoutDedicatedAdmin = componentsRecord();
    contractForRole(proxyWithoutDedicatedAdmin, "accountant").proxy = {
      implementation: ACCOUNT_B,
      implementationCodeHash: HASH_B,
      admin: null,
    };
    expect(() => verify(proxyWithoutDedicatedAdmin, ZERO_HASH)).not.toThrow();
  });

  test("enforces exact authority-source discriminator semantics", () => {
    const zeroSourceContract = componentsRecord();
    authorityForRole(zeroSourceContract, "settlement").source.contract = ZERO_ADDRESS;
    expectCode(() => verify(zeroSourceContract, ZERO_HASH), "INVALID_SCHEMA");

    const unresolvedOnchain = componentsRecord();
    authorityForRole(unresolvedOnchain, "settlement").source.getter = null;
    authorityForRole(unresolvedOnchain, "settlement").source.eventTopic = null;
    expectCode(() => verify(unresolvedOnchain, ZERO_HASH), "INVALID_SCHEMA");

    const malformedAttested = componentsRecord();
    authorityForRole(malformedAttested, "settlement").source.type = "attested";
    expectCode(() => verify(malformedAttested, ZERO_HASH), "INVALID_SCHEMA");

    const validAttested = componentsRecord();
    authorityForRole(validAttested, "settlement").source = {
      type: "attested",
      contract: null,
      getter: null,
      eventTopic: null,
    };
    expect(() => verify(validAttested, ZERO_HASH)).not.toThrow();
  });

  test("requires genesis invariants and independent component graph approval", () => {
    const nonzeroGeneration = componentsRecord();
    nonzeroGeneration.generation = "1";
    expectCode(() => verify(nonzeroGeneration, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const genesisMigration = componentsRecord();
    genesisMigration.migration = {};
    expectCode(() => verify(genesisMigration, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const differentBootstrapAnchor = componentsRecord();
    contractForRole(differentBootstrapAnchor, "anchor").address = ACCOUNT_B;
    const differentAnchorPackage = packageRecord(differentBootstrapAnchor, {
      expectedComponents: ZERO_HASH,
      componentAnchor: ACCOUNT_B,
    });
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        differentAnchorPackage.envelope,
        differentAnchorPackage.rawRecordBytes,
        differentAnchorPackage.expected,
      ),
      "CORE_BINDING_MISMATCH",
    );

    const packaged = packageRecord(componentsRecord(), { expectedComponents: ZERO_HASH });
    let graphCalls = 0;
    packaged.expected.verifyComponentGraph = (check) => {
      graphCalls += 1;
      expect(check.generation).toBe(0n);
      expect(check.components).toBe(ZERO_HASH);
      expect(check.supersedes).toBe(ZERO_HASH);
      expect(check.declaredAnchor).toBe(VERIFYING_CONTRACT);
      expect(check.attestationAnchor).toBe(VERIFYING_CONTRACT);
      expect(check.migration).toBeNull();
      expect(check.contracts.length).toBe(componentFixture.contracts.length);
      return false;
    };
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        packaged.envelope,
        packaged.rawRecordBytes,
        packaged.expected,
      ),
      "COMPONENT_GRAPH_FAILED",
    );
    expect(graphCalls).toBe(1);
  });

  test("passes old and newly declared anchors separately for a component migration", () => {
    const migration = laterComponentsRecord();
    contractForRole(migration, "anchor").address = ACCOUNT_B;
    migration.migration = {
      anchorTransition: {
        oldAnchor: VERIFYING_CONTRACT,
        newAnchor: ACCOUNT_B,
        continuingWatcherHeads: [],
      },
    };
    refreshComponentActivationCommitment(migration);
    const packaged = packageRecord(migration, {
      expectedComponents: ACTIVE_COMPONENTS,
      componentAnchor: ACCOUNT_B,
    });
    let graphCalls = 0;
    packaged.expected.verifyComponentGraph = (check) => {
      graphCalls += 1;
      expect(check.generation).toBe(1n);
      expect(check.components).toBe(ACTIVE_COMPONENTS);
      expect(check.supersedes).toBe(ACTIVE_COMPONENTS);
      expect(check.declaredAnchor).toBe(ACCOUNT_B);
      expect(check.attestationAnchor).toBe(VERIFYING_CONTRACT);
      expect(check.migration).toEqual(migration.migration);
      return true;
    };
    expect(() => verifyCoreEnvelopeSemantics(
      packaged.envelope,
      packaged.rawRecordBytes,
      packaged.expected,
    )).not.toThrow();
    expect(graphCalls).toBe(1);
  });

  test("binds a genesis activation intent and verifies its receipt after its anchor", () => {
    const packaged = packageRecord(componentsRecord(), { expectedComponents: ZERO_HASH });
    const callOrder: string[] = [];
    packaged.expected.verifyComponentGraph = () => {
      callOrder.push("graph");
      return true;
    };
    packaged.expected.verifyComponentProfiles = () => {
      callOrder.push("profiles");
      return true;
    };
    packaged.expected.verifyAuthentication = () => {
      callOrder.push("authentication");
      return true;
    };
    packaged.expected.verifyAnchorState = () => {
      callOrder.push("anchor");
      return true;
    };
    packaged.expected.verifyComponentActivation = (check) => {
      callOrder.push("activation");
      expect(check.nonce).toBe(1n);
      expect(check.expectedActive).toBeNull();
      expect(check.generation).toBe(0n);
      expect(check.declaredAnchor).toBe(VERIFYING_CONTRACT);
      expect(check.attestationAnchor).toBe(VERIFYING_CONTRACT);
      expect(check.migrationHash).toBe(ZERO_HASH);
      expect(check.migration).toBeNull();
      expect(check.requiredActivation.governanceAuthorizedFrom).toBe("bootstrap");
      expect(check.requiredActivation.anchorTransitionRequired).toBe(false);
      expect(check.requiredActivation.preState).toEqual({
        recordHash: ZERO_HASH,
        generation: 0n,
        anchor: "0x0000000000000000000000000000000000000000",
        nonce: 0n,
      });
      expect(check.requiredActivation.activationBoundary).toBe("transaction-completion");
      return { status: "activated" };
    };
    const result = verifyCoreEnvelopeSemantics(
      packaged.envelope,
      packaged.rawRecordBytes,
      packaged.expected,
    );
    expect(result.componentEffect).toBe("activated");
    expect(callOrder).toEqual(["graph", "profiles", "authentication", "anchor", "activation"]);

    packaged.expected.verifyComponentActivation = () => ({
      status: "invalid",
      reason: "conflicting activation receipt",
    });
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        packaged.envelope,
        packaged.rawRecordBytes,
        packaged.expected,
      ),
      "COMPONENT_ACTIVATION_FAILED",
    );
  });

  test("commits the active predecessor, anchor transition, nonce, window, and checks", () => {
    const migration = laterComponentsRecord();
    contractForRole(migration, "anchor").address = ACCOUNT_B;
    migration.migration = {
      anchorTransition: {
        oldAnchor: VERIFYING_CONTRACT,
        newAnchor: ACCOUNT_B,
        continuingWatcherHeads: [{
          streamId: HASH_B,
          sequence: "3",
          kind: "10",
          recordHash: HASH_C,
        }],
      },
    };
    migration.activation.conditions.checks = [{
      id: "old-settlement-paused",
      target: ACCOUNT_A,
      callData: "0x12345678",
      expectedReturnDataHash: HASH_A,
    }];
    refreshComponentActivationCommitment(migration);
    const packaged = packageRecord(migration, {
      expectedComponents: ACTIVE_COMPONENTS,
      componentAnchor: ACCOUNT_B,
    });
    packaged.expected.verifyComponentActivation = (check) => {
      expect(check.nonce).toBe(2n);
      expect(check.expectedActive).toEqual({
        recordHash: ACTIVE_COMPONENTS,
        generation: 0n,
        anchor: VERIFYING_CONTRACT,
      });
      expect(check.checks.map((condition) => condition.id)).toEqual(["old-settlement-paused"]);
      expect(check.requiredActivation.anchorTransitionRequired).toBe(true);
      expect(check.requiredActivation.anchorTransitionEvidence).toEqual({
        oldAnchor: VERIFYING_CONTRACT,
        newAnchor: ACCOUNT_B,
        exactFrozenHeadSet: true,
        exactImportedHeadSet: true,
        exactPostImportHeadSet: true,
        exactMigrationEventSet: true,
        sameSuccessfulCanonicalTransaction: true,
      });
      expect(check.migration).toEqual(migration.migration);
      expect(check.continuingWatcherHeads).toEqual([{
        streamId: HASH_B,
        sequence: 3n,
        kind: 10,
        recordHash: HASH_C,
      }]);
      expect(check.requiredActivation.eventRecordHash).toBe(packaged.expected.recordHash);
      expect(check.requiredActivation.eventAnchor).toBe(ACCOUNT_B);
      return { status: "activated" };
    };
    expect(() => verifyCoreEnvelopeSemantics(
      packaged.envelope,
      packaged.rawRecordBytes,
      packaged.expected,
    )).not.toThrow();
  });

  test("rejects malformed or stale activation commitments before external receipt checks", () => {
    const badCommitment = componentsRecord();
    badCommitment.activation.actionCommitment = HASH_A;
    expectCode(() => verify(badCommitment, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const reversedWindow = componentsRecord();
    reversedWindow.activation.conditions.validFromBlock = "1001";
    expectCode(() => verify(reversedWindow, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const genesisNonce = componentsRecord();
    genesisNonce.activation.nonce = "2";
    expectCode(() => verify(genesisNonce, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const missingExpectedActive = laterComponentsRecord();
    missingExpectedActive.activation.conditions.expectedActive = null;
    expectCode(() => verify(missingExpectedActive), "CORE_BINDING_MISMATCH");

    const wrongActiveAnchor = laterComponentsRecord();
    wrongActiveAnchor.activation.conditions.expectedActive!.anchor = ACCOUNT_B;
    refreshComponentActivationCommitment(wrongActiveAnchor);
    expectCode(() => verify(wrongActiveAnchor), "CORE_BINDING_MISMATCH");

    const skippedGeneration = laterComponentsRecord();
    skippedGeneration.generation = "2";
    expectCode(() => verify(skippedGeneration), "CORE_BINDING_MISMATCH");

    const unsortedChecks = componentsRecord();
    unsortedChecks.activation.conditions.checks = [
      { id: "z-check", target: ACCOUNT_A, callData: "0x", expectedReturnDataHash: HASH_A },
      { id: "a-check", target: ACCOUNT_A, callData: "0x", expectedReturnDataHash: HASH_A },
    ];
    expectCode(() => verify(unsortedChecks, ZERO_HASH), "ARRAY_ORDER");

    const futureLocator = componentsRecord();
    futureLocator.activation.transactionHash = HASH_A;
    expectCode(() => verify(futureLocator, ZERO_HASH), "INVALID_SCHEMA");
    const futureLog = componentsRecord();
    futureLog.activation.conditions.logIndex = "1";
    expectCode(() => verify(futureLog, ZERO_HASH), "INVALID_SCHEMA");

    const missingTransition = laterComponentsRecord();
    contractForRole(missingTransition, "anchor").address = ACCOUNT_B;
    refreshComponentActivationCommitment(missingTransition);
    const missingTransitionPackage = packageRecord(missingTransition, {
      expectedComponents: ACTIVE_COMPONENTS,
      componentAnchor: ACCOUNT_B,
    });
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        missingTransitionPackage.envelope,
        missingTransitionPackage.rawRecordBytes,
        missingTransitionPackage.expected,
      ),
      "INVALID_SCHEMA",
    );

    const migrationLocator = laterComponentsRecord();
    migrationLocator.migration = { transactionHash: HASH_A };
    refreshComponentActivationCommitment(migrationLocator);
    expectCode(() => verify(migrationLocator), "CORE_BINDING_MISMATCH");

    const metaLocator = componentsRecord();
    metaLocator.meta = { activation: { logIndex: "1" } };
    expectCode(() => verify(metaLocator, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const profileLocator = componentsRecord();
    profileLocator.profileParameters = { blockNumber: "100" };
    expectCode(() => verify(profileLocator, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const extensionLocator = componentsRecord();
    extensionLocator.extensions = [{
      id: "activation-locator",
      critical: false,
      value: { transactionIndex: "1" },
    }];
    expectCode(() => verify(extensionLocator, ZERO_HASH), "CORE_BINDING_MISMATCH");
  });

  test("returns unexecuted history and lets a later candidate reuse generation and nonce", () => {
    const unexecutedCandidate = laterComponentsRecord();
    const unexecutedPackage = packageRecord(unexecutedCandidate, {
      expectedComponents: ACTIVE_COMPONENTS,
    });
    unexecutedPackage.expected.verifyComponentActivation = () => ({ status: "unexecuted" });
    const unexecutedResult = verifyCoreEnvelopeSemantics(
      unexecutedPackage.envelope,
      unexecutedPackage.rawRecordBytes,
      unexecutedPackage.expected,
    );
    expect(unexecutedResult.componentStatus).toBe("unexecuted");
    expect(unexecutedResult.componentEffect).toBeNull();

    const retryCandidate = laterComponentsRecord();
    retryCandidate.context.sequence = "2";
    retryCandidate.context.prev = unexecutedPackage.expected.recordHash;
    refreshComponentActivationCommitment(retryCandidate);
    const packaged = packageRecord(retryCandidate, {
      expectedComponents: ACTIVE_COMPONENTS,
    });
    packaged.expected.verifyComponentActivation = (check) => {
      expect(check.sequence).toBe(2n);
      expect(check.generation).toBe(1n);
      expect(check.nonce).toBe(2n);
      expect(check.expectedActive?.recordHash).toBe(ACTIVE_COMPONENTS);
      return { status: "activated" };
    };
    const retryResult = verifyCoreEnvelopeSemantics(
      packaged.envelope,
      packaged.rawRecordBytes,
      packaged.expected,
    );
    expect(retryResult.componentStatus).toBe("activated");
    expect(retryResult.componentEffect).toBe("activated");
  });

  test.each(["settlement", "anchor", "valuation", "venue", "storage", "watcher"])(
    "rejects unsupported %s component profile selection",
    (axis) => {
      const record = componentsRecord();
      record.profiles[axis] = "evil/1";
      expectCode(() => verify(record, ZERO_HASH), "UNSUPPORTED_PROFILE");
    },
  );

  test("treats request liveness as a supported behavior selector", () => {
    const record = componentsRecord();
    record.profiles.requestLiveness = "bounded";
    expectCode(() => verify(record, ZERO_HASH), "UNSUPPORTED_PROFILE");

    const supported = new Set([...SUPPORTED_PROFILE_IDS, "bounded"]);
    expect(() => verify(record, ZERO_HASH, new Set(), supported)).not.toThrow();
  });

  test("enforces bundled settlement and Polymarket component terms", () => {
    const wrongShareDecimals = componentsRecord();
    wrongShareDecimals.share.decimals = "17";
    expectCode(() => verify(wrongShareDecimals, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const transferFee = componentsRecord();
    transferFee.share.transferFee = true;
    expectCode(() => verify(transferFee, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const otherPositionFormat = componentsRecord();
    otherPositionFormat.portfolio.positionFormats = ["position/other/1"];
    expectCode(
      () => verify(
        otherPositionFormat,
        ZERO_HASH,
        new Set(),
        new Set([...SUPPORTED_PROFILE_IDS, "position/other/1"]),
      ),
      "CORE_BINDING_MISMATCH",
    );

    const directCustody = componentsRecord();
    directCustody.portfolio.custodyModel = "direct";
    expectCode(() => verify(directCustody, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const wrongAccountingAsset = componentsRecord();
    wrongAccountingAsset.accountingAsset.address = ACCOUNT_A;
    expectCode(() => verify(wrongAccountingAsset, ZERO_HASH), "CORE_BINDING_MISMATCH");

    const remoteCustody = componentsRecord();
    contractForRole(remoteCustody, "strategy-custody").chainId = "1";
    expectCode(() => verify(remoteCustody, ZERO_HASH), "CORE_BINDING_MISMATCH");
  });

  test("requires independent approval of full component profile configuration", () => {
    const record = componentsRecord();
    contractForRole(record, "strategy-custody").address = ACCOUNT_B;
    const packaged = packageRecord(record, { expectedComponents: ZERO_HASH });
    let profileCalls = 0;
    packaged.expected.verifyComponentProfiles = (check) => {
      profileCalls += 1;
      expect(check.profiles).toEqual(componentFixture.profiles);
      expect(check.profileParameters).toEqual(componentFixture.profileParameters);
      expect(check.accountingAsset).toEqual(componentFixture.accountingAsset);
      expect(check.portfolio).toEqual(componentFixture.portfolio);
      expect(check.contracts.length).toBe(componentFixture.contracts.length);
      expect(check.contracts.filter((contract) => contract.role === "strategy-custody"))
        .toHaveLength(1);
      expect(check.contracts.find((contract) => contract.role === "strategy-custody")?.address)
        .toBe(ACCOUNT_B);
      return false;
    };
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        packaged.envelope,
        packaged.rawRecordBytes,
        packaged.expected,
      ),
      "COMPONENT_PROFILE_FAILED",
    );
    expect(profileCalls).toBe(1);
  });

  test("binds unexecuted retries to independent same-epoch price-attempt history", () => {
    type PriorAttempt = {
      hash: Hex;
      subjectId: Hex;
      kind: 2 | 5;
      sequence: bigint;
      epoch: bigint;
      priceAttempt: bigint;
      registryAnchored: boolean;
      receiptObserved: boolean;
      latestUnresolved: boolean;
    };
    const validator = (prior: PriorAttempt | null) => (
      check: CoreUnexecutedSupersessionCheck,
    ): boolean => {
      if (prior === null) return check.supersedesUnexecuted === null;
      return check.supersedesUnexecuted?.toLowerCase() === prior.hash.toLowerCase()
        && check.subjectId.toLowerCase() === prior.subjectId.toLowerCase()
        && check.epoch === prior.epoch
        && (prior.kind === 2 || prior.kind === 5)
        && prior.sequence < check.sequence
        && prior.priceAttempt < check.priceAttempt
        && prior.registryAnchored
        && !prior.receiptObserved
        && prior.latestUnresolved;
    };

    const settlementRetry = settlementRecord();
    settlementRetry.context.sequence = "3";
    settlementRetry.settlement.priceAttempt = "2";
    settlementRetry.supersedesUnexecuted = HASH_C;
    const settlementPackage = packageRecord(settlementRetry);
    const priorWinddown: PriorAttempt = {
      hash: HASH_C,
      subjectId: settlementPackage.expected.subjectId,
      kind: 5,
      sequence: 1n,
      epoch: 1n,
      priceAttempt: 1n,
      registryAnchored: true,
      receiptObserved: false,
      latestUnresolved: true,
    };
    let settlementChecks = 0;
    settlementPackage.expected.verifyUnexecutedSupersession = (check) => {
      settlementChecks += 1;
      expect(check.kind).toBe(2);
      expect(check.priceAttempt).toBe(2n);
      expect(check.recordPrev).toBe(HASH_A);
      expect(check.previousAnchor).toBe(HASH_A);
      return validator(priorWinddown)(check);
    };
    expect(() => verifyCoreEnvelopeSemantics(
      settlementPackage.envelope,
      settlementPackage.rawRecordBytes,
      settlementPackage.expected,
    )).not.toThrow();
    expect(settlementChecks).toBe(1);

    const wrongEpochPackage = packageRecord(settlementRetry);
    wrongEpochPackage.expected.verifyUnexecutedSupersession = validator({
      ...priorWinddown,
      epoch: 2n,
    });
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        wrongEpochPackage.envelope,
        wrongEpochPackage.rawRecordBytes,
        wrongEpochPackage.expected,
      ),
      "UNEXECUTED_SUPERSESSION_FAILED",
    );

    const nonEarlierAttemptPackage = packageRecord(settlementRetry);
    nonEarlierAttemptPackage.expected.verifyUnexecutedSupersession = validator({
      ...priorWinddown,
      priceAttempt: 2n,
    });
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        nonEarlierAttemptPackage.envelope,
        nonEarlierAttemptPackage.rawRecordBytes,
        nonEarlierAttemptPackage.expected,
      ),
      "UNEXECUTED_SUPERSESSION_FAILED",
    );

    const staleUnresolvedPackage = packageRecord(settlementRetry);
    staleUnresolvedPackage.expected.verifyUnexecutedSupersession = validator({
      ...priorWinddown,
      latestUnresolved: false,
    });
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        staleUnresolvedPackage.envelope,
        staleUnresolvedPackage.rawRecordBytes,
        staleUnresolvedPackage.expected,
      ),
      "UNEXECUTED_SUPERSESSION_FAILED",
    );

    const missingSupersession = settlementRecord();
    missingSupersession.context.sequence = "3";
    missingSupersession.settlement.priceAttempt = "2";
    const missingPackage = packageRecord(missingSupersession);
    missingPackage.expected.verifyUnexecutedSupersession = validator(priorWinddown);
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        missingPackage.envelope,
        missingPackage.rawRecordBytes,
        missingPackage.expected,
      ),
      "UNEXECUTED_SUPERSESSION_FAILED",
    );

    const freshPackage = packageRecord(settlementRecord());
    freshPackage.expected.verifyUnexecutedSupersession = validator(null);
    expect(() => verifyCoreEnvelopeSemantics(
      freshPackage.envelope,
      freshPackage.rawRecordBytes,
      freshPackage.expected,
    )).not.toThrow();

    const winddownRetry = winddownRecord();
    winddownRetry.context.sequence = "4";
    winddownRetry.priceAttempt = "3";
    winddownRetry.supersedesUnexecuted = HASH_B;
    const winddownPackage = packageRecord(winddownRetry);
    winddownPackage.expected.verifyUnexecutedSupersession = validator({
      hash: HASH_B,
      subjectId: winddownPackage.expected.subjectId,
      kind: 2,
      sequence: 1n,
      epoch: 1n,
      priceAttempt: 1n,
      registryAnchored: true,
      receiptObserved: false,
      latestUnresolved: true,
    });
    expect(() => verifyCoreEnvelopeSemantics(
      winddownPackage.envelope,
      winddownPackage.rawRecordBytes,
      winddownPackage.expected,
    )).not.toThrow();

    const falseCallbackPackage = packageRecord(winddownRetry);
    falseCallbackPackage.expected.verifyUnexecutedSupersession = () => false;
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        falseCallbackPackage.envelope,
        falseCallbackPackage.rawRecordBytes,
        falseCallbackPackage.expected,
      ),
      "UNEXECUTED_SUPERSESSION_FAILED",
    );

    const zeroSettlement = settlementRecord();
    zeroSettlement.supersedesUnexecuted = ZERO_HASH;
    expectCode(() => verify(zeroSettlement), "INVALID_SCHEMA");

    const zeroWinddown = winddownRecord();
    zeroWinddown.supersedesUnexecuted = ZERO_HASH;
    expectCode(() => verify(zeroWinddown), "INVALID_SCHEMA");
  });

  test("narrows kind 7 to zero-obligation subject closure", () => {
    const invalidRecords: TestRecord[] = [];

    const generation = finalRecord();
    generation.scope = "generation";
    invalidRecords.push(generation);

    const superseded = finalRecord();
    superseded.reason = "superseded";
    invalidRecords.push(superseded);

    const migration = finalRecord();
    migration.migration = { successorComponents: HASH_C };
    invalidRecords.push(migration);

    const epochScoped = finalRecord();
    epochScoped.context.epoch = "1";
    invalidRecords.push(epochScoped);

    for (const field of [
      "finalSupply",
      "pendingRequests",
      "outstandingClaims",
      "claimFunding",
    ] as const) {
      const nonzero = finalRecord();
      nonzero[field] = "1";
      invalidRecords.push(nonzero);
    }

    for (const record of invalidRecords) {
      expectCode(() => verify(record), "INVALID_SCHEMA");
    }
  });

  test("requires closed, ordered residual and recovery declarations", () => {
    const beforeResolution = {
      action: "transfer",
      timing: "before-finalization",
      beneficiary: ACCOUNT_B,
      evidenceHash: HASH_C,
    };
    const complete = finalRecord();
    complete.residualPositions = [{
      id: "position-a",
      position: { profile: "position/gnosis-ctf/1", positionId: "1" },
      custodyAccount: ACCOUNT_A,
      quantity: "1",
      resolution: { ...beforeResolution, action: "redeem", beneficiary: null },
    }];
    complete.residualCash = [{
      id: "cash-a",
      chainId: "137",
      account: ACCOUNT_A,
      asset: ACCOUNT_B,
      amount: "1",
      resolution: beforeResolution,
    }];
    complete.feeAccruals = [{
      id: "fee-a",
      denomination: "accounting-asset",
      amount: "1",
      resolution: { ...beforeResolution, action: "pay" },
    }];
    complete.liabilities = [{
      id: "liability-a",
      amount: "1",
      unit: "pUSD",
      resolution: { ...beforeResolution, action: "release" },
    }];
    complete.recovery = {
      status: "resolved-before-finalization",
      rightsCount: "1",
      manifestHash: HASH_B,
    };
    expect(() => verify(complete)).not.toThrow();

    const unordered = clone(complete);
    unordered.residualCash = [
      { ...complete.residualCash[0], id: "cash-z" },
      { ...complete.residualCash[0], id: "cash-a" },
    ];
    expectCode(() => verify(unordered), "ARRAY_ORDER");

    const duplicate = clone(complete);
    duplicate.feeAccruals = [
      complete.feeAccruals[0],
      { ...complete.feeAccruals[0], amount: "2" },
    ];
    expectCode(() => verify(duplicate), "DUPLICATE_SORT_KEY");

    const badBeforeEvidence = clone(complete);
    badBeforeEvidence.residualCash[0].resolution.evidenceHash = null;
    expectCode(() => verify(badBeforeEvidence), "INVALID_SCHEMA");

    const staleAtomicTiming = clone(complete);
    staleAtomicTiming.residualPositions[0].resolution.timing = "in-finalization";
    staleAtomicTiming.residualPositions[0].resolution.evidenceHash = null;
    expectCode(() => verify(staleAtomicTiming), "INVALID_SCHEMA");

    const zeroResidual = clone(complete);
    zeroResidual.residualPositions[0].quantity = "0";
    expectCode(() => verify(zeroResidual), "INVALID_SCHEMA");

    const zeroCashChain = clone(complete);
    zeroCashChain.residualCash[0].chainId = "0";
    expectCode(() => verify(zeroCashChain), "INVALID_SCHEMA");

    const openRecovery = clone(complete);
    openRecovery.recovery = {
      status: "open",
      rightsCount: "1",
      manifestHash: HASH_B,
    };
    expectCode(() => verify(openRecovery), "INVALID_SCHEMA");

    const emptyResolvedRecovery = clone(complete);
    emptyResolvedRecovery.recovery.rightsCount = "0";
    expectCode(() => verify(emptyResolvedRecovery), "INVALID_SCHEMA");

    const staleAtomicRecovery = clone(complete);
    staleAtomicRecovery.recovery.status = "resolved-in-finalization";
    expectCode(() => verify(staleAtomicRecovery), "INVALID_SCHEMA");
  });

  test("requires independent successful atomic finalization before reporting terminal effect", () => {
    type LaterRecord = { kind: number; changesSettlementBearingOutput?: boolean };
    type FinalizationState = {
      canonicalWrapperSucceeded: boolean;
      registeredAtomicWrapper: boolean;
      protectedAnchorSucceeded: boolean;
      storedRecordHash: Hex;
      storedSequence: bigint;
      settlementRetired: boolean;
      subjectFinalized: boolean;
      retirementFinalRecordBound: {
        canonical: boolean;
        recordHash: Hex;
        sequence: bigint;
      } | null;
      vaultRetired: {
        canonical: boolean;
        subjectId: Hex;
      } | null;
      obligationsMatch: boolean;
      stateReadBeforeAndAfterAnchor: boolean;
      resolutionEvidencePrecedesFinalization: boolean;
      custodyPerimeterEmpty: boolean;
      accountingPerimeterEmpty: boolean;
      wrapperNonReentrant: boolean;
      wrapperTraceHasNoResolutionOrArbitraryCalls: boolean;
      laterRecords: LaterRecord[];
    };

    const packaged = packageRecord(finalRecord());
    const validState: FinalizationState = {
      canonicalWrapperSucceeded: true,
      registeredAtomicWrapper: true,
      protectedAnchorSucceeded: true,
      storedRecordHash: packaged.expected.recordHash,
      storedSequence: packaged.expected.sequence,
      settlementRetired: true,
      subjectFinalized: true,
      retirementFinalRecordBound: {
        canonical: true,
        recordHash: packaged.expected.recordHash,
        sequence: packaged.expected.sequence,
      },
      vaultRetired: {
        canonical: true,
        subjectId: packaged.expected.subjectId,
      },
      obligationsMatch: true,
      stateReadBeforeAndAfterAnchor: true,
      resolutionEvidencePrecedesFinalization: true,
      custodyPerimeterEmpty: true,
      accountingPerimeterEmpty: true,
      wrapperNonReentrant: true,
      wrapperTraceHasNoResolutionOrArbitraryCalls: true,
      laterRecords: [
        { kind: 8, changesSettlementBearingOutput: false },
        { kind: 8, changesSettlementBearingOutput: false },
      ],
    };
    const validator = (state: FinalizationState) => (
      check: CoreRetirementFinalizationCheck,
    ): boolean => state.canonicalWrapperSucceeded
      && state.registeredAtomicWrapper
      && state.protectedAnchorSucceeded
      && state.storedRecordHash.toLowerCase()
        === check.requiredFinalization.storedRecordHash.toLowerCase()
      && state.storedSequence === check.requiredFinalization.storedSequence
      && state.settlementRetired === check.requiredFinalization.settlementRetired
      && state.subjectFinalized === check.requiredFinalization.subjectFinalized
      && state.retirementFinalRecordBound !== null
      && state.retirementFinalRecordBound.canonical
        === check.requiredFinalization.canonicalEventEvidence.retirementFinalRecordBound.canonical
      && state.retirementFinalRecordBound.recordHash.toLowerCase()
        === check.requiredFinalization.canonicalEventEvidence.retirementFinalRecordBound.recordHash.toLowerCase()
      && state.retirementFinalRecordBound.sequence
        === check.requiredFinalization.canonicalEventEvidence.retirementFinalRecordBound.sequence
      && state.vaultRetired !== null
      && state.vaultRetired.canonical
        === check.requiredFinalization.canonicalEventEvidence.vaultRetired.canonical
      && state.vaultRetired.subjectId.toLowerCase()
        === check.requiredFinalization.canonicalEventEvidence.vaultRetired.subjectId.toLowerCase()
      && state.obligationsMatch
      && state.stateReadBeforeAndAfterAnchor
        === (check.requiredFinalization.stateRead === "before-and-after-anchor")
      && state.resolutionEvidencePrecedesFinalization
        === check.requiredFinalization.resolutionEvidencePrecedesFinalization
      && state.custodyPerimeterEmpty
        === check.requiredFinalization.custodyPerimeterEmpty
      && state.accountingPerimeterEmpty
        === check.requiredFinalization.accountingPerimeterEmpty
      && state.wrapperNonReentrant === check.requiredFinalization.wrapperNonReentrant
      && state.wrapperTraceHasNoResolutionOrArbitraryCalls
        === check.requiredFinalization.noResolutionOrArbitraryCalls
      && check.kind === 7
      && check.scope === "subject"
      && check.streamId === ZERO_HASH
      && check.finalSupply === 0n
      && check.pendingRequests === 0n
      && check.outstandingClaims === 0n
      && check.claimFunding === 0n
      && check.requiredFinalization.anchorMode === "atomic"
      && check.requiredFinalization.resolutionTiming === "before-finalization"
      && check.requiredFinalization.terminalState.finalSupply === 0n
      && check.requiredFinalization.terminalState.pendingRequests === 0n
      && check.requiredFinalization.terminalState.outstandingClaims === 0n
      && check.requiredFinalization.terminalState.claimFunding === 0n
      && state.laterRecords.every((record) => record.kind
        === check.requiredFinalization.laterSubjectRecordKind
        && record.changesSettlementBearingOutput
          === check.requiredFinalization.laterCorrectionChangesSettlementBearingOutput);

    const callOrder: string[] = [];
    packaged.expected.verifyAuthentication = () => {
      callOrder.push("authentication");
      return true;
    };
    packaged.expected.verifyAnchorState = () => {
      callOrder.push("anchor");
      return true;
    };
    packaged.expected.verifyRetirementFinalization = (check) => {
      callOrder.push("finalization");
      expect(check.recordHash).toBe(packaged.expected.recordHash);
      expect(check.sequence).toBe(packaged.expected.sequence);
      expect(check.shareToken).toBe(componentFixture.subject.shareToken as Address);
      expect(check.components).toBe(ACTIVE_COMPONENTS);
      expect(check.verifyingContract).toBe(packaged.expected.verifyingContract);
      expect(check.signer).toBe(packaged.expected.signer);
      expect(check.signatureScheme).toBe(packaged.expected.signatureScheme);
      expect(check.signatureHash).toBe(packaged.expected.signatureHash);
      expect(check.attestationDigest).toMatch(/^0x[0-9a-f]{64}$/);
      expect(check.migration).toBeNull();
      expect(check.requiredFinalization.settlementRetired).toBe(true);
      expect(check.requiredFinalization.terminalState).toEqual({
        finalSupply: 0n,
        pendingRequests: 0n,
        outstandingClaims: 0n,
        claimFunding: 0n,
      });
      expect(check.requiredFinalization.stateRead).toBe("before-and-after-anchor");
      expect(check.requiredFinalization.resolutionTiming).toBe("before-finalization");
      expect(check.requiredFinalization.resolutionEvidencePrecedesFinalization).toBe(true);
      expect(check.requiredFinalization.custodyPerimeterEmpty).toBe(true);
      expect(check.requiredFinalization.accountingPerimeterEmpty).toBe(true);
      expect(check.requiredFinalization.wrapperNonReentrant).toBe(true);
      expect(check.requiredFinalization.noResolutionOrArbitraryCalls).toBe(true);
      expect(check.requiredFinalization.canonicalEventEvidence.retirementFinalRecordBound)
        .toEqual({
          canonical: true,
          recordHash: packaged.expected.recordHash,
          sequence: packaged.expected.sequence,
        });
      expect(check.requiredFinalization.canonicalEventEvidence.vaultRetired).toEqual({
        canonical: true,
        subjectId: packaged.expected.subjectId,
      });
      expect(check.requiredFinalization.laterSubjectRecordKind).toBe(8);
      expect(check.requiredFinalization.laterCorrectionChangesSettlementBearingOutput).toBe(false);
      return validator(validState)(check);
    };
    const result = verifyCoreEnvelopeSemantics(
      packaged.envelope,
      packaged.rawRecordBytes,
      packaged.expected,
    );
    expect(result.terminalEffect).toBe("subject");
    expect(callOrder).toEqual(["authentication", "anchor", "finalization"]);

    const failures: FinalizationState[] = [
      { ...validState, canonicalWrapperSucceeded: false },
      { ...validState, registeredAtomicWrapper: false },
      { ...validState, protectedAnchorSucceeded: false },
      { ...validState, storedRecordHash: HASH_C },
      { ...validState, storedSequence: validState.storedSequence + 1n },
      { ...validState, settlementRetired: false },
      { ...validState, subjectFinalized: false },
      { ...validState, retirementFinalRecordBound: null },
      {
        ...validState,
        retirementFinalRecordBound: {
          ...validState.retirementFinalRecordBound!,
          canonical: false,
        },
      },
      {
        ...validState,
        retirementFinalRecordBound: {
          ...validState.retirementFinalRecordBound!,
          recordHash: HASH_C,
        },
      },
      {
        ...validState,
        retirementFinalRecordBound: {
          ...validState.retirementFinalRecordBound!,
          sequence: validState.storedSequence + 1n,
        },
      },
      { ...validState, vaultRetired: null },
      {
        ...validState,
        vaultRetired: { ...validState.vaultRetired!, canonical: false },
      },
      {
        ...validState,
        vaultRetired: { ...validState.vaultRetired!, subjectId: HASH_C },
      },
      { ...validState, obligationsMatch: false },
      { ...validState, stateReadBeforeAndAfterAnchor: false },
      { ...validState, resolutionEvidencePrecedesFinalization: false },
      { ...validState, custodyPerimeterEmpty: false },
      { ...validState, accountingPerimeterEmpty: false },
      { ...validState, wrapperNonReentrant: false },
      { ...validState, wrapperTraceHasNoResolutionOrArbitraryCalls: false },
      { ...validState, laterRecords: [{ kind: 4 }] },
      { ...validState, laterRecords: [{ kind: 8, changesSettlementBearingOutput: true }] },
    ];
    for (const state of failures) {
      packaged.expected.verifyRetirementFinalization = validator(state);
      expectCode(
        () => verifyCoreEnvelopeSemantics(
          packaged.envelope,
          packaged.rawRecordBytes,
          packaged.expected,
        ),
        "RETIREMENT_FINALIZATION_FAILED",
      );
    }

    packaged.expected.verifyRetirementFinalization = () => {
      throw new Error("missing canonical wrapper receipt");
    };
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        packaged.envelope,
        packaged.rawRecordBytes,
        packaged.expected,
      ),
      "RETIREMENT_FINALIZATION_FAILED",
    );
  });

  test("rejects unsupported critical extensions but accepts supported or noncritical ids", () => {
    const critical = valuationRecord();
    critical.extensions = [{ id: "audit/critical-1", critical: true, value: null }];
    expectCode(() => verify(critical), "UNSUPPORTED_PROFILE");
    expect(() => verify(
      critical,
      ACTIVE_COMPONENTS,
      new Set(["audit/critical-1"]),
    )).not.toThrow();

    const noncritical = valuationRecord();
    noncritical.extensions = [{ id: "audit/noncritical-1", critical: false, value: null }];
    expect(() => verify(noncritical)).not.toThrow();
  });

  test("requires exact canonical bytes for the parsed record", () => {
    const packaged = packageRecord(valuationRecord());
    const otherRawRecord = canonicalize({ ...packaged.envelope.record, meta: { other: true } });
    expectCode(
      () => verifyCoreEnvelopeSemantics(packaged.envelope, otherRawRecord, packaged.expected),
      "RAW_RECORD_MISMATCH",
    );
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        packaged.envelope,
        `${packaged.rawRecordBytes}\n`,
        packaged.expected,
      ),
      "INVALID_CANONICAL_BYTES",
    );
  });

  test("rejects reordered arrays and duplicate sort keys with different bodies", () => {
    const reorderedLocations = packageRecord(valuationRecord(), {
      locations: ["ar://z", "ar://a"],
    });
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        reorderedLocations.envelope,
        reorderedLocations.rawRecordBytes,
        reorderedLocations.expected,
      ),
      "ARRAY_ORDER",
    );

    const reorderedContracts = componentsRecord();
    [reorderedContracts.contracts[0], reorderedContracts.contracts[1]] = [
      reorderedContracts.contracts[1],
      reorderedContracts.contracts[0],
    ];
    expectCode(() => verify(reorderedContracts, ZERO_HASH), "ARRAY_ORDER");

    const duplicateExtensionKey = valuationRecord();
    duplicateExtensionKey.extensions = [
      { id: "same", critical: false, value: null },
      { id: "same", critical: true, value: null },
    ];
    expectCode(() => verify(duplicateExtensionKey), "DUPLICATE_SORT_KEY");
  });

  test("enforces nested chain/read, value-line, position, holding, and response orders", () => {
    const valuation = valuationRecord();
    valuation.inputs.chainState = [
      { chainId: "138", blockNumber: "1", blockHash: HASH_B, blockTimestamp: "1", reads: [] },
      { chainId: "137", blockNumber: "1", blockHash: HASH_B, blockTimestamp: "1", reads: [] },
    ];
    expectCode(() => verify(valuation), "ARRAY_ORDER");

    const reads = valuationRecord();
    reads.inputs.chainState[0].reads = [
      {
        id: "z-read",
        role: "test",
        contract: ACCOUNT_A,
        callData: "0x",
        returnData: "0x",
        decoded: null,
        unit: "test",
      },
      {
        id: "a-read",
        role: "test",
        contract: ACCOUNT_A,
        callData: "0x",
        returnData: "0x",
        decoded: null,
        unit: "test",
      },
    ];
    expectCode(() => verify(reads), "ARRAY_ORDER");

    const lines = valuationRecord();
    lines.outputs.cashLines = [
      { id: "z-line", amount: "0", unit: "test", evidenceReadIds: [] },
      { id: "a-line", amount: "0", unit: "test", evidenceReadIds: [] },
    ];
    expectCode(() => verify(lines), "ARRAY_ORDER");

    const position = (chainId: string, positionId: string, holdings: Address[]) => ({
      chainId,
      positionContract: ACCOUNT_A,
      positionId,
      holdings: holdings.map((custodyAccount) => ({ custodyAccount, quantity: "1" })),
      aggregateQuantity: holdings.length.toString(),
      markMethod: "cross",
      filled: "0",
      unfilled: "0",
      unfilledMaximumPayout: "0",
      grossMark: "0",
      venueExitCost: "0",
      mark: "0",
      maximumPayout: "0",
      materialityReference: "0",
      materialityBps: "0",
      observationHashes: [],
      venueReferenceMark: null,
    });
    const positions = valuationRecord();
    positions.outputs.perPosition = [
      position("138", "1", [ACCOUNT_A]),
      position("137", "1", [ACCOUNT_A]),
    ];
    expectCode(() => verify(positions), "ARRAY_ORDER");

    const holdings = valuationRecord();
    holdings.outputs.perPosition = [position("137", "1", [ACCOUNT_B, ACCOUNT_A])];
    expectCode(() => verify(holdings), "ARRAY_ORDER");

    const responses = watcherRecord();
    responses.venueState.responses = [
      {
        source: "z",
        request: "test",
        startedAtMs: "1",
        endedAtMs: "2",
        bytesHash: HASH_B,
        locations: ["ar://a"],
        correlation: {},
      },
      {
        source: "a",
        request: "test",
        startedAtMs: "1",
        endedAtMs: "2",
        bytesHash: HASH_C,
        locations: ["ar://a"],
        correlation: {},
      },
    ];
    expectCode(() => verify(responses), "ARRAY_ORDER");

    const responseLocations = watcherRecord();
    responseLocations.venueState.responses = [{
      source: "a",
      request: "test",
      startedAtMs: "1",
      endedAtMs: "2",
      bytesHash: HASH_B,
      locations: ["ar://z", "ar://a"],
      correlation: {},
    }];
    expectCode(() => verify(responseLocations), "ARRAY_ORDER");
  });

  test("enforces request, claim, exclusion, and receipt-accounting orders", () => {
    const settlement = settlementRecord();
    settlement.deposit.requestIds = ["2", "1"];
    expectCode(() => verify(settlement), "ARRAY_ORDER");

    const claim = (requestId: string) => ({
      requestId,
      owner: ACCOUNT_A,
      queuedEpoch: "1",
      settlementEpoch: "1",
      queuedAssets: "1",
      shares: "1",
      leafIndex: "0",
      proof: [],
    });
    const claims = settlementRecord();
    claims.deposit.requestIds = ["1", "2"];
    claims.deposit.root = HASH_B;
    claims.deposit.totalAssets = "2";
    claims.deposit.totalShares = "2";
    claims.deposit.claims = [claim("2"), claim("1")];
    expectCode(() => verify(claims), "ARRAY_ORDER");

    const excluded = settlementRecord();
    excluded.excluded = [
      { leg: "withdraw", requestId: "1", reason: "zero_output" },
      { leg: "deposit", requestId: "2", reason: "zero_output" },
    ];
    expectCode(() => verify(excluded), "ARRAY_ORDER");

    const receipt = receiptRecord();
    receipt.observed.reserveBuckets = [
      { id: "z", asset: ACCOUNT_A, before: "0", after: "0" },
      { id: "a", asset: ACCOUNT_A, before: "0", after: "0" },
    ];
    expectCode(() => verify(receipt), "ARRAY_ORDER");

    const funding = receiptRecord();
    funding.observed.fundingSources = [
      { account: ACCOUNT_B, assetBalanceBefore: "0", encumberedBefore: "0", freeBefore: "0" },
      { account: ACCOUNT_A, assetBalanceBefore: "0", encumberedBefore: "0", freeBefore: "0" },
    ];
    expectCode(() => verify(funding), "ARRAY_ORDER");

    const balances = receiptRecord();
    balances.observed.assetBalances = [
      { account: ACCOUNT_B, asset: ACCOUNT_A, before: "0", after: "0" },
      { account: ACCOUNT_A, asset: ACCOUNT_A, before: "0", after: "0" },
    ];
    expectCode(() => verify(balances), "ARRAY_ORDER");
  });

  test("accepts uint256 and int256 endpoints and rejects one-step overflow", () => {
    const maxComponent = componentsRecord();
    maxComponent.share.initialPps = UINT256_MAX;
    expect(() => verify(maxComponent, ZERO_HASH)).not.toThrow();
    maxComponent.share.initialPps = UINT256_OVERFLOW;
    expectCode(() => verify(maxComponent, ZERO_HASH), "INVALID_NUMERIC_RANGE");

    expect(() => verify(valuationRecord(INT256_MAX))).not.toThrow();
    expect(() => verify(valuationRecord(INT256_MIN))).not.toThrow();
    expectCode(() => verify(valuationRecord(INT256_POSITIVE_OVERFLOW)), "INVALID_NUMERIC_RANGE");
    expectCode(() => verify(valuationRecord(INT256_NEGATIVE_OVERFLOW)), "INVALID_NUMERIC_RANGE");
  });

  test("finds uint256 overflow in nested record families", () => {
    const cases: Array<[string, TestRecord]> = [];

    const valuation = valuationRecord();
    valuation.outputs.totalSupply = UINT256_OVERFLOW;
    cases.push(["valuation", valuation]);

    const settlement = settlementRecord();
    settlement.deposit.totalAssets = UINT256_OVERFLOW;
    cases.push(["settlement", settlement]);

    const receipt = receiptRecord();
    receipt.observed.sourceAssets = UINT256_OVERFLOW;
    cases.push(["receipt", receipt]);

    const winddown = winddownRecord();
    winddown.openedAt = UINT256_OVERFLOW;
    cases.push(["winddown", winddown]);

    const watcher = watcherRecord();
    watcher.window.expectedSamples = UINT256_OVERFLOW;
    cases.push(["watcher", watcher]);

    for (const [name, record] of cases) {
      expectCode(() => verify(record), "INVALID_NUMERIC_RANGE");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test("binds subject, kind, stream, predecessor, component, and record hashes", () => {
    const packaged = packageRecord(valuationRecord());
    const mutations: Array<[string, Partial<CoreEnvelopeVerificationContext>]> = [
      ["chain", { chainId: 1n }],
      ["subject", { subjectId: HASH_B }],
      ["kind", { kind: 2 }],
      ["stream", { streamId: HASH_B }],
      ["predecessor", { prev: HASH_B }],
      ["components", { components: HASH_B }],
      ["component anchor", { componentAnchor: ACCOUNT_B }],
      ["record hash", { recordHash: HASH_B }],
    ];
    for (const [name, mutation] of mutations) {
      expectCode(
        () => verifyCoreEnvelopeSemantics(
          packaged.envelope,
          packaged.rawRecordBytes,
          { ...packaged.expected, ...mutation },
        ),
        "CORE_BINDING_MISMATCH",
      );
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test("binds every supplied attestation field", () => {
    const packaged = packageRecord(valuationRecord());
    const mutations: Array<Partial<CoreEnvelopeVerificationContext>> = [
      { previousAnchor: HASH_B },
      { verifyingContract: ACCOUNT_B },
      { signer: ACCOUNT_B },
      { signatureScheme: 1 },
      { signatureHash: HASH_B },
    ];
    for (const mutation of mutations) {
      expectCode(
        () => verifyCoreEnvelopeSemantics(
          packaged.envelope,
          packaged.rawRecordBytes,
          { ...packaged.expected, ...mutation },
        ),
        "CORE_BINDING_MISMATCH",
      );
    }
  });

  test("requires explicit true authentication and anchor-state results", () => {
    const packaged = packageRecord(valuationRecord());
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        packaged.envelope,
        packaged.rawRecordBytes,
        { ...packaged.expected, verifyAuthentication: () => false },
      ),
      "AUTHENTICATION_FAILED",
    );
    expectCode(
      () => verifyCoreEnvelopeSemantics(
        packaged.envelope,
        packaged.rawRecordBytes,
        { ...packaged.expected, verifyAnchorState: () => false },
      ),
      "ANCHOR_STATE_FAILED",
    );
  });
});
