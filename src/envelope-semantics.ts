// SPDX-License-Identifier: CC0-1.0

import Ajv2020 from "ajv/dist/2020";
import {
  encodePacked,
  keccak256,
  type Address,
  type Hex,
} from "viem";

import envelopeSchema from "../schemas/pmvs-envelope-v1.schema.json";
import {
  PMVS_MAX_RECORD_BYTES,
  WAD,
  ZERO_HASH,
  attestationDigest,
  componentActivationChecksHash,
  componentActivationCommitment,
  componentMigrationHash,
  parseCanonicalJson,
  parseInt256Decimal,
  parseUint256Decimal,
  recordHash,
  subjectId,
  type PMVSActivationCondition,
  type PMVSActiveComponents,
  type PMVSAnchorTransitionHead,
} from "./reference";

type JsonObject = Record<string, unknown>;

type JsonSchemaNode = {
  $ref?: string;
  type?: string | readonly string[];
  const?: unknown;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Record<string, JsonSchemaNode>;
  additionalProperties?: boolean | JsonSchemaNode;
  items?: JsonSchemaNode;
  allOf?: readonly JsonSchemaNode[];
  oneOf?: readonly JsonSchemaNode[];
  anyOf?: readonly JsonSchemaNode[];
  if?: JsonSchemaNode;
  then?: JsonSchemaNode;
  else?: JsonSchemaNode;
};

type SchemaRoot = JsonSchemaNode & {
  $defs: Record<string, JsonSchemaNode>;
};

const schemaRoot = envelopeSchema as unknown as SchemaRoot;
const validateEnvelope = new Ajv2020({ strict: true, allErrors: true }).compile(envelopeSchema);
const UINT64_MAX = (1n << 64n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const POLYGON_CHAIN_ID = 137n;
const POLYGON_PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb" as Address;

/** Numeric kind 6 is reserved and has no accepted Core-v1 record schema. */
export type CoreRecordKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type CoreSignatureScheme = 0 | 1;

export type CoreAuthenticationCheck = {
  chainId: bigint;
  digest: Hex;
  scheme: "eip712-ecdsa" | "eip712-erc1271";
  signature: Hex;
  verifyingContract: Address;
  signer: Address;
  recordHash: Hex;
  subjectId: Hex;
  streamId: Hex;
  kind: CoreRecordKind;
  sequence: bigint;
  prev: Hex;
  previousAnchor: Hex;
};

export type CoreAnchorStateCheck = {
  chainId: bigint;
  subjectId: Hex;
  streamId: Hex;
  kind: CoreRecordKind;
  sequence: bigint;
  recordPrev: Hex;
  previousAnchor: Hex;
  recordHash: Hex;
  signer: Address;
  signatureScheme: CoreSignatureScheme;
  signatureHash: Hex;
};

/**
 * Untrusted component-record claims presented to a callback that must validate
 * them against independently recovered bootstrap, discovery, migration, and
 * activation state.
 */
export type CoreComponentGraphCheck = {
  chainId: bigint;
  subjectId: Hex;
  shareToken: Address;
  recordHash: Hex;
  sequence: bigint;
  recordPrev: Hex;
  previousAnchor: Hex;
  generation: bigint;
  components: Hex;
  supersedes: Hex;
  declaredAnchor: Address;
  attestationAnchor: Address;
  activation: Readonly<Record<string, unknown>>;
  migration: Readonly<Record<string, unknown>> | null;
  contracts: readonly Readonly<Record<string, unknown>>[];
};

/**
 * A component activation assertion presented after authentication and anchor
 * verification. The callback must recover the receipt, logs, trace, discovery
 * state, prior activation nonce, and any anchor imports from canonical chain
 * data. Record-owned fields in this object are not independent evidence.
 */
export type CoreComponentActivationCheck = {
  chainId: bigint;
  subjectId: Hex;
  shareToken: Address;
  recordHash: Hex;
  sequence: bigint;
  recordPrev: Hex;
  generation: bigint;
  declaredAnchor: Address;
  attestationAnchor: Address;
  nonce: bigint;
  actionCommitment: Hex;
  expectedActive: PMVSActiveComponents | null;
  validFromBlock: bigint;
  validThroughBlock: bigint;
  migrationHash: Hex;
  migration: Readonly<Record<string, unknown>> | null;
  continuingWatcherHeads: readonly PMVSAnchorTransitionHead[];
  checksHash: Hex;
  checks: readonly PMVSActivationCondition[];
  confirmationDepth: bigint;
  requiredActivation: {
    transactionStatus: "success";
    canonicalReceipt: true;
    anchorPrecedesActivation: true;
    componentsUpdatedEventCount: 1n;
    eventEmitter: Address;
    eventRecordHash: Hex;
    eventGeneration: bigint;
    eventAnchor: Address;
    eventNonce: bigint;
    eventActionCommitment: Hex;
    anchorHeadKind: 4;
    anchorHeadSequence: bigint;
    anchorHeadRecordHash: Hex;
    governanceAuthorizedFrom: "bootstrap" | "active-generation";
    conditionsPassed: true;
    noOrdinaryCoveredAction: true;
    activationBoundary: "transaction-completion";
    anchorTransitionRequired: boolean;
    preState: {
      recordHash: Hex;
      generation: bigint;
      anchor: Address;
      nonce: bigint;
    };
    postState: {
      recordHash: Hex;
      generation: bigint;
      anchor: Address;
      nonce: bigint;
    };
    anchorTransitionEvidence: null | {
      oldAnchor: Address;
      newAnchor: Address;
      exactFrozenHeadSet: true;
      exactImportedHeadSet: true;
      exactPostImportHeadSet: true;
      exactMigrationEventSet: true;
      sameSuccessfulCanonicalTransaction: true;
    };
  };
};

export type CoreComponentActivationVerification =
  | { status: "activated" }
  | { status: "unexecuted" }
  | { status: "invalid"; reason: string };

/**
 * Hash-bound component declarations presented to an independent profile
 * verifier. The callback must not treat these record-owned values as trusted
 * configuration merely because they appear in this check.
 */
export type CoreComponentProfilesCheck = {
  chainId: bigint;
  subjectId: Hex;
  shareToken: Address;
  recordHash: Hex;
  generation: bigint;
  profiles: Readonly<Record<string, unknown>>;
  profileParameters: Readonly<Record<string, unknown>>;
  share: Readonly<Record<string, unknown>>;
  accountingAsset: Readonly<Record<string, unknown>>;
  portfolio: Readonly<Record<string, unknown>>;
  contracts: readonly Readonly<Record<string, unknown>>[];
  authorities: readonly Readonly<Record<string, unknown>>[];
  capabilities: readonly Readonly<Record<string, unknown>>[];
};

/**
 * A retry claim that must be checked against independently reconstructed
 * registry-anchor and receipt history. A true result means the nullable hash
 * identifies the latest unresolved same-subject, same-epoch pre-action before
 * this price attempt, regardless of whether either action uses the archive or
 * winddown branch.
 */
export type CoreUnexecutedSupersessionCheck = {
  chainId: bigint;
  subjectId: Hex;
  streamId: Hex;
  recordHash: Hex;
  kind: 2 | 5;
  sequence: bigint;
  epoch: bigint;
  priceAttempt: bigint;
  supersedesUnexecuted: Hex | null;
  recordPrev: Hex;
  previousAnchor: Hex;
};

/**
 * A subject-closure assertion presented to an independent chain-history
 * verifier. Every record-owned value in this object is untrusted. A true
 * result means one canonical successful transaction used the registered
 * atomic retirement wrapper, committed this exact kind-7 record, stored its
 * hash and sequence, set both terminal flags, emitted canonically bound
 * RetirementFinalRecordBound and VaultRetired evidence, and read the fixed
 * zero-state predicate before and after the anchor call. An independent
 * verifier must also prove that all declared resolution evidence predates the
 * wrapper transaction and that the custody and accounting perimeters were
 * empty. The wrapper executes no resolution or state-changing token call.
 * Through the verification block, every later subject-stream record must be
 * a non-settlement-bearing correction.
 */
export type CoreRetirementFinalizationCheck = {
  chainId: bigint;
  subjectId: Hex;
  shareToken: Address;
  streamId: Hex;
  recordHash: Hex;
  kind: 7;
  sequence: bigint;
  recordPrev: Hex;
  previousAnchor: Hex;
  components: Hex;
  verifyingContract: Address;
  signer: Address;
  signatureScheme: CoreSignatureScheme;
  signatureHash: Hex;
  attestationDigest: Hex;
  scope: "subject";
  reason: "supply-exhausted" | "zero-nav" | "governance-closure" | "other";
  lastArchiveHash: Hex;
  finalSupply: bigint;
  pendingRequests: bigint;
  outstandingClaims: bigint;
  claimFunding: bigint;
  residualPositions: readonly Readonly<Record<string, unknown>>[];
  residualCash: readonly Readonly<Record<string, unknown>>[];
  feeAccruals: readonly Readonly<Record<string, unknown>>[];
  liabilities: readonly Readonly<Record<string, unknown>>[];
  recovery: Readonly<Record<string, unknown>>;
  migration: null;
  requiredFinalization: {
    anchorMode: "atomic";
    storedRecordHash: Hex;
    storedSequence: bigint;
    settlementRetired: true;
    subjectFinalized: true;
    terminalState: {
      finalSupply: 0n;
      pendingRequests: 0n;
      outstandingClaims: 0n;
      claimFunding: 0n;
    };
    stateRead: "before-and-after-anchor";
    resolutionTiming: "before-finalization";
    resolutionEvidencePrecedesFinalization: true;
    custodyPerimeterEmpty: true;
    accountingPerimeterEmpty: true;
    wrapperNonReentrant: true;
    noResolutionOrArbitraryCalls: true;
    canonicalEventEvidence: {
      retirementFinalRecordBound: {
        canonical: true;
        recordHash: Hex;
        sequence: bigint;
      };
      vaultRetired: {
        canonical: true;
        subjectId: Hex;
      };
    };
    laterSubjectRecordKind: 8;
    laterCorrectionChangesSettlementBearingOutput: false;
  };
};

/**
 * Values independently recovered from canonical chain history. The callbacks
 * must perform the cryptographic, authority, anchor, activation-receipt, and
 * terminal-state checks; this module only constructs and binds their inputs.
 */
export type CoreEnvelopeVerificationContext = {
  chainId: bigint;
  subjectId: Hex;
  streamId: Hex;
  kind: CoreRecordKind;
  sequence: bigint;
  prev: Hex;
  /**
   * Independently resolved active component-record hash. This is zero only for
   * subject-stream component genesis; for a later component record it is the
   * active predecessor component hash.
   */
  components: Hex;
  /** Active anchor, or independently resolved declared anchor for an update. */
  componentAnchor: Address;
  supportedExtensionIds: ReadonlySet<string>;
  /** Implemented profile ids, position-format ids, and behavior selectors. */
  supportedProfileIds: ReadonlySet<string>;
  recordHash: Hex;
  previousAnchor: Hex;
  verifyingContract: Address;
  signer: Address;
  signatureScheme: CoreSignatureScheme;
  signatureHash: Hex;
  verifyComponentGraph: (check: CoreComponentGraphCheck) => boolean;
  /** Must also cross-bind every strategy-custody row to venue verification. */
  verifyComponentProfiles: (check: CoreComponentProfilesCheck) => boolean;
  /** Must recover canonical post-action evidence; record fields are untrusted. */
  verifyComponentActivation: (
    check: CoreComponentActivationCheck,
  ) => CoreComponentActivationVerification;
  verifyUnexecutedSupersession: (check: CoreUnexecutedSupersessionCheck) => boolean;
  verifyRetirementFinalization: (check: CoreRetirementFinalizationCheck) => boolean;
  verifyAuthentication: (check: CoreAuthenticationCheck) => boolean;
  verifyAnchorState: (check: CoreAnchorStateCheck) => boolean;
};

export type CoreEnvelopeSemanticResult = {
  subjectId: Hex;
  streamId: Hex;
  kind: CoreRecordKind;
  sequence: bigint;
  recordHash: Hex;
  attestationDigest: Hex;
  /** Non-null only after independent proof of successful atomic finalization. */
  terminalEffect: "subject" | null;
  /** Non-null only after independent proof of canonical component activation. */
  componentEffect: "activated" | null;
  /** Distinguishes an anchored candidate from an active generation. */
  componentStatus: "activated" | "unexecuted" | null;
};

export type CoreEnvelopeSemanticErrorCode =
  | "INVALID_SCHEMA"
  | "INVALID_CANONICAL_BYTES"
  | "RAW_RECORD_MISMATCH"
  | "INVALID_NUMERIC_RANGE"
  | "ARRAY_ORDER"
  | "DUPLICATE_SORT_KEY"
  | "CORE_BINDING_MISMATCH"
  | "UNSUPPORTED_PROFILE"
  | "COMPONENT_GRAPH_FAILED"
  | "COMPONENT_PROFILE_FAILED"
  | "COMPONENT_ACTIVATION_FAILED"
  | "UNEXECUTED_SUPERSESSION_FAILED"
  | "AUTHENTICATION_FAILED"
  | "ANCHOR_STATE_FAILED"
  | "RETIREMENT_FINALIZATION_FAILED";

export class CoreEnvelopeSemanticError extends Error {
  readonly code: CoreEnvelopeSemanticErrorCode;
  readonly path: string;

  constructor(code: CoreEnvelopeSemanticErrorCode, path: string, detail: string) {
    super(`${code} at ${path}: ${detail}`);
    this.name = "CoreEnvelopeSemanticError";
    this.code = code;
    this.path = path;
  }
}

type RecordDescriptor = {
  definition: string;
  contextKind: string;
  numericKind: CoreRecordKind;
  stream: "subject" | "watcher";
};

type ComponentDeclaration = {
  generation: bigint;
  supersedes: Hex;
  activation: {
    nonce: bigint;
    actionCommitment: Hex;
    expectedActive: PMVSActiveComponents | null;
    validFromBlock: bigint;
    validThroughBlock: bigint;
    migrationHash: Hex;
    checksHash: Hex;
    checks: PMVSActivationCondition[];
    continuingWatcherHeads: PMVSAnchorTransitionHead[];
    raw: JsonObject;
  };
  migration: JsonObject | null;
  declaredAnchor: Address;
  profiles: JsonObject;
  profileParameters: JsonObject;
  share: JsonObject;
  accountingAsset: JsonObject;
  portfolio: JsonObject;
  contracts: JsonObject[];
  authorities: JsonObject[];
  capabilities: JsonObject[];
};

const RECORDS: Record<string, RecordDescriptor> = {
  "pmvs/valuation-record": {
    definition: "valuationRecord",
    contextKind: "valuation",
    numericKind: 1,
    stream: "subject",
  },
  "pmvs/settlement-archive": {
    definition: "settlementRecord",
    contextKind: "settlement-archive",
    numericKind: 2,
    stream: "subject",
  },
  "pmvs/settlement-receipt": {
    definition: "receiptRecord",
    contextKind: "receipt",
    numericKind: 3,
    stream: "subject",
  },
  "pmvs/components": {
    definition: "componentsRecord",
    contextKind: "components",
    numericKind: 4,
    stream: "subject",
  },
  "pmvs/winddown-opened": {
    definition: "winddownRecord",
    contextKind: "winddown-opened",
    numericKind: 5,
    stream: "subject",
  },
  "pmvs/retirement-final": {
    definition: "finalRecord",
    contextKind: "retirement-final",
    numericKind: 7,
    stream: "subject",
  },
  "pmvs/correction": {
    definition: "correctionRecord",
    contextKind: "correction",
    numericKind: 8,
    stream: "subject",
  },
  "pmvs/gap": {
    definition: "gapRecord",
    contextKind: "gap",
    numericKind: 9,
    stream: "subject",
  },
  "pmvs/watcher-observation": {
    definition: "watcherRecord",
    contextKind: "watcher-observation",
    numericKind: 10,
    stream: "watcher",
  },
};

const NUMERIC_DEFINITIONS = new Set([
  "uint",
  "positiveUint",
  "uint8",
  "uint64",
  "positiveUint64",
  "wadRate",
  "bps",
  "sint",
]);

const OPAQUE_VALUE_DEFINITIONS = new Set(["pmvsValue", "pmvsObject"]);

function semanticError(
  code: CoreEnvelopeSemanticErrorCode,
  path: string,
  detail: string,
): never {
  throw new CoreEnvelopeSemanticError(code, path, detail);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJsonValue(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    let ownEnumerableKeys = 0;
    for (const key in actual) {
      if (!Object.hasOwn(actual, key)) continue;
      ownEnumerableKeys += 1;
      if (ownEnumerableKeys > expected.length) return false;
    }
    if (ownEnumerableKeys !== expected.length) return false;
    return expected.every((item, index) => Object.hasOwn(actual, index)
      && sameJsonValue(actual[index], item));
  }
  if (isObject(expected)) {
    if (!isObject(actual)) return false;
    const prototype = Object.getPrototypeOf(actual);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const expectedKeys = Object.keys(expected);
    let ownEnumerableKeys = 0;
    for (const key in actual) {
      if (!Object.hasOwn(actual, key)) continue;
      ownEnumerableKeys += 1;
      if (ownEnumerableKeys > expectedKeys.length) return false;
    }
    if (ownEnumerableKeys !== expectedKeys.length) return false;
    return expectedKeys.every((key) => Object.hasOwn(actual, key)
      && sameJsonValue(actual[key], expected[key]));
  }
  return false;
}

function objectAt(value: unknown, path: string): JsonObject {
  if (!isObject(value)) semanticError("INVALID_SCHEMA", path, "expected an object");
  return value;
}

function assertExactObjectKeys(value: JsonObject, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort(compareUtf16);
  const wanted = [...expected].sort(compareUtf16);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    semanticError("CORE_BINDING_MISMATCH", path, "object does not have the exact required fields");
  }
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) semanticError("INVALID_SCHEMA", path, "expected an array");
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string") semanticError("INVALID_SCHEMA", path, "expected a string");
  return value;
}

function refName(ref: string): string {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) semanticError("INVALID_SCHEMA", "$schema", `unsupported reference ${ref}`);
  return ref.slice(prefix.length);
}

function resolveRef(ref: string): JsonSchemaNode {
  const name = refName(ref);
  const resolved = schemaRoot.$defs[name];
  if (!resolved) semanticError("INVALID_SCHEMA", "$schema", `unknown definition ${name}`);
  return resolved;
}

function typeAllows(type: string | readonly string[], value: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === "null") return value === null;
    if (candidate === "array") return Array.isArray(value);
    if (candidate === "object") return isObject(value);
    return typeof value === candidate;
  });
}

/** A shallow discriminator used only after the full AJV schema has passed. */
function schemaApplies(schema: JsonSchemaNode, value: unknown, depth = 0): boolean {
  if (depth > 64) return true;
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (NUMERIC_DEFINITIONS.has(name)) return typeof value === "string";
    if (OPAQUE_VALUE_DEFINITIONS.has(name)) return true;
    return schemaApplies(resolveRef(schema.$ref), value, depth + 1);
  }
  if (schema.type && !typeAllows(schema.type, value)) return false;
  if (Object.hasOwn(schema, "const") && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.allOf && !schema.allOf.every((part) => schemaApplies(part, value, depth + 1))) return false;
  if (schema.oneOf && !schema.oneOf.some((part) => schemaApplies(part, value, depth + 1))) return false;
  if (schema.anyOf && !schema.anyOf.some((part) => schemaApplies(part, value, depth + 1))) return false;
  if (isObject(value)) {
    if (schema.required && schema.required.some((key) => !Object.hasOwn(value, key))) return false;
    if (schema.properties) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (Object.hasOwn(value, key) && !schemaApplies(child, value[key], depth + 1)) return false;
      }
    }
  }
  return true;
}

function validateNumericDefinition(name: string, value: unknown, path: string): void {
  if (typeof value !== "string") semanticError("INVALID_NUMERIC_RANGE", path, "numeric fields must be strings");
  try {
    if (name === "sint") {
      parseInt256Decimal(value);
      return;
    }
    const parsed = parseUint256Decimal(value);
    if (name === "positiveUint" && parsed === 0n) throw new Error("value must be positive");
    if (name === "uint8" && parsed > 255n) throw new Error("value exceeds uint8");
    if ((name === "uint64" || name === "positiveUint64") && parsed > UINT64_MAX) {
      throw new Error("value exceeds uint64");
    }
    if (name === "positiveUint64" && parsed === 0n) throw new Error("value must be positive");
    if (name === "wadRate" && parsed >= WAD) throw new Error("WAD rate must be below 1e18");
    if (name === "bps" && parsed > 10_000n) throw new Error("basis points exceed 10000");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid numeric range";
    semanticError("INVALID_NUMERIC_RANGE", path, detail);
  }
}

function validateNumerics(value: unknown, schema: JsonSchemaNode, path: string): void {
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (NUMERIC_DEFINITIONS.has(name)) {
      validateNumericDefinition(name, value, path);
      return;
    }
    if (OPAQUE_VALUE_DEFINITIONS.has(name)) return;
    validateNumerics(value, resolveRef(schema.$ref), path);
    return;
  }
  if (schema.allOf) {
    for (const part of schema.allOf) validateNumerics(value, part, path);
  }
  for (const alternatives of [schema.oneOf, schema.anyOf]) {
    if (!alternatives) continue;
    for (const branch of alternatives) {
      if (schemaApplies(branch, value)) validateNumerics(value, branch, path);
    }
  }
  if (schema.if) {
    const selected = schemaApplies(schema.if, value) ? schema.then : schema.else;
    if (selected) validateNumerics(value, selected, path);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateNumerics(item, schema.items!, `${path}[${index}]`));
  }
  if (isObject(value) && schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) validateNumerics(value[key], child, `${path}.${key}`);
    }
  }
  if (isObject(value) && isObject(schema.additionalProperties)) {
    const declaredKeys = new Set(Object.keys(schema.properties ?? {}));
    for (const [key, child] of Object.entries(value)) {
      if (!declaredKeys.has(key)) {
        validateNumerics(child, schema.additionalProperties, `${path}.${key}`);
      }
    }
  }
}

function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareParts(a: readonly (string | bigint)[], b: readonly (string | bigint)[]): number {
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    const result = typeof left === "bigint"
      ? compareBigInt(left, right as bigint)
      : compareUtf16(left, right as string);
    if (result !== 0) return result;
  }
  return 0;
}

function uintKey(value: unknown, path: string): bigint {
  try {
    return parseUint256Decimal(stringAt(value, path));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid uint256 key";
    semanticError("INVALID_NUMERIC_RANGE", path, detail);
  }
}

function assertStrictOrder<T>(
  items: readonly T[],
  compare: (left: T, right: T) => number,
  path: string,
): void {
  for (let index = 1; index < items.length; index += 1) {
    const order = compare(items[index - 1], items[index]);
    if (order === 0) {
      semanticError("DUPLICATE_SORT_KEY", `${path}[${index}]`, "duplicate canonical sort key");
    }
    if (order > 0) {
      semanticError("ARRAY_ORDER", `${path}[${index}]`, "array is not in canonical order");
    }
  }
}

function assertStringOrder(value: unknown, path: string): void {
  const items = arrayAt(value, path).map((item, index) => stringAt(item, `${path}[${index}]`));
  assertStrictOrder(items, compareUtf16, path);
}

function assertObjectsByStringKey(value: unknown, key: string, path: string): void {
  const items = arrayAt(value, path).map((item, index) => objectAt(item, `${path}[${index}]`));
  assertStrictOrder(
    items,
    (left, right) => compareUtf16(
      stringAt(left[key], `${path}.${key}`),
      stringAt(right[key], `${path}.${key}`),
    ),
    path,
  );
}

function checkExtensions(
  record: JsonObject,
  supportedExtensionIds: ReadonlySet<string>,
): void {
  const extensions = arrayAt(record.extensions, "record.extensions").map((item, index) =>
    objectAt(item, `record.extensions[${index}]`)
  );
  assertStrictOrder(
    extensions,
    (left, right) => compareUtf16(
      stringAt(left.id, "record.extensions.id"),
      stringAt(right.id, "record.extensions.id"),
    ),
    "record.extensions",
  );
  extensions.forEach((extension, index) => {
    const id = stringAt(extension.id, `record.extensions[${index}].id`);
    if (extension.critical === true && !supportedExtensionIds.has(id)) {
      semanticError(
        "UNSUPPORTED_PROFILE",
        `record.extensions[${index}].id`,
        `unsupported critical extension ${id}`,
      );
    }
  });
}

function checkComponentsArrays(record: JsonObject): void {
  const contracts = arrayAt(record.contracts, "record.contracts").map((item, index) =>
    objectAt(item, `record.contracts[${index}]`)
  );
  assertStrictOrder(contracts, (left, right) => compareParts(
    [
      stringAt(left.role, "record.contracts.role"),
      uintKey(left.chainId, "record.contracts.chainId"),
      stringAt(left.address, "record.contracts.address"),
    ],
    [
      stringAt(right.role, "record.contracts.role"),
      uintKey(right.chainId, "record.contracts.chainId"),
      stringAt(right.address, "record.contracts.address"),
    ],
  ), "record.contracts");

  const interfaces = arrayAt(record.interfaces, "record.interfaces").map((item, index) =>
    objectAt(item, `record.interfaces[${index}]`)
  );
  assertStrictOrder(interfaces, (left, right) => compareParts(
    [stringAt(left.id, "record.interfaces.id"), stringAt(left.contract, "record.interfaces.contract")],
    [stringAt(right.id, "record.interfaces.id"), stringAt(right.contract, "record.interfaces.contract")],
  ), "record.interfaces");

  const roleOrder = new Map([
    ["settlement", 0n],
    ["valuation", 1n],
    ["fee", 2n],
    ["custody", 3n],
    ["governance", 4n],
  ]);
  const authorities = arrayAt(record.authorities, "record.authorities").map((item, index) =>
    objectAt(item, `record.authorities[${index}]`)
  );
  assertStrictOrder(authorities, (left, right) => {
    const leftRole = stringAt(left.role, "record.authorities.role");
    const rightRole = stringAt(right.role, "record.authorities.role");
    return compareBigInt(roleOrder.get(leftRole) ?? 99n, roleOrder.get(rightRole) ?? 99n);
  }, "record.authorities");

  assertObjectsByStringKey(record.capabilities, "id", "record.capabilities");
  const activation = objectAt(record.activation, "record.activation");
  const activationConditions = objectAt(
    activation.conditions,
    "record.activation.conditions",
  );
  assertObjectsByStringKey(
    activationConditions.checks,
    "id",
    "record.activation.conditions.checks",
  );
  const portfolio = objectAt(record.portfolio, "record.portfolio");
  assertStringOrder(portfolio.positionFormats, "record.portfolio.positionFormats");
}

const COMPONENT_FUTURE_LOCATOR_KEYS = new Set([
  "transactionhash",
  "txhash",
  "blockhash",
  "blocknumber",
  "transactionindex",
  "txindex",
  "logindex",
]);

function checkNoFutureActivationLocators(
  value: unknown,
  path: string,
  candidateRecordHash: Hex,
): void {
  if (typeof value === "string") {
    if (value.toLowerCase() === candidateRecordHash.toLowerCase()) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        path,
        "a component candidate cannot contain its own future record hash",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      checkNoFutureActivationLocators(item, `${path}[${index}]`, candidateRecordHash);
    });
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    if (COMPONENT_FUTURE_LOCATOR_KEYS.has(normalized)) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        `${path}.${key}`,
        "future activation transaction, block, and log locators are post-action evidence",
      );
    }
    checkNoFutureActivationLocators(item, `${path}.${key}`, candidateRecordHash);
  }
}

function assertNonzeroAddress(value: unknown, path: string, label: string): Address {
  const address = stringAt(value, path) as Address;
  if (address.toLowerCase() === ZERO_ADDRESS) {
    semanticError("CORE_BINDING_MISMATCH", path, `${label} must be nonzero`);
  }
  return address;
}

function assertNonzeroHash(value: unknown, path: string, label: string): Hex {
  const hash = stringAt(value, path) as Hex;
  if (hash.toLowerCase() === ZERO_HASH) {
    semanticError("CORE_BINDING_MISMATCH", path, `${label} must be nonzero`);
  }
  return hash;
}

function assertComponentValue(
  actual: unknown,
  expected: unknown,
  path: string,
  detail: string,
): void {
  if (actual !== expected) semanticError("CORE_BINDING_MISMATCH", path, detail);
}

function singleContractRole(
  contracts: readonly JsonObject[],
  role: string,
): JsonObject {
  const matches = contracts.filter((contract) => contract.role === role);
  if (matches.length !== 1) {
    semanticError(
      "CORE_BINDING_MISMATCH",
      "record.contracts",
      `component record must declare exactly one ${role} role`,
    );
  }
  return matches[0];
}

function assertContractChain(
  contract: JsonObject,
  expectedChainId: bigint,
  path: string,
  label: string,
): void {
  if (uintKey(contract.chainId, `${path}.chainId`) !== expectedChainId) {
    semanticError(
      "CORE_BINDING_MISMATCH",
      `${path}.chainId`,
      `${label} chain id does not match the subject chain`,
    );
  }
}

function assertOnchainContractRole(
  contract: JsonObject,
  path: string,
  label: string,
): void {
  if (contract.accountType !== "contract") {
    semanticError(
      "CORE_BINDING_MISMATCH",
      `${path}.accountType`,
      `${label} must be an on-chain contract`,
    );
  }
}

function checkContractAccountSemantics(contract: JsonObject, index: number): void {
  const path = `record.contracts[${index}]`;
  assertNonzeroAddress(contract.address, `${path}.address`, "component address");
  const accountType = stringAt(contract.accountType, `${path}.accountType`);
  const runtimeCodeHash = stringAt(contract.runtimeCodeHash, `${path}.runtimeCodeHash`) as Hex;
  const proxy = contract.proxy;
  if (accountType === "eoa") {
    if (runtimeCodeHash.toLowerCase() !== ZERO_HASH) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        `${path}.runtimeCodeHash`,
        "an EOA component must use the zero runtime-code hash",
      );
    }
    if (proxy !== null) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        `${path}.proxy`,
        "an EOA component cannot declare proxy metadata",
      );
    }
    return;
  }
  if (accountType !== "contract") {
    semanticError("INVALID_SCHEMA", `${path}.accountType`, "unknown component account type");
  }
  assertNonzeroHash(runtimeCodeHash, `${path}.runtimeCodeHash`, "contract runtime-code hash");
  if (proxy !== null) {
    const proxyObject = objectAt(proxy, `${path}.proxy`);
    assertNonzeroAddress(
      proxyObject.implementation,
      `${path}.proxy.implementation`,
      "proxy implementation",
    );
    assertNonzeroHash(
      proxyObject.implementationCodeHash,
      `${path}.proxy.implementationCodeHash`,
      "proxy implementation code hash",
    );
    if (proxyObject.admin !== null) {
      assertNonzeroAddress(proxyObject.admin, `${path}.proxy.admin`, "proxy admin");
    }
  }
}

function checkAuthoritySourceSemantics(authority: JsonObject, index: number): void {
  const path = `record.authorities[${index}].source`;
  const source = objectAt(authority.source, path);
  const type = stringAt(source.type, `${path}.type`);
  if (type === "attested") {
    if (source.contract !== null || source.getter !== null || source.eventTopic !== null) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        path,
        "an attested authority source must leave all on-chain locator fields null",
      );
    }
    return;
  }
  if (type !== "onchain") {
    semanticError("INVALID_SCHEMA", `${path}.type`, "unknown authority source type");
  }
  assertNonzeroAddress(source.contract, `${path}.contract`, "on-chain authority source contract");
  let hasGetter = false;
  if (source.getter !== null) {
    const getter = stringAt(source.getter, `${path}.getter`);
    if (getter.trim().length === 0) {
      semanticError("CORE_BINDING_MISMATCH", `${path}.getter`, "authority getter must be nonempty");
    }
    hasGetter = true;
  }
  let hasEventTopic = false;
  if (source.eventTopic !== null) {
    assertNonzeroHash(source.eventTopic, `${path}.eventTopic`, "authority event topic");
    hasEventTopic = true;
  }
  if (!hasGetter && !hasEventTopic) {
    semanticError(
      "CORE_BINDING_MISMATCH",
      path,
      "an on-chain authority source needs a getter or nonzero event topic",
    );
  }
}

function requireSupportedProfile(
  id: string,
  path: string,
  supportedProfileIds: ReadonlySet<string>,
): void {
  if (!supportedProfileIds.has(id)) {
    semanticError("UNSUPPORTED_PROFILE", path, `unsupported component profile or selector ${id}`);
  }
}

function checkBundledComponentProfileTerms(
  subjectChainId: bigint,
  profiles: JsonObject,
  share: JsonObject,
  accountingAsset: JsonObject,
  portfolio: JsonObject,
  contracts: readonly JsonObject[],
): void {
  if (profiles.settlement === "settlement/epoch-merkle/1") {
    assertComponentValue(share.decimals, "18", "record.share.decimals", "epoch-merkle shares must use 18 decimals");
    for (const [field, detail] of [
      ["transferFee", "epoch-merkle shares cannot charge a transfer fee"],
      ["rebase", "epoch-merkle shares cannot rebase"],
      ["hooks", "epoch-merkle shares cannot use transfer hooks"],
      ["pausable", "epoch-merkle v1 requires unpausable shares"],
      ["allowList", "epoch-merkle v1 requires shares without an allow list"],
      ["adminMutable", "epoch-merkle v1 requires immutable share behavior"],
    ] as const) {
      assertComponentValue(share[field], false, `record.share.${field}`, detail);
    }
  }

  if (profiles.venue === "venue/polymarket/1") {
    if (subjectChainId !== POLYGON_CHAIN_ID) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        "record.subject.chainId",
        "the bundled Polymarket profile requires Polygon chain id 137",
      );
    }
    if (uintKey(accountingAsset.chainId, "record.accountingAsset.chainId") !== POLYGON_CHAIN_ID) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        "record.accountingAsset.chainId",
        "the bundled Polymarket accounting asset must be on Polygon",
      );
    }
    assertHexEqual(
      stringAt(accountingAsset.address, "record.accountingAsset.address"),
      POLYGON_PUSD,
      "record.accountingAsset.address",
      "bundled Polymarket pUSD address",
    );
    assertComponentValue(
      accountingAsset.decimals,
      "6",
      "record.accountingAsset.decimals",
      "bundled Polymarket pUSD must use 6 decimals",
    );
    assertComponentValue(
      accountingAsset.unit,
      "pusd-base-unit",
      "record.accountingAsset.unit",
      "bundled Polymarket accounting unit must be pusd-base-unit",
    );
    const positionFormats = arrayAt(portfolio.positionFormats, "record.portfolio.positionFormats");
    if (positionFormats.length !== 1 || positionFormats[0] !== "position/gnosis-ctf/1") {
      semanticError(
        "CORE_BINDING_MISMATCH",
        "record.portfolio.positionFormats",
        "the bundled Polymarket profile requires exactly position/gnosis-ctf/1",
      );
    }
    assertComponentValue(
      portfolio.custodyModel,
      "external-strategy",
      "record.portfolio.custodyModel",
      "the bundled Polymarket profile requires external-strategy custody",
    );
    assertComponentValue(
      portfolio.entryAssetMode,
      "accounting-asset",
      "record.portfolio.entryAssetMode",
      "the bundled Polymarket entry mode must use the accounting asset",
    );
    assertComponentValue(
      portfolio.exitAssetMode,
      "accounting-asset",
      "record.portfolio.exitAssetMode",
      "the bundled Polymarket exit mode must use the accounting asset",
    );
    contracts.forEach((contract, index) => {
      assertContractChain(
        contract,
        POLYGON_CHAIN_ID,
        `record.contracts[${index}]`,
        "bundled Polymarket component",
      );
    });
  }
}

function checkComponentActivationDeclaration(
  record: JsonObject,
  chainId: bigint,
  shareToken: Address,
  derivedSubjectId: Hex,
  sequence: bigint,
  recordPrev: Hex,
  declaredAnchor: Address,
  attestationAnchor: Address,
  migration: JsonObject | null,
): ComponentDeclaration["activation"] {
  const raw = objectAt(record.activation, "record.activation");
  const conditions = objectAt(raw.conditions, "record.activation.conditions");
  const expectedActiveValue = conditions.expectedActive;
  const expectedActive = expectedActiveValue === null
    ? null
    : (() => {
      const active = objectAt(expectedActiveValue, "record.activation.conditions.expectedActive");
      return {
        recordHash: assertNonzeroHash(
          active.recordHash,
          "record.activation.conditions.expectedActive.recordHash",
          "expected active component hash",
        ),
        generation: uintKey(
          active.generation,
          "record.activation.conditions.expectedActive.generation",
        ),
        anchor: assertNonzeroAddress(
          active.anchor,
          "record.activation.conditions.expectedActive.anchor",
          "expected active anchor",
        ),
      };
    })();
  const checks = arrayAt(conditions.checks, "record.activation.conditions.checks").map(
    (value, index): PMVSActivationCondition => {
      const check = objectAt(value, `record.activation.conditions.checks[${index}]`);
      return {
        id: stringAt(check.id, `record.activation.conditions.checks[${index}].id`),
        target: assertNonzeroAddress(
          check.target,
          `record.activation.conditions.checks[${index}].target`,
          "activation condition target",
        ),
        callData: stringAt(
          check.callData,
          `record.activation.conditions.checks[${index}].callData`,
        ) as Hex,
        expectedReturnDataHash: stringAt(
          check.expectedReturnDataHash,
          `record.activation.conditions.checks[${index}].expectedReturnDataHash`,
        ) as Hex,
      };
    },
  );
  const nonce = uintKey(raw.nonce, "record.activation.nonce");
  const actionCommitment = assertNonzeroHash(
    raw.actionCommitment,
    "record.activation.actionCommitment",
    "activation action commitment",
  );
  const validFromBlock = uintKey(
    conditions.validFromBlock,
    "record.activation.conditions.validFromBlock",
  );
  const validThroughBlock = uintKey(
    conditions.validThroughBlock,
    "record.activation.conditions.validThroughBlock",
  );
  const generation = uintKey(record.generation, "record.generation");
  const components = stringAt(record.components, "record.components") as Hex;
  const supersedes = stringAt(record.supersedes, "record.supersedes") as Hex;

  if (expectedActive === null) {
    if (components.toLowerCase() !== ZERO_HASH || supersedes.toLowerCase() !== ZERO_HASH) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        "record.activation.conditions.expectedActive",
        "component genesis requires zero component and supersedes hashes",
      );
    }
    assertHexEqual(
      declaredAnchor,
      attestationAnchor,
      "record.contracts[anchor].address",
      "genesis attestation anchor",
    );
  } else {
    assertHexEqual(
      expectedActive.recordHash,
      components,
      "record.activation.conditions.expectedActive.recordHash",
      "expected active component hash",
    );
    assertHexEqual(
      expectedActive.recordHash,
      supersedes,
      "record.supersedes",
      "superseded active component hash",
    );
    assertHexEqual(
      expectedActive.anchor,
      attestationAnchor,
      "record.activation.conditions.expectedActive.anchor",
      "active attestation anchor",
    );
  }

  const anchorChanges = expectedActive !== null
    && expectedActive.anchor.toLowerCase() !== declaredAnchor.toLowerCase();
  const continuingWatcherHeads: PMVSAnchorTransitionHead[] = [];
  const rawAnchorTransition = migration?.anchorTransition;
  if (anchorChanges) {
    const transition = objectAt(
      rawAnchorTransition,
      "record.migration.anchorTransition",
    );
    assertExactObjectKeys(
      transition,
      ["oldAnchor", "newAnchor", "continuingWatcherHeads"],
      "record.migration.anchorTransition",
    );
    assertHexEqual(
      assertNonzeroAddress(
        transition.oldAnchor,
        "record.migration.anchorTransition.oldAnchor",
        "old anchor",
      ),
      expectedActive!.anchor,
      "record.migration.anchorTransition.oldAnchor",
      "expected active anchor",
    );
    assertHexEqual(
      assertNonzeroAddress(
        transition.newAnchor,
        "record.migration.anchorTransition.newAnchor",
        "new anchor",
      ),
      declaredAnchor,
      "record.migration.anchorTransition.newAnchor",
      "declared new anchor",
    );
    const heads = arrayAt(
      transition.continuingWatcherHeads,
      "record.migration.anchorTransition.continuingWatcherHeads",
    ).map((value, index): PMVSAnchorTransitionHead => {
      const path = `record.migration.anchorTransition.continuingWatcherHeads[${index}]`;
      const head = objectAt(value, path);
      assertExactObjectKeys(head, ["streamId", "sequence", "kind", "recordHash"], path);
      const sequenceValue = uintKey(head.sequence, `${path}.sequence`);
      if (sequenceValue > UINT64_MAX) {
        semanticError("INVALID_NUMERIC_RANGE", `${path}.sequence`, "watcher sequence exceeds uint64");
      }
      const kind = uintKey(head.kind, `${path}.kind`);
      if (kind !== 10n) {
        semanticError("CORE_BINDING_MISMATCH", `${path}.kind`, "continuing watcher head must have kind 10");
      }
      return {
        streamId: assertNonzeroHash(head.streamId, `${path}.streamId`, "watcher stream id"),
        sequence: sequenceValue,
        kind: 10,
        recordHash: assertNonzeroHash(head.recordHash, `${path}.recordHash`, "watcher record hash"),
      };
    });
    assertStrictOrder(
      heads,
      (left, right) => compareUtf16(left.streamId, right.streamId),
      "record.migration.anchorTransition.continuingWatcherHeads",
    );
    continuingWatcherHeads.push(...heads);
  } else if (rawAnchorTransition !== undefined && rawAnchorTransition !== null) {
    semanticError(
      "CORE_BINDING_MISMATCH",
      "record.migration.anchorTransition",
      "same-anchor activation cannot declare an anchor transition",
    );
  }

  let derivedCommitment: Hex;
  let migrationHash: Hex;
  let checksHash: Hex;
  try {
    migrationHash = componentMigrationHash(migration);
    checksHash = componentActivationChecksHash(checks);
    derivedCommitment = componentActivationCommitment({
      chainId,
      shareToken,
      subjectId: derivedSubjectId,
      streamSequence: sequence,
      streamPrev: recordPrev,
      nonce,
      expectedActive,
      newGeneration: generation,
      newAnchor: declaredAnchor,
      validFromBlock,
      validThroughBlock,
      migration,
      checks,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid activation commitment";
    semanticError("CORE_BINDING_MISMATCH", "record.activation", detail);
  }
  assertHexEqual(
    actionCommitment,
    derivedCommitment,
    "record.activation.actionCommitment",
    "derived activation action commitment",
  );
  return {
    nonce,
    actionCommitment,
    expectedActive,
    validFromBlock,
    validThroughBlock,
    migrationHash,
    checksHash,
    checks,
    continuingWatcherHeads,
    raw,
  };
}

function checkComponentDeclaration(
  record: JsonObject,
  subjectChainId: bigint,
  shareToken: Address,
  derivedSubjectId: Hex,
  sequence: bigint,
  recordPrev: Hex,
  attestationAnchor: Address,
  expectedAnchor: Address,
  supportedProfileIds: ReadonlySet<string>,
): ComponentDeclaration {
  const contracts = arrayAt(record.contracts, "record.contracts").map((item, index) =>
    objectAt(item, `record.contracts[${index}]`)
  );
  contracts.forEach(checkContractAccountSemantics);

  const shareVault = singleContractRole(contracts, "share-vault");
  assertOnchainContractRole(shareVault, "record.contracts[share-vault]", "share-vault");
  assertContractChain(
    shareVault,
    subjectChainId,
    "record.contracts[share-vault]",
    "share-vault",
  );
  assertHexEqual(
    stringAt(shareVault.address, "record.contracts[share-vault].address"),
    shareToken,
    "record.contracts[share-vault].address",
    "share-vault subject token",
  );
  const anchor = singleContractRole(contracts, "anchor");
  assertOnchainContractRole(anchor, "record.contracts[anchor]", "anchor");
  assertContractChain(anchor, subjectChainId, "record.contracts[anchor]", "anchor");
  const declaredAnchor = stringAt(anchor.address, "record.contracts[anchor].address") as Address;
  assertHexEqual(
    declaredAnchor,
    expectedAnchor,
    "record.contracts[anchor].address",
    "declared component anchor",
  );

  const authorities = arrayAt(record.authorities, "record.authorities").map((item, index) =>
    objectAt(item, `record.authorities[${index}]`)
  );
  authorities.forEach(checkAuthoritySourceSemantics);

  const profiles = objectAt(record.profiles, "record.profiles");
  for (const field of ["settlement", "anchor", "valuation", "venue", "storage"] as const) {
    const id = stringAt(profiles[field], `record.profiles.${field}`);
    requireSupportedProfile(id, `record.profiles.${field}`, supportedProfileIds);
  }
  const watcher = profiles.watcher;
  if (watcher !== null) {
    const id = stringAt(watcher, "record.profiles.watcher");
    requireSupportedProfile(id, "record.profiles.watcher", supportedProfileIds);
  }
  const requestLiveness = stringAt(profiles.requestLiveness, "record.profiles.requestLiveness");
  requireSupportedProfile(
    requestLiveness,
    "record.profiles.requestLiveness",
    supportedProfileIds,
  );

  const share = objectAt(record.share, "record.share");
  const accountingAsset = objectAt(record.accountingAsset, "record.accountingAsset");
  const portfolio = objectAt(record.portfolio, "record.portfolio");
  const positionFormats = arrayAt(portfolio.positionFormats, "record.portfolio.positionFormats");
  positionFormats.forEach((value, index) => {
    const id = stringAt(value, `record.portfolio.positionFormats[${index}]`);
    requireSupportedProfile(id, `record.portfolio.positionFormats[${index}]`, supportedProfileIds);
  });
  checkBundledComponentProfileTerms(
    subjectChainId,
    profiles,
    share,
    accountingAsset,
    portfolio,
    contracts,
  );

  const migration = record.migration === null
    ? null
    : objectAt(record.migration, "record.migration");
  const activation = checkComponentActivationDeclaration(
    record,
    subjectChainId,
    shareToken,
    derivedSubjectId,
    sequence,
    recordPrev,
    declaredAnchor,
    attestationAnchor,
    migration,
  );
  return {
    generation: uintKey(record.generation, "record.generation"),
    supersedes: stringAt(record.supersedes, "record.supersedes") as Hex,
    activation,
    migration,
    declaredAnchor,
    profiles,
    profileParameters: objectAt(record.profileParameters, "record.profileParameters"),
    share,
    accountingAsset,
    portfolio,
    contracts,
    authorities,
    capabilities: arrayAt(record.capabilities, "record.capabilities").map((item, index) =>
      objectAt(item, `record.capabilities[${index}]`)
    ),
  };
}

function checkRawResponses(value: unknown, path: string): void {
  const responses = arrayAt(value, path).map((item, index) => objectAt(item, `${path}[${index}]`));
  assertStrictOrder(responses, (left, right) => compareParts(
    [
      stringAt(left.source, `${path}.source`),
      uintKey(left.startedAtMs, `${path}.startedAtMs`),
      stringAt(left.bytesHash, `${path}.bytesHash`),
    ],
    [
      stringAt(right.source, `${path}.source`),
      uintKey(right.startedAtMs, `${path}.startedAtMs`),
      stringAt(right.bytesHash, `${path}.bytesHash`),
    ],
  ), path);
  responses.forEach((response, index) => {
    assertStringOrder(response.locations, `${path}[${index}].locations`);
  });
}

function checkValuationArrays(record: JsonObject): void {
  const inputs = objectAt(record.inputs, "record.inputs");
  const chainState = arrayAt(inputs.chainState, "record.inputs.chainState").map((item, index) =>
    objectAt(item, `record.inputs.chainState[${index}]`)
  );
  assertStrictOrder(
    chainState,
    (left, right) => compareBigInt(
      uintKey(left.chainId, "record.inputs.chainState.chainId"),
      uintKey(right.chainId, "record.inputs.chainState.chainId"),
    ),
    "record.inputs.chainState",
  );
  chainState.forEach((state, index) => {
    assertObjectsByStringKey(state.reads, "id", `record.inputs.chainState[${index}].reads`);
  });

  const venueState = objectAt(inputs.venueState, "record.inputs.venueState");
  if (Array.isArray(venueState.responses) && venueState.responses.every((item) =>
    isObject(item) && Object.hasOwn(item, "source") && Object.hasOwn(item, "bytesHash")
      && Object.hasOwn(item, "startedAtMs") && Object.hasOwn(item, "locations")
  )) {
    checkRawResponses(venueState.responses, "record.inputs.venueState.responses");
  }

  const outputs = objectAt(record.outputs, "record.outputs");
  for (const name of ["cashLines", "overlayLines", "liabilityLines", "exclusionLines"] as const) {
    assertObjectsByStringKey(outputs[name], "id", `record.outputs.${name}`);
  }
  const positions = arrayAt(outputs.perPosition, "record.outputs.perPosition").map((item, index) =>
    objectAt(item, `record.outputs.perPosition[${index}]`)
  );
  assertStrictOrder(positions, (left, right) => compareParts(
    [
      uintKey(left.chainId, "record.outputs.perPosition.chainId"),
      stringAt(left.positionContract, "record.outputs.perPosition.positionContract"),
      uintKey(left.positionId, "record.outputs.perPosition.positionId"),
    ],
    [
      uintKey(right.chainId, "record.outputs.perPosition.chainId"),
      stringAt(right.positionContract, "record.outputs.perPosition.positionContract"),
      uintKey(right.positionId, "record.outputs.perPosition.positionId"),
    ],
  ), "record.outputs.perPosition");
  positions.forEach((position, index) => {
    assertObjectsByStringKey(position.holdings, "custodyAccount", `record.outputs.perPosition[${index}].holdings`);
  });
}

function checkSettlementArrays(record: JsonObject): void {
  for (const legName of ["deposit", "withdraw"] as const) {
    const leg = objectAt(record[legName], `record.${legName}`);
    const requestIds = arrayAt(leg.requestIds, `record.${legName}.requestIds`).map((item, index) =>
      uintKey(item, `record.${legName}.requestIds[${index}]`)
    );
    assertStrictOrder(requestIds, compareBigInt, `record.${legName}.requestIds`);
    const claims = arrayAt(leg.claims, `record.${legName}.claims`).map((item, index) =>
      objectAt(item, `record.${legName}.claims[${index}]`)
    );
    assertStrictOrder(
      claims,
      (left, right) => compareBigInt(
        uintKey(left.requestId, `record.${legName}.claims.requestId`),
        uintKey(right.requestId, `record.${legName}.claims.requestId`),
      ),
      `record.${legName}.claims`,
    );
  }

  const excluded = arrayAt(record.excluded, "record.excluded").map((item, index) =>
    objectAt(item, `record.excluded[${index}]`)
  );
  assertStrictOrder(excluded, (left, right) => compareParts(
    [stringAt(left.leg, "record.excluded.leg"), uintKey(left.requestId, "record.excluded.requestId")],
    [stringAt(right.leg, "record.excluded.leg"), uintKey(right.requestId, "record.excluded.requestId")],
  ), "record.excluded");
}

function checkReceiptArrays(record: JsonObject): void {
  const observed = objectAt(record.observed, "record.observed");
  assertObjectsByStringKey(observed.reserveBuckets, "id", "record.observed.reserveBuckets");
  assertObjectsByStringKey(observed.fundingSources, "account", "record.observed.fundingSources");
  const balances = arrayAt(observed.assetBalances, "record.observed.assetBalances").map((item, index) =>
    objectAt(item, `record.observed.assetBalances[${index}]`)
  );
  assertStrictOrder(balances, (left, right) => compareParts(
    [stringAt(left.account, "record.observed.assetBalances.account"), stringAt(left.asset, "record.observed.assetBalances.asset")],
    [stringAt(right.account, "record.observed.assetBalances.account"), stringAt(right.asset, "record.observed.assetBalances.asset")],
  ), "record.observed.assetBalances");
}

function checkFinalArrays(record: JsonObject): void {
  for (const name of [
    "residualPositions",
    "residualCash",
    "feeAccruals",
    "liabilities",
  ] as const) {
    assertObjectsByStringKey(record[name], "id", `record.${name}`);
  }
}

function checkCanonicalArrays(
  record: JsonObject,
  descriptor: RecordDescriptor,
  locations: unknown,
  supportedExtensionIds: ReadonlySet<string>,
): void {
  assertStringOrder(locations, "locations");
  checkExtensions(record, supportedExtensionIds);
  if (descriptor.definition === "componentsRecord") checkComponentsArrays(record);
  if (descriptor.definition === "valuationRecord") checkValuationArrays(record);
  if (descriptor.definition === "settlementRecord") checkSettlementArrays(record);
  if (descriptor.definition === "receiptRecord") checkReceiptArrays(record);
  if (descriptor.definition === "finalRecord") checkFinalArrays(record);
  if (descriptor.definition === "watcherRecord") {
    const venueState = objectAt(record.venueState, "record.venueState");
    checkRawResponses(venueState.responses, "record.venueState.responses");
  }
}

function assertHexEqual(actual: string, expected: string, path: string, label: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    semanticError("CORE_BINDING_MISMATCH", path, `${label} does not match independently supplied context`);
  }
}

function signatureScheme(scheme: string): CoreSignatureScheme {
  if (scheme === "eip712-ecdsa") return 0;
  if (scheme === "eip712-erc1271") return 1;
  semanticError("INVALID_SCHEMA", "attestation.scheme", "unknown signature scheme");
}

function rawByteLength(raw: string | Uint8Array): number {
  return typeof raw === "string" ? new TextEncoder().encode(raw).length : raw.byteLength;
}

/**
 * Verify Core semantics for a parsed PMVS envelope. `rawRecordBytes` must be
 * the canonical bytes of `envelope.record`, not the outer transport envelope.
 * Profile-owned objects remain the responsibility of their profile verifiers.
 * The supplied component-graph, selected-profile, retry-history,
 * retirement-finalization, authentication, and anchor-state checks must use
 * independently sourced facts. Record-owned values or unconditional `true`
 * callbacks are not evidence.
 */
export function verifyCoreEnvelopeSemantics(
  envelope: unknown,
  rawRecordBytes: string | Uint8Array,
  expected: CoreEnvelopeVerificationContext,
): CoreEnvelopeSemanticResult {
  if (rawByteLength(rawRecordBytes) > PMVS_MAX_RECORD_BYTES) {
    semanticError("INVALID_CANONICAL_BYTES", "rawRecordBytes", "record exceeds the Core byte limit");
  }
  let rawRecord: unknown;
  try {
    rawRecord = parseCanonicalJson(rawRecordBytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid canonical record bytes";
    semanticError("INVALID_CANONICAL_BYTES", "rawRecordBytes", detail);
  }
  const parsedEnvelope = objectAt(envelope, "envelope");
  if (!sameJsonValue(parsedEnvelope.record, rawRecord)) {
    semanticError("RAW_RECORD_MISMATCH", "rawRecordBytes", "canonical bytes do not encode envelope.record");
  }
  if (!validateEnvelope(envelope)) {
    semanticError(
      "INVALID_SCHEMA",
      "envelope",
      validateEnvelope.errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ")
        ?? "base-envelope schema validation failed",
    );
  }
  const record = objectAt(rawRecord, "rawRecordBytes");
  const attestation = objectAt(parsedEnvelope.attestation, "attestation");

  const schemaId = stringAt(record.schema, "record.schema");
  const descriptor = RECORDS[schemaId];
  if (!descriptor) semanticError("INVALID_SCHEMA", "record.schema", `unsupported Core schema ${schemaId}`);
  validateNumerics(record, { $ref: `#/$defs/${descriptor.definition}` }, "record");
  checkCanonicalArrays(
    record,
    descriptor,
    parsedEnvelope.locations,
    expected.supportedExtensionIds,
  );

  const context = objectAt(record.context, "record.context");
  const contextKind = stringAt(context.kind, "record.context.kind");
  if (contextKind !== descriptor.contextKind) {
    semanticError("CORE_BINDING_MISMATCH", "record.context.kind", "schema and context kinds disagree");
  }
  if (expected.kind !== descriptor.numericKind) {
    semanticError("CORE_BINDING_MISMATCH", "expected.kind", "numeric record kind does not match record schema");
  }
  const expectedStreamName = descriptor.stream;
  if (context.stream !== expectedStreamName) {
    semanticError("CORE_BINDING_MISMATCH", "record.context.stream", "record uses the wrong Core stream class");
  }

  const subject = objectAt(record.subject, "record.subject");
  const chainId = parseUint256Decimal(stringAt(subject.chainId, "record.subject.chainId"));
  if (chainId !== expected.chainId) {
    semanticError("CORE_BINDING_MISMATCH", "record.subject.chainId", "chain id does not match anchor context");
  }
  const shareToken = stringAt(subject.shareToken, "record.subject.shareToken") as Address;
  const derivedSubjectId = subjectId(chainId, shareToken);
  assertHexEqual(derivedSubjectId, expected.subjectId, "expected.subjectId", "subject id");
  if (descriptor.definition === "componentsRecord") {
    assertHexEqual(
      stringAt(record.subjectId, "record.subjectId"),
      derivedSubjectId,
      "record.subjectId",
      "component subject id",
    );
  }

  const sequence = parseUint256Decimal(stringAt(context.sequence, "record.context.sequence"));
  if (sequence > UINT64_MAX) semanticError("INVALID_NUMERIC_RANGE", "record.context.sequence", "sequence exceeds uint64");
  if (sequence !== expected.sequence) {
    semanticError("CORE_BINDING_MISMATCH", "record.context.sequence", "sequence does not match anchor context");
  }
  const prev = stringAt(context.prev, "record.context.prev") as Hex;
  assertHexEqual(prev, expected.prev, "record.context.prev", "record predecessor");
  const componentHash = stringAt(record.components, "record.components") as Hex;
  assertHexEqual(componentHash, expected.components, "record.components", "component hash");

  const isComponentsRecord = descriptor.definition === "componentsRecord";
  const isSubjectComponentGenesis = descriptor.stream === "subject"
    && isComponentsRecord
    && sequence === 0n;
  if (!isSubjectComponentGenesis && expected.components.toLowerCase() === ZERO_HASH) {
    semanticError(
      "CORE_BINDING_MISMATCH",
      "expected.components",
      "only subject-stream component genesis may use a zero component hash",
    );
  }

  if (descriptor.stream === "subject") {
    if (sequence === 0n) {
      if (!isComponentsRecord) {
        semanticError(
          "CORE_BINDING_MISMATCH",
          "record.context.sequence",
          "the subject stream must begin with a components record",
        );
      }
      assertHexEqual(componentHash, ZERO_HASH, "record.components", "genesis component hash");
      assertHexEqual(
        stringAt(record.supersedes, "record.supersedes"),
        ZERO_HASH,
        "record.supersedes",
        "genesis supersedes hash",
      );
    } else if (isComponentsRecord) {
      if (expected.components.toLowerCase() === ZERO_HASH) {
        semanticError(
          "CORE_BINDING_MISMATCH",
          "expected.components",
          "a later components record requires a nonzero active predecessor component hash",
        );
      }
      assertHexEqual(
        stringAt(record.supersedes, "record.supersedes"),
        expected.components,
        "record.supersedes",
        "superseded active component hash",
      );
    }
  }

  let componentDeclaration: ComponentDeclaration | undefined;
  if (isComponentsRecord) {
    componentDeclaration = checkComponentDeclaration(
      record,
      chainId,
      shareToken,
      derivedSubjectId,
      sequence,
      prev,
      expected.verifyingContract,
      expected.componentAnchor,
      expected.supportedProfileIds,
    );
    if (sequence === 0n) {
      assertHexEqual(
        componentDeclaration.declaredAnchor,
        expected.verifyingContract,
        "expected.componentAnchor",
        "genesis attestation anchor",
      );
      if (componentDeclaration.generation !== 0n) {
        semanticError(
          "CORE_BINDING_MISMATCH",
          "record.generation",
          "component genesis must use generation zero",
        );
      }
      if (componentDeclaration.migration !== null) {
        semanticError(
          "CORE_BINDING_MISMATCH",
          "record.migration",
          "component genesis cannot declare a migration",
        );
      }
    }
  } else {
    assertHexEqual(
      expected.componentAnchor,
      expected.verifyingContract,
      "expected.componentAnchor",
      "active component anchor",
    );
  }

  const signer = stringAt(attestation.signer, "attestation.signer") as Address;
  let derivedStreamId: Hex;
  if (descriptor.stream === "subject") {
    derivedStreamId = ZERO_HASH;
  } else {
    const producer = stringAt(context.producer, "record.context.producer") as Address;
    assertHexEqual(producer, signer, "record.context.producer", "watcher producer");
    derivedStreamId = keccak256(encodePacked(["string", "address"], ["PMVS:WATCHER:1", producer]));
  }
  assertHexEqual(derivedStreamId, expected.streamId, "expected.streamId", "stream id");
  assertHexEqual(stringAt(attestation.streamId, "attestation.streamId"), derivedStreamId, "attestation.streamId", "attestation stream id");

  const derivedRecordHash = recordHash(record);
  assertHexEqual(derivedRecordHash, expected.recordHash, "expected.recordHash", "record hash");
  assertHexEqual(stringAt(attestation.recordHash, "attestation.recordHash"), derivedRecordHash, "attestation.recordHash", "attested record hash");
  if (isComponentsRecord) {
    checkNoFutureActivationLocators(record, "record", derivedRecordHash);
  }
  assertHexEqual(
    stringAt(attestation.previousAnchor, "attestation.previousAnchor"),
    expected.previousAnchor,
    "attestation.previousAnchor",
    "previous anchor",
  );
  assertHexEqual(
    stringAt(attestation.verifyingContract, "attestation.verifyingContract"),
    expected.verifyingContract,
    "attestation.verifyingContract",
    "verifying contract",
  );
  assertHexEqual(signer, expected.signer, "attestation.signer", "signer");

  const schemeName = stringAt(attestation.scheme, "attestation.scheme");
  const derivedSignatureScheme = signatureScheme(schemeName);
  if (derivedSignatureScheme !== expected.signatureScheme) {
    semanticError("CORE_BINDING_MISMATCH", "attestation.scheme", "signature scheme does not match anchor context");
  }
  const signature = stringAt(attestation.signature, "attestation.signature") as Hex;
  const derivedSignatureHash = keccak256(signature);
  assertHexEqual(derivedSignatureHash, expected.signatureHash, "expected.signatureHash", "signature hash");

  if (sequence === 0n) {
    if (prev.toLowerCase() !== ZERO_HASH || expected.previousAnchor.toLowerCase() !== ZERO_HASH) {
      semanticError("CORE_BINDING_MISMATCH", "record.context", "a new stream must start from zero predecessors");
    }
  } else if (prev.toLowerCase() !== expected.previousAnchor.toLowerCase()) {
    semanticError("CORE_BINDING_MISMATCH", "record.context.prev", "record and anchor predecessors must agree");
  }

  if (descriptor.numericKind === 2 || descriptor.numericKind === 5) {
    const priceAttempt = descriptor.numericKind === 2
      ? uintKey(
        objectAt(record.settlement, "record.settlement").priceAttempt,
        "record.settlement.priceAttempt",
      )
      : uintKey(record.priceAttempt, "record.priceAttempt");
    const supersedesValue = record.supersedesUnexecuted;
    const supersedesUnexecuted = supersedesValue === null
      ? null
      : stringAt(supersedesValue, "record.supersedesUnexecuted") as Hex;
    if (supersedesUnexecuted?.toLowerCase() === ZERO_HASH) {
      semanticError(
        "CORE_BINDING_MISMATCH",
        "record.supersedesUnexecuted",
        "an unexecuted supersession hash must be nonzero",
      );
    }
    const supersessionCheck: CoreUnexecutedSupersessionCheck = {
      chainId,
      subjectId: derivedSubjectId,
      streamId: derivedStreamId,
      recordHash: derivedRecordHash,
      kind: descriptor.numericKind,
      sequence,
      epoch: uintKey(context.epoch, "record.context.epoch"),
      priceAttempt,
      supersedesUnexecuted,
      recordPrev: prev,
      previousAnchor: expected.previousAnchor,
    };
    let supersessionVerified = false;
    try {
      supersessionVerified = expected.verifyUnexecutedSupersession(supersessionCheck) === true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unexecuted supersession callback threw";
      semanticError(
        "UNEXECUTED_SUPERSESSION_FAILED",
        "verifyUnexecutedSupersession",
        detail,
      );
    }
    if (!supersessionVerified) {
      semanticError(
        "UNEXECUTED_SUPERSESSION_FAILED",
        "verifyUnexecutedSupersession",
        "external unexecuted-supersession result was not true",
      );
    }
  }

  if (componentDeclaration) {
    const graphCheck: CoreComponentGraphCheck = {
      chainId,
      subjectId: derivedSubjectId,
      shareToken,
      recordHash: derivedRecordHash,
      sequence,
      recordPrev: prev,
      previousAnchor: expected.previousAnchor,
      generation: componentDeclaration.generation,
      components: componentHash,
      supersedes: componentDeclaration.supersedes,
      declaredAnchor: componentDeclaration.declaredAnchor,
      attestationAnchor: expected.verifyingContract,
      activation: componentDeclaration.activation.raw,
      migration: componentDeclaration.migration,
      contracts: componentDeclaration.contracts,
    };
    let graphVerified = false;
    try {
      graphVerified = expected.verifyComponentGraph(graphCheck) === true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "component graph callback threw";
      semanticError("COMPONENT_GRAPH_FAILED", "verifyComponentGraph", detail);
    }
    if (!graphVerified) {
      semanticError(
        "COMPONENT_GRAPH_FAILED",
        "verifyComponentGraph",
        "external component graph result was not true",
      );
    }

    const profileCheck: CoreComponentProfilesCheck = {
      chainId,
      subjectId: derivedSubjectId,
      shareToken,
      recordHash: derivedRecordHash,
      generation: componentDeclaration.generation,
      profiles: componentDeclaration.profiles,
      profileParameters: componentDeclaration.profileParameters,
      share: componentDeclaration.share,
      accountingAsset: componentDeclaration.accountingAsset,
      portfolio: componentDeclaration.portfolio,
      contracts: componentDeclaration.contracts,
      authorities: componentDeclaration.authorities,
      capabilities: componentDeclaration.capabilities,
    };
    let profilesVerified = false;
    try {
      profilesVerified = expected.verifyComponentProfiles(profileCheck) === true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "component profile callback threw";
      semanticError("COMPONENT_PROFILE_FAILED", "verifyComponentProfiles", detail);
    }
    if (!profilesVerified) {
      semanticError(
        "COMPONENT_PROFILE_FAILED",
        "verifyComponentProfiles",
        "external component profile result was not true",
      );
    }
  }

  const digest = attestationDigest(expected.chainId, expected.verifyingContract, {
    recordHash: derivedRecordHash,
    kind: descriptor.numericKind,
    subjectId: derivedSubjectId,
    streamId: derivedStreamId,
    sequence,
    prev,
    previousAnchor: expected.previousAnchor,
  });
  const authenticationCheck: CoreAuthenticationCheck = {
    chainId,
    digest,
    scheme: schemeName as CoreAuthenticationCheck["scheme"],
    signature,
    verifyingContract: expected.verifyingContract,
    signer,
    recordHash: derivedRecordHash,
    subjectId: derivedSubjectId,
    streamId: derivedStreamId,
    kind: descriptor.numericKind,
    sequence,
    prev,
    previousAnchor: expected.previousAnchor,
  };
  let authenticationVerified = false;
  try {
    authenticationVerified = expected.verifyAuthentication(authenticationCheck) === true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "authentication callback threw";
    semanticError("AUTHENTICATION_FAILED", "verifyAuthentication", detail);
  }
  if (!authenticationVerified) {
    semanticError("AUTHENTICATION_FAILED", "verifyAuthentication", "external authentication result was not true");
  }

  const anchorCheck: CoreAnchorStateCheck = {
    chainId,
    subjectId: derivedSubjectId,
    streamId: derivedStreamId,
    kind: descriptor.numericKind,
    sequence,
    recordPrev: prev,
    previousAnchor: expected.previousAnchor,
    recordHash: derivedRecordHash,
    signer,
    signatureScheme: derivedSignatureScheme,
    signatureHash: derivedSignatureHash,
  };
  let anchorVerified = false;
  try {
    anchorVerified = expected.verifyAnchorState(anchorCheck) === true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "anchor callback threw";
    semanticError("ANCHOR_STATE_FAILED", "verifyAnchorState", detail);
  }
  if (!anchorVerified) {
    semanticError("ANCHOR_STATE_FAILED", "verifyAnchorState", "external anchor-state result was not true");
  }

  let componentEffect: "activated" | null = null;
  let componentStatus: "activated" | "unexecuted" | null = null;
  if (componentDeclaration) {
    const activation = componentDeclaration.activation;
    const publication = objectAt(record.publication, "record.publication");
    const activationCheck: CoreComponentActivationCheck = {
      chainId,
      subjectId: derivedSubjectId,
      shareToken,
      recordHash: derivedRecordHash,
      sequence,
      recordPrev: prev,
      generation: componentDeclaration.generation,
      declaredAnchor: componentDeclaration.declaredAnchor,
      attestationAnchor: expected.verifyingContract,
      nonce: activation.nonce,
      actionCommitment: activation.actionCommitment,
      expectedActive: activation.expectedActive,
      validFromBlock: activation.validFromBlock,
      validThroughBlock: activation.validThroughBlock,
      migrationHash: activation.migrationHash,
      migration: componentDeclaration.migration,
      continuingWatcherHeads: activation.continuingWatcherHeads,
      checksHash: activation.checksHash,
      checks: activation.checks,
      confirmationDepth: uintKey(
        publication.confirmationDepth,
        "record.publication.confirmationDepth",
      ),
      requiredActivation: {
        transactionStatus: "success",
        canonicalReceipt: true,
        anchorPrecedesActivation: true,
        componentsUpdatedEventCount: 1n,
        eventEmitter: shareToken,
        eventRecordHash: derivedRecordHash,
        eventGeneration: componentDeclaration.generation,
        eventAnchor: componentDeclaration.declaredAnchor,
        eventNonce: activation.nonce,
        eventActionCommitment: activation.actionCommitment,
        anchorHeadKind: 4,
        anchorHeadSequence: sequence,
        anchorHeadRecordHash: derivedRecordHash,
        governanceAuthorizedFrom: activation.expectedActive === null
          ? "bootstrap"
          : "active-generation",
        conditionsPassed: true,
        noOrdinaryCoveredAction: true,
        activationBoundary: "transaction-completion",
        anchorTransitionRequired: activation.expectedActive !== null
          && activation.expectedActive.anchor.toLowerCase()
            !== componentDeclaration.declaredAnchor.toLowerCase(),
        preState: activation.expectedActive === null
          ? {
            recordHash: ZERO_HASH,
            generation: 0n,
            anchor: ZERO_ADDRESS,
            nonce: 0n,
          }
          : {
            recordHash: activation.expectedActive.recordHash,
            generation: activation.expectedActive.generation,
            anchor: activation.expectedActive.anchor,
            nonce: activation.nonce - 1n,
          },
        postState: {
          recordHash: derivedRecordHash,
          generation: componentDeclaration.generation,
          anchor: componentDeclaration.declaredAnchor,
          nonce: activation.nonce,
        },
        anchorTransitionEvidence: activation.expectedActive !== null
            && activation.expectedActive.anchor.toLowerCase()
              !== componentDeclaration.declaredAnchor.toLowerCase()
          ? {
            oldAnchor: activation.expectedActive.anchor,
            newAnchor: componentDeclaration.declaredAnchor,
            exactFrozenHeadSet: true,
            exactImportedHeadSet: true,
            exactPostImportHeadSet: true,
            exactMigrationEventSet: true,
            sameSuccessfulCanonicalTransaction: true,
          }
          : null,
      },
    };
    let activationVerification: CoreComponentActivationVerification;
    try {
      activationVerification = expected.verifyComponentActivation(activationCheck);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "component activation callback threw";
      semanticError("COMPONENT_ACTIVATION_FAILED", "verifyComponentActivation", detail);
    }
    if (
      activationVerification === null
      || typeof activationVerification !== "object"
      || !("status" in activationVerification)
    ) {
      semanticError(
        "COMPONENT_ACTIVATION_FAILED",
        "verifyComponentActivation",
        "external component-activation callback returned a malformed result",
      );
    }
    if (activationVerification.status === "invalid") {
      semanticError(
        "COMPONENT_ACTIVATION_FAILED",
        "verifyComponentActivation",
        activationVerification.reason,
      );
    }
    if (activationVerification.status !== "activated" && activationVerification.status !== "unexecuted") {
      semanticError(
        "COMPONENT_ACTIVATION_FAILED",
        "verifyComponentActivation",
        "external component-activation callback returned an unknown status",
      );
    }
    componentEffect = activationVerification.status === "activated" ? "activated" : null;
    componentStatus = activationVerification.status;
  }

  let terminalEffect: "subject" | null = null;
  if (descriptor.numericKind === 7) {
    const retirementCheck: CoreRetirementFinalizationCheck = {
      chainId,
      subjectId: derivedSubjectId,
      shareToken,
      streamId: derivedStreamId,
      recordHash: derivedRecordHash,
      kind: 7,
      sequence,
      recordPrev: prev,
      previousAnchor: expected.previousAnchor,
      components: componentHash,
      verifyingContract: expected.verifyingContract,
      signer,
      signatureScheme: derivedSignatureScheme,
      signatureHash: derivedSignatureHash,
      attestationDigest: digest,
      scope: stringAt(record.scope, "record.scope") as "subject",
      reason: stringAt(record.reason, "record.reason") as CoreRetirementFinalizationCheck["reason"],
      lastArchiveHash: stringAt(record.lastArchiveHash, "record.lastArchiveHash") as Hex,
      finalSupply: uintKey(record.finalSupply, "record.finalSupply"),
      pendingRequests: uintKey(record.pendingRequests, "record.pendingRequests"),
      outstandingClaims: uintKey(record.outstandingClaims, "record.outstandingClaims"),
      claimFunding: uintKey(record.claimFunding, "record.claimFunding"),
      residualPositions: arrayAt(record.residualPositions, "record.residualPositions").map(
        (item, index) => objectAt(item, `record.residualPositions[${index}]`),
      ),
      residualCash: arrayAt(record.residualCash, "record.residualCash").map(
        (item, index) => objectAt(item, `record.residualCash[${index}]`),
      ),
      feeAccruals: arrayAt(record.feeAccruals, "record.feeAccruals").map(
        (item, index) => objectAt(item, `record.feeAccruals[${index}]`),
      ),
      liabilities: arrayAt(record.liabilities, "record.liabilities").map(
        (item, index) => objectAt(item, `record.liabilities[${index}]`),
      ),
      recovery: objectAt(record.recovery, "record.recovery"),
      migration: null,
      requiredFinalization: {
        anchorMode: "atomic",
        storedRecordHash: derivedRecordHash,
        storedSequence: sequence,
        settlementRetired: true,
        subjectFinalized: true,
        terminalState: {
          finalSupply: 0n,
          pendingRequests: 0n,
          outstandingClaims: 0n,
          claimFunding: 0n,
        },
        stateRead: "before-and-after-anchor",
        resolutionTiming: "before-finalization",
        resolutionEvidencePrecedesFinalization: true,
        custodyPerimeterEmpty: true,
        accountingPerimeterEmpty: true,
        wrapperNonReentrant: true,
        noResolutionOrArbitraryCalls: true,
        canonicalEventEvidence: {
          retirementFinalRecordBound: {
            canonical: true,
            recordHash: derivedRecordHash,
            sequence,
          },
          vaultRetired: {
            canonical: true,
            subjectId: derivedSubjectId,
          },
        },
        laterSubjectRecordKind: 8,
        laterCorrectionChangesSettlementBearingOutput: false,
      },
    };
    let finalizationVerified = false;
    try {
      finalizationVerified = expected.verifyRetirementFinalization(retirementCheck) === true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "retirement-finalization callback threw";
      semanticError(
        "RETIREMENT_FINALIZATION_FAILED",
        "verifyRetirementFinalization",
        detail,
      );
    }
    if (!finalizationVerified) {
      semanticError(
        "RETIREMENT_FINALIZATION_FAILED",
        "verifyRetirementFinalization",
        "external atomic subject-finalization result was not true",
      );
    }
    terminalEffect = "subject";
  }

  return {
    subjectId: derivedSubjectId,
    streamId: derivedStreamId,
    kind: descriptor.numericKind,
    sequence,
    recordHash: derivedRecordHash,
    attestationDigest: digest,
    terminalEffect,
    componentEffect,
    componentStatus,
  };
}
