// SPDX-License-Identifier: CC0-1.0

import {
  concat,
  encodeAbiParameters,
  encodePacked,
  hashTypedData,
  keccak256,
  stringToHex,
  toHex,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";

export const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;
export const WAD = 10n ** 18n;
export const PMVS_MAX_RECORD_BYTES = 16_777_216;
export const PMVS_MAX_NESTING_DEPTH = 64;
export const PMVS_MAX_CONTAINER_ITEMS = 65_536;
export const PMVS_ANCHOR_SELECTOR = toFunctionSelector(
  "commit((bytes32,bytes32,uint8,uint64,bytes32,bytes32,bytes32,address,uint8,string),bytes)",
);
export const PMVS_HEAD_SELECTOR = toFunctionSelector("head(bytes32,bytes32)");
export const PMVS_SUBJECT_FINALIZED_SELECTOR = toFunctionSelector("subjectFinalized(bytes32)");
export const PMVS_ANCHOR_INTERFACE_ID = toHex(
  BigInt(PMVS_ANCHOR_SELECTOR)
    ^ BigInt(PMVS_HEAD_SELECTOR)
    ^ BigInt(PMVS_SUBJECT_FINALIZED_SELECTOR),
  { size: 4 },
);
export const PMVS_AUTHORITY_RESOLVER_INTERFACE_ID = toFunctionSelector("pmvsAuthority(bytes32,uint8)");
export const PMVS_SUBJECT_ANCHOR_SELECTOR = toFunctionSelector("pmvsAnchor()");
export const PMVS_SUBJECT_COMPONENTS_SELECTOR = toFunctionSelector("pmvsComponents()");
export const PMVS_SUBJECT_ACTIVATION_NONCE_SELECTOR = toFunctionSelector("pmvsActivationNonce()");
export const PMVS_RETIREMENT_STATE_SELECTOR = toFunctionSelector("pmvsRetirementState()");
export const PMVS_SUBJECT_DISCOVERY_INTERFACE_ID = toHex(
  BigInt(PMVS_SUBJECT_ANCHOR_SELECTOR)
    ^ BigInt(PMVS_SUBJECT_COMPONENTS_SELECTOR)
    ^ BigInt(PMVS_SUBJECT_ACTIVATION_NONCE_SELECTOR),
  { size: 4 },
);
export const PMVS_ACTIVATION_CONDITION_TYPE =
  "PMVSActivationCondition(bytes32 idHash,address target,bytes32 callDataHash,bytes32 expectedReturnDataHash)";
export const PMVS_COMPONENT_ACTIVATION_TYPE =
  "PMVSComponentActivation(uint256 chainId,address shareToken,bytes32 subjectId,uint64 streamSequence,bytes32 streamPrev,uint64 nonce,bool expectedActiveExists,bytes32 expectedActiveRecordHash,uint64 expectedActiveGeneration,address expectedActiveAnchor,uint64 newGeneration,address newAnchor,uint64 validFromBlock,uint64 validThroughBlock,bytes32 migrationHash,bytes32 checksHash)";
export const PMVS_ACTIVATION_CONDITION_TYPEHASH = keccak256(
  stringToHex(PMVS_ACTIVATION_CONDITION_TYPE),
);
export const PMVS_COMPONENT_ACTIVATION_TYPEHASH = keccak256(
  stringToHex(PMVS_COMPONENT_ACTIVATION_TYPE),
);
export const PMVS_COMPONENTS_UPDATED_EVENT_SIGNATURE =
  "PMVSComponentsUpdated(bytes32,uint64,address,uint64,bytes32)";
export const PMVS_COMPONENTS_UPDATED_EVENT_TOPIC = keccak256(
  stringToHex(PMVS_COMPONENTS_UPDATED_EVENT_SIGNATURE),
);
export const PMVS_RECORD_ANCHORED_EVENT_SIGNATURE =
  "PMVSRecordAnchored(bytes32,bytes32,uint64,uint8,bytes32,bytes32,bytes32,address,uint8,bytes32,string)";
export const PMVS_RECORD_ANCHORED_EVENT_TOPIC = keccak256(
  stringToHex(PMVS_RECORD_ANCHORED_EVENT_SIGNATURE),
);
export const PMVS_ANCHOR_MIGRATED_EVENT_SIGNATURE =
  "PMVSAnchorMigrated(bytes32,bytes32,address,uint64,uint8,bytes32)";
export const PMVS_ANCHOR_MIGRATED_EVENT_TOPIC = keccak256(
  stringToHex(PMVS_ANCHOR_MIGRATED_EVENT_SIGNATURE),
);

function assertUnicode(value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("unpaired high surrogate");
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("unpaired low surrogate");
    }
  }
}

function assertDenseArray(value: readonly unknown[], label: string): void {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== "length") {
    throw new Error(`${label} has holes or non-index properties`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error(`${label} is sparse`);
  }
}

export function assertSortedUniqueBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  label: string,
): void {
  assertDenseArray(items, label);
  let prior: string | null = null;
  for (const item of items) {
    const key = keyOf(item);
    assertUnicode(key);
    if (prior !== null && key <= prior) throw new Error(`${label} must have strictly increasing keys`);
    prior = key;
  }
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    assertUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "bigint") {
    throw new Error("PMVS records forbid JSON numbers");
  }
  if (Array.isArray(value)) {
    assertDenseArray(value, "array");
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === undefined) throw new Error("undefined is not JSON");
    }
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("non-JSON object prototype");
    if (Reflect.ownKeys(value).length !== Object.keys(value).length) throw new Error("non-JSON object property");
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => {
        assertUnicode(key);
        if (item === undefined) throw new Error("undefined is not JSON");
        return `${JSON.stringify(key)}:${canonicalize(item)}`;
      });
    return `{${entries.join(",")}}`;
  }
  throw new Error(`unsupported JSON value: ${typeof value}`);
}

export function parseCanonicalJson(raw: string | Uint8Array): unknown {
  if (raw instanceof Uint8Array && raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    throw new Error("PMVS JSON must not contain a UTF-8 BOM");
  }
  const byteLength = typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
  if (byteLength > PMVS_MAX_RECORD_BYTES) throw new Error("PMVS JSON exceeds the record-size limit");
  const text = typeof raw === "string" ? raw : new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (text.charCodeAt(0) === 0xfeff) throw new Error("PMVS JSON must not contain a BOM");
  let cursor = 0;

  const skipWhitespace = (): void => {
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n" || text[cursor] === "\r")) {
      cursor += 1;
    }
  };

  const parseString = (): string => {
    if (text[cursor] !== '"') throw new Error("expected JSON string");
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === '"') {
        cursor += 1;
        const value = JSON.parse(text.slice(start, cursor));
        if (typeof value !== "string") throw new Error("invalid JSON string");
        return value;
      }
      if (text[cursor] === "\\") cursor += 1;
      cursor += 1;
    }
    throw new Error("unterminated JSON string");
  };

  const parseValue = (depth = 0): unknown => {
    skipWhitespace();
    const token = text[cursor];
    if (token === '"') return parseString();
    if (text.startsWith("true", cursor)) {
      cursor += 4;
      return true;
    }
    if (text.startsWith("false", cursor)) {
      cursor += 5;
      return false;
    }
    if (text.startsWith("null", cursor)) {
      cursor += 4;
      return null;
    }
    if (token === "[") {
      if (depth >= PMVS_MAX_NESTING_DEPTH) throw new Error("PMVS JSON exceeds the nesting-depth limit");
      cursor += 1;
      const result: unknown[] = [];
      skipWhitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        return result;
      }
      while (true) {
        result.push(parseValue(depth + 1));
        if (result.length > PMVS_MAX_CONTAINER_ITEMS) throw new Error("PMVS JSON array is too long");
        skipWhitespace();
        if (text[cursor] === "]") {
          cursor += 1;
          return result;
        }
        if (text[cursor] !== ",") throw new Error("expected array separator");
        cursor += 1;
      }
    }
    if (token === "{") {
      if (depth >= PMVS_MAX_NESTING_DEPTH) throw new Error("PMVS JSON exceeds the nesting-depth limit");
      cursor += 1;
      const result = Object.create(null) as Record<string, unknown>;
      const keys = new Set<string>();
      skipWhitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        return result;
      }
      while (true) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error(`duplicate JSON key: ${key}`);
        keys.add(key);
        if (keys.size > PMVS_MAX_CONTAINER_ITEMS) throw new Error("PMVS JSON object has too many members");
        skipWhitespace();
        if (text[cursor] !== ":") throw new Error("expected object colon");
        cursor += 1;
        result[key] = parseValue(depth + 1);
        skipWhitespace();
        if (text[cursor] === "}") {
          cursor += 1;
          return result;
        }
        if (text[cursor] !== ",") throw new Error("expected object separator");
        cursor += 1;
      }
    }
    throw new Error("PMVS JSON contains a number or invalid token");
  };

  const value = parseValue();
  skipWhitespace();
  if (cursor !== text.length) throw new Error("trailing JSON data");
  if (canonicalize(value) !== text) throw new Error("JSON bytes are not canonical PMVS-JCS/1");
  return value;
}

export function recordHash(record: unknown): Hex {
  return keccak256(stringToHex(canonicalize(record)));
}

export function subjectId(chainId: bigint, shareToken: Address): Hex {
  assertUint(chainId, UINT256_MAX, "chain id");
  assertNonzeroAddress(shareToken, "share token");
  return keccak256(encodePacked(["uint256", "address"], [chainId, shareToken]));
}

export function watcherStreamId(signer: Address): Hex {
  assertNonzeroAddress(signer, "watcher signer");
  return keccak256(encodePacked(["string", "address"], ["PMVS:WATCHER:1", signer]));
}

export type PMVSActivationCondition = {
  id: string;
  target: Address;
  callData: Hex;
  expectedReturnDataHash: Hex;
};

export type PMVSActiveComponents = {
  recordHash: Hex;
  generation: bigint;
  anchor: Address;
};

export type PMVSComponentActivationCommitmentInput = {
  chainId: bigint;
  shareToken: Address;
  subjectId: Hex;
  streamSequence: bigint;
  streamPrev: Hex;
  nonce: bigint;
  expectedActive: PMVSActiveComponents | null;
  newGeneration: bigint;
  newAnchor: Address;
  validFromBlock: bigint;
  validThroughBlock: bigint;
  migration: unknown | null;
  checks: readonly PMVSActivationCondition[];
};

function assertHexData(value: Hex, label: string): void {
  if (!/^0x(?:[0-9a-f]{2})*$/.test(value)) throw new Error(`${label} must be lowercase hex bytes`);
}

function activationConditionHash(condition: PMVSActivationCondition): Hex {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(condition.id)) {
    throw new Error("activation condition id is invalid");
  }
  assertNonzeroAddress(condition.target, "activation condition target");
  assertHexData(condition.callData, "activation condition calldata");
  assertBytes32(condition.expectedReturnDataHash, "activation expected-return hash");
  return keccak256(encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [
      PMVS_ACTIVATION_CONDITION_TYPEHASH,
      keccak256(stringToHex(condition.id)),
      condition.target,
      keccak256(condition.callData),
      condition.expectedReturnDataHash,
    ],
  ));
}

export function componentActivationChecksHash(
  checks: readonly PMVSActivationCondition[],
): Hex {
  assertDenseArray(checks, "activation conditions");
  assertSortedUniqueBy(checks, (check) => check.id, "activation conditions");
  const leaves = checks.map(activationConditionHash);
  return keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [leaves]));
}

export function componentMigrationHash(migration: unknown | null): Hex {
  if (migration === null) return ZERO_HASH;
  if (typeof migration !== "object" || Array.isArray(migration)) {
    throw new Error("component migration must be an object or null");
  }
  return keccak256(stringToHex(canonicalize(migration)));
}

/**
 * Commits a component activation intent without hashing the component
 * record's own hash. The later activation event binds this commitment to that
 * record hash and therefore does not create a hash fixed point.
 */
export function componentActivationCommitment(
  input: PMVSComponentActivationCommitmentInput,
): Hex {
  assertUint(input.chainId, UINT256_MAX, "activation chain id");
  assertNonzeroAddress(input.shareToken, "activation share token");
  assertBytes32(input.subjectId, "activation subject id");
  if (input.subjectId.toLowerCase() !== subjectId(input.chainId, input.shareToken)) {
    throw new Error("activation subject id does not match chain and share token");
  }
  assertUint(input.streamSequence, UINT64_MAX, "activation stream sequence");
  assertBytes32(input.streamPrev, "activation stream predecessor");
  assertUint(input.nonce, UINT64_MAX, "activation nonce");
  if (input.nonce === 0n) throw new Error("activation nonce must be positive");
  assertUint(input.newGeneration, UINT64_MAX, "new component generation");
  assertNonzeroAddress(input.newAnchor, "new component anchor");
  assertUint(input.validFromBlock, UINT64_MAX, "activation start block");
  assertUint(input.validThroughBlock, UINT64_MAX, "activation end block");
  if (input.validFromBlock > input.validThroughBlock) {
    throw new Error("activation block window is reversed");
  }

  let expectedActiveExists = false;
  let expectedActiveRecordHash = ZERO_HASH;
  let expectedActiveGeneration = 0n;
  let expectedActiveAnchor = "0x0000000000000000000000000000000000000000" as Address;
  if (input.expectedActive === null) {
    if (input.streamSequence !== 0n || input.streamPrev.toLowerCase() !== ZERO_HASH) {
      throw new Error("component genesis must occupy subject-stream sequence zero");
    }
    if (input.nonce !== 1n || input.newGeneration !== 0n || input.migration !== null) {
      throw new Error("component genesis requires nonce one, generation zero, and no migration");
    }
  } else {
    expectedActiveExists = true;
    expectedActiveRecordHash = input.expectedActive.recordHash;
    expectedActiveGeneration = input.expectedActive.generation;
    expectedActiveAnchor = input.expectedActive.anchor;
    assertBytes32(expectedActiveRecordHash, "expected active component hash");
    if (expectedActiveRecordHash.toLowerCase() === ZERO_HASH) {
      throw new Error("expected active component hash must be nonzero");
    }
    assertUint(expectedActiveGeneration, UINT64_MAX, "expected active generation");
    assertNonzeroAddress(expectedActiveAnchor, "expected active anchor");
    if (expectedActiveGeneration === UINT64_MAX || input.newGeneration !== expectedActiveGeneration + 1n) {
      throw new Error("new component generation must increase by one");
    }
    if (input.nonce === 1n) throw new Error("a component update cannot reuse the genesis nonce");
    if (input.migration === null) throw new Error("a component update requires migration data");
  }

  const migrationHash = componentMigrationHash(input.migration);
  const checksHash = componentActivationChecksHash(input.checks);
  return keccak256(encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "bytes32" },
      { type: "uint64" },
      { type: "bytes32" },
      { type: "uint64" },
      { type: "bool" },
      { type: "bytes32" },
      { type: "uint64" },
      { type: "address" },
      { type: "uint64" },
      { type: "address" },
      { type: "uint64" },
      { type: "uint64" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [
      PMVS_COMPONENT_ACTIVATION_TYPEHASH,
      input.chainId,
      input.shareToken,
      input.subjectId,
      input.streamSequence,
      input.streamPrev,
      input.nonce,
      expectedActiveExists,
      expectedActiveRecordHash,
      expectedActiveGeneration,
      expectedActiveAnchor,
      input.newGeneration,
      input.newAnchor,
      input.validFromBlock,
      input.validThroughBlock,
      migrationHash,
      checksHash,
    ],
  ));
}

export type PMVSChainPosition = {
  blockNumber: bigint;
  transactionIndex: bigint;
  logIndex: bigint;
};

export type PMVSAnchorTransitionHead = {
  streamId: Hex;
  sequence: bigint;
  kind: 4 | 10;
  recordHash: Hex;
};

export type PMVSAnchorMigratedReceiptEvent = PMVSAnchorTransitionHead & {
  subjectId: Hex;
  oldAnchor: Address;
  emitter: Address;
  topic0: Hex;
  transactionHash: Hex;
  position: PMVSChainPosition;
};

export type PMVSAnchorTransitionReceiptEvidence = {
  oldAnchor: Address;
  newAnchor: Address;
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: bigint;
  transactionIndex: bigint;
  frozenOldHeads: readonly PMVSAnchorTransitionHead[];
  importedNewHeads: readonly PMVSAnchorTransitionHead[];
  postImportHeads: readonly PMVSAnchorTransitionHead[];
  migratedEvents: readonly PMVSAnchorMigratedReceiptEvent[];
};

export type PMVSComponentActivationReceiptEvidence = {
  transactionHash: Hex;
  receiptBlockHash: Hex;
  canonicalBlockHash: Hex;
  receiptBlockNumber: bigint;
  receiptTransactionIndex: bigint;
  currentBlockNumber: bigint;
  status: "success" | "reverted";
  removed: boolean;
  anchorTransactionHash: Hex;
  anchorReceiptBlockHash: Hex;
  canonicalAnchorBlockHash: Hex;
  anchorReceiptBlockNumber: bigint;
  anchorReceiptTransactionIndex: bigint;
  anchorStatus: "success" | "reverted";
  anchorRemoved: boolean;
  anchorPosition: PMVSChainPosition;
  activationPosition: PMVSChainPosition;
  anchorEventCount: bigint;
  anchorEvent: {
    emitter: Address;
    topic0: Hex;
    subjectId: Hex;
    streamId: Hex;
    sequence: bigint;
    kind: 4;
    recordHash: Hex;
  };
  componentsUpdatedEventCount: bigint;
  emitter: Address;
  topic0: Hex;
  recordHash: Hex;
  generation: bigint;
  anchor: Address;
  nonce: bigint;
  actionCommitment: Hex;
  priorActivationNonce: bigint;
  preState: {
    recordHash: Hex;
    generation: bigint;
    anchor: Address;
    nonce: bigint;
  };
  anchorHead: AnchorHead;
  postState: {
    recordHash: Hex;
    generation: bigint;
    anchor: Address;
    nonce: bigint;
  };
  governanceAuthorized: boolean;
  conditionsPassed: boolean;
  noOrdinaryCoveredAction: boolean;
  anchorTransition: PMVSAnchorTransitionReceiptEvidence | null;
};

function compareChainPosition(left: PMVSChainPosition, right: PMVSChainPosition): number {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex < right.transactionIndex ? -1 : 1;
  }
  if (left.logIndex !== right.logIndex) return left.logIndex < right.logIndex ? -1 : 1;
  return 0;
}

function assertActivationHead(head: PMVSAnchorTransitionHead, label: string): void {
  assertBytes32(head.streamId, `${label} stream id`);
  assertUint(head.sequence, UINT64_MAX, `${label} sequence`);
  if (head.streamId === ZERO_HASH) {
    if (head.kind !== 4) throw new Error(`${label} subject head must have kind 4`);
  } else if (head.kind !== 10) {
    throw new Error(`${label} watcher head must have kind 10`);
  }
  assertBytes32(head.recordHash, `${label} record hash`);
  if (head.recordHash === ZERO_HASH) throw new Error(`${label} record hash must be nonzero`);
}

function assertExactActivationHeads(
  actual: readonly PMVSAnchorTransitionHead[],
  expected: readonly PMVSAnchorTransitionHead[],
  label: string,
): void {
  assertDenseArray(actual, label);
  assertSortedUniqueBy(actual, (head) => head.streamId, label);
  if (actual.length !== expected.length) throw new Error(`${label} is not the exact declared head set`);
  actual.forEach((head, index) => {
    assertActivationHead(head, `${label}[${index}]`);
    const wanted = expected[index];
    if (
      head.streamId !== wanted.streamId
      || head.sequence !== wanted.sequence
      || head.kind !== wanted.kind
      || head.recordHash !== wanted.recordHash
    ) {
      throw new Error(`${label} does not match the declared head set`);
    }
  });
}

/** Checks independently recovered canonical receipt evidence for activation. */
export function assertComponentActivationReceipt(input: {
  subjectId: Hex;
  shareToken: Address;
  recordHash: Hex;
  sequence: bigint;
  generation: bigint;
  anchor: Address;
  nonce: bigint;
  actionCommitment: Hex;
  expectedActive: PMVSActiveComponents | null;
  continuingWatcherHeads: readonly PMVSAnchorTransitionHead[];
  validFromBlock: bigint;
  validThroughBlock: bigint;
  confirmationDepth: bigint;
  receipt: PMVSComponentActivationReceiptEvidence;
}): void {
  assertBytes32(input.subjectId, "activation subject id");
  if (input.subjectId === ZERO_HASH) throw new Error("activation subject id must be nonzero");
  assertNonzeroAddress(input.shareToken, "activation share token");
  assertBytes32(input.recordHash, "activated component hash");
  if (input.recordHash.toLowerCase() === ZERO_HASH) throw new Error("activated component hash must be nonzero");
  assertUint(input.sequence, UINT64_MAX, "activated component sequence");
  assertUint(input.generation, UINT64_MAX, "activated generation");
  assertNonzeroAddress(input.anchor, "activated anchor");
  assertUint(input.nonce, UINT64_MAX, "activation nonce");
  if (input.nonce === 0n) throw new Error("activation nonce must be positive");
  assertBytes32(input.actionCommitment, "activation action commitment");
  if (input.actionCommitment.toLowerCase() === ZERO_HASH) {
    throw new Error("activation action commitment must be nonzero");
  }
  assertUint(input.validFromBlock, UINT64_MAX, "activation start block");
  assertUint(input.validThroughBlock, UINT64_MAX, "activation end block");
  if (input.validFromBlock > input.validThroughBlock) {
    throw new Error("activation block window is reversed");
  }
  assertUint(input.confirmationDepth, UINT64_MAX, "activation confirmation depth");
  assertDenseArray(input.continuingWatcherHeads, "continuing watcher heads");
  assertSortedUniqueBy(
    input.continuingWatcherHeads,
    (head) => head.streamId,
    "continuing watcher heads",
  );
  input.continuingWatcherHeads.forEach((head, index) => {
    assertActivationHead(head, `continuing watcher heads[${index}]`);
    if (head.streamId === ZERO_HASH) {
      throw new Error("continuing watcher heads cannot repeat the subject stream");
    }
  });

  const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
  if (input.expectedActive !== null) {
    assertBytes32(input.expectedActive.recordHash, "expected active record hash");
    if (input.expectedActive.recordHash === ZERO_HASH) {
      throw new Error("expected active record hash must be nonzero");
    }
    assertUint(input.expectedActive.generation, UINT64_MAX, "expected active generation");
    assertNonzeroAddress(input.expectedActive.anchor, "expected active anchor");
  }

  const receipt = input.receipt;
  assertBoolean(receipt.removed, "activation receipt removed flag");
  assertBoolean(receipt.anchorRemoved, "component anchor receipt removed flag");
  assertBoolean(receipt.governanceAuthorized, "activation governance authorization");
  assertBoolean(receipt.conditionsPassed, "activation conditions result");
  assertBoolean(receipt.noOrdinaryCoveredAction, "ordinary covered-action exclusion");
  assertBytes32(receipt.transactionHash, "activation transaction hash");
  assertBytes32(receipt.receiptBlockHash, "activation receipt block hash");
  assertBytes32(receipt.canonicalBlockHash, "canonical activation block hash");
  if (
    receipt.transactionHash === ZERO_HASH
    || receipt.receiptBlockHash === ZERO_HASH
    || receipt.canonicalBlockHash === ZERO_HASH
  ) {
    throw new Error("activation transaction and block hashes must be nonzero");
  }
  assertUint(receipt.receiptBlockNumber, UINT64_MAX, "activation receipt block number");
  assertUint(receipt.receiptTransactionIndex, UINT64_MAX, "activation receipt transaction index");
  if (receipt.receiptBlockHash.toLowerCase() !== receipt.canonicalBlockHash.toLowerCase()) {
    throw new Error("activation receipt is not on the supplied canonical block");
  }
  if (receipt.status !== "success" || receipt.removed) {
    throw new Error("activation receipt is not a successful canonical receipt");
  }
  assertBytes32(receipt.anchorTransactionHash, "component anchor transaction hash");
  assertBytes32(receipt.anchorReceiptBlockHash, "component anchor receipt block hash");
  assertBytes32(receipt.canonicalAnchorBlockHash, "canonical component anchor block hash");
  if (
    receipt.anchorTransactionHash === ZERO_HASH
    || receipt.anchorReceiptBlockHash === ZERO_HASH
    || receipt.canonicalAnchorBlockHash === ZERO_HASH
  ) {
    throw new Error("component anchor transaction and block hashes must be nonzero");
  }
  assertUint(receipt.anchorReceiptBlockNumber, UINT64_MAX, "component anchor receipt block number");
  assertUint(
    receipt.anchorReceiptTransactionIndex,
    UINT64_MAX,
    "component anchor receipt transaction index",
  );
  if (receipt.anchorReceiptBlockHash !== receipt.canonicalAnchorBlockHash) {
    throw new Error("component anchor receipt is not on the supplied canonical block");
  }
  if (receipt.anchorStatus !== "success" || receipt.anchorRemoved) {
    throw new Error("component anchor receipt is not a successful canonical receipt");
  }
  for (const [label, position] of [
    ["anchor", receipt.anchorPosition],
    ["activation", receipt.activationPosition],
  ] as const) {
    assertUint(position.blockNumber, UINT64_MAX, `${label} block number`);
    assertUint(position.transactionIndex, UINT64_MAX, `${label} transaction index`);
    assertUint(position.logIndex, UINT64_MAX, `${label} log index`);
  }
  if (
    receipt.activationPosition.blockNumber !== receipt.receiptBlockNumber
    || receipt.activationPosition.transactionIndex !== receipt.receiptTransactionIndex
  ) {
    throw new Error("activation event position does not belong to the activation receipt");
  }
  if (
    receipt.anchorPosition.blockNumber !== receipt.anchorReceiptBlockNumber
    || receipt.anchorPosition.transactionIndex !== receipt.anchorReceiptTransactionIndex
  ) {
    throw new Error("anchor event position does not belong to the candidate anchor receipt");
  }
  if (
    receipt.anchorReceiptBlockNumber === receipt.receiptBlockNumber
    && receipt.anchorReceiptBlockHash.toLowerCase() !== receipt.receiptBlockHash.toLowerCase()
  ) {
    throw new Error("canonical receipts at the same height must share one block hash");
  }
  if (
    receipt.anchorReceiptBlockNumber === receipt.receiptBlockNumber
    && receipt.anchorReceiptTransactionIndex === receipt.receiptTransactionIndex
    && receipt.anchorTransactionHash.toLowerCase() !== receipt.transactionHash.toLowerCase()
  ) {
    throw new Error("canonical receipts at the same transaction position must share one transaction hash");
  }
  if (receipt.anchorTransactionHash === receipt.transactionHash) {
    if (
      receipt.anchorReceiptBlockHash !== receipt.receiptBlockHash
      || receipt.anchorPosition.blockNumber !== receipt.receiptBlockNumber
      || receipt.anchorPosition.transactionIndex !== receipt.receiptTransactionIndex
    ) {
      throw new Error("same-transaction anchor position does not match the activation receipt");
    }
  }
  if (compareChainPosition(receipt.anchorPosition, receipt.activationPosition) >= 0) {
    throw new Error("component anchor must precede activation");
  }
  assertUint(receipt.currentBlockNumber, UINT64_MAX, "canonical head block number");
  if (receipt.activationPosition.blockNumber > receipt.currentBlockNumber) {
    throw new Error("activation block is ahead of the canonical head");
  }
  if (
    receipt.activationPosition.blockNumber < input.validFromBlock
    || receipt.activationPosition.blockNumber > input.validThroughBlock
  ) {
    throw new Error("activation block is outside the committed window");
  }
  const confirmations = receipt.currentBlockNumber - receipt.activationPosition.blockNumber + 1n;
  if (confirmations < input.confirmationDepth) throw new Error("activation is not sufficiently confirmed");
  const candidateAnchor = input.expectedActive === null ? input.anchor : input.expectedActive.anchor;
  if (receipt.anchorEventCount !== 1n) {
    throw new Error("candidate anchor transaction must emit exactly one matching anchor event");
  }
  if (
    receipt.anchorEvent.emitter !== candidateAnchor
    || receipt.anchorEvent.topic0 !== PMVS_RECORD_ANCHORED_EVENT_TOPIC
    || receipt.anchorEvent.subjectId !== input.subjectId
    || receipt.anchorEvent.streamId !== ZERO_HASH
    || receipt.anchorEvent.sequence !== input.sequence
    || receipt.anchorEvent.kind !== 4
    || receipt.anchorEvent.recordHash !== input.recordHash
  ) {
    throw new Error("candidate anchor event does not bind the component record");
  }
  if (receipt.componentsUpdatedEventCount !== 1n) {
    throw new Error("activation transaction must emit exactly one components-updated event");
  }
  if (receipt.emitter !== input.shareToken) throw new Error("activation event emitter mismatch");
  if (receipt.topic0.toLowerCase() !== PMVS_COMPONENTS_UPDATED_EVENT_TOPIC.toLowerCase()) {
    throw new Error("activation event topic mismatch");
  }
  if (
    receipt.recordHash.toLowerCase() !== input.recordHash.toLowerCase()
    || receipt.generation !== input.generation
    || receipt.anchor !== input.anchor
    || receipt.nonce !== input.nonce
    || receipt.actionCommitment.toLowerCase() !== input.actionCommitment.toLowerCase()
  ) {
    throw new Error("activation event does not bind the expected component intent");
  }
  assertUint(receipt.priorActivationNonce, UINT64_MAX, "prior activation nonce");
  if (receipt.priorActivationNonce === UINT64_MAX || receipt.nonce !== receipt.priorActivationNonce + 1n) {
    throw new Error("activation nonce must increase by one");
  }
  for (const [label, state] of [
    ["pre-activation", receipt.preState],
    ["post-activation", receipt.postState],
  ] as const) {
    assertBytes32(state.recordHash, `${label} component hash`);
    assertUint(state.generation, UINT64_MAX, `${label} generation`);
    assertLowerAddress(state.anchor, `${label} anchor`);
    assertUint(state.nonce, UINT64_MAX, `${label} nonce`);
  }
  if (receipt.preState.nonce !== receipt.priorActivationNonce) {
    throw new Error("pre-activation nonce does not match canonical prior state");
  }
  if (input.expectedActive === null) {
    if (
      receipt.preState.recordHash !== ZERO_HASH
      || receipt.preState.generation !== 0n
      || receipt.preState.anchor !== zeroAddress
      || receipt.preState.nonce !== 0n
    ) {
      throw new Error("component genesis requires empty discovery pre-state");
    }
  } else if (
    receipt.preState.recordHash !== input.expectedActive.recordHash
    || receipt.preState.generation !== input.expectedActive.generation
    || receipt.preState.anchor !== input.expectedActive.anchor
  ) {
    throw new Error("activation pre-state does not match the expected active tuple");
  }
  if (
    receipt.anchorHead === null
    || receipt.anchorHead.kind !== 4
    || receipt.anchorHead.sequence !== input.sequence
    || receipt.anchorHead.recordHash.toLowerCase() !== input.recordHash.toLowerCase()
  ) {
    throw new Error("activation anchor head tuple mismatch");
  }
  if (
    receipt.postState.recordHash.toLowerCase() !== input.recordHash.toLowerCase()
    || receipt.postState.generation !== input.generation
    || receipt.postState.anchor !== input.anchor
    || receipt.postState.nonce !== input.nonce
  ) {
    throw new Error("post-activation discovery state mismatch");
  }

  const transitionRequired = input.expectedActive !== null
    && input.expectedActive.anchor !== input.anchor;
  if (!transitionRequired) {
    if (receipt.anchorTransition !== null) {
      throw new Error("same-anchor activation cannot claim an anchor transition");
    }
    if (input.continuingWatcherHeads.length !== 0) {
      throw new Error("same-anchor activation cannot import watcher heads");
    }
  } else {
    const transition = receipt.anchorTransition;
    if (transition === null) throw new Error("anchor transition evidence is required");
    if (
      transition.oldAnchor !== input.expectedActive!.anchor
      || transition.newAnchor !== input.anchor
      || transition.transactionHash !== receipt.transactionHash
      || transition.blockHash !== receipt.receiptBlockHash
      || transition.blockNumber !== receipt.receiptBlockNumber
      || transition.transactionIndex !== receipt.receiptTransactionIndex
    ) {
      throw new Error("anchor transition identity mismatch");
    }
    const subjectHead: PMVSAnchorTransitionHead = {
      streamId: ZERO_HASH,
      sequence: input.sequence,
      kind: 4,
      recordHash: input.recordHash,
    };
    const expectedHeads = [subjectHead, ...input.continuingWatcherHeads];
    assertExactActivationHeads(transition.frozenOldHeads, expectedHeads, "frozen old heads");
    assertExactActivationHeads(transition.importedNewHeads, expectedHeads, "imported new heads");
    assertExactActivationHeads(transition.postImportHeads, expectedHeads, "post-import heads");
    assertDenseArray(transition.migratedEvents, "anchor-migrated events");
    if (transition.migratedEvents.length !== expectedHeads.length) {
      throw new Error("anchor-migrated events are not the exact declared head set");
    }
    let priorLogIndex: bigint | null = null;
    transition.migratedEvents.forEach((event, index) => {
      const wanted = expectedHeads[index];
      assertActivationHead(event, `anchor-migrated events[${index}]`);
      assertBytes32(event.subjectId, `anchor-migrated events[${index}] subject id`);
      assertNonzeroAddress(event.oldAnchor, `anchor-migrated events[${index}] old anchor`);
      assertNonzeroAddress(event.emitter, `anchor-migrated events[${index}] emitter`);
      assertBytes32(event.topic0, `anchor-migrated events[${index}] topic`);
      assertBytes32(event.transactionHash, `anchor-migrated events[${index}] transaction hash`);
      for (const [field, value] of [
        ["blockNumber", event.position.blockNumber],
        ["transactionIndex", event.position.transactionIndex],
        ["logIndex", event.position.logIndex],
      ] as const) {
        assertUint(value, UINT64_MAX, `anchor-migrated events[${index}] ${field}`);
      }
      if (
        event.subjectId !== input.subjectId
        || event.oldAnchor !== input.expectedActive!.anchor
        || event.emitter !== input.anchor
        || event.topic0 !== PMVS_ANCHOR_MIGRATED_EVENT_TOPIC
        || event.transactionHash !== receipt.transactionHash
        || event.position.blockNumber !== receipt.receiptBlockNumber
        || event.position.transactionIndex !== receipt.receiptTransactionIndex
        || event.position.logIndex >= receipt.activationPosition.logIndex
        || (priorLogIndex !== null && event.position.logIndex <= priorLogIndex)
        || event.streamId !== wanted.streamId
        || event.sequence !== wanted.sequence
        || event.kind !== wanted.kind
        || event.recordHash !== wanted.recordHash
      ) {
        throw new Error("anchor-migrated event does not bind the declared atomic import");
      }
      priorLogIndex = event.position.logIndex;
    });
  }
  if (!receipt.governanceAuthorized) throw new Error("activation governance authorization failed");
  if (!receipt.conditionsPassed) throw new Error("activation conditions did not pass");
  if (!receipt.noOrdinaryCoveredAction) {
    throw new Error("activation transaction included an ordinary covered action");
  }
}

export function ctfConditionId(
  oracle: Address,
  questionId: Hex,
  outcomeSlotCount: bigint,
): Hex {
  assertNonzeroAddress(oracle, "condition oracle");
  assertBytes32(questionId, "question id");
  if (outcomeSlotCount < 2n || outcomeSlotCount > 256n) {
    throw new Error("outcome slot count must be in [2, 256]");
  }
  return keccak256(
    encodePacked(["address", "bytes32", "uint256"], [oracle, questionId, outcomeSlotCount]),
  );
}

const CTF_FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const CTF_CURVE_B = 3n;
const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const INT256_MIN = -(1n << 255n);
const INT256_MAX = (1n << 255n) - 1n;

function assertUint(value: bigint, maximum: bigint, label: string): void {
  if (typeof value !== "bigint") throw new Error(`${label} must be a bigint`);
  if (value < 0n || value > maximum) throw new Error(`${label} is out of range`);
}

function assertBoolean(value: boolean, label: string): void {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
}

export function parseUint256Decimal(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("invalid canonical uint256");
  const parsed = BigInt(value);
  assertUint(parsed, UINT256_MAX, "uint256");
  return parsed;
}

export function parseInt256Decimal(value: string): bigint {
  if (!/^(0|-?[1-9][0-9]*)$/.test(value)) throw new Error("invalid canonical int256");
  const parsed = BigInt(value);
  if (parsed < INT256_MIN || parsed > INT256_MAX) throw new Error("int256 is out of range");
  return parsed;
}

function assertLowerAddress(value: Address, label: string): void {
  if (!/^0x[0-9a-f]{40}$/.test(value)) throw new Error(`${label} must be a lowercase address`);
}

function assertNonzeroAddress(value: Address, label: string): void {
  assertLowerAddress(value, label);
  if (value === "0x0000000000000000000000000000000000000000") {
    throw new Error(`${label} must be nonzero`);
  }
}

function mod(value: bigint): bigint {
  const reduced = value % CTF_FIELD_MODULUS;
  return reduced < 0n ? reduced + CTF_FIELD_MODULUS : reduced;
}

function modPow(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let factor = mod(base);
  let power = exponent;
  while (power > 0n) {
    if ((power & 1n) === 1n) result = mod(result * factor);
    factor = mod(factor * factor);
    power >>= 1n;
  }
  return result;
}

function curveY(x: bigint, odd: boolean): bigint {
  const yy = mod(x * x * x + CTF_CURVE_B);
  let y = modPow(yy, (CTF_FIELD_MODULUS + 1n) / 4n);
  if (mod(y * y) !== yy) throw new Error("invalid CTF collection point");
  if ((y & 1n) === (odd ? 0n : 1n)) y = CTF_FIELD_MODULUS - y;
  return y;
}

function addCurvePoints(x1: bigint, y1: bigint, x2: bigint, y2: bigint): [bigint, bigint] {
  if (x1 === x2 && mod(y1 + y2) === 0n) return [0n, 0n];
  const numerator = x1 === x2 && y1 === y2 ? mod(3n * x1 * x1) : mod(y2 - y1);
  const denominator = x1 === x2 && y1 === y2 ? mod(2n * y1) : mod(x2 - x1);
  if (denominator === 0n) throw new Error("invalid CTF point addition");
  const slope = mod(numerator * modPow(denominator, CTF_FIELD_MODULUS - 2n));
  const x3 = mod(slope * slope - x1 - x2);
  const y3 = mod(slope * (x1 - x3) - y1);
  return [x3, y3];
}

export function ctfCollectionId(parentCollectionId: Hex, conditionId: Hex, indexSet: bigint): Hex {
  assertBytes32(parentCollectionId, "parent collection id");
  assertBytes32(conditionId, "condition id");
  if (indexSet <= 0n || indexSet > UINT256_MAX) throw new Error("index set must be a positive uint256");

  const seed = BigInt(keccak256(encodePacked(["bytes32", "uint256"], [conditionId, indexSet])));
  const odd = (seed >> 255n) !== 0n;
  let x1 = seed;
  let y1: bigint;
  while (true) {
    x1 = mod(x1 + 1n);
    try {
      y1 = curveY(x1, odd);
      break;
    } catch {
      // CTHelpers increments x until x^3 + 3 is a quadratic residue.
    }
  }

  const encodedParent = BigInt(parentCollectionId);
  if (encodedParent !== 0n) {
    const parentOdd = (encodedParent >> 254n) !== 0n;
    const x2 = encodedParent & ((1n << 254n) - 1n);
    if (x2 >= CTF_FIELD_MODULUS) throw new Error("invalid parent collection id");
    const y2 = curveY(x2, parentOdd);
    [x1, y1] = addCurvePoints(x1, y1, x2, y2);
  }

  if ((y1 & 1n) === 1n) x1 ^= 1n << 254n;
  return toHex(x1, { size: 32 });
}

export function ctfPositionId(collateralToken: Address, collectionId: Hex): bigint {
  assertNonzeroAddress(collateralToken, "collateral token");
  assertBytes32(collectionId, "collection id");
  return BigInt(keccak256(encodePacked(["address", "bytes32"], [collateralToken, collectionId])));
}

export type CtfPositionRecord = {
  profile: string;
  chainId: string;
  positionContract: string;
  custodyAccount: string;
  collateralToken: string;
  oracle: string;
  questionId: string;
  outcomeSlotCount: string;
  conditionId: string;
  parentCollectionId: string;
  indexSet: string;
  collectionId: string;
  positionId: string;
  quantity: string;
};

export function assertCtfPositionRecord(position: CtfPositionRecord): void {
  if (position.profile !== "position/gnosis-ctf/1") throw new Error("unsupported CTF position profile");
  const chainId = parseUint256Decimal(position.chainId);
  if (chainId === 0n) throw new Error("chain id must be positive");
  assertNonzeroAddress(position.positionContract as Address, "position contract");
  assertNonzeroAddress(position.custodyAccount as Address, "custody account");
  assertNonzeroAddress(position.collateralToken as Address, "collateral token");
  assertNonzeroAddress(position.oracle as Address, "condition oracle");
  assertBytes32(position.questionId as Hex, "question id");
  const outcomeSlotCount = parseUint256Decimal(position.outcomeSlotCount);
  if (outcomeSlotCount < 2n || outcomeSlotCount > 256n) {
    throw new Error("outcome slot count must be in [2, 256]");
  }
  assertBytes32(position.conditionId as Hex, "condition id");
  assertBytes32(position.parentCollectionId as Hex, "parent collection id");
  const indexSet = parseUint256Decimal(position.indexSet);
  const fullIndexSet = (1n << outcomeSlotCount) - 1n;
  if (indexSet === 0n || indexSet >= fullIndexSet) {
    throw new Error("index set must be a nonempty proper subset of the condition slots");
  }
  assertBytes32(position.collectionId as Hex, "collection id");
  const positionId = parseUint256Decimal(position.positionId);
  const quantity = parseUint256Decimal(position.quantity);
  if (quantity === 0n) throw new Error("position quantity must be positive");

  const expectedCondition = ctfConditionId(
    position.oracle as Address,
    position.questionId as Hex,
    outcomeSlotCount,
  );
  if (expectedCondition !== position.conditionId) throw new Error("condition id derivation mismatch");
  const expectedCollection = ctfCollectionId(
    position.parentCollectionId as Hex,
    position.conditionId as Hex,
    indexSet,
  );
  if (expectedCollection !== position.collectionId) throw new Error("collection id derivation mismatch");
  const expectedPosition = ctfPositionId(position.collateralToken as Address, position.collectionId as Hex);
  if (expectedPosition !== positionId) throw new Error("position id derivation mismatch");
}

export type PositionHolding = {
  chainId: bigint;
  positionContract: Address;
  positionId: bigint;
  custodyAccount: Address;
  quantity: bigint;
};

export type AggregatedPosition = {
  chainId: bigint;
  positionContract: Address;
  positionId: bigint;
  holdings: Array<{ custodyAccount: Address; quantity: bigint }>;
  aggregateQuantity: bigint;
};

export function aggregatePositionHoldings(holdings: readonly PositionHolding[]): AggregatedPosition[] {
  assertDenseArray(holdings, "position holdings");
  const sorted = [...holdings];
  for (const holding of sorted) {
    assertUint(holding.chainId, UINT256_MAX, "chain id");
    if (holding.chainId === 0n) throw new Error("chain id must be positive");
    assertNonzeroAddress(holding.positionContract, "position contract");
    assertNonzeroAddress(holding.custodyAccount, "custody account");
    assertUint(holding.positionId, UINT256_MAX, "position id");
    assertUint(holding.quantity, UINT256_MAX, "position quantity");
    if (holding.quantity === 0n) throw new Error("position quantity must be positive");
  }
  sorted.sort((a, b) => {
    if (a.chainId !== b.chainId) return a.chainId < b.chainId ? -1 : 1;
    if (a.positionContract !== b.positionContract) return a.positionContract < b.positionContract ? -1 : 1;
    if (a.positionId !== b.positionId) return a.positionId < b.positionId ? -1 : 1;
    return a.custodyAccount < b.custodyAccount ? -1 : a.custodyAccount > b.custodyAccount ? 1 : 0;
  });

  const result: AggregatedPosition[] = [];
  for (const holding of sorted) {
    const current = result[result.length - 1];
    if (
      current === undefined
      || current.chainId !== holding.chainId
      || current.positionContract !== holding.positionContract
      || current.positionId !== holding.positionId
    ) {
      result.push({
        chainId: holding.chainId,
        positionContract: holding.positionContract,
        positionId: holding.positionId,
        holdings: [{ custodyAccount: holding.custodyAccount, quantity: holding.quantity }],
        aggregateQuantity: holding.quantity,
      });
      continue;
    }
    if (current.holdings[current.holdings.length - 1].custodyAccount === holding.custodyAccount) {
      throw new Error("duplicate position holding key");
    }
    current.holdings.push({ custodyAccount: holding.custodyAccount, quantity: holding.quantity });
    current.aggregateQuantity += holding.quantity;
    assertUint(current.aggregateQuantity, UINT256_MAX, "aggregate position quantity");
  }
  return result;
}

export function crossDisplayedBids(
  size: bigint,
  bids: readonly { price: bigint; quantity: bigint }[],
  priceScale: bigint,
): { filled: bigint; unfilled: bigint; grossMark: bigint } {
  assertDenseArray(bids, "displayed bids");
  assertUint(size, UINT256_MAX, "position size");
  assertUint(priceScale, UINT256_MAX, "price scale");
  if (priceScale === 0n) throw new Error("price scale must be positive");
  let priorPrice: bigint | null = null;
  for (const bid of bids) {
    assertUint(bid.price, UINT256_MAX, "bid price");
    assertUint(bid.quantity, UINT256_MAX, "bid quantity");
    if (bid.price === 0n || bid.quantity === 0n) throw new Error("bid values must be positive");
    if (bid.price > priceScale) throw new Error("bid price exceeds one payout unit");
    if (priorPrice !== null && bid.price >= priorPrice) throw new Error("bids must be strictly descending");
    priorPrice = bid.price;
  }

  let remaining = size;
  let numerator = 0n;
  for (const bid of bids) {
    const take = bid.quantity < remaining ? bid.quantity : remaining;
    numerator += take * bid.price;
    remaining -= take;
    if (remaining === 0n) break;
  }
  const grossMark = numerator / priceScale;
  assertUint(grossMark, UINT256_MAX, "gross mark");
  return { filled: size - remaining, unfilled: remaining, grossMark };
}

export function ctfRedemptionPayout(
  quantity: bigint,
  indexSet: bigint,
  payoutNumerators: readonly bigint[],
  payoutDenominator: bigint,
): bigint {
  assertDenseArray(payoutNumerators, "payout numerators");
  assertUint(quantity, UINT256_MAX, "quantity");
  assertUint(indexSet, UINT256_MAX, "index set");
  if (payoutNumerators.length < 2 || payoutNumerators.length > 256) {
    throw new Error("payout vector length must be in [2, 256]");
  }
  assertUint(payoutDenominator, UINT256_MAX, "payout denominator");
  if (payoutDenominator === 0n) throw new Error("payout denominator must be positive");
  let numeratorSum = 0n;
  for (const numerator of payoutNumerators) {
    assertUint(numerator, UINT256_MAX, "payout numerator");
    numeratorSum += numerator;
    assertUint(numeratorSum, UINT256_MAX, "payout numerator sum");
  }
  if (numeratorSum !== payoutDenominator) {
    throw new Error("payout numerators must sum to the denominator");
  }

  const fullIndexSet = (1n << BigInt(payoutNumerators.length)) - 1n;
  if (indexSet <= 0n || indexSet >= fullIndexSet) {
    throw new Error("index set must be a nonempty proper subset");
  }

  let positionPayoutNumerator = 0n;
  for (let i = 0; i < payoutNumerators.length; i += 1) {
    if ((indexSet & (1n << BigInt(i))) !== 0n) positionPayoutNumerator += payoutNumerators[i];
  }
  if (positionPayoutNumerator !== 0n && quantity > UINT256_MAX / positionPayoutNumerator) {
    throw new Error("redemption payout multiplication overflows uint256");
  }
  const payout = (quantity * positionPayoutNumerator) / payoutDenominator;
  assertUint(payout, UINT256_MAX, "redemption payout");
  return payout;
}

export type CompatibilityLeafInput = {
  requestId: bigint;
  owner: Address;
  amount: bigint;
  epoch: bigint;
};

export function compatibilityLeaf(input: CompatibilityLeafInput): Hex {
  assertUint(input.requestId, UINT256_MAX, "request id");
  if (input.requestId === 0n) throw new Error("request id must be positive");
  assertUint(input.amount, UINT256_MAX, "amount");
  assertUint(input.epoch, UINT64_MAX, "epoch");
  assertNonzeroAddress(input.owner, "request owner");
  return keccak256(
    encodePacked(
      ["uint256", "address", "uint256", "uint64"],
      [input.requestId, input.owner, input.amount, input.epoch],
    ),
  );
}

function orderedPair(a: Hex, b: Hex): [Hex, Hex] {
  assertBytes32(a, "left Merkle node");
  assertBytes32(b, "right Merkle node");
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

function assertBytes32(value: Hex, label: string): void {
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be lowercase bytes32`);
}

export function compatibilityNode(a: Hex, b: Hex): Hex {
  return keccak256(concat(orderedPair(a, b)));
}

export function compatibilityRoot(leaves: readonly Hex[]): Hex {
  assertDenseArray(leaves, "Merkle leaves");
  if (leaves.length === 0) return ZERO_HASH;
  for (const leaf of leaves) assertBytes32(leaf, "Merkle leaf");
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(compatibilityNode(level[i], level[i + 1] ?? level[i]));
    }
    level = next;
  }
  return level[0];
}

export const PMVS_MERKLE_TAG = keccak256(stringToHex("PMVS:MERKLE:1"));

export type PMVSMerkleLeafInput = CompatibilityLeafInput & {
  chainId: bigint;
  settlementContract: Address;
  leg: 0 | 1;
};

export function pmvsMerkleLeaf(input: PMVSMerkleLeafInput): Hex {
  assertUint(input.chainId, UINT256_MAX, "chain id");
  assertUint(input.requestId, UINT256_MAX, "request id");
  if (input.requestId === 0n) throw new Error("request id must be positive");
  assertUint(input.amount, UINT256_MAX, "amount");
  assertUint(input.epoch, UINT64_MAX, "epoch");
  assertNonzeroAddress(input.settlementContract, "settlement contract");
  assertNonzeroAddress(input.owner, "request owner");
  if (input.leg !== 0 && input.leg !== 1) throw new Error("leg must be 0 or 1");
  return keccak256(
    encodePacked(
      ["bytes1", "bytes32", "uint256", "address", "uint8", "uint64", "uint256", "address", "uint256"],
      [
        "0x00",
        PMVS_MERKLE_TAG,
        input.chainId,
        input.settlementContract,
        input.leg,
        input.epoch,
        input.requestId,
        input.owner,
        input.amount,
      ],
    ),
  );
}

export function pmvsMerkleNode(a: Hex, b: Hex): Hex {
  const [left, right] = orderedPair(a, b);
  return keccak256(concat(["0x01", left, right]));
}

export function pmvsMerkleRawRoot(leaves: readonly Hex[]): Hex {
  assertDenseArray(leaves, "Merkle leaves");
  if (leaves.length === 0) return ZERO_HASH;
  for (const leaf of leaves) assertBytes32(leaf, "Merkle leaf");
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(pmvsMerkleNode(level[i], level[i + 1] ?? level[i]));
    }
    level = next;
  }
  return level[0];
}

export function pmvsMerkleRoot(leaves: readonly Hex[]): Hex {
  assertDenseArray(leaves, "Merkle leaves");
  if (leaves.length === 0) return ZERO_HASH;
  return keccak256(concat(["0x02", toHex(BigInt(leaves.length), { size: 32 }), pmvsMerkleRawRoot(leaves)]));
}

export function pmvsMerkleProof(leaves: readonly Hex[], index: number): Hex[] {
  assertDenseArray(leaves, "Merkle leaves");
  if (!Number.isSafeInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error("Merkle proof index is out of range");
  }
  for (const leaf of leaves) assertBytes32(leaf, "Merkle leaf");
  const proof: Hex[] = [];
  let level = [...leaves];
  let cursor = index;
  while (level.length > 1) {
    const sibling = cursor ^ 1;
    proof.push(level[sibling] ?? level[cursor]);
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(pmvsMerkleNode(level[i], level[i + 1] ?? level[i]));
    }
    level = next;
    cursor = Math.floor(cursor / 2);
  }
  return proof;
}

export function verifyPmvsMerkleProof(
  root: Hex,
  leaf: Hex,
  proof: readonly Hex[],
  leafCount: bigint,
  leafIndex: bigint,
): boolean {
  assertBytes32(root, "Merkle root");
  assertBytes32(leaf, "Merkle leaf");
  assertDenseArray(proof, "Merkle proof");
  for (const node of proof) assertBytes32(node, "Merkle proof node");
  assertUint(leafCount, UINT256_MAX, "leaf count");
  assertUint(leafIndex, UINT256_MAX, "leaf index");
  if (leafCount === 0n) return false;
  if (leafIndex >= leafCount) return false;

  let width = leafCount;
  let expectedProofLength = 0;
  while (width > 1n) {
    width = (width + 1n) / 2n;
    expectedProofLength += 1;
  }
  if (proof.length !== expectedProofLength) return false;

  let rawRoot = leaf;
  let cursor = leafIndex;
  width = leafCount;
  for (const node of proof) {
    const sibling = cursor ^ 1n;
    if (sibling >= width && node !== rawRoot) return false;
    rawRoot = pmvsMerkleNode(rawRoot, node);
    cursor >>= 1n;
    width = (width + 1n) / 2n;
  }
  const candidate = keccak256(concat(["0x02", toHex(leafCount, { size: 32 }), rawRoot]));
  return candidate.toLowerCase() === root.toLowerCase();
}

export type SettlementArchiveClaim = {
  requestId: bigint;
  owner: Address;
  queuedEpoch: bigint;
  settlementEpoch: bigint;
  inputAmount: bigint;
  outputAmount: bigint;
  leafIndex: bigint;
  proof: readonly Hex[];
};

export type SettlementExpectedClaim = Pick<
  SettlementArchiveClaim,
  "requestId" | "owner" | "queuedEpoch" | "settlementEpoch" | "inputAmount"
>;

export function assertSettlementArchiveLeg(input: {
  chainId: bigint;
  settlementContract: Address;
  leg: 0 | 1;
  settlementEpoch: bigint;
  pps: bigint;
  assetDecimals: number;
  requestIds: readonly bigint[];
  root: Hex;
  totalInput: bigint;
  totalOutput: bigint;
  claims: readonly SettlementArchiveClaim[];
  expectedPps: bigint;
  expectedClaims: readonly SettlementExpectedClaim[];
}): void {
  assertUint(input.chainId, UINT256_MAX, "chain id");
  if (input.chainId === 0n) throw new Error("chain id must be positive");
  assertNonzeroAddress(input.settlementContract, "settlement contract");
  if (input.leg !== 0 && input.leg !== 1) throw new Error("leg must be 0 or 1");
  assertUint(input.settlementEpoch, UINT64_MAX, "settlement epoch");
  if (input.settlementEpoch === 0n) throw new Error("settlement epoch must be positive");
  assertUint(input.pps, UINT256_MAX, "settlement price");
  if (input.pps === 0n) throw new Error("settlement price must be positive");
  assertUint(input.expectedPps, UINT256_MAX, "authenticated settlement price");
  if (input.expectedPps === 0n) throw new Error("authenticated settlement price must be positive");
  if (input.pps !== input.expectedPps) {
    throw new Error("settlement price does not match the authenticated context");
  }
  assertDecimals(input.assetDecimals, 18, "accounting-asset decimals");
  assertBytes32(input.root, "settlement root");
  assertUint(input.totalInput, UINT256_MAX, "settlement input total");
  assertUint(input.totalOutput, UINT256_MAX, "settlement output total");
  assertDenseArray(input.requestIds, "request ids");
  assertDenseArray(input.claims, "settlement claims");
  assertDenseArray(input.expectedClaims, "authenticated claim facts");
  if (input.claims.length !== input.requestIds.length) {
    throw new Error("claim list must match the request-id list");
  }
  if (input.expectedClaims.length !== input.requestIds.length) {
    throw new Error("authenticated claim facts must match the request-id list");
  }

  let priorRequestId = 0n;
  let inputSum = 0n;
  let outputSum = 0n;
  const leaves: Hex[] = [];
  for (let index = 0; index < input.claims.length; index += 1) {
    const requestId = input.requestIds[index];
    const claim = input.claims[index];
    const expectedClaim = input.expectedClaims[index];
    assertUint(requestId, UINT256_MAX, "request id");
    if (requestId === 0n || requestId <= priorRequestId) {
      throw new Error("request ids must be positive and strictly increasing");
    }
    if (claim.requestId !== requestId) throw new Error("claim request id mismatch");
    assertUint(expectedClaim.requestId, UINT256_MAX, "authenticated request id");
    if (expectedClaim.requestId !== requestId) {
      throw new Error("request id does not match the authenticated request fact");
    }
    assertNonzeroAddress(claim.owner, "claim owner");
    assertNonzeroAddress(expectedClaim.owner, "authenticated claim owner");
    if (claim.owner !== expectedClaim.owner) {
      throw new Error("claim owner does not match the authenticated request fact");
    }
    assertUint(claim.queuedEpoch, UINT64_MAX, "queued epoch");
    assertUint(claim.settlementEpoch, UINT64_MAX, "claim settlement epoch");
    assertUint(expectedClaim.queuedEpoch, UINT64_MAX, "authenticated queued epoch");
    assertUint(expectedClaim.settlementEpoch, UINT64_MAX, "authenticated settlement epoch");
    if (claim.queuedEpoch === 0n || claim.queuedEpoch > input.settlementEpoch) {
      throw new Error("invalid queued epoch");
    }
    if (claim.settlementEpoch !== input.settlementEpoch) {
      throw new Error("claim settlement epoch mismatch");
    }
    if (
      claim.queuedEpoch !== expectedClaim.queuedEpoch
      || claim.settlementEpoch !== expectedClaim.settlementEpoch
    ) {
      throw new Error("claim epoch does not match the authenticated request or settlement fact");
    }
    assertUint(claim.inputAmount, UINT256_MAX, "claim input");
    assertUint(claim.outputAmount, UINT256_MAX, "claim output");
    assertUint(expectedClaim.inputAmount, UINT256_MAX, "authenticated claim input");
    if (claim.inputAmount !== expectedClaim.inputAmount) {
      throw new Error("claim input does not match the authenticated request fact");
    }
    if (claim.inputAmount === 0n || claim.outputAmount === 0n) {
      throw new Error("selected claim amounts must be positive");
    }
    const expectedOutput = input.leg === 0
      ? depositSharesOut(claim.inputAmount, input.expectedPps, input.assetDecimals)
      : withdrawAssetsOut(claim.inputAmount, input.expectedPps, input.assetDecimals);
    if (claim.outputAmount !== expectedOutput) throw new Error("claim output does not match settlement pricing");
    assertUint(claim.leafIndex, UINT256_MAX, "leaf index");
    if (claim.leafIndex !== BigInt(index)) throw new Error("claim leaf index mismatch");
    assertDenseArray(claim.proof, "claim proof");
    if (claim.proof.length > 256) throw new Error("claim proof is too long");

    inputSum += claim.inputAmount;
    outputSum += claim.outputAmount;
    assertUint(inputSum, UINT256_MAX, "settlement input sum");
    assertUint(outputSum, UINT256_MAX, "settlement output sum");
    leaves.push(pmvsMerkleLeaf({
      chainId: input.chainId,
      settlementContract: input.settlementContract,
      leg: input.leg,
      epoch: input.settlementEpoch,
      requestId,
      owner: claim.owner,
      amount: claim.outputAmount,
    }));
    priorRequestId = requestId;
  }

  if (inputSum !== input.totalInput || outputSum !== input.totalOutput) {
    throw new Error("settlement totals do not equal claim sums");
  }
  if (leaves.length === 0) {
    if (input.root !== ZERO_HASH || input.totalInput !== 0n || input.totalOutput !== 0n) {
      throw new Error("empty settlement leg must use a zero root and totals");
    }
    return;
  }
  if (input.root === ZERO_HASH || input.totalInput === 0n || input.totalOutput === 0n) {
    throw new Error("nonempty settlement leg must use a nonzero root and totals");
  }
  if (pmvsMerkleRoot(leaves) !== input.root) throw new Error("settlement root mismatch");
  for (let index = 0; index < input.claims.length; index += 1) {
    const expectedProof = pmvsMerkleProof(leaves, index);
    const proof = input.claims[index].proof;
    if (proof.length !== expectedProof.length || proof.some((node, cursor) => node !== expectedProof[cursor])) {
      throw new Error("claim proof does not match the canonical leaf set");
    }
  }
}

export type SettlementReceiptAction =
  | { type: "normal-roll"; recordKind: "settlement-archive"; recordHash: Hex }
  | { type: "zero-nav"; recordKind: "winddown-opened"; recordHash: Hex };

export type AuthenticatedZeroNavEffects = {
  /** Complete request-state snapshot digest before and after the action. */
  requestState: { before: Hex; after: Hex };
  /** Complete selected-claim and entitlement-state snapshot digest. */
  claimState: { before: Hex; after: Hex };
  /** Complete reserve-bucket snapshot digest. */
  reserveState: { before: Hex; after: Hex };
  /** Complete covered-asset balance snapshot digest. */
  assetBalanceState: { before: Hex; after: Hex };
  /** Complete fee and fee-beneficiary-state snapshot digest. */
  feeState: { before: Hex; after: Hex };
};

export function assertPriceAttemptPublication(input: {
  currentAttempt: bigint;
  candidateAttempt: bigint;
  previousValidUntil: bigint | null;
  publicationTimestamp: bigint;
  epochProcessed: boolean;
  successfulActionExists: boolean;
}): void {
  assertBoolean(input.epochProcessed, "epoch-processed state");
  assertBoolean(input.successfulActionExists, "successful-action state");
  assertUint(input.currentAttempt, UINT64_MAX, "current price attempt");
  assertUint(input.candidateAttempt, UINT64_MAX, "candidate price attempt");
  assertUint(input.publicationTimestamp, UINT64_MAX, "price publication timestamp");
  if (input.candidateAttempt === 0n) throw new Error("price attempt must be positive");
  if (input.epochProcessed) throw new Error("cannot publish a price for a processed epoch");
  if (input.successfulActionExists) {
    throw new Error("cannot publish a price after a successful epoch action");
  }

  if (input.currentAttempt === 0n) {
    if (input.previousValidUntil !== null) {
      throw new Error("first price attempt cannot have a previous expiry");
    }
    if (input.candidateAttempt !== 1n) throw new Error("first price attempt must be one");
    return;
  }

  if (input.previousValidUntil === null) {
    throw new Error("retry price publication requires the previous attempt");
  }
  assertUint(input.previousValidUntil, UINT64_MAX, "previous price expiry");
  if (input.previousValidUntil === 0n) throw new Error("previous price expiry must be positive");
  if (input.publicationTimestamp <= input.previousValidUntil) {
    throw new Error("previous price attempt has not expired");
  }
  if (input.currentAttempt === UINT64_MAX) throw new Error("price-attempt sequence is exhausted");
  if (input.candidateAttempt !== input.currentAttempt + 1n) {
    throw new Error("price attempt must advance by one");
  }
}

export type PMVSRetirementState = {
  /** Live ERC-20 share total supply. */
  finalSupply: bigint;
  /** Uncancelled and unselected deposit and withdrawal requests. */
  pendingRequests: bigint;
  /** Selected but undelivered user and fee entitlements. */
  outstandingClaims: bigint;
  /** Accounting-asset units encumbered in user and fee claim buckets. */
  claimFunding: bigint;
};

/**
 * Checks the fixed on-chain predicate for terminal subject retirement. A
 * conforming settlement component maintains these counters on every request,
 * selection, cancellation, claim, fee-claim, and migration transition. The
 * caller cannot supply or override the values used by the wrapper.
 */
export function assertRetirementState(state: PMVSRetirementState): void {
  const counters = [
    ["final supply", state.finalSupply],
    ["pending requests", state.pendingRequests],
    ["outstanding claims", state.outstandingClaims],
    ["claim funding", state.claimFunding],
  ] as const;
  for (const [label, value] of counters) {
    assertUint(value, UINT256_MAX, label);
    if (value !== 0n) throw new Error(`${label} must be zero for retirement`);
  }
}

export function assertSettlementReceiptAction(input: {
  action: SettlementReceiptAction;
  receiptEpoch: bigint;
  referencedRecord: {
    recordHash: Hex;
    epoch: bigint;
    priceAttempt: bigint;
    grossPps: bigint;
    valuationRecord: Hex;
    validUntil: bigint;
  } & (
    | { recordKind: "settlement-archive"; ppsFinal: bigint }
    | { recordKind: "winddown-opened" }
  );
  epochArchiveHash: Hex;
  epochActionRecordHash: Hex;
  observedPriceAttempt: bigint;
  authenticatedPriceAttempt: bigint;
  selectedPriceAttempt: bigint;
  observedGrossPps: bigint;
  observedPpsFinal: bigint;
  observedValuationRecord: Hex;
  observedValidUntil: bigint;
  observedExecutionTimestamp: bigint;
  canonicalExecutionTimestamp: bigint;
  authenticatedGrossPps: bigint;
  authenticatedPpsFinal: bigint;
  authenticatedValuationRecord: Hex;
  authenticatedValidUntil: bigint;
  depositSelectionCount: bigint;
  withdrawSelectionCount: bigint;
  feeSharesMinted: bigint;
  finalFeeAssets: bigint;
  totalSupplyBefore: bigint;
  totalSupplyAfter: bigint;
  /**
   * Independently authenticated digests of complete canonical state snapshots.
   * The outer chain verifier constructs these values from the canonical
   * transaction trace and receipt-block state; this helper only binds them.
   */
  authenticatedZeroNavEffects: AuthenticatedZeroNavEffects | null;
  retirementTriggered: boolean;
  retirementReason: string | null;
}): void {
  assertBoolean(input.retirementTriggered, "retirement-triggered state");
  assertUint(input.receiptEpoch, UINT64_MAX, "receipt epoch");
  assertUint(input.referencedRecord.epoch, UINT64_MAX, "referenced-record epoch");
  if (input.receiptEpoch === 0n || input.referencedRecord.epoch === 0n) {
    throw new Error("settlement action epochs must be positive");
  }
  if (input.referencedRecord.epoch !== input.receiptEpoch) {
    throw new Error("referenced-record epoch does not match receipt epoch");
  }

  assertUint(input.observedPriceAttempt, UINT64_MAX, "observed price attempt");
  assertUint(input.authenticatedPriceAttempt, UINT64_MAX, "authenticated price attempt");
  assertUint(input.selectedPriceAttempt, UINT64_MAX, "selected price attempt");
  assertUint(input.referencedRecord.priceAttempt, UINT64_MAX, "referenced-record price attempt");
  assertUint(input.observedValidUntil, UINT64_MAX, "observed price expiry");
  assertUint(input.authenticatedValidUntil, UINT64_MAX, "authenticated price expiry");
  assertUint(input.referencedRecord.validUntil, UINT64_MAX, "referenced-record price expiry");
  assertUint(input.observedExecutionTimestamp, UINT64_MAX, "observed execution timestamp");
  assertUint(input.canonicalExecutionTimestamp, UINT64_MAX, "canonical execution timestamp");
  if (
    input.observedPriceAttempt === 0n
    || input.authenticatedPriceAttempt === 0n
    || input.selectedPriceAttempt === 0n
    || input.referencedRecord.priceAttempt === 0n
  ) {
    throw new Error("settlement price attempts must be positive");
  }
  if (
    input.observedValidUntil === 0n
    || input.authenticatedValidUntil === 0n
    || input.referencedRecord.validUntil === 0n
  ) {
    throw new Error("settlement price expiries must be positive");
  }
  if (input.observedPriceAttempt !== input.authenticatedPriceAttempt) {
    throw new Error("receipt price attempt does not match the authenticated price");
  }
  if (input.selectedPriceAttempt !== input.authenticatedPriceAttempt) {
    throw new Error("selected on-chain price attempt does not match the authenticated price");
  }
  if (input.referencedRecord.priceAttempt !== input.authenticatedPriceAttempt) {
    throw new Error("referenced-record price attempt does not match the authenticated price");
  }

  assertBytes32(input.action.recordHash, "receipt action record hash");
  assertBytes32(input.referencedRecord.recordHash, "referenced-record hash");
  assertBytes32(input.observedValuationRecord, "observed valuation-record hash");
  assertBytes32(input.authenticatedValuationRecord, "authenticated valuation-record hash");
  assertBytes32(input.referencedRecord.valuationRecord, "referenced-record valuation-record hash");
  if (
    input.action.recordHash === ZERO_HASH
    || input.referencedRecord.recordHash === ZERO_HASH
    || input.observedValuationRecord === ZERO_HASH
    || input.authenticatedValuationRecord === ZERO_HASH
    || input.referencedRecord.valuationRecord === ZERO_HASH
  ) {
    throw new Error("receipt action and valuation-record hashes must be nonzero");
  }
  if (input.action.recordHash !== input.referencedRecord.recordHash) {
    throw new Error("receipt action hash does not match the referenced record");
  }
  if (input.observedValuationRecord !== input.authenticatedValuationRecord) {
    throw new Error("receipt valuation record does not match the authenticated price");
  }
  if (input.referencedRecord.valuationRecord !== input.authenticatedValuationRecord) {
    throw new Error("referenced-record valuation record does not match the authenticated price");
  }

  assertUint(input.observedGrossPps, UINT256_MAX, "observed gross price");
  assertUint(input.observedPpsFinal, UINT256_MAX, "observed final price");
  assertUint(input.authenticatedGrossPps, UINT256_MAX, "authenticated gross price");
  assertUint(input.authenticatedPpsFinal, UINT256_MAX, "authenticated final price");
  assertUint(input.referencedRecord.grossPps, UINT256_MAX, "referenced-record gross price");
  assertUint(input.depositSelectionCount, UINT256_MAX, "deposit selection count");
  assertUint(input.withdrawSelectionCount, UINT256_MAX, "withdraw selection count");
  assertUint(input.feeSharesMinted, UINT256_MAX, "minted fee shares");
  assertUint(input.finalFeeAssets, UINT256_MAX, "final fee assets");
  assertUint(input.totalSupplyBefore, UINT256_MAX, "supply before action");
  assertUint(input.totalSupplyAfter, UINT256_MAX, "supply after action");
  if (
    input.observedGrossPps !== input.authenticatedGrossPps
    || input.observedPpsFinal !== input.authenticatedPpsFinal
  ) {
    throw new Error("receipt prices do not match the authenticated price");
  }
  if (input.referencedRecord.grossPps !== input.authenticatedGrossPps) {
    throw new Error("referenced-record gross price does not match the authenticated price");
  }
  if (input.observedValidUntil !== input.authenticatedValidUntil) {
    throw new Error("receipt price expiry does not match the authenticated price");
  }
  if (input.referencedRecord.validUntil !== input.authenticatedValidUntil) {
    throw new Error("referenced-record price expiry does not match the authenticated price");
  }
  if (input.observedExecutionTimestamp !== input.canonicalExecutionTimestamp) {
    throw new Error("receipt execution timestamp does not match the canonical settlement block");
  }
  if (input.canonicalExecutionTimestamp > input.authenticatedValidUntil) {
    throw new Error("settlement execution is stale");
  }
  if (input.retirementTriggered || input.retirementReason !== null) {
    throw new Error("settlement actions cannot finalize retirement");
  }

  assertBytes32(input.epochArchiveHash, "epoch archive hash");
  assertBytes32(input.epochActionRecordHash, "epoch action-record hash");

  let expectedRecordKind: "settlement-archive" | "winddown-opened";
  let boundRecordHash: Hex;
  if (input.action.type === "normal-roll") {
    if (input.epochActionRecordHash !== ZERO_HASH) {
      throw new Error("normal settlement must leave the zero-NAV action getter empty");
    }
    expectedRecordKind = "settlement-archive";
    boundRecordHash = input.epochArchiveHash;
  } else if (input.action.type === "zero-nav") {
    if (input.epochArchiveHash !== ZERO_HASH) {
      throw new Error("zero-NAV settlement must leave the archive getter empty");
    }
    expectedRecordKind = "winddown-opened";
    boundRecordHash = input.epochActionRecordHash;
  } else {
    throw new Error("unknown settlement receipt action");
  }

  if (
    input.action.recordKind !== expectedRecordKind
    || input.referencedRecord.recordKind !== expectedRecordKind
  ) {
    throw new Error("receipt action does not match the referenced record kind");
  }
  assertBytes32(boundRecordHash, "bound action record hash");
  if (boundRecordHash !== input.action.recordHash) {
    throw new Error("receipt action hash does not match the selected epoch getter");
  }

  if (input.action.type === "normal-roll") {
    if (input.referencedRecord.recordKind !== "settlement-archive") {
      throw new Error("normal settlement requires a settlement-archive record");
    }
    assertUint(input.referencedRecord.ppsFinal, UINT256_MAX, "referenced-record final price");
    if (input.referencedRecord.ppsFinal !== input.authenticatedPpsFinal) {
      throw new Error("referenced-record final price does not match the authenticated price");
    }
    if (input.observedGrossPps === 0n || input.observedPpsFinal === 0n) {
      throw new Error("normal settlement prices must be positive");
    }
    if (input.authenticatedZeroNavEffects !== null) {
      throw new Error("normal settlement cannot carry zero-NAV no-effect evidence");
    }
    return;
  }

  if (input.observedGrossPps !== 0n || input.observedPpsFinal !== 0n) {
    throw new Error("zero-NAV settlement prices must be zero");
  }
  if (input.depositSelectionCount !== 0n || input.withdrawSelectionCount !== 0n) {
    throw new Error("zero-NAV settlement cannot select requests");
  }
  if (input.feeSharesMinted !== 0n || input.finalFeeAssets !== 0n) {
    throw new Error("zero-NAV settlement cannot charge fees");
  }
  if (input.totalSupplyAfter !== input.totalSupplyBefore) {
    throw new Error("zero-NAV settlement cannot mint or burn shares");
  }
  if (input.authenticatedZeroNavEffects === null) {
    throw new Error("zero-NAV settlement requires authenticated no-effect evidence");
  }
  const stateFamilies = [
    "requestState",
    "claimState",
    "reserveState",
    "assetBalanceState",
    "feeState",
  ] as const;
  const effectKeys = Object.keys(input.authenticatedZeroNavEffects).sort();
  const expectedEffectKeys = [...stateFamilies].sort();
  if (
    effectKeys.length !== expectedEffectKeys.length
    || effectKeys.some((key, index) => key !== expectedEffectKeys[index])
  ) {
    throw new Error("zero-NAV no-effect evidence must contain every closed state family");
  }
  for (const label of stateFamilies) {
    const snapshot = input.authenticatedZeroNavEffects[label];
    if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error(`${label} snapshot must be an object`);
    }
    const snapshotKeys = Object.keys(snapshot).sort();
    if (
      snapshotKeys.length !== 2
      || snapshotKeys[0] !== "after"
      || snapshotKeys[1] !== "before"
    ) {
      throw new Error(`${label} snapshot must contain only before and after digests`);
    }
    assertBytes32(snapshot.before, `${label} before digest`);
    assertBytes32(snapshot.after, `${label} after digest`);
    if (snapshot.before === ZERO_HASH || snapshot.after === ZERO_HASH) {
      throw new Error(`${label} snapshot digests must be nonzero`);
    }
    if (snapshot.before !== snapshot.after) {
      throw new Error(`zero-NAV settlement changed ${label}`);
    }
  }
}

export function assertSettlementTiming(input: {
  captureEndedAtMs: bigint;
  maxCaptureAgeMs: bigint;
  validUntil: bigint;
  observedExecutionTimestamp: bigint;
  canonicalExecutionTimestamp: bigint;
  requestLiveness: "bounded" | "operator-dependent";
  claimRemedyDelay: bigint | null;
  claimDeadline: bigint | null;
}): void {
  assertUint(input.captureEndedAtMs, UINT64_MAX, "capture end time");
  assertUint(input.maxCaptureAgeMs, UINT64_MAX, "maximum capture age");
  if (input.maxCaptureAgeMs === 0n) throw new Error("maximum capture age must be positive");
  assertUint(input.validUntil, UINT64_MAX, "settlement deadline");
  assertUint(input.observedExecutionTimestamp, UINT64_MAX, "observed execution timestamp");
  assertUint(input.canonicalExecutionTimestamp, UINT64_MAX, "canonical execution timestamp");
  const expiryMs = input.captureEndedAtMs + input.maxCaptureAgeMs;
  assertUint(expiryMs, UINT256_MAX, "capture expiry");
  const expectedValidUntil = expiryMs / 1000n;
  if (expectedValidUntil === 0n || expectedValidUntil > UINT64_MAX) {
    throw new Error("derived settlement deadline is out of range");
  }
  if (input.validUntil !== expectedValidUntil) throw new Error("settlement deadline derivation mismatch");
  if (input.observedExecutionTimestamp !== input.canonicalExecutionTimestamp) {
    throw new Error("receipt execution timestamp does not match the canonical settlement block");
  }
  if (input.canonicalExecutionTimestamp > input.validUntil) throw new Error("settlement execution is stale");

  if (input.requestLiveness === "operator-dependent") {
    if (input.claimRemedyDelay !== null || input.claimDeadline !== null) {
      throw new Error("operator-dependent settlement cannot advertise a claim deadline");
    }
    return;
  }
  if (input.requestLiveness !== "bounded") throw new Error("unknown request-liveness profile");
  if (input.claimRemedyDelay === null || input.claimDeadline === null) {
    throw new Error("bounded settlement requires a claim deadline and delay");
  }
  assertUint(input.claimRemedyDelay, UINT64_MAX, "claim remedy delay");
  assertUint(input.claimDeadline, UINT64_MAX, "claim deadline");
  if (input.claimRemedyDelay === 0n) throw new Error("claim remedy delay must be positive");
  const expectedClaimDeadline = input.validUntil + input.claimRemedyDelay;
  if (expectedClaimDeadline > UINT64_MAX) throw new Error("claim deadline is out of range");
  if (input.claimDeadline !== expectedClaimDeadline) throw new Error("claim deadline derivation mismatch");
}

export function selectionHash(requestIds: readonly bigint[]): Hex {
  assertDenseArray(requestIds, "request ids");
  let prior = -1n;
  for (const requestId of requestIds) {
    assertUint(requestId, UINT256_MAX, "request id");
    if (requestId === 0n) throw new Error("request ids must be positive");
    if (requestId <= prior) throw new Error("request ids must be strictly increasing");
    prior = requestId;
  }
  return keccak256(encodeAbiParameters([{ type: "uint256[]" }], [requestIds]));
}

export function bpsExitCostCap(grossMark: bigint, maxFeeRateBps: bigint): bigint {
  assertUint(grossMark, UINT256_MAX, "gross mark");
  if (maxFeeRateBps <= 0n || maxFeeRateBps >= 10_000n) throw new Error("fee cap must be in [1, 9999]");
  return (grossMark * maxFeeRateBps) / 10_000n;
}

function assertDecimals(decimals: number, maximum: number, label: string): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > maximum) {
    throw new Error(`${label} is out of range`);
  }
}

export function valuationPps(
  nav: bigint,
  totalSupply: bigint,
  assetDecimals: number,
  shareDecimals: number,
  initialPps: bigint,
): bigint {
  assertUint(nav, UINT256_MAX, "NAV");
  assertUint(totalSupply, UINT256_MAX, "total supply");
  assertUint(initialPps, UINT256_MAX, "initial price");
  assertDecimals(assetDecimals, 255, "asset decimals");
  assertDecimals(shareDecimals, 255, "share decimals");
  if (initialPps === 0n) throw new Error("initial price must be positive");
  if (totalSupply === 0n) {
    if (nav !== 0n) throw new Error("unallocated assets at zero supply");
    return initialPps;
  }
  const result = (nav * 10n ** BigInt(shareDecimals) * WAD)
    / (totalSupply * 10n ** BigInt(assetDecimals));
  assertUint(result, UINT256_MAX, "price per share");
  return result;
}

export function materialityWithinCaps(
  exposure: bigint,
  absoluteCap: bigint,
  capBps: bigint,
  materialityReference: bigint,
  absoluteOnly = false,
): boolean {
  assertBoolean(absoluteOnly, "absolute-only materiality mode");
  for (const [value, label] of [
    [exposure, "exposure"],
    [absoluteCap, "absolute cap"],
    [materialityReference, "materiality reference"],
  ] as const) {
    assertUint(value, UINT256_MAX, label);
  }
  if (capBps < 0n || capBps > 10_000n) throw new Error("materiality cap is out of range");
  if (exposure === 0n) return true;
  if (exposure > absoluteCap) return false;
  if (absoluteOnly) return true;
  if (materialityReference === 0n) return false;
  return exposure * 10_000n <= materialityReference * capBps;
}

function settlementBridge(assetDecimals: number): bigint {
  assertDecimals(assetDecimals, 18, "accounting-asset decimals");
  return 10n ** BigInt(18 - assetDecimals);
}

export function depositSharesOut(assets: bigint, pps: bigint, assetDecimals: number): bigint {
  assertUint(assets, UINT256_MAX, "deposit assets");
  assertUint(pps, UINT256_MAX, "price per share");
  if (pps === 0n) throw new Error("price per share must be positive");
  const result = (assets * settlementBridge(assetDecimals) * WAD) / pps;
  assertUint(result, UINT256_MAX, "deposit shares");
  return result;
}

export function withdrawAssetsOut(shares: bigint, pps: bigint, assetDecimals: number): bigint {
  assertUint(shares, UINT256_MAX, "withdrawal shares");
  assertUint(pps, UINT256_MAX, "price per share");
  if (pps === 0n) throw new Error("price per share must be positive");
  const result = (shares * pps) / (WAD * settlementBridge(assetDecimals));
  assertUint(result, UINT256_MAX, "withdrawal assets");
  return result;
}

export function finalRollFeeAssets(input: {
  withdrawShares: bigint;
  grossPps: bigint;
  finalPps: bigint;
  assetDecimals: number;
  sourceAssets: bigint;
  encumberedBefore: bigint;
  withdrawTotalAssets: bigint;
}): bigint {
  for (const [value, label] of [
    [input.withdrawShares, "withdrawal shares"],
    [input.grossPps, "gross price"],
    [input.finalPps, "final price"],
    [input.sourceAssets, "source assets"],
    [input.encumberedBefore, "encumbered assets"],
    [input.withdrawTotalAssets, "withdrawal total"],
  ] as const) {
    assertUint(value, UINT256_MAX, label);
  }
  if (input.finalPps === 0n || input.finalPps > input.grossPps) {
    throw new Error("invalid final price");
  }
  const candidate = (input.withdrawShares * (input.grossPps - input.finalPps))
    / (WAD * settlementBridge(input.assetDecimals));
  assertUint(candidate, UINT256_MAX, "candidate fee assets");
  const freeBefore = input.sourceAssets > input.encumberedBefore
    ? input.sourceAssets - input.encumberedBefore
    : 0n;
  if (freeBefore < input.withdrawTotalAssets) throw new Error("withdrawal claims are underfunded");
  const headroom = freeBefore - input.withdrawTotalAssets;
  return candidate < headroom ? candidate : headroom;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  if (numerator < 0n) throw new Error("numerator must be non-negative");
  return numerator === 0n ? 0n : (numerator - 1n) / denominator + 1n;
}

export function netPps(gross: bigint, highWaterMark: bigint, feeRate: bigint): bigint {
  assertUint(gross, UINT256_MAX, "gross price");
  assertUint(highWaterMark, UINT256_MAX, "high-water mark");
  assertUint(feeRate, UINT256_MAX, "fee rate");
  if (feeRate >= WAD) throw new Error("fee rate must be below WAD");
  if (gross <= highWaterMark) return gross;
  const delta = gross - highWaterMark;
  const result = highWaterMark + ((WAD - feeRate) * delta) / WAD;
  assertUint(result, UINT256_MAX, "net price");
  return result;
}

export function performanceFeeShares(
  gross: bigint,
  highWaterMark: bigint,
  feeRate: bigint,
  supply: bigint,
  finalRoll = false,
): bigint {
  assertBoolean(finalRoll, "final-roll fee mode");
  assertUint(gross, UINT256_MAX, "gross price");
  assertUint(highWaterMark, UINT256_MAX, "high-water mark");
  assertUint(feeRate, UINT256_MAX, "fee rate");
  assertUint(supply, UINT256_MAX, "share supply");
  if (feeRate >= WAD) throw new Error("fee rate must be below WAD");
  if (gross <= highWaterMark || feeRate === 0n || supply === 0n || finalRoll) return 0n;
  const finalPps = netPps(gross, highWaterMark, feeRate);
  if (finalPps === 0n) throw new Error("zero final price");
  const feePerShare = ceilDiv(feeRate * (gross - highWaterMark), WAD);
  const result = ceilDiv(supply * feePerShare, finalPps);
  assertUint(result, UINT256_MAX, "performance-fee shares");
  return result;
}

export function attestationDigest(
  chainId: bigint,
  verifyingContract: Address,
  message: {
    recordHash: Hex;
    kind: number;
    subjectId: Hex;
    streamId: Hex;
    sequence: bigint;
    prev: Hex;
    previousAnchor: Hex;
  },
): Hex {
  assertUint(chainId, UINT256_MAX, "chain id");
  assertNonzeroAddress(verifyingContract, "verifying contract");
  assertRecordKind(message.kind, "record kind");
  assertUint(message.sequence, UINT64_MAX, "sequence");
  assertBytes32(message.recordHash, "record hash");
  assertBytes32(message.subjectId, "subject id");
  assertBytes32(message.streamId, "stream id");
  assertBytes32(message.prev, "previous record hash");
  assertBytes32(message.previousAnchor, "previous anchor");
  return hashTypedData({
    domain: { name: "PMVS-Attestation", version: "1", chainId, verifyingContract },
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
}

function assertRecordKind(kind: number, label: string): void {
  if (
    !Number.isInteger(kind)
    || ![1, 2, 3, 4, 5, 7, 8, 9, 10].includes(kind)
  ) {
    throw new Error(`${label} is out of range`);
  }
}

export type AnchorCommitMode = "registry" | "atomic";

function isProtectedAnchorKind(kind: number): boolean {
  return kind === 2 || kind === 5 || kind === 7;
}

/**
 * Models authorization at the public `commit` entry point. Signature and
 * stream checks are separate: this check only decides whether the caller may
 * use this entry point for the supplied Core-v1 kind. `mode` and
 * `coveredWrapper` must come from authenticated deployment state, never from
 * the submitted envelope or transaction calldata.
 */
export function assertAnchorGenericCommit(input: {
  mode: AnchorCommitMode;
  kind: number;
  caller: Address;
  coveredWrapper: Address | null;
}): void {
  assertRecordKind(input.kind, "record kind");
  assertNonzeroAddress(input.caller, "commit caller");

  if (input.mode === "registry") {
    if (input.kind === 7) {
      throw new Error("registry mode cannot commit retirement-final records");
    }
    return;
  }
  if (input.mode !== "atomic") throw new Error("unknown anchor mode");

  if (!isProtectedAnchorKind(input.kind)) return;
  if (input.coveredWrapper === null) {
    throw new Error("protected record kind has no registered covered wrapper");
  }
  assertNonzeroAddress(input.coveredWrapper, "covered wrapper");
  if (input.caller !== input.coveredWrapper) {
    throw new Error("protected record kind requires the registered covered wrapper");
  }
}

/** Models an anchor transition that is internal to the covered atomic wrapper. */
export function assertAnchorInternalCoveredCommit(input: {
  mode: AnchorCommitMode;
  kind: number;
}): void {
  assertRecordKind(input.kind, "record kind");
  if (input.mode !== "atomic") {
    throw new Error("an internal covered commit requires atomic mode");
  }
  if (!isProtectedAnchorKind(input.kind)) {
    throw new Error("an internal covered commit requires a protected record kind");
  }
}

/**
 * Checks the persisted `subjectFinalized` flag around one anchor transaction.
 * The mode, path, caller, and registered wrapper are authenticated deployment
 * facts. `after` is a canonical post-transaction read, not a record field.
 */
export function assertAnchorSubjectFinalizationTransition(input: {
  mode: AnchorCommitMode;
  path: "generic" | "internal-covered";
  caller: Address | null;
  coveredWrapper: Address | null;
  streamId: Hex;
  kind: number;
  before: boolean;
  after: boolean;
  transactionSucceeded: boolean;
}): void {
  if (input.mode !== "registry" && input.mode !== "atomic") {
    throw new Error("unknown anchor mode");
  }
  if (input.path !== "generic" && input.path !== "internal-covered") {
    throw new Error("unknown anchor transition path");
  }
  assertRecordKind(input.kind, "record kind");
  assertBytes32(input.streamId, "stream id");
  if (
    typeof input.before !== "boolean"
    || typeof input.after !== "boolean"
    || typeof input.transactionSucceeded !== "boolean"
  ) {
    throw new Error("subject-finalized transition fields must be booleans");
  }

  if (input.path === "generic") {
    if (input.caller === null) throw new Error("generic anchor transition requires its caller");
    assertNonzeroAddress(input.caller, "commit caller");
    if (input.coveredWrapper !== null) {
      assertNonzeroAddress(input.coveredWrapper, "covered wrapper");
    }
  } else {
    if (input.caller !== null) {
      throw new Error("internal covered transition cannot declare an external commit caller");
    }
    if (input.coveredWrapper === null) {
      throw new Error("internal covered transition requires a registered wrapper");
    }
    assertNonzeroAddress(input.coveredWrapper, "covered wrapper");
  }

  if (!input.transactionSucceeded) {
    if (input.after !== input.before) {
      throw new Error("a reverted anchor transaction cannot change subject-finalized state");
    }
    return;
  }

  if (input.path === "generic") {
    assertAnchorGenericCommit({
      mode: input.mode,
      kind: input.kind,
      caller: input.caller!,
      coveredWrapper: input.coveredWrapper,
    });
  } else {
    assertAnchorInternalCoveredCommit({ mode: input.mode, kind: input.kind });
  }

  const subjectStream = input.streamId.toLowerCase() === ZERO_HASH;
  if (input.before) {
    if (!subjectStream || input.kind !== 8) {
      throw new Error("a finalized subject can advance only through a subject-stream correction");
    }
    if (!input.after) throw new Error("subject-finalized state cannot be cleared");
    return;
  }

  if (input.kind === 7) {
    if (!subjectStream) {
      throw new Error("retirement-final can set subject-finalized state only on the subject stream");
    }
    if (!input.after) {
      throw new Error("a successful protected retirement transition must set subject-finalized state");
    }
    return;
  }

  if (input.after) {
    throw new Error("only a successful protected retirement transition can set subject-finalized state");
  }
}

export type AnchorHead = { sequence: bigint; kind: number; recordHash: Hex } | null;

export function assertAnchorHeadKind(head: Exclude<AnchorHead, null>, expectedKind: number): void {
  assertRecordKind(head.kind, "stored record kind");
  assertRecordKind(expectedKind, "expected record kind");
  if (head.kind !== expectedKind) throw new Error("anchor head has the wrong record kind");
}

/**
 * Checks one transition against the exact head stored for this subject and
 * stream. Both `head` and `persistedSubjectFinalized` are trusted chain-state
 * reads from the conforming anchor, not claims copied from a record.
 */
export function assertAnchorAdvance(
  head: AnchorHead,
  input: {
    streamId: Hex;
    watcherSigner: Address | null;
    kind: number;
    /** Independently persisted state read from the conforming anchor contract. */
    persistedSubjectFinalized: boolean;
    sequence: bigint;
    recordPrev: Hex;
    previousAnchor: Hex;
    recordHash: Hex;
  },
): void {
  assertBytes32(input.streamId, "stream id");
  assertRecordKind(input.kind, "record kind");
  if (typeof input.persistedSubjectFinalized !== "boolean") {
    throw new Error("persisted subject-finalized state must be a boolean");
  }
  const subjectStream = input.streamId.toLowerCase() === ZERO_HASH;
  if (input.persistedSubjectFinalized && (!subjectStream || input.kind !== 8)) {
    throw new Error("only subject-stream corrections can advance a finalized subject");
  }
  if (
    input.persistedSubjectFinalized
    && (head === null || (head.kind !== 7 && head.kind !== 8))
  ) {
    throw new Error("persisted subject-finalized state requires a retirement or correction head");
  }
  if (subjectStream) {
    if (input.watcherSigner !== null) {
      throw new Error("subject-stream records cannot declare a watcher signer");
    }
    if (input.kind === 10) throw new Error("watcher records cannot advance the subject stream");
  } else {
    if (input.kind !== 10) throw new Error("only watcher records can advance a watcher stream");
    if (input.watcherSigner === null) throw new Error("watcher stream requires its signer");
    if (input.streamId.toLowerCase() !== watcherStreamId(input.watcherSigner)) {
      throw new Error("watcher stream id does not match its signer");
    }
  }
  assertUint(input.sequence, UINT64_MAX, "sequence");
  assertBytes32(input.recordPrev, "previous record hash");
  assertBytes32(input.previousAnchor, "previous anchor");
  assertBytes32(input.recordHash, "record hash");
  if (input.recordHash.toLowerCase() === ZERO_HASH) throw new Error("record hash must be nonzero");

  if (head === null) {
    if (subjectStream && input.kind !== 4) {
      throw new Error("subject-stream genesis must be a components record");
    }
    if (input.sequence !== 0n || input.recordPrev.toLowerCase() !== ZERO_HASH || input.previousAnchor.toLowerCase() !== ZERO_HASH) {
      throw new Error("invalid genesis anchor position");
    }
    return;
  }

  assertUint(head.sequence, UINT64_MAX, "stored sequence");
  assertRecordKind(head.kind, "stored record kind");
  if (subjectStream ? head.kind === 10 : head.kind !== 10) {
    throw new Error("stored record kind does not match the stream");
  }
  if (subjectStream && head.sequence === 0n && head.kind !== 4) {
    throw new Error("stored subject-stream genesis must be a components record");
  }
  assertBytes32(head.recordHash, "stored record hash");
  if (head.recordHash === ZERO_HASH) throw new Error("stored record hash must be nonzero");
  if (head.sequence === UINT64_MAX) throw new Error("anchor sequence exhausted");
  if (input.sequence !== head.sequence + 1n) throw new Error("anchor sequence must increase by one");
  if (
    input.recordPrev.toLowerCase() !== head.recordHash.toLowerCase()
    || input.previousAnchor.toLowerCase() !== head.recordHash.toLowerCase()
  ) {
    throw new Error("anchor predecessor mismatch");
  }
}
