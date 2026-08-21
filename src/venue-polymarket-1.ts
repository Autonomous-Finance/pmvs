// SPDX-License-Identifier: CC0-1.0

import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getCreate2Address,
  hashTypedData,
  keccak256,
  type Address,
  type Hex,
} from "viem";

import {
  assertCtfPositionRecord,
  ctfCollectionId,
  ctfPositionId,
  ctfRedemptionPayout,
  parseUint256Decimal,
  type CtfPositionRecord,
} from "./reference";

const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_COLLECTION = `0x${"00".repeat(32)}` as Hex;

export const POLYMARKET_DEPOSIT_SESSION_ENVELOPE_MAGIC =
  "0x6492649264926492649264926492649264926492649264926492649264926492" as const;

export const POLYMARKET_LEGACY_SAFE_FACTORY =
  "0xaacfeea03eb1561c4e67d661e40682bd20e3541b" as const;
export const POLYMARKET_LEGACY_SAFE_FACTORY_CODE_HASH =
  "0x7a423db1d467bbd092e48044242a9c1f003442a83ca8109f0f7c07a50782e23d" as const;
export const POLYMARKET_LEGACY_SAFE_IMPLEMENTATION =
  "0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8" as const;
export const POLYMARKET_LEGACY_SAFE_IMPLEMENTATION_CODE_HASH =
  "0xf4b625c76701938f75938880a926414b5f91471d32e21c0cbb37566b62495ca7" as const;
export const POLYMARKET_LEGACY_SAFE_PROXY_BYTECODE_HASH =
  "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf" as const;
export const POLYMARKET_LEGACY_SAFE_PROXY_RUNTIME_CODE_HASH =
  "0x92565062fdea8761e07d9df2fcdbd66c0582af6ddf0e0355bc07754ad97400b0" as const;

export type PolymarketVenueSemanticErrorCode =
  | "INVALID_SHAPE"
  | "INVALID_UINT256"
  | "ARRAY_ORDER"
  | "DUPLICATE_ID"
  | "UNRESOLVED_REFERENCE"
  | "UNUSED_CONFIG"
  | "CUSTODY_BINDING"
  | "POSITION_DERIVATION"
  | "POSITION_BINDING"
  | "POSITION_EVENT_MISMATCH"
  | "ORACLE_CONFIG_MISMATCH"
  | "NEG_RISK_CONFIG_MISMATCH"
  | "BOOK_SET_MISMATCH"
  | "BOOK_ORDER"
  | "PAYOUT_STATE_MISMATCH"
  | "RESPONSE_REFERENCE"
  | "REDEMPTION_SCOPE"
  | "REDEMPTION_COVERAGE"
  | "REDEMPTION_ROUTE_MISMATCH"
  | "REDEMPTION_CALL_PLAN"
  | "REDEMPTION_RESERVED_POSITION"
  | "SWEEP_SET_MISMATCH"
  | "SETTLEMENT_FREEZE_CONFIG"
  | "ORDER_HASH_MISMATCH"
  | "ORDER_BINDING"
  | "ORDER_STATUS_MISMATCH"
  | "ORDER_RESERVE_MISMATCH"
  | "POSITION_RESERVATION_MISMATCH"
  | "COLLATERAL_EXPOSURE"
  | "WRAPPED_COLLATERAL_EXPOSURE"
  | "AUTHORITY_SET_MISMATCH"
  | "PROVENANCE_TUPLE";

export class PolymarketVenueSemanticError extends Error {
  readonly code: PolymarketVenueSemanticErrorCode;
  readonly path: string;

  constructor(code: PolymarketVenueSemanticErrorCode, path: string, detail: string) {
    super(`${code} at ${path}: ${detail}`);
    this.name = "PolymarketVenueSemanticError";
    this.code = code;
    this.path = path;
  }
}

type JsonObject = Record<string, unknown>;

export type PolymarketV2OrderHashInput = {
  salt: string;
  maker: string;
  signer: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: string;
  signatureType: string;
  timestamp: string;
  metadata: string;
  builder: string;
};

type PolymarketVenueSemanticCommonOptions = {
  valuationBlockTimestamp?: bigint;
};

export type PolymarketAuthorityIdentity = {
  contract: string;
  account: string;
  role: string;
};

export type PolymarketVenueDiagnosticOptions =
  PolymarketVenueSemanticCommonOptions & {
    verificationScope: "diagnostic";
    strategyCustodyAccounts?: readonly string[];
    fundingSourceAccounts?: readonly string[];
    pUsdCustodyBalance?: string;
    expectedAuthorityIdentities?: readonly PolymarketAuthorityIdentity[];
  };

export type PolymarketVenueSettlementOptions =
  PolymarketVenueSemanticCommonOptions & {
    verificationScope: "settlement";
    strategyCustodyAccounts: readonly string[];
    fundingSourceAccounts: readonly string[];
    pUsdCustodyBalance: string;
    expectedAuthorityIdentities: readonly PolymarketAuthorityIdentity[];
  };

/**
 * Selects either profile diagnostics or the strict venue checks required by a
 * settlement-bearing PMVS claim. Neither scope is an end-to-end conformance
 * result; the outer verifier still authenticates chain evidence and applies
 * the Core, valuation, settlement, anchor, and storage rules.
 * Settlement scope also requires the independently reconstructed complete
 * authority identity set; copying identities from the record is not evidence.
 */
export type PolymarketVenueSemanticOptions =
  | PolymarketVenueDiagnosticOptions
  | PolymarketVenueSettlementOptions;

export type PolymarketSettlementCall = {
  to: string;
  input: string;
  enforcerCodeHash: string;
};

export type PolymarketSettlementCustodyCheck = {
  custodyConfigId: string;
  custodyAccount: string;
  preProxyRuntimeCodeHash: string;
  postProxyRuntimeCodeHash: string;
  masterCopyCalldata: string;
  preMasterCopyReturnData: string;
  postMasterCopyReturnData: string;
  preImplementation: string;
  postImplementation: string;
  preImplementationCodeHash: string;
  postImplementationCodeHash: string;
  preControllers: readonly string[];
  postControllers: readonly string[];
  preThreshold: string;
  postThreshold: string;
  preModules: readonly string[];
  postModules: readonly string[];
  preGuard: string | null;
  postGuard: string | null;
  preFallbackHandler: string | null;
  postFallbackHandler: string | null;
  preNonce: string;
  postNonce: string;
};

export type PolymarketSettlementCallOptions = {
  strategyCustodyAccounts: readonly string[];
  pUsdCustodyBalance: string;
  fundingSourceAccounts: readonly string[];
  expectedAuthorityIdentities: readonly PolymarketAuthorityIdentity[];
  strategyCustodyTargetCallCount: string;
  strategyCustodyOriginCallCount: string;
  safeDelegatecallCount: string;
  stateChangingV2CallCount: string;
  custodyChecks: readonly PolymarketSettlementCustodyCheck[];
};

const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
    { name: "timestamp", type: "uint256" },
    { name: "metadata", type: "bytes32" },
    { name: "builder", type: "bytes32" },
  ],
} as const;

const USER_PAUSE_ABI = [
  {
    type: "function",
    name: "isUserPaused",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const APPROVAL_FOR_ALL_ABI = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const CTF_REDEMPTION_ABI = [
  {
    type: "function",
    name: "redeemPositions",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

const NEG_RISK_REDEMPTION_ABI = [
  {
    type: "function",
    name: "redeemPositions",
    stateMutability: "nonpayable",
    inputs: [
      { name: "conditionId", type: "bytes32" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

const WCOL_UNWRAP_ABI = [
  {
    type: "function",
    name: "unwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const COLLATERAL_ONRAMP_ABI = [
  {
    type: "function",
    name: "wrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const ABI_FALSE_OR_ZERO = `0x${"00".repeat(32)}`;
const ABI_TRUE = `0x${"00".repeat(31)}01`;

/** Recomputes the hash returned by CTF Exchange V2 `hashOrder`. */
export function polymarketV2OrderHash(
  order: PolymarketV2OrderHashInput,
  exchange: string,
): Hex {
  return hashTypedData({
    domain: {
      name: "Polymarket CTF Exchange",
      version: "2",
      chainId: 137,
      verifyingContract: exchange as Address,
    },
    types: ORDER_TYPES,
    primaryType: "Order",
    message: {
      salt: parseUint256Decimal(order.salt),
      maker: order.maker as Address,
      signer: order.signer as Address,
      tokenId: parseUint256Decimal(order.tokenId),
      makerAmount: parseUint256Decimal(order.makerAmount),
      takerAmount: parseUint256Decimal(order.takerAmount),
      side: Number(parseUint256Decimal(order.side)),
      signatureType: Number(parseUint256Decimal(order.signatureType)),
      timestamp: parseUint256Decimal(order.timestamp),
      metadata: order.metadata as Hex,
      builder: order.builder as Hex,
    },
  });
}

/** Recomputes the fixed V2 legacy Safe CREATE2 address for one derivation signer. */
export function polymarketLegacySafeAddress(signer: string): Address {
  const salt = keccak256(
    encodeAbiParameters(
      [{ type: "address" }],
      [signer as Address],
    ),
  );
  return getCreate2Address({
    from: POLYMARKET_LEGACY_SAFE_FACTORY,
    salt,
    bytecodeHash: POLYMARKET_LEGACY_SAFE_PROXY_BYTECODE_HASH,
  }).toLowerCase() as Address;
}

function fail(
  code: PolymarketVenueSemanticErrorCode,
  path: string,
  detail: string,
): never {
  throw new PolymarketVenueSemanticError(code, path, detail);
}

function tupleKey(...values: readonly string[]): string {
  return values.map((value) => `${value.length}:${value}`).join("");
}

function objectAt(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_SHAPE", path, "expected an object");
  }
  return value as JsonObject;
}

function assertClosedKeys(
  value: JsonObject,
  expectedKeys: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...expectedKeys].sort(compareText);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    fail("INVALID_SHAPE", path, "object fields do not match the closed settlement evidence shape");
  }
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail("INVALID_SHAPE", path, "expected an array");
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string") fail("INVALID_SHAPE", path, "expected a string");
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail("INVALID_SHAPE", path, "expected a boolean");
  return value;
}

function uintAt(value: unknown, path: string): bigint {
  const text = stringAt(value, path);
  try {
    return parseUint256Decimal(text);
  } catch (error) {
    fail("INVALID_UINT256", path, error instanceof Error ? error.message : "invalid uint256");
  }
}

const UINT256_KEYS = new Set([
  "amount",
  "assetId",
  "blockNumber",
  "bodyLength",
  "chainId",
  "decimals",
  "effectiveRemainingMakerAmount",
  "endedAtMs",
  "feeBps",
  "flaggedAt",
  "indexSet",
  "lastEventBlockNumber",
  "lastEventLogIndex",
  "lastTradePriceU6",
  "logIndex",
  "makerAmount",
  "maxFeeRateBps",
  "maxRedemptionExposure",
  "maxUsdceSettlementExposure",
  "minOrderSizeBase",
  "minimumOutputAmount",
  "nonce",
  "operatorDelaySeconds",
  "outcomeSlotCount",
  "pausedAt",
  "pendingOwnerDeadline",
  "pendingOwnerNonce",
  "payoutDenominator",
  "positionId",
  "priceU6",
  "quantity",
  "questionCount",
  "questionIndex",
  "reportedAt",
  "reservedAmount",
  "reservedQuantity",
  "resultIndex",
  "salt",
  "side",
  "signatureType",
  "startedAtMs",
  "statusRemaining",
  "takerAmount",
  "threshold",
  "tickSizeU6",
  "timestamp",
  "tokenId",
  "totalSupply",
  "underlyingBalance",
  "userPauseBlockInterval",
  "userPausedBlockAt",
  "validUntil",
  "value",
  "vaultUsdceAllowance",
  "vaultUsdceBalance",
  "venueReportedSize",
  "venueTimestampMs",
]);

function assertUint256Fields(value: unknown, path = "$", fieldName?: string): void {
  if (value === null) return;
  if (fieldName !== undefined && UINT256_KEYS.has(fieldName)) {
    uintAt(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertUint256Fields(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as JsonObject)) {
      assertUint256Fields(item, `${path}.${key}`, key);
    }
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertSortedUnique<T>(
  items: readonly T[],
  compare: (left: T, right: T) => number,
  key: (item: T) => string,
  path: string,
): void {
  const seen = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const itemKey = key(items[index]);
    if (seen.has(itemKey)) fail("DUPLICATE_ID", `${path}[${index}]`, `duplicate key ${itemKey}`);
    seen.add(itemKey);
    if (index > 0 && compare(items[index - 1], items[index]) >= 0) {
      fail("ARRAY_ORDER", `${path}[${index}]`, "entries are not in canonical order");
    }
  }
}

function recordsAt(state: JsonObject, field: string): JsonObject[] {
  return arrayAt(state[field], `$.${field}`).map((item, index) =>
    objectAt(item, `$.${field}[${index}]`),
  );
}

function idMap(
  records: readonly JsonObject[],
  field: string,
  path: string,
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  records.forEach((record, index) => {
    const id = stringAt(record[field], `${path}[${index}].${field}`);
    if (result.has(id)) fail("DUPLICATE_ID", `${path}[${index}].${field}`, `duplicate id ${id}`);
    result.set(id, record);
  });
  return result;
}

function requireRef(
  map: ReadonlyMap<string, JsonObject>,
  id: unknown,
  path: string,
): JsonObject {
  const key = stringAt(id, path);
  const result = map.get(key);
  if (result === undefined) fail("UNRESOLVED_REFERENCE", path, `unknown id ${key}`);
  return result;
}

function same(left: unknown, right: unknown): boolean {
  return left === right;
}

function requireSame(
  left: unknown,
  right: unknown,
  code: PolymarketVenueSemanticErrorCode,
  path: string,
  detail: string,
): void {
  if (!same(left, right)) fail(code, path, detail);
}

function addUint(left: bigint, right: bigint, path: string): bigint {
  const sum = left + right;
  if (sum > UINT256_MAX) fail("INVALID_UINT256", path, "uint256 sum overflows");
  return sum;
}

function numericStringCompare(left: string, right: string): number {
  const a = uintAt(left, "numeric sort key");
  const b = uintAt(right, "numeric sort key");
  return a < b ? -1 : a > b ? 1 : 0;
}

function positionRecord(entry: JsonObject, path: string): JsonObject {
  return objectAt(entry.position, `${path}.position`);
}

function positionScope(entry: JsonObject, path: string): string {
  const position = positionRecord(entry, path);
  return tupleKey(stringAt(entry.custodyConfigId, `${path}.custodyConfigId`), stringAt(
    position.conditionId,
    `${path}.position.conditionId`,
  ));
}

function positionKey(entry: JsonObject, path: string): string {
  const position = positionRecord(entry, path);
  return tupleKey(stringAt(position.custodyAccount, `${path}.position.custodyAccount`), stringAt(
    position.positionId,
    `${path}.position.positionId`,
  ));
}

function tupleProvenance(
  record: JsonObject,
  path: string,
): "null" | "present" | "mixed" {
  const values = [
    record.lastEventBlockNumber,
    record.lastEventTransactionHash,
    record.lastEventLogIndex,
  ];
  const nulls = values.filter((value) => value === null).length;
  return nulls === 3 ? "null" : nulls === 0 ? "present" : "mixed";
}

function assertProvenance(
  erc1155Approvals: readonly JsonObject[],
  erc20Allowances: readonly JsonObject[],
  authorities: readonly JsonObject[],
): void {
  erc1155Approvals.forEach((approval, index) => {
    if (tupleProvenance(approval, `$.erc1155Approvals[${index}]`) === "mixed") {
      fail(
        "PROVENANCE_TUPLE",
        `$.erc1155Approvals[${index}]`,
        "event location must be wholly null or wholly present",
      );
    }
  });
  erc20Allowances.forEach((allowance, index) => {
    const path = `$.erc20Allowances[${index}]`;
    const state = tupleProvenance(allowance, path);
    const source = stringAt(allowance.candidateSource, `${path}.candidateSource`);
    if ((source === "event" && state !== "present") || (source === "route" && state !== "null")) {
      fail("PROVENANCE_TUPLE", path, `candidateSource ${source} has inconsistent event fields`);
    }
  });
  authorities.forEach((authority, index) => {
    const path = `$.authorities[${index}]`;
    const state = tupleProvenance(authority, path);
    const source = stringAt(authority.candidateSource, `${path}.candidateSource`);
    if (
      (source === "event" && state !== "present")
      || ((source === "constructor" || source === "route") && state !== "null")
    ) {
      fail("PROVENANCE_TUPLE", path, `candidateSource ${source} has inconsistent event fields`);
    }
  });
}

function assertSignerEventLocation(entry: JsonObject, path: string): void {
  uintAt(entry.lastEventBlockNumber, `${path}.lastEventBlockNumber`);
  const transactionHash = stringAt(
    entry.lastEventTransactionHash,
    `${path}.lastEventTransactionHash`,
  );
  if (!/^0x(?!0{64}$)[0-9a-f]{64}$/.test(transactionHash)) {
    fail(
      "CUSTODY_BINDING",
      `${path}.lastEventTransactionHash`,
      "signer event transaction hash must be lowercase nonzero bytes32",
    );
  }
  uintAt(entry.lastEventLogIndex, `${path}.lastEventLogIndex`);
}

function assertDepositSignerSets(
  custody: JsonObject,
  path: string,
  valuationBlockTimestamp: bigint,
): void {
  const sessionSigners = arrayAt(custody.sessionSigners, `${path}.sessionSigners`).map(
    (value, index) => objectAt(value, `${path}.sessionSigners[${index}]`),
  );
  assertSortedUnique(
    sessionSigners,
    (left, right) => compareText(String(left.signer), String(right.signer)),
    (entry) => String(entry.signer),
    `${path}.sessionSigners`,
  );
  sessionSigners.forEach((entry, index) => {
    const entryPath = `${path}.sessionSigners[${index}]`;
    const signer = stringAt(entry.signer, `${entryPath}.signer`);
    if (!/^0x(?!0{40}$)[0-9a-f]{40}$/.test(signer)) {
      fail(
        "CUSTODY_BINDING",
        `${entryPath}.signer`,
        "session signer must be a lowercase nonzero address",
      );
    }
    const validUntil = uintAt(entry.validUntil, `${entryPath}.validUntil`);
    const expectedActive = validUntil !== 0n && valuationBlockTimestamp < validUntil;
    if (booleanAt(entry.active, `${entryPath}.active`) !== expectedActive) {
      fail(
        "CUSTODY_BINDING",
        `${entryPath}.active`,
        "session signer activity does not match validUntil at the valuation block timestamp",
      );
    }
    assertSignerEventLocation(entry, entryPath);
  });

  const passkeySigners = arrayAt(
    custody.passkeySessionSigners,
    `${path}.passkeySessionSigners`,
  ).map((value, index) => objectAt(value, `${path}.passkeySessionSigners[${index}]`));
  assertSortedUnique(
    passkeySigners,
    (left, right) => compareText(String(left.passkeyId), String(right.passkeyId)),
    (entry) => String(entry.passkeyId),
    `${path}.passkeySessionSigners`,
  );
  passkeySigners.forEach((entry, index) => {
    const entryPath = `${path}.passkeySessionSigners[${index}]`;
    const passkeyId = stringAt(entry.passkeyId, `${entryPath}.passkeyId`);
    if (!/^0x(?!0{64}$)[0-9a-f]{64}$/.test(passkeyId)) {
      fail(
        "CUSTODY_BINDING",
        `${entryPath}.passkeyId`,
        "passkeyId must be lowercase nonzero bytes32",
      );
    }
    const x = stringAt(entry.x, `${entryPath}.x`);
    const y = stringAt(entry.y, `${entryPath}.y`);
    if (!/^0x[0-9a-f]{64}$/.test(x) || !/^0x[0-9a-f]{64}$/.test(y)) {
      fail(
        "CUSTODY_BINDING",
        entryPath,
        "passkey coordinates must be lowercase bytes32",
      );
    }
    const zeroBytes32 = `0x${"00".repeat(32)}`;
    const xIsZero = x === zeroBytes32;
    const yIsZero = y === zeroBytes32;
    if (xIsZero !== yIsZero) {
      fail(
        "CUSTODY_BINDING",
        entryPath,
        "passkey coordinates must both be zero or both be nonzero",
      );
    }
    const validUntil = uintAt(entry.validUntil, `${entryPath}.validUntil`);
    if (xIsZero && validUntil !== 0n) {
      fail(
        "CUSTODY_BINDING",
        `${entryPath}.validUntil`,
        "a revoked passkey candidate must have zero coordinates and zero validUntil",
      );
    }
    const expectedActive = validUntil !== 0n && valuationBlockTimestamp < validUntil;
    if (booleanAt(entry.active, `${entryPath}.active`) !== expectedActive) {
      fail(
        "CUSTODY_BINDING",
        `${entryPath}.active`,
        "passkey signer activity does not match validUntil at the valuation block timestamp",
      );
    }
    assertSignerEventLocation(entry, entryPath);
  });
}

function assertCustodyBindings(
  custodyConfigs: readonly JsonObject[],
  options: PolymarketVenueSemanticOptions,
): void {
  const hasDepositWallet = custodyConfigs.some(
    (custody) => custody.walletKind === "deposit-wallet-v2",
  );
  let valuationBlockTimestamp = options.valuationBlockTimestamp;
  if (hasDepositWallet) {
    if (valuationBlockTimestamp === undefined) {
      fail(
        "CUSTODY_BINDING",
        "options.valuationBlockTimestamp",
        "Deposit Wallet validation requires the valuation block timestamp",
      );
    }
    if (
      typeof valuationBlockTimestamp !== "bigint"
      || valuationBlockTimestamp < 0n
      || valuationBlockTimestamp > UINT256_MAX
    ) {
      fail(
        "INVALID_UINT256",
        "options.valuationBlockTimestamp",
        "valuation block timestamp is outside uint256",
      );
    }
  }
  const accounts = new Set<string>();
  const legacyDerivationSigners = new Set<string>();
  custodyConfigs.forEach((custody, index) => {
    const path = `$.custodyConfigs[${index}]`;
    const account = stringAt(custody.custodyAccount, `${path}.custodyAccount`);
    if (accounts.has(account)) fail("DUPLICATE_ID", `${path}.custodyAccount`, "duplicate custody account");
    accounts.add(account);
    requireSame(custody.makerAddress, account, "CUSTODY_BINDING", `${path}.makerAddress`, "maker must be custody account");
    const kind = stringAt(custody.walletKind, `${path}.walletKind`);
    if (kind === "deposit-wallet-v2") {
      requireSame(custody.signatureType, "3", "CUSTODY_BINDING", `${path}.signatureType`, "Deposit Wallet requires signature type 3");
      requireSame(custody.orderSignerAddress, account, "CUSTODY_BINDING", `${path}.orderSignerAddress`, "Deposit Wallet order signer must be the wallet");
      const proxyMode = stringAt(custody.proxyMode, `${path}.proxyMode`);
      const implementationPinned = booleanAt(
        custody.implementationPinned,
        `${path}.implementationPinned`,
      );
      if ((proxyMode === "deposit-implementation-pinned") !== implementationPinned) {
        fail(
          "CUSTODY_BINDING",
          `${path}.implementationPinned`,
          "implementation pinning state does not match the Deposit Wallet proxy mode",
        );
      }
      const owner = stringAt(custody.owner, `${path}.owner`);
      requireSame(
        custody.accountSignerAddress,
        owner,
        "CUSTODY_BINDING",
        `${path}.accountSignerAddress`,
        "version 1 Deposit Wallet orders must use the current owner",
      );
      uintAt(custody.pausedAt, `${path}.pausedAt`);
      const pendingOwner = custody.pendingOwner;
      if (
        pendingOwner !== null
        && !/^0x(?!0{40}$)[0-9a-f]{40}$/.test(
          stringAt(pendingOwner, `${path}.pendingOwner`),
        )
      ) {
        fail(
          "CUSTODY_BINDING",
          `${path}.pendingOwner`,
          "pending owner must be null or a lowercase nonzero address",
        );
      }
      const pendingDeadline = uintAt(
        custody.pendingOwnerDeadline,
        `${path}.pendingOwnerDeadline`,
      );
      uintAt(custody.pendingOwnerNonce, `${path}.pendingOwnerNonce`);
      if ((pendingOwner === null) !== (pendingDeadline === 0n)) {
        fail(
          "CUSTODY_BINDING",
          `${path}.pendingOwnerDeadline`,
          "pending owner and handover deadline nullability disagree",
        );
      }
      assertDepositSignerSets(custody, path, valuationBlockTimestamp as bigint);
    } else if (kind === "legacy-gnosis-safe") {
      requireSame(custody.signatureType, "2", "CUSTODY_BINDING", `${path}.signatureType`, "legacy Safe requires signature type 2");
      requireSame(custody.orderSignerAddress, custody.accountSignerAddress, "CUSTODY_BINDING", `${path}.orderSignerAddress`, "legacy Safe order signer must be its derivation signer");
      const derivationSigner = stringAt(
        custody.accountSignerAddress,
        `${path}.accountSignerAddress`,
      );
      if (!/^0x(?!0{40}$)[0-9a-f]{40}$/.test(derivationSigner)) {
        fail(
          "CUSTODY_BINDING",
          `${path}.accountSignerAddress`,
          "legacy Safe derivation signer must be a lowercase nonzero address",
        );
      }
      if (legacyDerivationSigners.has(derivationSigner)) {
        fail(
          "CUSTODY_BINDING",
          `${path}.accountSignerAddress`,
          "legacy Safe derivation signer is already used by another custody config",
        );
      }
      legacyDerivationSigners.add(derivationSigner);
      requireSame(custody.factory, POLYMARKET_LEGACY_SAFE_FACTORY, "CUSTODY_BINDING", `${path}.factory`, "legacy Safe factory does not match the pinned V2 derivation");
      requireSame(custody.factoryCodeHash, POLYMARKET_LEGACY_SAFE_FACTORY_CODE_HASH, "CUSTODY_BINDING", `${path}.factoryCodeHash`, "legacy Safe factory runtime does not match the pinned V2 derivation");
      requireSame(custody.proxyMode, "legacy-safe-proxy", "CUSTODY_BINDING", `${path}.proxyMode`, "legacy Safe proxy mode mismatch");
      requireSame(custody.runtimeCodeHash, POLYMARKET_LEGACY_SAFE_PROXY_RUNTIME_CODE_HASH, "CUSTODY_BINDING", `${path}.runtimeCodeHash`, "legacy Safe proxy runtime does not match the pinned V2 proxy");
      requireSame(custody.implementation, POLYMARKET_LEGACY_SAFE_IMPLEMENTATION, "CUSTODY_BINDING", `${path}.implementation`, "legacy Safe singleton does not match the pinned V2 derivation");
      requireSame(custody.implementationCodeHash, POLYMARKET_LEGACY_SAFE_IMPLEMENTATION_CODE_HASH, "CUSTODY_BINDING", `${path}.implementationCodeHash`, "legacy Safe singleton runtime does not match the pinned V2 implementation");
      let derivedAccount: string;
      try {
        derivedAccount = polymarketLegacySafeAddress(derivationSigner);
      } catch (error) {
        fail(
          "CUSTODY_BINDING",
          `${path}.accountSignerAddress`,
          error instanceof Error ? error.message : "cannot derive legacy Safe address",
        );
      }
      requireSame(
        account,
        derivedAccount,
        "CUSTODY_BINDING",
        `${path}.custodyAccount`,
        "legacy Safe address does not match the pinned factory, singleton, and derivation signer",
      );
    } else {
      fail("CUSTODY_BINDING", `${path}.walletKind`, `unsupported wallet kind ${kind}`);
    }
    const controllers = arrayAt(custody.controllers, `${path}.controllers`).map((value, controllerIndex) =>
      stringAt(value, `${path}.controllers[${controllerIndex}]`),
    );
    assertSortedUnique(controllers, compareText, (value) => value, `${path}.controllers`);
    if (
      kind === "deposit-wallet-v2"
      && (
        controllers.length !== 1
        || controllers[0] !== stringAt(custody.owner, `${path}.owner`)
      )
    ) {
      fail(
        "CUSTODY_BINDING",
        `${path}.controllers`,
        "Deposit Wallet controllers must contain exactly its owner",
      );
    }
    const modules = arrayAt(custody.modules, `${path}.modules`).map((value, moduleIndex) =>
      stringAt(value, `${path}.modules[${moduleIndex}]`),
    );
    assertSortedUnique(modules, compareText, (value) => value, `${path}.modules`);
    if (uintAt(custody.threshold, `${path}.threshold`) > BigInt(controllers.length)) {
      fail("CUSTODY_BINDING", `${path}.threshold`, "threshold exceeds controller count");
    }
  });
}

function assertStrategyCustodyAccounts(
  custodyConfigs: readonly JsonObject[],
  options: PolymarketVenueSemanticOptions,
): void {
  if (options.strategyCustodyAccounts === undefined) {
    if (options.verificationScope === "settlement") {
      fail(
        "CUSTODY_BINDING",
        "options.strategyCustodyAccounts",
        "settlement-bearing validation requires the independently derived strategy-custody account set",
      );
    }
    return;
  }

  const supplied = arrayAt(
    options.strategyCustodyAccounts,
    "options.strategyCustodyAccounts",
  ).map((value, index) => {
    const account = stringAt(value, `options.strategyCustodyAccounts[${index}]`);
    if (!/^0x(?!0{40}$)[0-9a-f]{40}$/.test(account)) {
      fail(
        "CUSTODY_BINDING",
        `options.strategyCustodyAccounts[${index}]`,
        "strategy-custody account must be a lowercase nonzero address",
      );
    }
    return account;
  });
  assertSortedUnique(
    supplied,
    compareText,
    (account) => account,
    "options.strategyCustodyAccounts",
  );

  const configured = custodyConfigs
    .map((custody, index) =>
      stringAt(custody.custodyAccount, `$.custodyConfigs[${index}].custodyAccount`),
    )
    .sort(compareText);
  if (
    supplied.length !== configured.length
    || supplied.some((account, index) => account !== configured[index])
  ) {
    fail(
      "CUSTODY_BINDING",
      "$.custodyConfigs",
      "custody accounts do not exactly equal the independently derived strategy-custody account set",
    );
  }
}

function assertSettlementFundingSourceAccounts(
  custodyConfigs: readonly JsonObject[],
  options: PolymarketVenueSemanticOptions,
): void {
  if (options.fundingSourceAccounts === undefined) {
    if (options.verificationScope === "settlement") {
      fail(
        "SETTLEMENT_FREEZE_CONFIG",
        "options.fundingSourceAccounts",
        "settlement-bearing validation requires the authenticated Core funding-source account set",
      );
    }
    return;
  }
  settlementFundingSourceAccounts(
    custodyConfigs,
    options.fundingSourceAccounts,
    "options.fundingSourceAccounts",
  );
}

function assertSettlementCustodyEligibility(
  custodyConfigs: readonly JsonObject[],
  options: PolymarketVenueSemanticOptions,
): void {
  if (options.verificationScope !== "settlement") return;
  custodyConfigs.forEach((custody, index) => {
    const path = `$.custodyConfigs[${index}]`;
    const walletKind = stringAt(custody.walletKind, `${path}.walletKind`);
    if (walletKind === "deposit-wallet-v2") {
      const hasActiveSessionSigner = [
        ...arrayAt(custody.sessionSigners, `${path}.sessionSigners`),
        ...arrayAt(custody.passkeySessionSigners, `${path}.passkeySessionSigners`),
      ].some((entry, signerIndex) =>
        booleanAt(
          objectAt(entry, `${path}.signers[${signerIndex}]`).active,
          `${path}.signers[${signerIndex}].active`,
        ),
      );
      if (hasActiveSessionSigner) {
        fail(
          "CUSTODY_BINDING",
          path,
          "settlement-bearing validation forbids active Deposit Wallet session signers",
        );
      }
      fail(
        "CUSTODY_BINDING",
        `${path}.walletKind`,
        "Deposit Wallet custody is diagnostic-only in venue profile version 1",
      );
    }
    if (walletKind !== "legacy-gnosis-safe") {
      fail(
        "CUSTODY_BINDING",
        `${path}.walletKind`,
        "settlement-bearing validation requires legacy Safe custody",
      );
    }
    if (arrayAt(custody.modules, `${path}.modules`).length !== 0) {
      fail(
        "CUSTODY_BINDING",
        `${path}.modules`,
        "settlement-bearing legacy Safe custody cannot have enabled modules",
      );
    }
    if (custody.guard !== null || custody.fallbackHandler !== null) {
      fail(
        "CUSTODY_BINDING",
        path,
        "settlement-bearing legacy Safe custody cannot have a guard or fallback handler",
      );
    }
  });
}

function assertNegRiskConfig(config: JsonObject, path: string): void {
  const questionId = stringAt(config.questionId, `${path}.questionId`);
  const question = BigInt(questionId);
  const expectedMarket = `0x${(question & ~255n).toString(16).padStart(64, "0")}`;
  const expectedIndex = (question & 255n).toString();
  requireSame(config.marketId, expectedMarket, "NEG_RISK_CONFIG_MISMATCH", `${path}.marketId`, "market id must clear the question id low byte");
  requireSame(config.questionIndex, expectedIndex, "NEG_RISK_CONFIG_MISMATCH", `${path}.questionIndex`, "question index must equal the question id low byte");
  if (uintAt(config.questionIndex, `${path}.questionIndex`) >= uintAt(config.questionCount, `${path}.questionCount`)) {
    fail("NEG_RISK_CONFIG_MISMATCH", `${path}.questionIndex`, "question index is outside question count");
  }
  const determined = booleanAt(config.determined, `${path}.determined`);
  if ((determined && config.resultIndex === null) || (!determined && config.resultIndex !== null)) {
    fail("NEG_RISK_CONFIG_MISMATCH", `${path}.resultIndex`, "result nullability disagrees with determined");
  }
  if (
    determined
    && uintAt(config.resultIndex, `${path}.resultIndex`) >= uintAt(config.questionCount, `${path}.questionCount`)
  ) {
    fail("NEG_RISK_CONFIG_MISMATCH", `${path}.resultIndex`, "result index is outside question count");
  }
  const reported = uintAt(config.reportedAt, `${path}.reportedAt`) !== 0n;
  if ((reported && typeof config.reportedResult !== "boolean") || (!reported && config.reportedResult !== null)) {
    fail("NEG_RISK_CONFIG_MISMATCH", `${path}.reportedResult`, "reported result nullability disagrees with reportedAt");
  }

  const adapterMarket = objectAt(config.adapterMarketPrepared, `${path}.adapterMarketPrepared`);
  const adapterQuestion = objectAt(config.adapterQuestionPrepared, `${path}.adapterQuestionPrepared`);
  const operatorMarket = objectAt(config.operatorMarketPrepared, `${path}.operatorMarketPrepared`);
  const operatorQuestion = objectAt(config.operatorQuestionPrepared, `${path}.operatorQuestionPrepared`);
  requireSame(adapterMarket.marketId, config.marketId, "NEG_RISK_CONFIG_MISMATCH", `${path}.adapterMarketPrepared.marketId`, "adapter market event mismatch");
  requireSame(adapterMarket.oracle, config.marketOperator, "NEG_RISK_CONFIG_MISMATCH", `${path}.adapterMarketPrepared.oracle`, "adapter market oracle mismatch");
  requireSame(adapterMarket.feeBps, config.feeBps, "NEG_RISK_CONFIG_MISMATCH", `${path}.adapterMarketPrepared.feeBps`, "adapter market fee mismatch");
  requireSame(adapterQuestion.marketId, config.marketId, "NEG_RISK_CONFIG_MISMATCH", `${path}.adapterQuestionPrepared.marketId`, "adapter question market mismatch");
  requireSame(adapterQuestion.questionId, config.questionId, "NEG_RISK_CONFIG_MISMATCH", `${path}.adapterQuestionPrepared.questionId`, "adapter question id mismatch");
  requireSame(adapterQuestion.questionIndex, config.questionIndex, "NEG_RISK_CONFIG_MISMATCH", `${path}.adapterQuestionPrepared.questionIndex`, "adapter question index mismatch");
  requireSame(operatorMarket.marketId, config.marketId, "NEG_RISK_CONFIG_MISMATCH", `${path}.operatorMarketPrepared.marketId`, "operator market event mismatch");
  requireSame(operatorMarket.feeBps, config.feeBps, "NEG_RISK_CONFIG_MISMATCH", `${path}.operatorMarketPrepared.feeBps`, "operator market fee mismatch");
  requireSame(operatorQuestion.marketId, config.marketId, "NEG_RISK_CONFIG_MISMATCH", `${path}.operatorQuestionPrepared.marketId`, "operator question market mismatch");
  requireSame(operatorQuestion.questionId, config.questionId, "NEG_RISK_CONFIG_MISMATCH", `${path}.operatorQuestionPrepared.questionId`, "operator question id mismatch");
  requireSame(operatorQuestion.questionIndex, config.questionIndex, "NEG_RISK_CONFIG_MISMATCH", `${path}.operatorQuestionPrepared.questionIndex`, "operator question index mismatch");
  requireSame(operatorQuestion.requestId, config.requestId, "NEG_RISK_CONFIG_MISMATCH", `${path}.operatorQuestionPrepared.requestId`, "operator request id mismatch");
  requireSame(config.operatorNegRiskAdapter, config.negRiskAdapter, "NEG_RISK_CONFIG_MISMATCH", `${path}.operatorNegRiskAdapter`, "operator adapter mismatch");
  requireSame(config.upstreamCtf, config.marketOperator, "NEG_RISK_CONFIG_MISMATCH", `${path}.upstreamCtf`, "upstream CTF must be the selected operator");
}

function assertPositionBindings(
  entries: readonly JsonObject[],
  custodyById: ReadonlyMap<string, JsonObject>,
  routeById: ReadonlyMap<string, JsonObject>,
  standardOracleById: ReadonlyMap<string, JsonObject>,
  negRiskById: ReadonlyMap<string, JsonObject>,
): void {
  const preparationByCondition = new Map<string, string>();
  const seenPositionKeys = new Set<string>();
  entries.forEach((entry, index) => {
    const path = `$.positions[${index}]`;
    const position = positionRecord(entry, path);
    try {
      assertCtfPositionRecord(position as CtfPositionRecord);
    } catch (error) {
      fail("POSITION_DERIVATION", `${path}.position`, error instanceof Error ? error.message : "invalid CTF position");
    }
    const key = positionKey(entry, path);
    if (seenPositionKeys.has(key)) fail("DUPLICATE_ID", `${path}.position.positionId`, "duplicate custody and position id");
    seenPositionKeys.add(key);

    const custody = requireRef(custodyById, entry.custodyConfigId, `${path}.custodyConfigId`);
    requireSame(position.custodyAccount, custody.custodyAccount, "POSITION_BINDING", `${path}.position.custodyAccount`, "position custody does not match custody config");
    const route = requireRef(routeById, entry.routeId, `${path}.routeId`);
    requireSame(entry.marketKind, route.marketKind, "POSITION_BINDING", `${path}.marketKind`, "position and exchange route market kinds differ");
    requireSame(position.positionContract, route.ctf, "POSITION_BINDING", `${path}.position.positionContract`, "position contract does not match exchange route CTF");
    requireSame(position.collateralToken, route.ctfCollateralToken, "POSITION_BINDING", `${path}.position.collateralToken`, "position collateral does not match exchange route");
    const preparation = objectAt(entry.conditionPreparation, `${path}.conditionPreparation`);
    requireSame(preparation.oracle, position.oracle, "POSITION_EVENT_MISMATCH", `${path}.conditionPreparation.oracle`, "prepared oracle does not match position");
    requireSame(preparation.questionId, position.questionId, "POSITION_EVENT_MISMATCH", `${path}.conditionPreparation.questionId`, "prepared question does not match position");
    requireSame(preparation.outcomeSlotCount, position.outcomeSlotCount, "POSITION_EVENT_MISMATCH", `${path}.conditionPreparation.outcomeSlotCount`, "prepared slot count does not match position");
    const preparationIdentity = [
      preparation.blockNumber,
      preparation.blockHash,
      preparation.transactionHash,
      preparation.logIndex,
      preparation.oracle,
      preparation.questionId,
      preparation.outcomeSlotCount,
    ].join("|");
    const conditionId = stringAt(position.conditionId, `${path}.position.conditionId`);
    const priorPreparation = preparationByCondition.get(conditionId);
    if (priorPreparation !== undefined && priorPreparation !== preparationIdentity) {
      fail("POSITION_EVENT_MISMATCH", `${path}.conditionPreparation`, "one condition has conflicting preparation events");
    }
    preparationByCondition.set(conditionId, preparationIdentity);

    if (entry.marketKind === "standard") {
      if (entry.negRiskConfigId !== null) fail("POSITION_BINDING", `${path}.negRiskConfigId`, "standard position cannot select a negative-risk config");
      const oracle = requireRef(standardOracleById, entry.standardOracleConfigId, `${path}.standardOracleConfigId`);
      requireSame(oracle.oracle, position.oracle, "ORACLE_CONFIG_MISMATCH", `${path}.standardOracleConfigId`, "oracle address mismatch");
      requireSame(oracle.questionId, position.questionId, "ORACLE_CONFIG_MISMATCH", `${path}.standardOracleConfigId`, "oracle question mismatch");
      requireSame(oracle.ctf, position.positionContract, "ORACLE_CONFIG_MISMATCH", `${path}.standardOracleConfigId`, "oracle CTF mismatch");
    } else if (entry.marketKind === "negative-risk") {
      if (entry.standardOracleConfigId !== null) fail("POSITION_BINDING", `${path}.standardOracleConfigId`, "negative-risk position cannot select a standard oracle config");
      const config = requireRef(negRiskById, entry.negRiskConfigId, `${path}.negRiskConfigId`);
      requireSame(config.questionId, position.questionId, "NEG_RISK_CONFIG_MISMATCH", `${path}.negRiskConfigId`, "negative-risk question mismatch");
      requireSame(config.negRiskAdapter, position.oracle, "NEG_RISK_CONFIG_MISMATCH", `${path}.negRiskConfigId`, "negative-risk CTF oracle mismatch");
      requireSame(config.wrappedCollateral, position.collateralToken, "NEG_RISK_CONFIG_MISMATCH", `${path}.negRiskConfigId`, "negative-risk wrapped collateral mismatch");
    } else {
      fail("POSITION_BINDING", `${path}.marketKind`, "unsupported market kind");
    }
  });
}

function assertBooks(
  books: readonly JsonObject[],
  positions: readonly JsonObject[],
  resolutionByCondition: ReadonlyMap<string, boolean>,
  routeById: ReadonlyMap<string, JsonObject>,
  responseByHash: ReadonlyMap<string, JsonObject>,
  referencedResponses: Set<string>,
): void {
  const held = new Map<string, { conditionId: string; negRisk: boolean; available: bigint }>();
  positions.forEach((entry, index) => {
    const path = `$.positions[${index}]`;
    const position = positionRecord(entry, path);
    const id = stringAt(position.positionId, `${path}.position.positionId`);
    const quantity = uintAt(position.quantity, `${path}.position.quantity`);
    const reserved = uintAt(entry.reservedQuantity, `${path}.reservedQuantity`);
    if (reserved > quantity) fail("POSITION_RESERVATION_MISMATCH", `${path}.reservedQuantity`, "reservation exceeds held quantity");
    const conditionId = stringAt(position.conditionId, `${path}.position.conditionId`);
    const resolved = resolutionByCondition.get(conditionId);
    if (resolved === undefined) {
      fail(
        "PAYOUT_STATE_MISMATCH",
        "$.redemptionExecutions",
        `missing payout state for condition ${conditionId}`,
      );
    }
    if (!resolved) {
      const route = requireRef(routeById, entry.routeId, `${path}.routeId`);
      const maxFee = uintAt(route.maxFeeRateBps, `${path}.route.maxFeeRateBps`);
      if (maxFee === 0n || maxFee >= 10_000n) {
        fail(
          "POSITION_BINDING",
          `${path}.routeId`,
          "an unresolved CLOB-cross route requires a max fee in [1, 9999]",
        );
      }
    }
    const available = quantity - reserved;
    const existing = held.get(id);
    if (existing === undefined) {
      held.set(id, {
        conditionId,
        negRisk: entry.marketKind === "negative-risk",
        available,
      });
    } else {
      requireSame(existing.conditionId, position.conditionId, "BOOK_SET_MISMATCH", path, "one asset id maps to conflicting conditions");
      requireSame(existing.negRisk, entry.marketKind === "negative-risk", "BOOK_SET_MISMATCH", path, "one asset id maps to conflicting market kinds");
      existing.available = addUint(existing.available, available, `${path}.position.quantity`);
    }
  });
  const expected = new Map(
    [...held].filter(([, position]) => {
      return resolutionByCondition.get(position.conditionId) === false;
    }),
  );
  if (books.length !== expected.size) {
    fail(
      "BOOK_SET_MISMATCH",
      "$.books",
      "book count does not equal the distinct unresolved held asset count",
    );
  }
  const seen = new Set<string>();
  books.forEach((book, index) => {
    const path = `$.books[${index}]`;
    const assetId = stringAt(book.assetId, `${path}.assetId`);
    if (seen.has(assetId)) fail("DUPLICATE_ID", `${path}.assetId`, "duplicate book asset id");
    seen.add(assetId);
    const position = expected.get(assetId);
    if (position === undefined) {
      fail(
        "BOOK_SET_MISMATCH",
        `${path}.assetId`,
        "book has no unresolved held position on the CLOB-cross path",
      );
    }
    requireSame(book.market, position.conditionId, "BOOK_SET_MISMATCH", `${path}.market`, "book market does not match position condition");
    requireSame(book.negRisk, position.negRisk, "BOOK_SET_MISMATCH", `${path}.negRisk`, "book market kind does not match position");
    const responseHash = stringAt(book.responseHash, `${path}.responseHash`);
    if (!responseByHash.has(responseHash)) fail("RESPONSE_REFERENCE", `${path}.responseHash`, "book response is missing");
    referencedResponses.add(responseHash);
    const bids = arrayAt(book.bids, `${path}.bids`).map((bid, bidIndex) =>
      objectAt(bid, `${path}.bids[${bidIndex}]`),
    );
    let priorPrice: bigint | null = null;
    let depth = 0n;
    bids.forEach((bid, bidIndex) => {
      const price = uintAt(bid.priceU6, `${path}.bids[${bidIndex}].priceU6`);
      const quantity = uintAt(bid.quantity, `${path}.bids[${bidIndex}].quantity`);
      if (price === 0n || quantity === 0n || price > 1_000_000n) {
        fail("BOOK_ORDER", `${path}.bids[${bidIndex}]`, "bid values are outside the normalized positive range");
      }
      if (priorPrice !== null && price >= priorPrice) {
        fail("BOOK_ORDER", `${path}.bids[${bidIndex}].priceU6`, "bids must be strictly descending with duplicate prices merged");
      }
      priorPrice = price;
      depth = addUint(depth, quantity, `${path}.bids`);
    });
    if (book.bidsTruncated === true && depth < position.available) {
      fail("BOOK_SET_MISMATCH", `${path}.bidsTruncated`, "a truncated ladder does not fill aggregate available holdings");
    }
  });
}

function binaryPositionIds(conditionId: string, collateralToken: string): [string, string] {
  const firstCollection = ctfCollectionId(ZERO_COLLECTION, conditionId as Hex, 1n);
  const secondCollection = ctfCollectionId(ZERO_COLLECTION, conditionId as Hex, 2n);
  const first = ctfPositionId(collateralToken as Address, firstCollection).toString();
  const second = ctfPositionId(collateralToken as Address, secondCollection).toString();
  return BigInt(first) < BigInt(second) ? [first, second] : [second, first];
}

function sweepKey(record: JsonObject, path: string): string {
  const account = stringAt(record.account, `${path}.account`);
  const token = stringAt(record.tokenContract, `${path}.tokenContract`);
  const tokenId = record.tokenId === null ? "n" : `u${uintAt(record.tokenId, `${path}.tokenId`).toString().padStart(78, "0")}`;
  return `${account}|${token}|${tokenId}`;
}

function expectedSweeps(redemption: JsonObject, conditionId: string): JsonObject[] {
  const kind = stringAt(redemption.kind, "redemption kind");
  if (kind === "direct-ctf-onramp" || kind === "neg-risk-direct-ctf-onramp") return [];
  const ctf = stringAt(redemption.conditionalTokens, "conditionalTokens");
  const collateral = stringAt(redemption.rawCtfCollateralToken, "rawCtfCollateralToken");
  const [first, second] = binaryPositionIds(conditionId, collateral);
  const entrypoint = stringAt(redemption.entrypoint, "entrypoint");
  if (kind === "ctf-exchange-bound-factory") {
    return [
      { account: entrypoint, tokenContract: ctf, tokenId: first, amount: "0" },
      { account: entrypoint, tokenContract: ctf, tokenId: second, amount: "0" },
      { account: entrypoint, tokenContract: stringAt(redemption.usdce, "usdce"), tokenId: null, amount: "0" },
    ];
  }
  if (kind === "neg-risk-adapter-onramp") {
    return [
      { account: entrypoint, tokenContract: ctf, tokenId: first, amount: "0" },
      { account: entrypoint, tokenContract: ctf, tokenId: second, amount: "0" },
      { account: entrypoint, tokenContract: stringAt(redemption.wrappedCollateral, "wrappedCollateral"), tokenId: null, amount: "0" },
    ];
  }
  if (kind === "neg-risk-exchange-bound-factory") {
    const legacy = stringAt(redemption.negRiskAdapter, "negRiskAdapter");
    return [
      { account: entrypoint, tokenContract: ctf, tokenId: first, amount: "0" },
      { account: entrypoint, tokenContract: ctf, tokenId: second, amount: "0" },
      { account: legacy, tokenContract: ctf, tokenId: first, amount: "0" },
      { account: legacy, tokenContract: ctf, tokenId: second, amount: "0" },
      { account: legacy, tokenContract: stringAt(redemption.wrappedCollateral, "wrappedCollateral"), tokenId: null, amount: "0" },
      { account: entrypoint, tokenContract: stringAt(redemption.usdce, "usdce"), tokenId: null, amount: "0" },
    ];
  }
  fail("REDEMPTION_ROUTE_MISMATCH", "$.redemptionConfigs", `unknown redemption kind ${kind}`);
}

function assertSweepSet(redemption: JsonObject, conditionId: string, path: string): void {
  const actual = arrayAt(redemption.sweepBalances, `${path}.sweepBalances`).map((value, index) =>
    objectAt(value, `${path}.sweepBalances[${index}]`),
  );
  const expected = expectedSweeps(redemption, conditionId);
  const actualKeys = actual.map((record, index) => sweepKey(record, `${path}.sweepBalances[${index}]`));
  const expectedKeys = expected.map((record, index) => sweepKey(record, `${path}.expectedSweeps[${index}]`));
  actual.forEach((record, index) => {
    requireSame(record.amount, "0", "SWEEP_SET_MISMATCH", `${path}.sweepBalances[${index}].amount`, "adapter pre-call sweep balance must be zero");
  });
  assertSortedUnique(actualKeys, compareText, (value) => value, `${path}.sweepBalances`);
  actualKeys.sort(compareText);
  expectedKeys.sort(compareText);
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail("SWEEP_SET_MISMATCH", `${path}.sweepBalances`, "sweep tuples do not exactly cover the balances consumed by this execution");
  }
}

function assertRouteConsistency(
  route: JsonObject,
  redemption: JsonObject,
  collateral: JsonObject,
  path: string,
): void {
  requireSame(redemption.marketKind, route.marketKind, "REDEMPTION_ROUTE_MISMATCH", `${path}.marketKind`, "redemption and exchange market kinds differ");
  requireSame(redemption.rawCtfCollateralToken, route.ctfCollateralToken, "REDEMPTION_ROUTE_MISMATCH", `${path}.rawCtfCollateralToken`, "raw CTF collateral differs from exchange route");
  requireSame(redemption.conditionalTokens, route.ctf, "REDEMPTION_ROUTE_MISMATCH", `${path}.conditionalTokens`, "CTF differs from exchange route");
  requireSame(redemption.accountingOutputToken, route.exchangeCollateralToken, "REDEMPTION_ROUTE_MISMATCH", `${path}.accountingOutputToken`, "accounting output differs from exchange collateral");
  requireSame(redemption.accountingOutputToken, collateral.accountingToken, "REDEMPTION_ROUTE_MISMATCH", `${path}.accountingOutputToken`, "accounting output differs from collateral config");
  requireSame(redemption.usdce, collateral.usdce, "REDEMPTION_ROUTE_MISMATCH", `${path}.usdce`, "USDC.e differs from collateral config");
  if (redemption.onramp !== null) {
    requireSame(redemption.onramp, collateral.onramp, "REDEMPTION_ROUTE_MISMATCH", `${path}.onramp`, "onramp differs from collateral config");
    requireSame(redemption.onrampCodeHash, collateral.onrampCodeHash, "REDEMPTION_ROUTE_MISMATCH", `${path}.onrampCodeHash`, "onramp code hash differs from collateral config");
  }
  const kind = stringAt(redemption.kind, `${path}.kind`);
  if (kind === "ctf-exchange-bound-factory" || kind === "neg-risk-exchange-bound-factory") {
    requireSame(redemption.entrypoint, route.outcomeTokenFactory, "REDEMPTION_ROUTE_MISMATCH", `${path}.entrypoint`, "adapter entrypoint differs from route factory");
    requireSame(redemption.entrypointCodeHash, route.outcomeTokenFactoryCodeHash, "REDEMPTION_ROUTE_MISMATCH", `${path}.entrypointCodeHash`, "adapter code hash differs from route factory");
    requireSame(redemption.collateralToken, route.factoryCollateralToken, "REDEMPTION_ROUTE_MISMATCH", `${path}.collateralToken`, "adapter collateral getter mismatch");
    requireSame(redemption.pausedUsdce, route.factoryPausedUsdce, "REDEMPTION_ROUTE_MISMATCH", `${path}.pausedUsdce`, "adapter pause state mismatch");
    if (kind === "neg-risk-exchange-bound-factory") {
      requireSame(redemption.negRiskAdapter, route.factoryNegRiskAdapter, "REDEMPTION_ROUTE_MISMATCH", `${path}.negRiskAdapter`, "negative-risk adapter getter mismatch");
      requireSame(redemption.wrappedCollateral, route.factoryWrappedCollateral, "REDEMPTION_ROUTE_MISMATCH", `${path}.wrappedCollateral`, "wrapped collateral getter mismatch");
    }
  } else if (kind === "direct-ctf-onramp" || kind === "neg-risk-direct-ctf-onramp") {
    requireSame(redemption.entrypoint, route.ctf, "REDEMPTION_ROUTE_MISMATCH", `${path}.entrypoint`, "direct entrypoint must be CTF");
    requireSame(redemption.entrypointCodeHash, route.ctfCodeHash, "REDEMPTION_ROUTE_MISMATCH", `${path}.entrypointCodeHash`, "direct CTF code hash mismatch");
    requireSame(redemption.pausedUsdce, collateral.onrampPausedUsdce, "REDEMPTION_ROUTE_MISMATCH", `${path}.pausedUsdce`, "onramp pause state mismatch");
  } else if (kind === "neg-risk-adapter-onramp") {
    requireSame(redemption.entrypoint, route.factoryNegRiskAdapter, "REDEMPTION_ROUTE_MISMATCH", `${path}.entrypoint`, "legacy adapter differs from exchange route");
    requireSame(redemption.wrappedCollateral, route.factoryWrappedCollateral, "REDEMPTION_ROUTE_MISMATCH", `${path}.wrappedCollateral`, "legacy adapter wrapped collateral mismatch");
    requireSame(redemption.pausedUsdce, collateral.onrampPausedUsdce, "REDEMPTION_ROUTE_MISMATCH", `${path}.pausedUsdce`, "onramp pause state mismatch");
  }
  const expectedCommits = [
    "ccc0596074f4dfd62c944fbca4de252893b82b4b",
    "eeefca66eb46c800a9aaab88db2064a99026fde5",
    ...(redemption.marketKind === "negative-risk"
      ? ["f78b35b0863b4308a431ca307d06f49b2ea65e78"]
      : []),
  ];
  const actualCommits = arrayAt(redemption.sourceCommits, `${path}.sourceCommits`).map(
    (commit, index) => stringAt(commit, `${path}.sourceCommits[${index}]`),
  );
  if (
    actualCommits.length !== expectedCommits.length
    || actualCommits.some((commit, index) => commit !== expectedCommits[index])
  ) {
    fail(
      "REDEMPTION_ROUTE_MISMATCH",
      `${path}.sourceCommits`,
      "source revisions do not equal the canonical route dependency set",
    );
  }
}

function bigintArrayAt(value: unknown, path: string): bigint[] {
  if (!Array.isArray(value)) fail("REDEMPTION_CALL_PLAN", path, "decoded argument is not an array");
  return value.map((item, index) => {
    if (typeof item !== "bigint") {
      fail("REDEMPTION_CALL_PLAN", `${path}[${index}]`, "decoded array item is not an integer");
    }
    return item;
  });
}

function requireBigintArray(
  actual: readonly bigint[],
  expected: readonly bigint[],
  path: string,
  detail: string,
): void {
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    fail("REDEMPTION_CALL_PLAN", path, detail);
  }
}

function assertExactFirstCalldata(
  redemption: JsonObject,
  execution: JsonObject,
  scopedPositions: readonly JsonObject[],
  call: JsonObject,
  path: string,
): void {
  if (call.calldataState !== "exact") return;
  const calldata = stringAt(call.calldata, `${path}.calldata`) as Hex;
  const kind = stringAt(redemption.kind, `${path}.redemptionRoute.kind`);
  if (kind === "neg-risk-adapter-onramp") {
    let decoded: ReturnType<typeof decodeFunctionData>;
    try {
      decoded = decodeFunctionData({ abi: NEG_RISK_REDEMPTION_ABI, data: calldata });
    } catch {
      fail("REDEMPTION_CALL_PLAN", `${path}.calldata`, "cannot decode legacy negative-risk redemption calldata");
    }
    const args = decoded.args as readonly unknown[];
    requireSame(args[0], execution.conditionId, "REDEMPTION_CALL_PLAN", `${path}.calldata`, "legacy redemption condition mismatch");
    const quantities: [bigint, bigint] = [0n, 0n];
    scopedPositions.forEach((entry) => {
      const position = positionRecord(entry, "covered position");
      const slot = position.indexSet === "1" ? 0 : 1;
      quantities[slot] = addUint(quantities[slot], uintAt(position.quantity, "covered position quantity"), path);
    });
    requireBigintArray(
      bigintArrayAt(args[1], `${path}.calldata.amounts`),
      quantities,
      `${path}.calldata`,
      "legacy redemption amounts do not equal full covered holdings",
    );
    requireSame(
      calldata,
      encodeFunctionData({
        abi: NEG_RISK_REDEMPTION_ABI,
        functionName: "redeemPositions",
        args: [stringAt(execution.conditionId, `${path}.conditionId`) as Hex, quantities],
      }),
      "REDEMPTION_CALL_PLAN",
      `${path}.calldata`,
      "legacy redemption calldata is not the canonical encoding of the bound arguments",
    );
    return;
  }

  let decoded: ReturnType<typeof decodeFunctionData>;
  try {
    decoded = decodeFunctionData({ abi: CTF_REDEMPTION_ABI, data: calldata });
  } catch {
    fail("REDEMPTION_CALL_PLAN", `${path}.calldata`, "cannot decode CTF redemption calldata");
  }
  const args = decoded.args as readonly unknown[];
  requireSame(
    typeof args[0] === "string" ? args[0].toLowerCase() : args[0],
    redemption.rawCtfCollateralToken,
    "REDEMPTION_CALL_PLAN",
    `${path}.calldata`,
    "redemption collateral mismatch",
  );
  requireSame(args[1], ZERO_COLLECTION, "REDEMPTION_CALL_PLAN", `${path}.calldata`, "redemption parent collection must be zero");
  requireSame(args[2], execution.conditionId, "REDEMPTION_CALL_PLAN", `${path}.calldata`, "redemption condition mismatch");
  const actualIndexSets = bigintArrayAt(args[3], `${path}.calldata.indexSets`);
  const expectedIndexSets =
    kind === "ctf-exchange-bound-factory" || kind === "neg-risk-exchange-bound-factory"
      ? [1n, 2n]
      : scopedPositions
          .map((entry) => uintAt(positionRecord(entry, "covered position").indexSet, "covered index set"))
          .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  requireBigintArray(
    actualIndexSets,
    expectedIndexSets,
    `${path}.calldata`,
    "redemption index sets do not exactly match the selected route and covered positions",
  );
  requireSame(
    calldata,
    encodeFunctionData({
      abi: CTF_REDEMPTION_ABI,
      functionName: "redeemPositions",
      args: [
        stringAt(redemption.rawCtfCollateralToken, `${path}.rawCtfCollateralToken`) as Address,
        ZERO_COLLECTION,
        stringAt(execution.conditionId, `${path}.conditionId`) as Hex,
        expectedIndexSets,
      ],
    }),
    "REDEMPTION_CALL_PLAN",
    `${path}.calldata`,
    "CTF redemption calldata is not the canonical encoding of the bound arguments",
  );
}

// The first call's payout is derived from CTF payout reads outside venueState.
// This helper binds every later exact 1:1 call to that declared amount. A null
// resolution-dependent suffix remains an explicit obligation of the outer
// chain-state and transaction-trace verifier once the payout becomes known.
function assertExactOneToOneCalldata(
  redemption: JsonObject,
  custody: JsonObject,
  previousCall: JsonObject,
  call: JsonObject,
  kind: string,
  callIndex: number,
  path: string,
): void {
  const state = stringAt(call.calldataState, `${path}.calldataState`);
  if (state === "resolution-dependent") {
    requireSame(call.calldata, null, "REDEMPTION_CALL_PLAN", `${path}.calldata`, "resolution-dependent calldata must be deferred");
    requireSame(call.minimumOutputAmount, "0", "REDEMPTION_CALL_PLAN", `${path}.minimumOutputAmount`, "a deferred call cannot claim a known output");
    return;
  }
  if (state !== "exact") {
    fail("REDEMPTION_CALL_PLAN", `${path}.calldataState`, `unsupported calldata state ${state}`);
  }
  if (previousCall.calldataState !== "exact") {
    fail(
      "REDEMPTION_CALL_PLAN",
      path,
      "an exact amount-dependent call cannot follow deferred calldata",
    );
  }

  const previousMinimum = uintAt(previousCall.minimumOutputAmount, `${path}.previousMinimumOutputAmount`);
  const calldata = stringAt(call.calldata, `${path}.calldata`) as Hex;
  const custodyAccount = stringAt(custody.custodyAccount, `${path}.custodyAccount`);
  let decoded: ReturnType<typeof decodeFunctionData>;
  let expectedCalldata: Hex;

  if (kind === "neg-risk-direct-ctf-onramp" && callIndex === 1) {
    try {
      decoded = decodeFunctionData({ abi: WCOL_UNWRAP_ABI, data: calldata });
    } catch {
      fail("REDEMPTION_CALL_PLAN", `${path}.calldata`, "cannot decode WCOL unwrap calldata");
    }
    const args = decoded.args as readonly unknown[];
    requireSame(
      typeof args[0] === "string" ? args[0].toLowerCase() : args[0],
      custodyAccount,
      "REDEMPTION_CALL_PLAN",
      `${path}.calldata`,
      "WCOL unwrap recipient must be the execution custody account",
    );
    requireSame(
      args[1],
      previousMinimum,
      "REDEMPTION_CALL_PLAN",
      `${path}.calldata`,
      "WCOL unwrap amount must equal the preceding declared output",
    );
    expectedCalldata = encodeFunctionData({
      abi: WCOL_UNWRAP_ABI,
      functionName: "unwrap",
      args: [custodyAccount as Address, previousMinimum],
    });
  } else {
    try {
      decoded = decodeFunctionData({ abi: COLLATERAL_ONRAMP_ABI, data: calldata });
    } catch {
      fail("REDEMPTION_CALL_PLAN", `${path}.calldata`, "cannot decode collateral-onramp calldata");
    }
    const args = decoded.args as readonly unknown[];
    requireSame(
      typeof args[0] === "string" ? args[0].toLowerCase() : args[0],
      redemption.usdce,
      "REDEMPTION_CALL_PLAN",
      `${path}.calldata`,
      "onramp asset must be USDC.e",
    );
    requireSame(
      typeof args[1] === "string" ? args[1].toLowerCase() : args[1],
      custodyAccount,
      "REDEMPTION_CALL_PLAN",
      `${path}.calldata`,
      "onramp recipient must be the execution custody account",
    );
    requireSame(
      args[2],
      previousMinimum,
      "REDEMPTION_CALL_PLAN",
      `${path}.calldata`,
      "onramp amount must equal the preceding declared output",
    );
    expectedCalldata = encodeFunctionData({
      abi: COLLATERAL_ONRAMP_ABI,
      functionName: "wrap",
      args: [
        stringAt(redemption.usdce, `${path}.redemptionRoute.usdce`) as Address,
        custodyAccount as Address,
        previousMinimum,
      ],
    });
  }

  requireSame(
    calldata,
    expectedCalldata,
    "REDEMPTION_CALL_PLAN",
    `${path}.calldata`,
    "exact call calldata is not the canonical encoding of the bound arguments",
  );
  requireSame(
    call.minimumOutputAmount,
    previousMinimum.toString(),
    "REDEMPTION_CALL_PLAN",
    `${path}.minimumOutputAmount`,
    "a 1:1 stage must preserve the preceding declared output amount",
  );
}

function assertCallPlan(
  redemption: JsonObject,
  execution: JsonObject,
  custody: JsonObject,
  scopedPositions: readonly JsonObject[],
  path: string,
): void {
  const calls = arrayAt(execution.redemptionCalls, `${path}.redemptionCalls`).map((value, index) =>
    objectAt(value, `${path}.redemptionCalls[${index}]`),
  );
  const kind = stringAt(redemption.kind, `${path}.redemptionRoute.kind`);
  const pUsd = stringAt(redemption.accountingOutputToken, `${path}.redemptionRoute.accountingOutputToken`);
  const usdce = stringAt(redemption.usdce, `${path}.redemptionRoute.usdce`);
  const wcol = redemption.wrappedCollateral === null ? null : stringAt(redemption.wrappedCollateral, `${path}.redemptionRoute.wrappedCollateral`);
  let expected: Array<[string, string]>;
  if (kind === "ctf-exchange-bound-factory" || kind === "neg-risk-exchange-bound-factory") {
    expected = [[stringAt(redemption.entrypoint, `${path}.redemptionRoute.entrypoint`), pUsd]];
  } else if (kind === "direct-ctf-onramp") {
    expected = [
      [stringAt(redemption.entrypoint, `${path}.redemptionRoute.entrypoint`), usdce],
      [stringAt(redemption.onramp, `${path}.redemptionRoute.onramp`), pUsd],
    ];
  } else if (kind === "neg-risk-adapter-onramp") {
    expected = [
      [stringAt(redemption.entrypoint, `${path}.redemptionRoute.entrypoint`), usdce],
      [stringAt(redemption.onramp, `${path}.redemptionRoute.onramp`), pUsd],
    ];
  } else if (kind === "neg-risk-direct-ctf-onramp" && wcol !== null) {
    expected = [
      [stringAt(redemption.entrypoint, `${path}.redemptionRoute.entrypoint`), wcol],
      [wcol, usdce],
      [stringAt(redemption.onramp, `${path}.redemptionRoute.onramp`), pUsd],
    ];
  } else {
    fail("REDEMPTION_CALL_PLAN", path, `unsupported redemption kind ${kind}`);
  }
  if (calls.length !== expected.length) {
    fail("REDEMPTION_CALL_PLAN", `${path}.redemptionCalls`, "call count does not match the selected route");
  }
  calls.forEach((call, index) => {
    requireSame(call.target, expected[index][0], "REDEMPTION_CALL_PLAN", `${path}.redemptionCalls[${index}].target`, "call target does not match route sequence");
    requireSame(call.expectedOutputToken, expected[index][1], "REDEMPTION_CALL_PLAN", `${path}.redemptionCalls[${index}].expectedOutputToken`, "call output token does not match route sequence");
    requireSame(call.value, "0", "REDEMPTION_CALL_PLAN", `${path}.redemptionCalls[${index}].value`, "redemption calls must not transfer native value");
  });
  if (calls[0].calldataState !== "exact") {
    fail(
      "REDEMPTION_CALL_PLAN",
      `${path}.redemptionCalls[0].calldataState`,
      "the first redemption call has no prior payout dependency and must be exact",
    );
  }
  assertExactFirstCalldata(
    redemption,
    execution,
    scopedPositions,
    calls[0],
    `${path}.redemptionCalls[0]`,
  );
  for (let index = 1; index < calls.length; index += 1) {
    assertExactOneToOneCalldata(
      redemption,
      custody,
      calls[index - 1],
      calls[index],
      kind,
      index,
      `${path}.redemptionCalls[${index}]`,
    );
  }
}

function assertRedemptionAuthorities(
  redemption: JsonObject,
  execution: JsonObject,
  custody: JsonObject,
  scopedPositions: readonly JsonObject[],
  approvalsByKey: ReadonlyMap<string, JsonObject>,
  requiredOnrampAllowances: Map<string, bigint>,
  requiredWrapperAuthorities: Set<string>,
  path: string,
): void {
  const kind = stringAt(redemption.kind, `${path}.redemptionRoute.kind`);
  const custodyAccount = stringAt(custody.custodyAccount, `${path}.custodyAccount`);
  const ctf = stringAt(redemption.conditionalTokens, `${path}.redemptionRoute.conditionalTokens`);
  const entrypoint = stringAt(redemption.entrypoint, `${path}.redemptionRoute.entrypoint`);
  if (
    kind === "ctf-exchange-bound-factory"
    || kind === "neg-risk-adapter-onramp"
    || kind === "neg-risk-exchange-bound-factory"
  ) {
    const approval = approvalsByKey.get(`${ctf}|${custodyAccount}|${entrypoint}`);
    if (approval === undefined || approval.approved !== true) {
      fail(
        "REDEMPTION_CALL_PLAN",
        path,
        "redemption entrypoint lacks the pinned active CTF approval needed to pull custody positions",
      );
    }
  }
  if (kind === "neg-risk-exchange-bound-factory") {
    const legacyAdapter = stringAt(redemption.negRiskAdapter, `${path}.redemptionRoute.negRiskAdapter`);
    const nestedApproval = approvalsByKey.get(`${ctf}|${entrypoint}|${legacyAdapter}`);
    if (nestedApproval === undefined || nestedApproval.approved !== true) {
      fail(
        "REDEMPTION_CALL_PLAN",
        path,
        "negative-risk factory lacks the pinned CTF approval needed by its legacy adapter",
      );
    }
  }

  const wrapper = redemption.onramp === null
    ? entrypoint
    : stringAt(redemption.onramp, `${path}.redemptionRoute.onramp`);
  requiredWrapperAuthorities.add(
    `${stringAt(redemption.accountingOutputToken, `${path}.redemptionRoute.accountingOutputToken`)}|${wrapper}|wrapper`,
  );

  if (redemption.onramp === null) return;
  const usdce = stringAt(redemption.usdce, `${path}.redemptionRoute.usdce`);
  const allowanceKey = `${usdce}|${custodyAccount}|${wrapper}`;
  const calls = arrayAt(execution.redemptionCalls, `${path}.redemptionCalls`);
  const onrampCall = objectAt(calls[calls.length - 1], `${path}.redemptionCalls[${calls.length - 1}]`);
  let required: bigint;
  if (onrampCall.calldataState === "exact") {
    required = uintAt(onrampCall.minimumOutputAmount, `${path}.redemptionCalls.minimumOutputAmount`);
  } else {
    const binaryTotals: [bigint, bigint] = [0n, 0n];
    scopedPositions.forEach((entry) => {
      const position = positionRecord(entry, `${path}.coveredPosition`);
      const slot = position.indexSet === "1" ? 0 : 1;
      binaryTotals[slot] = addUint(
        binaryTotals[slot],
        uintAt(position.quantity, `${path}.coveredPosition.quantity`),
        `${path}.coveredPosition.quantity`,
      );
    });
    required = binaryTotals[0] > binaryTotals[1] ? binaryTotals[0] : binaryTotals[1];
  }
  requiredOnrampAllowances.set(
    allowanceKey,
    addUint(requiredOnrampAllowances.get(allowanceKey) ?? 0n, required, `${path}.onrampAllowance`),
  );
}

type RedemptionValidation = {
  usedRoutes: Set<string>;
  resolutionByCondition: Map<string, boolean>;
};

function assertPayoutState(
  execution: JsonObject,
  scopedPositions: readonly JsonObject[],
  path: string,
): { resolved: boolean; fingerprint: string } {
  const payoutNumerators = arrayAt(
    execution.payoutNumerators,
    `${path}.payoutNumerators`,
  ).map((value, index) => uintAt(value, `${path}.payoutNumerators[${index}]`));
  if (payoutNumerators.length !== 2) {
    fail(
      "PAYOUT_STATE_MISMATCH",
      `${path}.payoutNumerators`,
      "the binary venue profile requires exactly two CTF payout numerators",
    );
  }
  const payoutDenominator = uintAt(
    execution.payoutDenominator,
    `${path}.payoutDenominator`,
  );
  const fingerprint = `${payoutDenominator}:${payoutNumerators.join(",")}`;
  if (payoutDenominator === 0n) {
    if (payoutNumerators.some((numerator) => numerator !== 0n)) {
      fail(
        "PAYOUT_STATE_MISMATCH",
        `${path}.payoutNumerators`,
        "an unresolved CTF condition must have two zero payout numerators",
      );
    }
    return { resolved: false, fingerprint };
  }

  let payoutNumeratorSum = 0n;
  for (const numerator of payoutNumerators) {
    payoutNumeratorSum = addUint(
      payoutNumeratorSum,
      numerator,
      `${path}.payoutNumerators`,
    );
  }
  if (payoutNumeratorSum !== payoutDenominator) {
    fail(
      "PAYOUT_STATE_MISMATCH",
      `${path}.payoutNumerators`,
      "resolved CTF payout numerators do not sum to the denominator",
    );
  }
  if (
    execution.marketKind === "negative-risk"
    && !(
      payoutDenominator === 1n
      && (
        (payoutNumerators[0] === 1n && payoutNumerators[1] === 0n)
        || (payoutNumerators[0] === 0n && payoutNumerators[1] === 1n)
      )
    )
  ) {
    fail(
      "PAYOUT_STATE_MISMATCH",
      `${path}.payoutNumerators`,
      "a resolved negative-risk condition requires [1,0] or [0,1] with denominator 1",
    );
  }

  let expectedOutput = 0n;
  for (const entry of scopedPositions) {
    const position = positionRecord(entry, `${path}.coveredPosition`);
    try {
      expectedOutput = addUint(
        expectedOutput,
        ctfRedemptionPayout(
          uintAt(position.quantity, `${path}.coveredPosition.quantity`),
          uintAt(position.indexSet, `${path}.coveredPosition.indexSet`),
          payoutNumerators,
          payoutDenominator,
        ),
        `${path}.redemptionCalls[0].minimumOutputAmount`,
      );
    } catch (error) {
      fail(
        "PAYOUT_STATE_MISMATCH",
        `${path}.payoutNumerators`,
        error instanceof Error ? error.message : "invalid CTF payout state",
      );
    }
  }

  const calls = arrayAt(execution.redemptionCalls, `${path}.redemptionCalls`).map(
    (value, index) => objectAt(value, `${path}.redemptionCalls[${index}]`),
  );
  calls.forEach((call, index) => {
    if (call.calldataState !== "exact") {
      fail(
        "PAYOUT_STATE_MISMATCH",
        `${path}.redemptionCalls[${index}].calldataState`,
        "a resolved condition cannot retain resolution-dependent calldata",
      );
    }
  });
  requireSame(
    calls[0].minimumOutputAmount,
    expectedOutput.toString(),
    "PAYOUT_STATE_MISMATCH",
    `${path}.redemptionCalls[0].minimumOutputAmount`,
    "the first redemption-call output does not equal the pinned CTF payout",
  );
  return { resolved: true, fingerprint };
}

function assertRedemptions(
  executions: readonly JsonObject[],
  positions: readonly JsonObject[],
  custodyById: ReadonlyMap<string, JsonObject>,
  routeById: ReadonlyMap<string, JsonObject>,
  redemptionById: ReadonlyMap<string, JsonObject>,
  collateral: JsonObject,
  approvals: readonly JsonObject[],
  allowances: readonly JsonObject[],
  authorities: readonly JsonObject[],
): RedemptionValidation {
  const usedRoutes = new Set<string>();
  const payoutFingerprintByCondition = new Map<string, string>();
  const resolutionByCondition = new Map<string, boolean>();
  const executionByScope = new Map<string, JsonObject>();
  const sweptConditionByRoute = new Map<string, string>();
  const approvalsByKey = new Map<string, JsonObject>();
  approvals.forEach((approval, index) =>
    approvalsByKey.set(approvalKey(approval, `$.erc1155Approvals[${index}]`), approval),
  );
  const allowancesByKey = new Map<string, JsonObject>();
  allowances.forEach((allowance, index) =>
    allowancesByKey.set(allowanceKey(allowance, `$.erc20Allowances[${index}]`), allowance),
  );
  const authoritiesByKey = new Map<string, JsonObject>();
  authorities.forEach((authority, index) =>
    authoritiesByKey.set(authorityKey(authority, `$.authorities[${index}]`), authority),
  );
  const requiredOnrampAllowances = new Map<string, bigint>();
  const requiredWrapperAuthorities = new Set<string>();
  requiredWrapperAuthorities.add(
    `${stringAt(collateral.accountingToken, "$.collateralConfig.accountingToken")}|${stringAt(collateral.offramp, "$.collateralConfig.offramp")}|wrapper`,
  );
  executions.forEach((execution, index) => {
    const path = `$.redemptionExecutions[${index}]`;
    requireRef(custodyById, execution.custodyConfigId, `${path}.custodyConfigId`);
    const scope = tupleKey(
      stringAt(execution.custodyConfigId, `${path}.custodyConfigId`),
      stringAt(execution.conditionId, `${path}.conditionId`),
    );
    if (executionByScope.has(scope)) fail("REDEMPTION_SCOPE", path, "more than one execution consumes the same custody and condition scope");
    executionByScope.set(scope, execution);
  });

  const positionsByScope = new Map<string, JsonObject[]>();
  positions.forEach((position, index) => {
    const path = `$.positions[${index}]`;
    const scope = positionScope(position, path);
    const bucket = positionsByScope.get(scope) ?? [];
    bucket.push(position);
    positionsByScope.set(scope, bucket);
  });
  if (executionByScope.size !== positionsByScope.size) {
    fail("REDEMPTION_COVERAGE", "$.redemptionExecutions", "execution scopes do not equal held custody and condition scopes");
  }

  const consumedPositionKeys = new Set<string>();
  for (const [scope, scopedPositions] of positionsByScope) {
    const execution = executionByScope.get(scope);
    if (execution === undefined) fail("REDEMPTION_COVERAGE", "$.redemptionExecutions", `missing execution for ${scope}`);
    const executionId = stringAt(execution.redemptionExecutionId, "redemption execution id");
    const custody = requireRef(
      custodyById,
      execution.custodyConfigId,
      `$.redemptionExecutions.${executionId}.custodyConfigId`,
    );
    const expectedIds = scopedPositions.map((entry) => stringAt(positionRecord(entry, "position").positionId, "position id"));
    expectedIds.sort(numericStringCompare);
    const coveredIds = arrayAt(execution.coveredPositionIds, "coveredPositionIds").map((id, index) =>
      stringAt(id, `coveredPositionIds[${index}]`),
    );
    assertSortedUnique(coveredIds, numericStringCompare, (value) => value, `$.redemptionExecutions.${executionId}.coveredPositionIds`);
    if (coveredIds.length !== expectedIds.length || coveredIds.some((id, index) => id !== expectedIds[index])) {
      fail("REDEMPTION_COVERAGE", `$.redemptionExecutions.${executionId}.coveredPositionIds`, "execution does not cover exactly the held positions in its custody and condition scope");
    }
    const marketKinds = new Set(scopedPositions.map((entry) => stringAt(entry.marketKind, "position market kind")));
    if (marketKinds.size !== 1 || !marketKinds.has(stringAt(execution.marketKind, "execution market kind"))) {
      fail("REDEMPTION_SCOPE", `$.redemptionExecutions.${executionId}.marketKind`, "execution market kind differs from covered positions");
    }
    const tradingRoutes = new Set(scopedPositions.map((entry) => stringAt(entry.routeId, "position route id")));
    if (tradingRoutes.size !== 1) {
      fail("REDEMPTION_SCOPE", `$.redemptionExecutions.${executionId}`, "one execution cannot mix exchange routes");
    }
    scopedPositions.forEach((entry) => {
      requireSame(entry.redemptionExecutionId, executionId, "REDEMPTION_COVERAGE", "$.positions.redemptionExecutionId", "position points to a different redemption execution");
      const key = positionKey(entry, "position");
      if (consumedPositionKeys.has(key)) fail("REDEMPTION_COVERAGE", "$.positions", "position is consumed by more than one call plan");
      consumedPositionKeys.add(key);
    });

    const redemption = requireRef(redemptionById, execution.redemptionRouteId, `$.redemptionExecutions.${executionId}.redemptionRouteId`);
    const redemptionRouteId = stringAt(execution.redemptionRouteId, "redemption route id");
    usedRoutes.add(redemptionRouteId);
    const conditionId = stringAt(execution.conditionId, "execution condition id");
    if (arrayAt(redemption.sweepBalances, "redemption sweep balances").length > 0) {
      const priorCondition = sweptConditionByRoute.get(redemptionRouteId);
      if (priorCondition !== undefined && priorCondition !== conditionId) {
        fail(
          "REDEMPTION_ROUTE_MISMATCH",
          `$.redemptionExecutions.${executionId}.redemptionRouteId`,
          "a swept redemption config cannot be reused across condition ids",
        );
      }
      sweptConditionByRoute.set(redemptionRouteId, conditionId);
    }
    requireSame(redemption.marketKind, execution.marketKind, "REDEMPTION_ROUTE_MISMATCH", `$.redemptionExecutions.${executionId}.marketKind`, "execution and redemption route market kinds differ");
    const route = requireRef(routeById, [...tradingRoutes][0], `$.redemptionExecutions.${executionId}.exchangeRoute`);
    assertRouteConsistency(route, redemption, collateral, `$.redemptionConfigs.${redemptionRouteId}`);
    assertCallPlan(
      redemption,
      execution,
      custody,
      scopedPositions,
      `$.redemptionExecutions.${executionId}`,
    );
    const payoutState = assertPayoutState(
      execution,
      scopedPositions,
      `$.redemptionExecutions.${executionId}`,
    );
    const priorPayoutFingerprint = payoutFingerprintByCondition.get(conditionId);
    if (
      priorPayoutFingerprint !== undefined
      && priorPayoutFingerprint !== payoutState.fingerprint
    ) {
      fail(
        "PAYOUT_STATE_MISMATCH",
        `$.redemptionExecutions.${executionId}.payoutNumerators`,
        "custody scopes for one condition contain conflicting CTF payout state",
      );
    }
    payoutFingerprintByCondition.set(conditionId, payoutState.fingerprint);
    resolutionByCondition.set(conditionId, payoutState.resolved);
    assertRedemptionAuthorities(
      redemption,
      execution,
      custody,
      scopedPositions,
      approvalsByKey,
      requiredOnrampAllowances,
      requiredWrapperAuthorities,
      `$.redemptionExecutions.${executionId}`,
    );
    assertSweepSet(redemption, conditionId, `$.redemptionConfigs.${redemptionRouteId}`);
  }
  for (const [key, required] of requiredOnrampAllowances) {
    const allowance = allowancesByKey.get(key);
    if (allowance === undefined) {
      fail(
        "REDEMPTION_CALL_PLAN",
        "$.erc20Allowances",
        `onramp route lacks a pinned USDC.e allowance for ${key}`,
      );
    }
    if (uintAt(allowance.amount, "$.erc20Allowances.amount") < required) {
      fail(
        "REDEMPTION_CALL_PLAN",
        "$.erc20Allowances",
        `pinned USDC.e allowance is below the aggregate redemption requirement for ${key}`,
      );
    }
  }
  for (const key of requiredWrapperAuthorities) {
    const authority = authoritiesByKey.get(key);
    if (authority === undefined || authority.active !== true) {
      fail(
        "REDEMPTION_CALL_PLAN",
        "$.authorities",
        `redemption route lacks the pinned active pUSD wrapper authority ${key}`,
      );
    }
  }
  return { usedRoutes, resolutionByCondition };
}

function approvalKey(record: JsonObject, path: string): string {
  return `${stringAt(record.tokenContract, `${path}.tokenContract`)}|${stringAt(record.owner, `${path}.owner`)}|${stringAt(record.operator, `${path}.operator`)}`;
}

function allowanceKey(record: JsonObject, path: string): string {
  return `${stringAt(record.token, `${path}.token`)}|${stringAt(record.owner, `${path}.owner`)}|${stringAt(record.spender, `${path}.spender`)}`;
}

function authorityKey(record: JsonObject, path: string): string {
  return `${stringAt(record.contract, `${path}.contract`)}|${stringAt(record.account, `${path}.account`)}|${stringAt(record.role, `${path}.role`)}`;
}

function assertExpectedAuthorityIdentities(
  authorities: readonly JsonObject[],
  expected: readonly PolymarketAuthorityIdentity[] | undefined,
  scope: "diagnostic" | "settlement",
): void {
  if (expected === undefined) {
    if (scope === "settlement") {
      fail(
        "AUTHORITY_SET_MISMATCH",
        "options.expectedAuthorityIdentities",
        "settlement validation requires the independently reconstructed authority-candidate set",
      );
    }
    return;
  }
  const expectedRecords = expected.map((entry, index) => {
    const path = `options.expectedAuthorityIdentities[${index}]`;
    const record = objectAt(entry, path);
    assertClosedKeys(record, ["contract", "account", "role"], path);
    const contract = stringAt(record.contract, `${path}.contract`);
    const account = stringAt(record.account, `${path}.account`);
    const role = stringAt(record.role, `${path}.role`);
    if (!/^0x(?!0{40}$)[0-9a-f]{40}$/.test(contract)) {
      fail("AUTHORITY_SET_MISMATCH", `${path}.contract`, "expected authority contract is not a lowercase nonzero address");
    }
    if (!/^0x(?!0{40}$)[0-9a-f]{40}$/.test(account)) {
      fail("AUTHORITY_SET_MISMATCH", `${path}.account`, "expected authority account is not a lowercase nonzero address");
    }
    if (role.length === 0) {
      fail("AUTHORITY_SET_MISMATCH", `${path}.role`, "expected authority role is empty");
    }
    return record;
  });
  assertSortedUnique(
    expectedRecords,
    (left, right) => compareText(authorityKey(left, "expected authority"), authorityKey(right, "expected authority")),
    (entry) => authorityKey(entry, "expected authority"),
    "options.expectedAuthorityIdentities",
  );
  const actualKeys = authorities.map((entry, index) => authorityKey(entry, `$.authorities[${index}]`));
  const expectedKeys = expectedRecords.map((entry, index) => authorityKey(
    entry,
    `options.expectedAuthorityIdentities[${index}]`,
  ));
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(
      "AUTHORITY_SET_MISMATCH",
      "$.authorities",
      "recorded authority identities do not equal the independently reconstructed candidate set",
    );
  }
}

function assertOrderCommitments(
  commitments: readonly JsonObject[],
  custodyById: ReadonlyMap<string, JsonObject>,
  routeById: ReadonlyMap<string, JsonObject>,
  positions: readonly JsonObject[],
  approvals: readonly JsonObject[],
  allowances: readonly JsonObject[],
): { reservedSells: Map<string, bigint>; reservedBuys: bigint; usedRoutes: Set<string> } {
  const reservedSells = new Map<string, bigint>();
  let reservedBuys = 0n;
  const usedRoutes = new Set<string>();

  const approvalsByKey = new Map<string, JsonObject>();
  approvals.forEach((approval, index) => approvalsByKey.set(approvalKey(approval, `$.erc1155Approvals[${index}]`), approval));
  const allowancesByKey = new Map<string, JsonObject>();
  allowances.forEach((allowance, index) => allowancesByKey.set(allowanceKey(allowance, `$.erc20Allowances[${index}]`), allowance));

  const positionByCustodyAndId = new Map<string, JsonObject>();
  positions.forEach((entry, index) => {
    const position = positionRecord(entry, `$.positions[${index}]`);
    positionByCustodyAndId.set(`${position.custodyAccount}|${position.positionId}`, entry);
  });

  const orderHashes = new Set<string>();
  const pauseStates = new Map<string, string>();
  positions.forEach((entry, index) => {
    const pair = tupleKey(String(entry.custodyConfigId), String(entry.routeId));
    const pause = tupleKey(String(entry.userPausedBlockAt), String(entry.isUserPaused));
    const prior = pauseStates.get(pair);
    if (prior !== undefined && prior !== pause) {
      fail("ORDER_BINDING", `$.positions[${index}]`, "positions disagree on exchange user-pause state");
    }
    pauseStates.set(pair, pause);
  });

  commitments.forEach((commitment, index) => {
    const path = `$.orderCommitments[${index}]`;
    const custodyId = stringAt(commitment.custodyConfigId, `${path}.custodyConfigId`);
    const custody = requireRef(custodyById, custodyId, `${path}.custodyConfigId`);
    const routeId = stringAt(commitment.routeId, `${path}.routeId`);
    const route = requireRef(routeById, routeId, `${path}.routeId`);
    usedRoutes.add(routeId);
    const orderHash = stringAt(commitment.orderHash, `${path}.orderHash`);
    if (orderHashes.has(orderHash)) fail("DUPLICATE_ID", `${path}.orderHash`, "duplicate order hash");
    orderHashes.add(orderHash);
    requireSame(commitment.maker, custody.makerAddress, "ORDER_BINDING", `${path}.maker`, "order maker does not match custody config");
    requireSame(commitment.signer, custody.orderSignerAddress, "ORDER_BINDING", `${path}.signer`, "order signer does not match custody config");
    requireSame(commitment.signatureType, custody.signatureType, "ORDER_BINDING", `${path}.signatureType`, "order signature type does not match custody config");
    const signature = stringAt(commitment.signature, `${path}.signature`);
    if (signature === "0x" || commitment.signatureValid !== true) {
      fail("ORDER_BINDING", `${path}.signature`, "the disclosed signature must be nonempty and verified");
    }
    if (
      custody.walletKind === "deposit-wallet-v2"
      && signature.length >= POLYMARKET_DEPOSIT_SESSION_ENVELOPE_MAGIC.length
      && signature.endsWith(POLYMARKET_DEPOSIT_SESSION_ENVELOPE_MAGIC.slice(2))
    ) {
      fail(
        "ORDER_BINDING",
        `${path}.signature`,
        "version 1 Deposit Wallet orders must use the owner path, not a session-key envelope",
      );
    }
    let expectedHash: string;
    try {
      expectedHash = polymarketV2OrderHash(commitment as unknown as PolymarketV2OrderHashInput, stringAt(route.exchange, `${path}.route.exchange`));
    } catch (error) {
      fail("ORDER_HASH_MISMATCH", `${path}.orderHash`, error instanceof Error ? error.message : "cannot hash order");
    }
    requireSame(orderHash, expectedHash, "ORDER_HASH_MISMATCH", `${path}.orderHash`, "order hash does not match the selected exchange domain and typed fields");

    const makerAmount = uintAt(commitment.makerAmount, `${path}.makerAmount`);
    uintAt(commitment.takerAmount, `${path}.takerAmount`);
    if (makerAmount === 0n) {
      fail("ORDER_STATUS_MISMATCH", `${path}.makerAmount`, "maker amount must be positive");
    }
    const filled = booleanAt(commitment.statusFilled, `${path}.statusFilled`);
    if (filled) {
      fail("ORDER_STATUS_MISMATCH", `${path}.statusFilled`, "the bounded commitment set contains only unfilled orders");
    }
    if (commitment.transferAuthorityActive !== true || commitment.isUserPaused !== false) {
      fail(
        "ORDER_BINDING",
        path,
        "the bounded commitment set contains only currently active orders with unpaused makers",
      );
    }
    const statusRemaining = uintAt(commitment.statusRemaining, `${path}.statusRemaining`);
    if (statusRemaining > (1n << 248n) - 1n) {
      fail("ORDER_STATUS_MISMATCH", `${path}.statusRemaining`, "V2 remaining amount exceeds uint248");
    }
    if (statusRemaining > makerAmount) {
      fail("ORDER_STATUS_MISMATCH", `${path}.statusRemaining`, "remaining maker amount exceeds signed maker amount");
    }
    const expectedRemaining = statusRemaining === 0n ? makerAmount : statusRemaining;
    requireSame(commitment.effectiveRemainingMakerAmount, expectedRemaining.toString(), "ORDER_STATUS_MISMATCH", `${path}.effectiveRemainingMakerAmount`, "effective remaining amount does not match V2 default-status semantics");
    requireSame(commitment.reservedAmount, expectedRemaining.toString(), "ORDER_RESERVE_MISMATCH", `${path}.reservedAmount`, "reserved amount must equal effective remaining maker amount");

    const side = stringAt(commitment.side, `${path}.side`);
    if (side === "0") {
      requireSame(commitment.reservedAssetType, "erc20", "ORDER_RESERVE_MISMATCH", `${path}.reservedAssetType`, "buy orders reserve ERC-20 collateral");
      requireSame(commitment.reservedAssetContract, route.exchangeCollateralToken, "ORDER_RESERVE_MISMATCH", `${path}.reservedAssetContract`, "buy reserve must be route pUSD");
      requireSame(commitment.reservedTokenId, null, "ORDER_RESERVE_MISMATCH", `${path}.reservedTokenId`, "ERC-20 reserve cannot have a token id");
      reservedBuys = addUint(reservedBuys, expectedRemaining, `${path}.reservedAmount`);
      const allowance = allowancesByKey.get(`${commitment.reservedAssetContract}|${commitment.maker}|${route.exchange}`);
      if (allowance === undefined) {
        fail("ORDER_BINDING", `${path}.transferAuthorityActive`, "buy order has no matching pUSD allowance record");
      }
      requireSame(commitment.transferAuthorityActive, uintAt(allowance.amount, `${path}.allowance.amount`) > 0n, "ORDER_BINDING", `${path}.transferAuthorityActive`, "buy transfer-authority state disagrees with allowance");
    } else if (side === "1") {
      requireSame(commitment.reservedAssetType, "erc1155", "ORDER_RESERVE_MISMATCH", `${path}.reservedAssetType`, "sell orders reserve CTF ERC-1155 positions");
      requireSame(commitment.reservedAssetContract, route.ctf, "ORDER_RESERVE_MISMATCH", `${path}.reservedAssetContract`, "sell reserve must use route CTF");
      requireSame(commitment.reservedTokenId, commitment.tokenId, "ORDER_RESERVE_MISMATCH", `${path}.reservedTokenId`, "sell reserve token id must equal the signed order token id");
      const approval = approvalsByKey.get(`${route.ctf}|${commitment.maker}|${route.exchange}`);
      if (approval === undefined) {
        fail("ORDER_BINDING", `${path}.transferAuthorityActive`, "sell order has no matching CTF exchange approval record");
      }
      requireSame(commitment.transferAuthorityActive, approval.approved, "ORDER_BINDING", `${path}.transferAuthorityActive`, "sell transfer-authority state disagrees with ERC-1155 approval");
      const held = positionByCustodyAndId.get(`${commitment.maker}|${commitment.tokenId}`);
      if (held === undefined) fail("ORDER_RESERVE_MISMATCH", `${path}.tokenId`, "unfilled sell order does not reserve a held CTF position");
      requireSame(held.routeId, routeId, "ORDER_RESERVE_MISMATCH", `${path}.routeId`, "sell order route differs from held position route");
      const reserveKey = `${commitment.maker}|${commitment.tokenId}`;
      reservedSells.set(reserveKey, addUint(reservedSells.get(reserveKey) ?? 0n, expectedRemaining, `${path}.reservedAmount`));
    } else {
      fail("ORDER_BINDING", `${path}.side`, "side must be 0 or 1");
    }

    const pair = tupleKey(custodyId, routeId);
    const pause = tupleKey(String(commitment.userPausedBlockAt), String(commitment.isUserPaused));
    const priorPause = pauseStates.get(pair);
    if (priorPause !== undefined && priorPause !== pause) {
      fail("ORDER_BINDING", path, "order and position exchange user-pause states differ");
    }
    pauseStates.set(pair, pause);
  });

  positions.forEach((entry, index) => {
    const path = `$.positions[${index}]`;
    const position = positionRecord(entry, path);
    const key = `${position.custodyAccount}|${position.positionId}`;
    const reserved = reservedSells.get(key) ?? 0n;
    requireSame(entry.reservedQuantity, reserved.toString(), "POSITION_RESERVATION_MISMATCH", `${path}.reservedQuantity`, "reserved quantity does not equal unfilled sell commitments");
  });

  return { reservedSells, reservedBuys, usedRoutes };
}

function freezeReadKey(read: JsonObject, path: string): string {
  return `${stringAt(read.target, `${path}.target`)}|${stringAt(read.calldata, `${path}.calldata`)}|${stringAt(
    read.expectedReturnData,
    `${path}.expectedReturnData`,
  )}`;
}

function assertSettlementFreezes(
  freezes: readonly JsonObject[],
  custodyConfigs: readonly JsonObject[],
  routeConfigs: readonly JsonObject[],
  positions: readonly JsonObject[],
  commitments: readonly JsonObject[],
  approvals: readonly JsonObject[],
  allowances: readonly JsonObject[],
  options: PolymarketVenueSemanticOptions,
): void {
  const byPair = new Map<string, JsonObject>();
  const custodyById = idMap(custodyConfigs, "custodyConfigId", "$.custodyConfigs");
  const routeById = idMap(routeConfigs, "routeId", "$.routeConfigs");
  const positionsByPair = new Map<string, JsonObject[]>();
  positions.forEach((position) => {
    const pair = tupleKey(String(position.custodyConfigId), String(position.routeId));
    const bucket = positionsByPair.get(pair) ?? [];
    bucket.push(position);
    positionsByPair.set(pair, bucket);
  });
  const approvalsByKey = new Map<string, JsonObject>();
  approvals.forEach((approval, index) =>
    approvalsByKey.set(approvalKey(approval, `$.erc1155Approvals[${index}]`), approval),
  );
  const allowancesByKey = new Map<string, JsonObject>();
  allowances.forEach((allowance, index) =>
    allowancesByKey.set(allowanceKey(allowance, `$.erc20Allowances[${index}]`), allowance),
  );
  freezes.forEach((freeze, index) => {
    const path = `$.settlementFreezeConfigs[${index}]`;
    const custodyId = stringAt(freeze.custodyConfigId, `${path}.custodyConfigId`);
    const routeId = stringAt(freeze.routeId, `${path}.routeId`);
    const custody = requireRef(custodyById, custodyId, `${path}.custodyConfigId`);
    const route = requireRef(routeById, routeId, `${path}.routeId`);
    const pair = tupleKey(custodyId, routeId);
    if (byPair.has(pair)) fail("SETTLEMENT_FREEZE_CONFIG", path, "duplicate custody and route freeze predicate");
    byPair.set(pair, freeze);
    requireSame(
      freeze.enforcementMode,
      "settlement-transaction-precondition",
      "SETTLEMENT_FREEZE_CONFIG",
      `${path}.enforcementMode`,
      "freeze must be enforced by the settlement transaction before effects",
    );
    const reads = arrayAt(freeze.predicateReads, `${path}.predicateReads`).map((item, readIndex) =>
      objectAt(item, `${path}.predicateReads[${readIndex}]`),
    );
    const predicate = stringAt(freeze.predicate, `${path}.predicate`);
    let expected: JsonObject[];
    if (predicate === "effective-user-pause") {
      expected = [
        {
          target: route.exchange,
          calldata: encodeFunctionData({
            abi: USER_PAUSE_ABI,
            functionName: "isUserPaused",
            args: [custody.custodyAccount as Address],
          }),
          expectedReturnData: ABI_TRUE,
        },
      ];
      for (const position of positionsByPair.get(pair) ?? []) {
        if (position.isUserPaused !== true || uintAt(position.userPausedBlockAt, `${path}.userPausedBlockAt`) === 0n) {
          fail(
            "SETTLEMENT_FREEZE_CONFIG",
            path,
            "effective pause predicate disagrees with the pinned position pause state",
          );
        }
      }
    } else if (predicate === "transfer-authorities-revoked") {
      expected = [
        {
          target: route.ctf,
          calldata: encodeFunctionData({
            abi: APPROVAL_FOR_ALL_ABI,
            functionName: "isApprovedForAll",
            args: [custody.custodyAccount as Address, route.exchange as Address],
          }),
          expectedReturnData: ABI_FALSE_OR_ZERO,
        },
        {
          target: route.exchangeCollateralToken,
          calldata: encodeFunctionData({
            abi: ALLOWANCE_ABI,
            functionName: "allowance",
            args: [custody.custodyAccount as Address, route.exchange as Address],
          }),
          expectedReturnData: ABI_FALSE_OR_ZERO,
        },
      ];
      const approval = approvalsByKey.get(`${route.ctf}|${custody.custodyAccount}|${route.exchange}`);
      if (approval === undefined || approval.approved !== false) {
        fail(
          "SETTLEMENT_FREEZE_CONFIG",
          path,
          "revocation predicate requires a pinned false CTF exchange approval",
        );
      }
      const allowance = allowancesByKey.get(
        `${route.exchangeCollateralToken}|${custody.custodyAccount}|${route.exchange}`,
      );
      if (allowance === undefined || uintAt(allowance.amount, `${path}.allowance.amount`) !== 0n) {
        fail(
          "SETTLEMENT_FREEZE_CONFIG",
          path,
          "revocation predicate requires a pinned zero pUSD exchange allowance",
        );
      }
    } else {
      fail("SETTLEMENT_FREEZE_CONFIG", `${path}.predicate`, `unsupported predicate ${predicate}`);
    }
    if (reads.length !== expected.length) {
      fail("SETTLEMENT_FREEZE_CONFIG", `${path}.predicateReads`, "freeze predicate has the wrong read count");
    }
    reads.forEach((read, readIndex) => {
      requireSame(read.target, expected[readIndex].target, "SETTLEMENT_FREEZE_CONFIG", `${path}.predicateReads[${readIndex}].target`, "freeze read target mismatch");
      requireSame(read.calldata, expected[readIndex].calldata, "SETTLEMENT_FREEZE_CONFIG", `${path}.predicateReads[${readIndex}].calldata`, "freeze read calldata mismatch");
      requireSame(read.expectedReturnData, expected[readIndex].expectedReturnData, "SETTLEMENT_FREEZE_CONFIG", `${path}.predicateReads[${readIndex}].expectedReturnData`, "freeze expected return data mismatch");
    });
    const readKeys = reads.map((read, readIndex) => freezeReadKey(read, `${path}.predicateReads[${readIndex}]`));
    if (new Set(readKeys).size !== readKeys.length) {
      fail("SETTLEMENT_FREEZE_CONFIG", `${path}.predicateReads`, "freeze contains a duplicate predicate read");
    }
  });

  if (options.verificationScope !== "settlement") return;
  if (custodyConfigs.length === 0) {
    fail("SETTLEMENT_FREEZE_CONFIG", "$.custodyConfigs", "settlement-bearing validation requires custody");
  }
  if (freezes.some((freeze) => freeze.predicate !== "effective-user-pause")) {
    fail(
      "SETTLEMENT_FREEZE_CONFIG",
      "$.settlementFreezeConfigs",
      "settlement-bearing v1 requires effective user pause for every custody and route pair",
    );
  }
  const routeKinds = new Set(routeConfigs.map((route) => route.marketKind));
  if (
    routeConfigs.length !== 2
    || routeKinds.size !== 2
    || !routeKinds.has("standard")
    || !routeKinds.has("negative-risk")
  ) {
    fail("SETTLEMENT_FREEZE_CONFIG", "$.routeConfigs", "settlement-bearing validation requires both supported V2 route branches");
  }
  const expectedPairs = new Set<string>();
  for (const custody of custodyConfigs) {
    for (const route of routeConfigs) {
      expectedPairs.add(tupleKey(String(custody.custodyConfigId), String(route.routeId)));
    }
  }
  if (byPair.size !== expectedPairs.size) {
    fail("SETTLEMENT_FREEZE_CONFIG", "$.settlementFreezeConfigs", "settlement freeze coverage is not the full custody by route cross product");
  }
  for (const pair of expectedPairs) {
    if (!byPair.has(pair)) fail("SETTLEMENT_FREEZE_CONFIG", "$.settlementFreezeConfigs", `missing settlement freeze for ${pair}`);
  }
  const firstFreeze = freezes[0];
  for (let index = 1; index < freezes.length; index += 1) {
    const freeze = freezes[index];
    for (const field of [
      "enforcer",
      "enforcerCodeHash",
      "settlementFunctionSelector",
      "settlementCalldataHash",
      "enforcerSourceCommit",
    ] as const) {
      requireSame(
        freeze[field],
        firstFreeze[field],
        "SETTLEMENT_FREEZE_CONFIG",
        `$.settlementFreezeConfigs[${index}].${field}`,
        "all predicates for one atomic settlement must use the same pinned enforcer",
      );
    }
  }
  commitments.forEach((commitment, index) => {
    if (
      commitment.statusFilled === false
      && commitment.signatureValid === true
      && commitment.transferAuthorityActive === true
      && commitment.isUserPaused === false
    ) {
      fail(
        "SETTLEMENT_FREEZE_CONFIG",
        `$.orderCommitments[${index}]`,
        "settlement-bearing state contains a currently executable signed order",
      );
    }
  });
}

function maximumBinaryPayout(positions: readonly JsonObject[], marketKind: string): bigint {
  const byCondition = new Map<string, [bigint, bigint]>();
  positions.forEach((entry, index) => {
    if (entry.marketKind !== marketKind) return;
    const position = positionRecord(entry, `$.positions[${index}]`);
    const condition = stringAt(position.conditionId, `$.positions[${index}].position.conditionId`);
    const totals = byCondition.get(condition) ?? [0n, 0n];
    const slot = stringAt(position.indexSet, `$.positions[${index}].position.indexSet`) === "1" ? 0 : 1;
    totals[slot] = addUint(totals[slot], uintAt(position.quantity, `$.positions[${index}].position.quantity`), `$.positions[${index}].position.quantity`);
    byCondition.set(condition, totals);
  });
  let result = 0n;
  for (const totals of byCondition.values()) result = addUint(result, totals[0] > totals[1] ? totals[0] : totals[1], "position redemption exposure");
  return result;
}

function assertExposure(
  collateral: JsonObject,
  wrappedCollateral: unknown,
  positions: readonly JsonObject[],
  reservedBuys: bigint,
  pUsdCustodyBalance?: string,
): void {
  const standardRedemption = maximumBinaryPayout(positions, "standard");
  const negativeRedemption = maximumBinaryPayout(positions, "negative-risk");
  const cashExposure =
    pUsdCustodyBalance === undefined
      ? reservedBuys
      : uintAt(pUsdCustodyBalance, "options.pUsdCustodyBalance");
  if (cashExposure < reservedBuys) {
    fail(
      "COLLATERAL_EXPOSURE",
      "options.pUsdCustodyBalance",
      "outer pUSD custody balance is below disclosed buy reservations",
    );
  }
  const required = addUint(
    addUint(standardRedemption, negativeRedemption, "redemption exposure"),
    cashExposure,
    "pUSD exposure",
  );
  const declared = uintAt(collateral.maxUsdceSettlementExposure, "$.collateralConfig.maxUsdceSettlementExposure");
  if (declared < required) {
    fail("COLLATERAL_EXPOSURE", "$.collateralConfig.maxUsdceSettlementExposure", "declared USDC.e settlement exposure is below position redemption and buy-order commitments");
  }
  if (
    uintAt(collateral.vaultUsdceBalance, "$.collateralConfig.vaultUsdceBalance") < declared
    || uintAt(collateral.vaultUsdceAllowance, "$.collateralConfig.vaultUsdceAllowance") < declared
  ) {
    fail("COLLATERAL_EXPOSURE", "$.collateralConfig", "vault USDC.e balance and allowance must each cover declared settlement exposure");
  }
  if (negativeRedemption === 0n) {
    if (wrappedCollateral !== null) fail("WRAPPED_COLLATERAL_EXPOSURE", "$.wrappedCollateralConfig", "wrapped collateral config must be null without negative-risk holdings");
    return;
  }
  const wrapped = objectAt(wrappedCollateral, "$.wrappedCollateralConfig");
  const maximum = uintAt(wrapped.maxRedemptionExposure, "$.wrappedCollateralConfig.maxRedemptionExposure");
  if (maximum < negativeRedemption) {
    fail("WRAPPED_COLLATERAL_EXPOSURE", "$.wrappedCollateralConfig.maxRedemptionExposure", "declared WCOL redemption exposure is below held negative-risk payout exposure");
  }
  if (maximum > uintAt(wrapped.totalSupply, "$.wrappedCollateralConfig.totalSupply")) {
    fail("WRAPPED_COLLATERAL_EXPOSURE", "$.wrappedCollateralConfig.maxRedemptionExposure", "redemption exposure exceeds WCOL total supply");
  }
  if (uintAt(wrapped.underlyingBalance, "$.wrappedCollateralConfig.underlyingBalance") < maximum) {
    fail("WRAPPED_COLLATERAL_EXPOSURE", "$.wrappedCollateralConfig.underlyingBalance", "WCOL underlying balance does not cover declared redemption exposure");
  }
}

function assertAllUsed(
  all: ReadonlyMap<string, JsonObject>,
  used: ReadonlySet<string>,
  path: string,
): void {
  for (const id of all.keys()) {
    if (!used.has(id)) fail("UNUSED_CONFIG", path, `unused config ${id}`);
  }
}

const SETTLEMENT_CALL_OPTION_KEYS = [
  "strategyCustodyAccounts",
  "pUsdCustodyBalance",
  "fundingSourceAccounts",
  "expectedAuthorityIdentities",
  "strategyCustodyTargetCallCount",
  "strategyCustodyOriginCallCount",
  "safeDelegatecallCount",
  "stateChangingV2CallCount",
  "custodyChecks",
] as const;

const SETTLEMENT_CUSTODY_CHECK_KEYS = [
  "custodyConfigId",
  "custodyAccount",
  "preProxyRuntimeCodeHash",
  "postProxyRuntimeCodeHash",
  "masterCopyCalldata",
  "preMasterCopyReturnData",
  "postMasterCopyReturnData",
  "preImplementation",
  "postImplementation",
  "preImplementationCodeHash",
  "postImplementationCodeHash",
  "preControllers",
  "postControllers",
  "preThreshold",
  "postThreshold",
  "preModules",
  "postModules",
  "preGuard",
  "postGuard",
  "preFallbackHandler",
  "postFallbackHandler",
  "preNonce",
  "postNonce",
] as const;

function settlementEvidenceStrings(
  value: unknown,
  path: string,
): string[] {
  const strings = arrayAt(value, path).map((item, index) =>
    stringAt(item, `${path}[${index}]`),
  );
  assertSortedUnique(strings, compareText, (item) => item, path);
  return strings;
}

function settlementFundingSourceAccounts(
  custodyConfigs: readonly JsonObject[],
  value: unknown,
  path: string,
): string[] {
  const custodyAccounts = new Set(
    custodyConfigs.map((custody, index) =>
      stringAt(custody.custodyAccount, `$.custodyConfigs[${index}].custodyAccount`),
    ),
  );
  const fundingSourceAccounts = settlementEvidenceStrings(value, path);
  fundingSourceAccounts.forEach((account, index) => {
    if (!/^0x(?!0{40}$)[0-9a-f]{40}$/.test(account)) {
      fail(
        "SETTLEMENT_FREEZE_CONFIG",
        `${path}[${index}]`,
        "funding source must be a lowercase nonzero address",
      );
    }
    if (custodyAccounts.has(account)) {
      fail(
        "SETTLEMENT_FREEZE_CONFIG",
        `${path}[${index}]`,
        "strategy custody cannot be a normal-roll funding source in venue profile version 1",
      );
    }
  });
  return fundingSourceAccounts;
}

function requireSameStringArray(
  actual: readonly string[],
  expected: readonly string[],
  path: string,
  detail: string,
): void {
  if (
    actual.length !== expected.length
    || actual.some((value, index) => value !== expected[index])
  ) {
    fail("SETTLEMENT_FREEZE_CONFIG", path, detail);
  }
}

function assertPrefundedSettlementEvidence(
  state: JsonObject,
  options: PolymarketSettlementCallOptions,
): void {
  const optionRecord = objectAt(options, "settlementCall.options");
  assertClosedKeys(optionRecord, SETTLEMENT_CALL_OPTION_KEYS, "settlementCall.options");
  const custodyConfigs = recordsAt(state, "custodyConfigs");
  const custodyById = idMap(custodyConfigs, "custodyConfigId", "$.custodyConfigs");

  settlementFundingSourceAccounts(
    custodyConfigs,
    options.fundingSourceAccounts,
    "settlementCall.options.fundingSourceAccounts",
  );

  for (const field of [
    "strategyCustodyTargetCallCount",
    "strategyCustodyOriginCallCount",
    "safeDelegatecallCount",
    "stateChangingV2CallCount",
  ] as const) {
    if (uintAt(options[field], `settlementCall.options.${field}`) !== 0n) {
      fail(
        "SETTLEMENT_FREEZE_CONFIG",
        `settlementCall.options.${field}`,
        `${field} must be zero during the protected settlement transaction`,
      );
    }
  }

  const checks = arrayAt(options.custodyChecks, "settlementCall.options.custodyChecks")
    .map((value, index) => {
      const path = `settlementCall.options.custodyChecks[${index}]`;
      const check = objectAt(value, path);
      assertClosedKeys(check, SETTLEMENT_CUSTODY_CHECK_KEYS, path);
      return check;
    });
  assertSortedUnique(
    checks,
    (left, right) => compareText(String(left.custodyConfigId), String(right.custodyConfigId)),
    (check) => String(check.custodyConfigId),
    "settlementCall.options.custodyChecks",
  );
  if (checks.length !== custodyConfigs.length) {
    fail(
      "SETTLEMENT_FREEZE_CONFIG",
      "settlementCall.options.custodyChecks",
      "pre/post custody checks do not exactly cover custodyConfigs",
    );
  }
  checks.forEach((check, index) => {
    const path = `settlementCall.options.custodyChecks[${index}]`;
    const custodyId = stringAt(check.custodyConfigId, `${path}.custodyConfigId`);
    const custody = requireRef(custodyById, custodyId, `${path}.custodyConfigId`);
    const custodyAccount = stringAt(custody.custodyAccount, `${path}.custodyAccount`);
    const implementation = stringAt(custody.implementation, `${path}.implementation`);
    requireSame(check.custodyAccount, custodyAccount, "SETTLEMENT_FREEZE_CONFIG", `${path}.custodyAccount`, "custody check account mismatch");
    requireSame(check.masterCopyCalldata, "0xa619486e", "SETTLEMENT_FREEZE_CONFIG", `${path}.masterCopyCalldata`, "Safe singleton must be read through native masterCopy()");
    const expectedMasterCopyReturn = `0x${"00".repeat(12)}${implementation.slice(2)}`;

    const configuredControllers = arrayAt(custody.controllers, `${path}.controllers`).map(
      (value, controllerIndex) => stringAt(value, `${path}.controllers[${controllerIndex}]`),
    );
    for (const phase of ["pre", "post"] as const) {
      requireSame(check[`${phase}ProxyRuntimeCodeHash`], custody.runtimeCodeHash, "SETTLEMENT_FREEZE_CONFIG", `${path}.${phase}ProxyRuntimeCodeHash`, `${phase}-settlement Safe proxy code hash mismatch`);
      requireSame(check[`${phase}MasterCopyReturnData`], expectedMasterCopyReturn, "SETTLEMENT_FREEZE_CONFIG", `${path}.${phase}MasterCopyReturnData`, `${phase}-settlement masterCopy() return does not encode the recorded singleton`);
      requireSame(check[`${phase}Implementation`], implementation, "SETTLEMENT_FREEZE_CONFIG", `${path}.${phase}Implementation`, `${phase}-settlement Safe singleton mismatch`);
      requireSame(check[`${phase}ImplementationCodeHash`], custody.implementationCodeHash, "SETTLEMENT_FREEZE_CONFIG", `${path}.${phase}ImplementationCodeHash`, `${phase}-settlement Safe singleton code hash mismatch`);
      const controllers = settlementEvidenceStrings(
        check[`${phase}Controllers`],
        `${path}.${phase}Controllers`,
      );
      requireSameStringArray(
        controllers,
        configuredControllers,
        `${path}.${phase}Controllers`,
        `${phase}-settlement Safe owners differ from the recorded controllers`,
      );
      requireSame(check[`${phase}Threshold`], custody.threshold, "SETTLEMENT_FREEZE_CONFIG", `${path}.${phase}Threshold`, `${phase}-settlement Safe threshold changed`);
      const modules = settlementEvidenceStrings(
        check[`${phase}Modules`],
        `${path}.${phase}Modules`,
      );
      requireSameStringArray(
        modules,
        [],
        `${path}.${phase}Modules`,
        `${phase}-settlement Safe modules must remain empty`,
      );
      requireSame(check[`${phase}Guard`], null, "SETTLEMENT_FREEZE_CONFIG", `${path}.${phase}Guard`, `${phase}-settlement Safe guard must remain null`);
      requireSame(check[`${phase}FallbackHandler`], null, "SETTLEMENT_FREEZE_CONFIG", `${path}.${phase}FallbackHandler`, `${phase}-settlement Safe fallback handler must remain null`);
    }
    const preNonce = uintAt(check.preNonce, `${path}.preNonce`);
    requireSame(check.preNonce, custody.nonce, "SETTLEMENT_FREEZE_CONFIG", `${path}.preNonce`, "pre-settlement Safe nonce differs from the pinned nonce");
    if (uintAt(check.postNonce, `${path}.postNonce`) !== preNonce) {
      fail(
        "SETTLEMENT_FREEZE_CONFIG",
        `${path}.postNonce`,
        "Safe nonce changed during a settlement that forbids custody calls",
      );
    }
  });
}

/**
 * Applies the cross-field rules for `venue/polymarket/1` after JSON Schema
 * validation. It throws a coded error on the first failure.
 *
 * `orderCommitments` is only the bounded set disclosed to the record. The
 * verifier never treats CLOB emptiness or that array as proof that no other
 * signature exists. For Deposit Wallet commitments, the helper also rejects
 * the session-envelope magic suffix so version 1 remains owner-only.
 * Settlement-bearing validation instead requires a complete set of
 * chain-enforced freeze predicates.
 *
 * When `strategyCustodyAccounts` is supplied, it must be the independently
 * derived, sorted account set from the active component generation and is
 * checked one-to-one against `custodyConfigs`. Settlement-bearing validation
 * requires that input. A diagnostic validation without it checks internal
 * consistency only and makes no custody-completeness claim. The caller must
 * select either `diagnostic` or `settlement`; there is no default scope.
 * Diagnostic validation is nonconforming. Settlement scope applies the venue
 * checks required by L1 and higher levels, but this helper is not an
 * end-to-end PMVS verifier.
 *
 * Settlement-bearing validation also requires the authenticated Core
 * funding-source account set. The caller must derive it from the active Core
 * generation and its capture-block state. This helper requires that set to be
 * sorted, unique, and disjoint from strategy custody; Core verifies balances,
 * encumbrances, reserve funding, and exact settlement deltas.
 *
 * Without `pUsdCustodyBalance`, the USDC.e exposure check is a conservative
 * lower-bound test using disclosed buy reserves. An outer verifier can pass the
 * complete pUSD custody balance to cover cash that is not reserved by an order.
 *
 * The payout vector on each redemption execution selects the valuation path.
 * A zero CTF denominator requires a book for each distinct held asset id. A
 * positive denominator requires an exact redemption output and forbids a book
 * for the resolved position. The caller must authenticate each payout read
 * against the pinned block.
 *
 * Resolution-dependent redemption-call suffixes are not treated as executable
 * calldata here. The outer chain/trace verifier must replace and validate them
 * against the realized first-call payout before a separate valuation or
 * wind-down execution. A version 1 normal roll does not execute these plans.
 *
 * This is a cross-field verifier, not a chain-read verifier. The caller must
 * bind every normalized status, boolean, balance, allowance, approval, getter,
 * and code hash to the exact target, calldata, return data, valuation block,
 * and block hash in the outer PMVS record.
 * In settlement scope, `expectedAuthorityIdentities` must come from that
 * independent reconstruction and must not be copied from `venueState`.
 */
export function assertPolymarketVenueState(
  value: unknown,
  options: PolymarketVenueSemanticOptions,
): asserts value is JsonObject {
  if (
    options === undefined
    || (options.verificationScope !== "diagnostic" && options.verificationScope !== "settlement")
  ) {
    fail(
      "INVALID_SHAPE",
      "options.verificationScope",
      "venue verification requires an explicit diagnostic or settlement scope",
    );
  }
  const state = objectAt(value, "$");
  assertUint256Fields(state);

  const custodyConfigs = recordsAt(state, "custodyConfigs");
  const positions = recordsAt(state, "positions");
  const books = recordsAt(state, "books");
  const routeConfigs = recordsAt(state, "routeConfigs");
  const standardOracleConfigs = recordsAt(state, "standardOracleConfigs");
  const negRiskConfigs = recordsAt(state, "negRiskConfigs");
  const redemptionConfigs = recordsAt(state, "redemptionConfigs");
  const redemptionExecutions = recordsAt(state, "redemptionExecutions");
  const orderCommitments = recordsAt(state, "orderCommitments");
  const settlementFreezeConfigs = recordsAt(state, "settlementFreezeConfigs");
  const erc1155Approvals = recordsAt(state, "erc1155Approvals");
  const erc20Allowances = recordsAt(state, "erc20Allowances");
  const authorities = recordsAt(state, "authorities");
  const responses = recordsAt(state, "responses");
  const collateral = objectAt(state.collateralConfig, "$.collateralConfig");

  assertSortedUnique(custodyConfigs, (a, b) => compareText(String(a.custodyConfigId), String(b.custodyConfigId)), (item) => String(item.custodyConfigId), "$.custodyConfigs");
  assertSortedUnique(positions, (a, b) => {
    const pa = positionRecord(a, "position");
    const pb = positionRecord(b, "position");
    const number = numericStringCompare(String(pa.positionId), String(pb.positionId));
    return number !== 0 ? number : compareText(String(a.custodyConfigId), String(b.custodyConfigId));
  }, (item) => positionKey(item, "position"), "$.positions");
  assertSortedUnique(books, (a, b) => numericStringCompare(String(a.assetId), String(b.assetId)), (item) => String(item.assetId), "$.books");
  assertSortedUnique(routeConfigs, (a, b) => compareText(String(a.routeId), String(b.routeId)), (item) => String(item.routeId), "$.routeConfigs");
  assertSortedUnique(standardOracleConfigs, (a, b) => compareText(String(a.standardOracleConfigId), String(b.standardOracleConfigId)), (item) => String(item.standardOracleConfigId), "$.standardOracleConfigs");
  assertSortedUnique(negRiskConfigs, (a, b) => compareText(String(a.negRiskConfigId), String(b.negRiskConfigId)), (item) => String(item.negRiskConfigId), "$.negRiskConfigs");
  assertSortedUnique(redemptionConfigs, (a, b) => compareText(String(a.redemptionRouteId), String(b.redemptionRouteId)), (item) => String(item.redemptionRouteId), "$.redemptionConfigs");
  assertSortedUnique(redemptionExecutions, (a, b) => compareText(String(a.redemptionExecutionId), String(b.redemptionExecutionId)), (item) => String(item.redemptionExecutionId), "$.redemptionExecutions");
  const compareOrders = (left: JsonObject, right: JsonObject): number => {
    const custody = compareText(String(left.custodyConfigId), String(right.custodyConfigId));
    if (custody !== 0) return custody;
    const route = compareText(String(left.routeId), String(right.routeId));
    if (route !== 0) return route;
    const token = numericStringCompare(String(left.tokenId), String(right.tokenId));
    return token !== 0 ? token : compareText(String(left.orderHash), String(right.orderHash));
  };
  assertSortedUnique(
    orderCommitments,
    compareOrders,
    (item) => String(item.orderHash),
    "$.orderCommitments",
  );
  assertSortedUnique(settlementFreezeConfigs, (a, b) => compareText(String(a.freezeConfigId), String(b.freezeConfigId)), (item) => String(item.freezeConfigId), "$.settlementFreezeConfigs");
  assertSortedUnique(erc1155Approvals, (a, b) => compareText(approvalKey(a, "approval"), approvalKey(b, "approval")), (item) => approvalKey(item, "approval"), "$.erc1155Approvals");
  assertSortedUnique(erc20Allowances, (a, b) => compareText(allowanceKey(a, "allowance"), allowanceKey(b, "allowance")), (item) => allowanceKey(item, "allowance"), "$.erc20Allowances");
  const compareAuthorities = (left: JsonObject, right: JsonObject): number => {
    const contract = compareText(String(left.contract), String(right.contract));
    if (contract !== 0) return contract;
    const account = compareText(String(left.account), String(right.account));
    return account !== 0 ? account : compareText(String(left.role), String(right.role));
  };
  assertSortedUnique(
    authorities,
    compareAuthorities,
    (item) => authorityKey(item, "authority"),
    "$.authorities",
  );
  assertSortedUnique(responses, (a, b) => compareText(String(a.responseHash), String(b.responseHash)), (item) => String(item.responseHash), "$.responses");
  redemptionConfigs.forEach((config, index) => {
    const commits = arrayAt(config.sourceCommits, `$.redemptionConfigs[${index}].sourceCommits`).map(
      (commit, commitIndex) =>
        stringAt(commit, `$.redemptionConfigs[${index}].sourceCommits[${commitIndex}]`),
    );
    assertSortedUnique(
      commits,
      compareText,
      (commit) => commit,
      `$.redemptionConfigs[${index}].sourceCommits`,
    );
  });

  const custodyById = idMap(custodyConfigs, "custodyConfigId", "$.custodyConfigs");
  const routeById = idMap(routeConfigs, "routeId", "$.routeConfigs");
  const standardOracleById = idMap(standardOracleConfigs, "standardOracleConfigId", "$.standardOracleConfigs");
  const negRiskById = idMap(negRiskConfigs, "negRiskConfigId", "$.negRiskConfigs");
  const redemptionById = idMap(redemptionConfigs, "redemptionRouteId", "$.redemptionConfigs");
  const redemptionExecutionById = idMap(
    redemptionExecutions,
    "redemptionExecutionId",
    "$.redemptionExecutions",
  );
  const responseByHash = idMap(responses, "responseHash", "$.responses");

  assertCustodyBindings(custodyConfigs, options);
  assertStrategyCustodyAccounts(custodyConfigs, options);
  assertSettlementCustodyEligibility(custodyConfigs, options);
  assertSettlementFundingSourceAccounts(custodyConfigs, options);
  negRiskConfigs.forEach((config, index) => assertNegRiskConfig(config, `$.negRiskConfigs[${index}]`));
  assertPositionBindings(positions, custodyById, routeById, standardOracleById, negRiskById);
  assertProvenance(erc1155Approvals, erc20Allowances, authorities);
  assertExpectedAuthorityIdentities(
    authorities,
    options.expectedAuthorityIdentities,
    options.verificationScope,
  );

  const orderResult = assertOrderCommitments(
    orderCommitments,
    custodyById,
    routeById,
    positions,
    erc1155Approvals,
    erc20Allowances,
  );
  assertSettlementFreezes(
    settlementFreezeConfigs,
    custodyConfigs,
    routeConfigs,
    positions,
    orderCommitments,
    erc1155Approvals,
    erc20Allowances,
    options,
  );
  const redemptionValidation = assertRedemptions(
    redemptionExecutions,
    positions,
    custodyById,
    routeById,
    redemptionById,
    collateral,
    erc1155Approvals,
    erc20Allowances,
    authorities,
  );
  positions.forEach((entry, index) => {
    const redemptionExecution = requireRef(
      redemptionExecutionById,
      entry.redemptionExecutionId,
      `$.positions[${index}].redemptionExecutionId`,
    );
    requireRef(
      redemptionById,
      redemptionExecution.redemptionRouteId,
      `$.positions[${index}].redemptionExecutionId`,
    );
    if (
      options.verificationScope === "settlement"
      && uintAt(entry.reservedQuantity, `$.positions[${index}].reservedQuantity`) !== 0n
    ) {
      fail(
        "REDEMPTION_RESERVED_POSITION",
        `$.positions[${index}].reservedQuantity`,
        "accepted redemption executions cannot partially consume a reserved position",
      );
    }
  });

  const referencedResponses = new Set<string>();
  assertBooks(
    books,
    positions,
    redemptionValidation.resolutionByCondition,
    routeById,
    responseByHash,
    referencedResponses,
  );
  responses.forEach((response, index) => {
    if (uintAt(response.startedAtMs, `$.responses[${index}].startedAtMs`) > uintAt(response.endedAtMs, `$.responses[${index}].endedAtMs`)) {
      fail("RESPONSE_REFERENCE", `$.responses[${index}]`, "response end precedes response start");
    }
    const uris = arrayAt(response.retrievalUris, `$.responses[${index}].retrievalUris`).map((uri, uriIndex) =>
      stringAt(uri, `$.responses[${index}].retrievalUris[${uriIndex}]`),
    );
    assertSortedUnique(uris, compareText, (item) => item, `$.responses[${index}].retrievalUris`);
  });
  for (const responseHash of responseByHash.keys()) {
    if (!referencedResponses.has(responseHash)) fail("RESPONSE_REFERENCE", "$.responses", `unused response ${responseHash}`);
  }

  const usedCustodies = new Set<string>();
  const usedRoutes = new Set<string>(orderResult.usedRoutes);
  const usedStandardOracles = new Set<string>();
  const usedNegRisk = new Set<string>();
  positions.forEach((entry) => {
    usedCustodies.add(String(entry.custodyConfigId));
    usedRoutes.add(String(entry.routeId));
    if (entry.standardOracleConfigId !== null) usedStandardOracles.add(String(entry.standardOracleConfigId));
    if (entry.negRiskConfigId !== null) usedNegRisk.add(String(entry.negRiskConfigId));
  });
  orderCommitments.forEach((entry) => usedCustodies.add(String(entry.custodyConfigId)));
  settlementFreezeConfigs.forEach((entry) => {
    usedCustodies.add(String(entry.custodyConfigId));
    usedRoutes.add(String(entry.routeId));
  });
  if (options.strategyCustodyAccounts === undefined) {
    assertAllUsed(custodyById, usedCustodies, "$.custodyConfigs");
  }
  if (options.verificationScope !== "settlement") {
    assertAllUsed(routeById, usedRoutes, "$.routeConfigs");
  }
  assertAllUsed(standardOracleById, usedStandardOracles, "$.standardOracleConfigs");
  assertAllUsed(negRiskById, usedNegRisk, "$.negRiskConfigs");
  assertAllUsed(redemptionById, redemptionValidation.usedRoutes, "$.redemptionConfigs");

  if (options.verificationScope === "settlement" && options.pUsdCustodyBalance === undefined) {
    fail(
      "COLLATERAL_EXPOSURE",
      "options.pUsdCustodyBalance",
      "settlement-bearing validation requires the full aggregate pUSD custody balance",
    );
  }
  assertExposure(
    collateral,
    state.wrappedCollateralConfig,
    positions,
    orderResult.reservedBuys,
    options.pUsdCustodyBalance,
  );
}

/**
 * Binds supplied settlement-receipt fields to every freeze predicate in the
 * state. The caller must source `to`, `input`, and `enforcerCodeHash` from the
 * actual transaction receipt and runtime at its receipt block. The outer
 * receipt verifier must also require a canonical successful transaction, its
 * expected authorized sender, zero native value, and exact transaction and
 * block identity. The enforcer itself must be a direct non-proxy without
 * DELEGATECALL. Deposit Wallet custody is diagnostic-only. Version 1 requires
 * claims and fees to be prefunded outside strategy custody before capture. The
 * protected transaction cannot call a strategy-custody account, originate a
 * call from one, or enter a Safe proxy. The outer verifier must derive the
 * closed funding-source set, zero trace counts, and pre/post custody checks
 * from the active Core generation, capture evidence, Core receipt, canonical
 * state, and complete trace. This helper cross-binds those supplied summaries
 * but cannot authenticate them.
 */
export function assertPolymarketSettlementCall(
  value: unknown,
  call: PolymarketSettlementCall,
  options: PolymarketSettlementCallOptions,
): void {
  if (options === undefined || options.strategyCustodyAccounts === undefined) {
    fail(
      "CUSTODY_BINDING",
      "settlementCall.options.strategyCustodyAccounts",
      "settlement-call validation requires the independently derived strategy-custody account set",
    );
  }
  if (options.pUsdCustodyBalance === undefined) {
    fail(
      "COLLATERAL_EXPOSURE",
      "settlementCall.options.pUsdCustodyBalance",
      "settlement-call validation requires the full aggregate pUSD custody balance",
    );
  }
  assertPolymarketVenueState(value, {
    verificationScope: "settlement",
    strategyCustodyAccounts: options.strategyCustodyAccounts,
    fundingSourceAccounts: options.fundingSourceAccounts,
    pUsdCustodyBalance: options.pUsdCustodyBalance,
    expectedAuthorityIdentities: options.expectedAuthorityIdentities,
  });
  const state = objectAt(value, "$");
  const freezes = recordsAt(state, "settlementFreezeConfigs");
  if (freezes.length === 0) {
    fail("SETTLEMENT_FREEZE_CONFIG", "$.settlementFreezeConfigs", "settlement call has no freeze predicates");
  }
  assertPrefundedSettlementEvidence(state, options);
  if (!/^0x(?:[0-9a-f]{2})+$/.test(call.input) || call.input.length < 10) {
    fail("SETTLEMENT_FREEZE_CONFIG", "settlementCall.input", "settlement input has no four-byte selector");
  }
  if (!/^0x(?!0{40}$)[0-9a-f]{40}$/.test(call.to)) {
    fail("SETTLEMENT_FREEZE_CONFIG", "settlementCall.to", "settlement target must be a lowercase nonzero address");
  }
  if (!/^0x(?!0{64}$)[0-9a-f]{64}$/.test(call.enforcerCodeHash)) {
    fail(
      "SETTLEMENT_FREEZE_CONFIG",
      "settlementCall.enforcerCodeHash",
      "receipt-block enforcer code hash must be lowercase nonzero bytes32",
    );
  }
  const selector = call.input.slice(0, 10);
  const calldataHash = keccak256(call.input as Hex);
  freezes.forEach((freeze, index) => {
    requireSame(call.to, freeze.enforcer, "SETTLEMENT_FREEZE_CONFIG", "settlementCall.to", `settlement target does not match freeze enforcer ${index}`);
    requireSame(selector, freeze.settlementFunctionSelector, "SETTLEMENT_FREEZE_CONFIG", "settlementCall.input", `settlement selector does not match freeze selector ${index}`);
    requireSame(
      call.enforcerCodeHash,
      freeze.enforcerCodeHash,
      "SETTLEMENT_FREEZE_CONFIG",
      "settlementCall.enforcerCodeHash",
      `receipt-block code hash does not match freeze enforcer ${index}`,
    );
    requireSame(
      calldataHash,
      freeze.settlementCalldataHash,
      "SETTLEMENT_FREEZE_CONFIG",
      "settlementCall.input",
      `full settlement calldata hash does not match freeze predicate ${index}`,
    );
  });
}
