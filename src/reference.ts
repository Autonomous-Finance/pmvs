// SPDX-License-Identifier: CC0-1.0

import {
  concat,
  encodeAbiParameters,
  encodePacked,
  hashTypedData,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from "viem";

export const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;
export const WAD = 10n ** 18n;

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
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
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

export function recordHash(record: unknown): Hex {
  return keccak256(stringToHex(canonicalize(record)));
}

export function subjectId(chainId: bigint, shareToken: Address): Hex {
  return keccak256(encodePacked(["uint256", "address"], [chainId, shareToken]));
}

export function ctfConditionId(
  oracle: Address,
  questionId: Hex,
  outcomeSlotCount: bigint,
): Hex {
  if (outcomeSlotCount < 2n || outcomeSlotCount > 256n) {
    throw new Error("outcome slot count must be in [2, 256]");
  }
  return keccak256(
    encodePacked(["address", "bytes32", "uint256"], [oracle, questionId, outcomeSlotCount]),
  );
}

export function ctfPositionId(collateralToken: Address, collectionId: Hex): bigint {
  return BigInt(keccak256(encodePacked(["address", "bytes32"], [collateralToken, collectionId])));
}

export function ctfRedemptionPayout(
  quantity: bigint,
  indexSet: bigint,
  payoutNumerators: readonly bigint[],
  payoutDenominator: bigint,
): bigint {
  if (quantity < 0n) throw new Error("quantity must be non-negative");
  if (payoutNumerators.length < 2 || payoutNumerators.length > 256) {
    throw new Error("payout vector length must be in [2, 256]");
  }
  if (payoutDenominator <= 0n) throw new Error("payout denominator must be positive");
  if (payoutNumerators.some((value) => value < 0n)) {
    throw new Error("payout numerator must be non-negative");
  }
  if (payoutNumerators.reduce((sum, value) => sum + value, 0n) !== payoutDenominator) {
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
  return (quantity * positionPayoutNumerator) / payoutDenominator;
}

export type CompatibilityLeafInput = {
  requestId: bigint;
  owner: Address;
  amount: bigint;
  epoch: bigint;
};

export function compatibilityLeaf(input: CompatibilityLeafInput): Hex {
  return keccak256(
    encodePacked(
      ["uint256", "address", "uint256", "uint64"],
      [input.requestId, input.owner, input.amount, input.epoch],
    ),
  );
}

function orderedPair(a: Hex, b: Hex): [Hex, Hex] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

export function compatibilityNode(a: Hex, b: Hex): Hex {
  return keccak256(concat(orderedPair(a, b)));
}

export function compatibilityRoot(leaves: readonly Hex[]): Hex {
  if (leaves.length === 0) return ZERO_HASH;
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
  if (leaves.length === 0) return ZERO_HASH;
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
  if (leaves.length === 0) return ZERO_HASH;
  return keccak256(concat(["0x02", toHex(BigInt(leaves.length), { size: 32 }), pmvsMerkleRawRoot(leaves)]));
}

export function selectionHash(requestIds: readonly bigint[]): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256[]" }], [requestIds]));
}

export function bpsExitCostCap(grossMark: bigint, maxFeeRateBps: bigint): bigint {
  if (grossMark < 0n) throw new Error("gross mark must be non-negative");
  if (maxFeeRateBps <= 0n || maxFeeRateBps >= 10_000n) throw new Error("fee cap must be in [1, 9999]");
  return (grossMark * maxFeeRateBps) / 10_000n;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  if (numerator < 0n) throw new Error("numerator must be non-negative");
  return numerator === 0n ? 0n : (numerator - 1n) / denominator + 1n;
}

export function netPps(gross: bigint, highWaterMark: bigint, feeRate: bigint): bigint {
  if (gross < 0n || highWaterMark < 0n || feeRate < 0n || feeRate > WAD) throw new Error("out of range");
  if (gross <= highWaterMark) return gross;
  const delta = gross - highWaterMark;
  return highWaterMark + ((WAD - feeRate) * delta) / WAD;
}

export function performanceFeeShares(
  gross: bigint,
  highWaterMark: bigint,
  feeRate: bigint,
  supply: bigint,
  finalRoll = false,
): bigint {
  if (gross < 0n || highWaterMark < 0n || feeRate < 0n || feeRate > WAD || supply < 0n) {
    throw new Error("out of range");
  }
  if (gross <= highWaterMark || feeRate === 0n || supply === 0n || finalRoll) return 0n;
  const finalPps = netPps(gross, highWaterMark, feeRate);
  if (finalPps === 0n) throw new Error("zero final price");
  const feePerShare = ceilDiv(feeRate * (gross - highWaterMark), WAD);
  return ceilDiv(supply * feePerShare, finalPps);
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
