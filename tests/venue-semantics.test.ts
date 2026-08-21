// SPDX-License-Identifier: CC0-1.0

import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import {
  encodeFunctionData,
  keccak256,
  type Address,
  type Hex,
} from "viem";

import venueFixture from "../fixtures/venue-polymarket-1.json";
import positionSchema from "../schemas/position-gnosis-ctf-1.schema.json";
import venueSchema from "../schemas/venue-polymarket-1.schema.json";
import {
  assertPolymarketSettlementCall,
  assertPolymarketVenueState as assertPolymarketVenueStateRaw,
  POLYMARKET_DEPOSIT_SESSION_ENVELOPE_MAGIC,
  POLYMARKET_LEGACY_SAFE_PROXY_RUNTIME_CODE_HASH,
  polymarketLegacySafeAddress,
  polymarketV2OrderHash,
  PolymarketVenueSemanticError,
  type PolymarketSettlementCallOptions,
  type PolymarketVenueSemanticOptions,
  type PolymarketVenueSemanticErrorCode,
} from "../src/venue-polymarket-1";
import {
  ctfCollectionId,
  ctfConditionId,
  ctfPositionId,
  ZERO_HASH,
} from "../src/reference";

const CTF: Address = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const PUSD: Address = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const USDCE: Address = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const WCOL: Address = "0x3a3bd7bb9528e159577f7c2e685cc81a765002e2";
const ONRAMP: Address = "0x93070a847efef7f70739046a929d47a521f5b8ee";
const OFFRAMP: Address = "0x2957922eb93258b93368531d39facca3b4dc5854";
const V31_ORACLE: Address = "0x157ce2d672854c848c9b79c49a8cc6cc89176a49";
const DEPOSIT_FACTORY: Address = "0x00000000000fb5c9adea0298d729a0cb3823cc07";
const STANDARD_EXCHANGE: Address = "0xe111180000d2663c0091e4f400237545b87b996b";
const NEGATIVE_EXCHANGE: Address = "0xe2222d279d744050d28e00520010520000310f59";
const STANDARD_FACTORY: Address = "0xada100874d00e3331d00f2007a9c336a65009718";
const NEGATIVE_FACTORY: Address = "0xada200001000ef00d07553cee7006808f895c6f1";
const NEG_RISK_ADAPTER: Address = "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296";
const SAFE_FACTORY: Address = "0xaacfeea03eb1561c4e67d661e40682bd20e3541b";
const SIGNER: Address = "0x2222222222222222222222222222222222222222";
const ACCOUNT = polymarketLegacySafeAddress(SIGNER);
const VAULT: Address = "0x3333333333333333333333333333333333333333";
const FEE_RECEIVER: Address = "0x4444444444444444444444444444444444444444";
const PUSD_ONLY_SIGNER: Address = "0x5555555555555555555555555555555555555555";
const PUSD_ONLY_ACCOUNT = polymarketLegacySafeAddress(PUSD_ONLY_SIGNER);
const OTHER_ACCOUNT: Address = "0x6666666666666666666666666666666666666666";
const CORE_FUNDING_SOURCE: Address = "0x7777777777777777777777777777777777777777";
const FACTORY_OWNER: Address = "0x47ebfac3353314c788b96cdcbf41daadfe03629c";
const HASH_A: Hex = `0x${"11".repeat(32)}`;
const HASH_B: Hex = `0x${"22".repeat(32)}`;
const HASH_C: Hex = `0x${"33".repeat(32)}`;
const HASH_D: Hex = `0x${"44".repeat(32)}`;
const HASH_E: Hex = `0x${"55".repeat(32)}`;
const HASH_F: Hex = `0x${"66".repeat(32)}`;
const ABI_TRUE: Hex = `0x${"00".repeat(31)}01`;
const ABI_FALSE_OR_ZERO: Hex = `0x${"00".repeat(32)}`;
const SETTLEMENT_SELECTOR: Hex = "0xabcdef12";
const SETTLEMENT_INPUT = `${SETTLEMENT_SELECTOR}1234` as const;
const BASE_EXPECTED_AUTHORITY_IDENTITIES = [
  {
    contract: DEPOSIT_FACTORY,
    account: FACTORY_OWNER,
    role: "deposit-wallet-factory-upgrader",
  },
  { contract: PUSD, account: OFFRAMP, role: "wrapper" },
  { contract: PUSD, account: STANDARD_FACTORY, role: "wrapper" },
] as const;
const DIAGNOSTIC_STATE_OPTIONS = {
  verificationScope: "diagnostic",
} as const;
const SETTLEMENT_STATE_OPTIONS = {
  verificationScope: "settlement",
  strategyCustodyAccounts: [ACCOUNT],
  fundingSourceAccounts: [CORE_FUNDING_SOURCE],
  pUsdCustodyBalance: "0",
  expectedAuthorityIdentities: BASE_EXPECTED_AUTHORITY_IDENTITIES,
} as const;

type EventProvenance = {
  lastEventBlockNumber: string | null;
  lastEventTransactionHash: Hex | null;
  lastEventLogIndex: string | null;
};

type PositionFixture = {
  profile: string;
  chainId: string;
  positionContract: Address;
  custodyAccount: Address;
  collateralToken: Address;
  oracle: Address;
  questionId: Hex;
  outcomeSlotCount: string;
  conditionId: Hex;
  parentCollectionId: Hex;
  indexSet: string;
  collectionId: Hex;
  positionId: string;
  quantity: string;
};

type PositionEntryFixture = {
  position: PositionFixture;
  custodyConfigId: string;
  marketKind: string;
  routeId: string;
  standardOracleConfigId: string | null;
  negRiskConfigId: string | null;
  redemptionExecutionId: string;
  conditionPreparation: {
    blockNumber: string;
    blockHash: Hex;
    transactionHash: Hex;
    logIndex: string;
    oracle: Address;
    questionId: Hex;
    outcomeSlotCount: string;
  };
  userPausedBlockAt: string;
  isUserPaused: boolean;
  reservedQuantity: string;
  venueReportedSize: string | null;
};

type SessionSignerFixture = EventProvenance & {
  signer: Address;
  validUntil: string;
  active: boolean;
};

type PasskeySessionSignerFixture = EventProvenance & {
  passkeyId: Hex;
  x: Hex;
  y: Hex;
  validUntil: string;
  active: boolean;
};

type CustodyConfigFixture = {
  [key: string]: unknown;
  custodyConfigId: string;
  custodyAccount: Address;
  walletKind: string;
  signatureType: string;
  makerAddress: Address;
  orderSignerAddress: Address;
  accountSignerAddress: Address;
  owner: Address | null;
  pendingOwner: Address | null;
  pendingOwnerDeadline: string | null;
  pendingOwnerNonce: string | null;
  runtimeCodeHash: Hex;
  factory: Address;
  factoryCodeHash: Hex;
  factoryImplementation: Address | null;
  factoryImplementationCodeHash: Hex | null;
  proxyMode: string;
  implementationResolver: Address | null;
  implementationResolverCodeHash: Hex | null;
  implementation: Address;
  implementationCodeHash: Hex;
  controllers: Address[];
  threshold: string;
  modules: Address[];
  guard: Address | null;
  fallbackHandler: Address | null;
  pausedAt: string | null;
  implementationPinned: boolean | null;
  sessionSigners: SessionSignerFixture[];
  passkeySessionSigners: PasskeySessionSignerFixture[];
  nonce: string;
};

type BookFixture = {
  [key: string]: unknown;
  assetId: string;
  market: Hex;
  responseHash: Hex;
};

type RouteConfigFixture = {
  [key: string]: unknown;
  routeId: string;
  marketKind: string;
  exchange: Address;
  maxFeeRateBps: string;
};

type StandardOracleConfigFixture = {
  [key: string]: unknown;
  standardOracleConfigId: string;
  questionId: Hex;
};

type NegRiskConfigFixture = {
  [key: string]: unknown;
  negRiskConfigId: string;
};

type SweepBalanceFixture = {
  account: Address;
  tokenContract: Address;
  tokenId: string | null;
  amount: string;
};

type RedemptionConfigFixture = {
  [key: string]: unknown;
  redemptionRouteId: string;
  marketKind: string;
  kind: string;
  adapterRole: string;
  entrypoint: Address;
  entrypointCodeHash: Hex;
  balanceSelection: string;
  collateralToken: Address | null;
  negRiskAdapter: Address | null;
  wrappedCollateral: Address | null;
  onramp: Address | null;
  onrampCodeHash: Hex | null;
  sweepBalances: SweepBalanceFixture[];
  sourceCommits: string[];
};

type RedemptionCallFixture = {
  target: Address;
  value: string;
  calldataState: string;
  calldata: Hex | null;
  expectedOutputToken: Address;
  minimumOutputAmount: string;
};

type RedemptionExecutionFixture = {
  redemptionExecutionId: string;
  custodyConfigId: string;
  marketKind: string;
  conditionId: Hex;
  payoutNumerators: string[];
  payoutDenominator: string;
  redemptionRouteId: string;
  coveredPositionIds: string[];
  redemptionCalls: RedemptionCallFixture[];
};

type OrderCommitmentFixture = {
  custodyConfigId: string;
  routeId: string;
  orderHash: Hex;
  salt: string;
  maker: Address;
  signer: Address;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: string;
  signatureType: string;
  timestamp: string;
  metadata: Hex;
  builder: Hex;
  signature: Hex;
  statusFilled: boolean;
  statusRemaining: string;
  effectiveRemainingMakerAmount: string;
  reservedAssetType: string;
  reservedAssetContract: Address;
  reservedTokenId: string | null;
  reservedAmount: string;
  signatureValid: boolean;
  transferAuthorityActive: boolean;
  userPausedBlockAt: string;
  isUserPaused: boolean;
};

type SettlementFreezeConfigFixture = {
  freezeConfigId: string;
  custodyConfigId: string;
  routeId: string;
  predicate: string;
  enforcementMode: string;
  predicateReads: Array<{
    target: Address;
    calldata: Hex;
    expectedReturnData: Hex;
  }>;
  enforcer: Address;
  enforcerCodeHash: Hex;
  settlementFunctionSelector: Hex;
  settlementCalldataHash: Hex;
  enforcerSourceCommit: string;
};

type CollateralConfigFixture = {
  [key: string]: unknown;
  totalSupply: string;
  maxUsdceSettlementExposure: string;
  vaultUsdceBalance: string;
  vaultUsdceAllowance: string;
};

type WrappedCollateralConfigFixture = {
  [key: string]: unknown;
  wrappedCollateral: Address;
};

type Erc1155ApprovalFixture = EventProvenance & {
  tokenContract: Address;
  owner: Address;
  operator: Address;
  approved: boolean;
};

type Erc20AllowanceFixture = EventProvenance & {
  token: Address;
  owner: Address;
  spender: Address;
  amount: string;
  candidateSource: string;
};

type AuthorityFixture = EventProvenance & {
  contract: Address;
  account: Address;
  role: string;
  active: boolean;
  candidateSource: string;
};

type ResponseFixture = {
  [key: string]: unknown;
  responseHash: Hex;
  requestUrl: string;
  retrievalUris: string[];
};

type VenueStateFixture = {
  profile: string;
  custodyConfigs: CustodyConfigFixture[];
  positions: PositionEntryFixture[];
  books: BookFixture[];
  routeConfigs: RouteConfigFixture[];
  standardOracleConfigs: StandardOracleConfigFixture[];
  negRiskConfigs: NegRiskConfigFixture[];
  redemptionConfigs: RedemptionConfigFixture[];
  redemptionExecutions: RedemptionExecutionFixture[];
  orderCommitments: OrderCommitmentFixture[];
  settlementFreezeConfigs: SettlementFreezeConfigFixture[];
  collateralConfig: CollateralConfigFixture;
  wrappedCollateralConfig: WrappedCollateralConfigFixture | null;
  erc1155Approvals: Erc1155ApprovalFixture[];
  erc20Allowances: Erc20AllowanceFixture[];
  authorities: AuthorityFixture[];
  responses: ResponseFixture[];
};

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

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(positionSchema);
const validateSchema = ajv.compile(venueSchema);

const clone = <T>(value: T): T => structuredClone(value);

const uncheckedVenueOptions = (value: unknown): PolymarketVenueSemanticOptions =>
  value as PolymarketVenueSemanticOptions;

const uncheckedSettlementCallOptions = (
  value: unknown,
): PolymarketSettlementCallOptions => value as PolymarketSettlementCallOptions;

function assertPolymarketVenueState(
  value: unknown,
  options: PolymarketVenueSemanticOptions = DIAGNOSTIC_STATE_OPTIONS,
): void {
  assertPolymarketVenueStateRaw(value, {
    valuationBlockTimestamp: 1_000n,
    ...options,
  });
}

function expectCode(action: () => void, code: PolymarketVenueSemanticErrorCode): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(PolymarketVenueSemanticError);
    expect((error as PolymarketVenueSemanticError).code).toBe(code);
  }
}

function routeConfig(
  marketKind: "standard" | "negative-risk",
): RouteConfigFixture {
  const negative = marketKind === "negative-risk";
  return {
    routeId: negative ? "route-negative" : "route-standard",
    marketKind,
    exchange: negative ? NEGATIVE_EXCHANGE : STANDARD_EXCHANGE,
    exchangeCodeHash: negative
      ? "0x04b857d48dcc38b3d484239569dc96a7a6c39bbb90ed2461227fc6e50ed5787d"
      : "0xa08da89bbac2063dfa6a705e70314d218d40fb2b2a6405442297c241fcd58401",
    exchangeCollateralToken: PUSD,
    ctf: CTF,
    ctfCodeHash: "0xbe524e094025c2a1122ccfbe3264e29fe662d7e0ae518b6926135c814405eceb",
    ctfCollateralToken: negative ? WCOL : USDCE,
    outcomeTokenFactory: negative ? NEGATIVE_FACTORY : STANDARD_FACTORY,
    outcomeTokenFactoryCodeHash: negative
      ? "0x0cec3398b0b528b191ccb9b0e7d023731c8f582f401d526f48ca7575df7a003e"
      : "0x1ece8945fe803fe6a0ff4f10d13979830429f51463075f3f284031d8bc17d9ed",
    factoryConditionalTokens: CTF,
    factoryCollateralToken: PUSD,
    factoryUsdce: USDCE,
    factoryNegRiskAdapter: negative ? NEG_RISK_ADAPTER : null,
    factoryWrappedCollateral: negative ? WCOL : null,
    factoryPausedUsdce: false,
    legacySafeFactory: SAFE_FACTORY,
    legacySafeFactoryCodeHash:
      "0x7a423db1d467bbd092e48044242a9c1f003442a83ca8109f0f7c07a50782e23d",
    legacySafeImplementation: "0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8",
    legacySafeImplementationCodeHash:
      "0xf4b625c76701938f75938880a926414b5f91471d32e21c0cbb37566b62495ca7",
    exchangePaused: false,
    userPauseBlockInterval: "100",
    maxFeeRateBps: "500",
    feeReceiver: FEE_RECEIVER,
    sourceCommit: "ccc0596074f4dfd62c944fbca4de252893b82b4b",
  };
}

function makePosition(indexSet: "1" | "2", quantity: string): PositionFixture {
  const conditionId = ctfConditionId(V31_ORACLE, HASH_A, 2n);
  const collectionId = ctfCollectionId(ZERO_HASH, conditionId, BigInt(indexSet));
  return {
    profile: "position/gnosis-ctf/1",
    chainId: "137",
    positionContract: CTF,
    custodyAccount: ACCOUNT,
    collateralToken: USDCE,
    oracle: V31_ORACLE,
    questionId: HASH_A,
    outcomeSlotCount: "2",
    conditionId,
    parentCollectionId: ZERO_HASH,
    indexSet,
    collectionId,
    positionId: ctfPositionId(USDCE, collectionId).toString(),
    quantity,
  };
}

function zeroSweep(
  account: Address,
  tokenContract: Address,
  tokenId: string | null,
): SweepBalanceFixture {
  return { account, tokenContract, tokenId, amount: "0" };
}

function makeDiagnosticState(): VenueStateFixture {
  const positions = [makePosition("1", "1000"), makePosition("2", "600")].sort((a, b) =>
    BigInt(a.positionId) < BigInt(b.positionId) ? -1 : 1,
  );
  const preparation = {
    blockNumber: "100",
    blockHash: HASH_B,
    transactionHash: HASH_C,
    logIndex: "2",
    oracle: V31_ORACLE,
    questionId: HASH_A,
    outcomeSlotCount: "2",
  };
  const positionEntries = positions.map((position) => ({
    position,
    custodyConfigId: "custody-deposit",
    marketKind: "standard",
    routeId: "route-standard",
    standardOracleConfigId: "oracle-standard",
    negRiskConfigId: null,
    redemptionExecutionId: "execute-standard",
    conditionPreparation: clone(preparation),
    userPausedBlockAt: "0",
    isUserPaused: false,
    reservedQuantity: "0",
    venueReportedSize: null,
  }));
  const responseHashes = [HASH_D, HASH_E];
  const books = positions.map((position, index) => ({
    assetId: position.positionId,
    market: position.conditionId,
    negRisk: false,
    venueTimestampMs: "1000",
    venueHash: `opaque-book-${index}`,
    minOrderSizeBase: "1",
    tickSizeU6: "1000",
    lastTradePriceU6: null,
    bids: [{ priceU6: "500000", quantity: "2000" }],
    bidsTruncated: false,
    responseHash: responseHashes[index],
  }));
  const positionIds = positions.map((position) => position.positionId);
  const sweeps = [
    zeroSweep(STANDARD_FACTORY, USDCE, null),
    zeroSweep(STANDARD_FACTORY, CTF, positionIds[0]),
    zeroSweep(STANDARD_FACTORY, CTF, positionIds[1]),
  ];
  return {
    profile: "venue/polymarket/1",
    custodyConfigs: [
      {
        custodyConfigId: "custody-deposit",
        custodyAccount: ACCOUNT,
        walletKind: "deposit-wallet-v2",
        signatureType: "3",
        makerAddress: ACCOUNT,
        orderSignerAddress: ACCOUNT,
        accountSignerAddress: SIGNER,
        owner: SIGNER,
        pendingOwner: null,
        pendingOwnerDeadline: "0",
        pendingOwnerNonce: "0",
        runtimeCodeHash: HASH_A,
        factory: DEPOSIT_FACTORY,
        factoryCodeHash:
          "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
        factoryImplementation: "0x528cc05efac2b0d255e423272187efd41248abd7",
        factoryImplementationCodeHash:
          "0xe6424f1008e46b4b657efacf9500ea7747cbbf3055d9d76459253ac2884793d2",
        proxyMode: "deposit-shared-erc1967",
        implementationResolver: "0x7a18edfe055488a3128f01f563e5b479d92ffc3a",
        implementationResolverCodeHash:
          "0xf87b06a1302051471df08ff79a938757509569e16b7a7efa55a3ea7b29b0b9d1",
        implementation: "0xf7f27c29e60fe6325bef8da7f93250353d2e3294",
        implementationCodeHash:
          "0xf5c1072460e64902af84d35f5bb1d0a15d80a88c5827b831a977fbc5a0684b96",
        controllers: [SIGNER],
        threshold: "1",
        modules: [],
        guard: null,
        fallbackHandler: null,
        pausedAt: "0",
        implementationPinned: false,
        sessionSigners: [],
        passkeySessionSigners: [],
        nonce: "7",
      },
    ],
    positions: positionEntries,
    books,
    routeConfigs: [routeConfig("standard")],
    standardOracleConfigs: [
      {
        standardOracleConfigId: "oracle-standard",
        oracle: V31_ORACLE,
        version: "v3.1.0",
        runtimeCodeHash:
          "0xe44d7e53a84493f6b71255e19f42f7cea9b8be486492fee80529c75d75f61579",
        ctf: CTF,
        optimisticOracle: "0xee3afe347d5c74317041e2618c49534daf887c24",
        collateralWhitelist: "0x1020ae36548ab28bc0c41fd2a08d24132c82cc55",
        questionId: HASH_A,
        initialized: true,
        flagged: false,
        ready: false,
        questionStateReturnData: "0x",
        sourceCommit: "10dd8829d710ed9c2541b4196b463ad0c90546fc",
      },
    ],
    negRiskConfigs: [],
    redemptionConfigs: [
      {
        redemptionRouteId: "redeem-standard",
        marketKind: "standard",
        kind: "ctf-exchange-bound-factory",
        adapterRole: "exchange-bound-factory",
        entrypoint: STANDARD_FACTORY,
        entrypointCodeHash:
          "0x1ece8945fe803fe6a0ff4f10d13979830429f51463075f3f284031d8bc17d9ed",
        rawCtfCollateralToken: USDCE,
        intermediateOutputTokens: [USDCE],
        accountingOutputToken: PUSD,
        balanceSelection: "caller-full-binary-set",
        conditionalTokens: CTF,
        collateralToken: PUSD,
        usdce: USDCE,
        negRiskAdapter: null,
        wrappedCollateral: null,
        onramp: null,
        onrampCodeHash: null,
        sweepBalances: sweeps,
        pausedUsdce: false,
        sourceCommits: [
          "ccc0596074f4dfd62c944fbca4de252893b82b4b",
          "eeefca66eb46c800a9aaab88db2064a99026fde5",
        ],
      },
    ],
    redemptionExecutions: [
      {
        redemptionExecutionId: "execute-standard",
        custodyConfigId: "custody-deposit",
        marketKind: "standard",
        conditionId: positions[0].conditionId,
        payoutNumerators: ["0", "0"],
        payoutDenominator: "0",
        redemptionRouteId: "redeem-standard",
        coveredPositionIds: positionIds,
        redemptionCalls: [
          {
            target: STANDARD_FACTORY,
            value: "0",
            calldataState: "exact",
            calldata: encodeFunctionData({
              abi: CTF_REDEMPTION_ABI,
              functionName: "redeemPositions",
              args: [USDCE, ZERO_HASH, positions[0].conditionId, [1n, 2n]],
            }),
            expectedOutputToken: PUSD,
            minimumOutputAmount: "1",
          },
        ],
      },
    ],
    orderCommitments: [],
    settlementFreezeConfigs: [],
    collateralConfig: {
      accountingToken: PUSD,
      proxyCodeHash:
        "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
      implementation: "0x6bbcef9f7ef3b6c592c99e0f206a0de94ad0925f",
      implementationCodeHash:
        "0x932c9369433b333d6d97d99b7731885751862aa3502122786d24174a9fd8e58e",
      decimals: "6",
      nativeUsdc: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      usdce: USDCE,
      vault: VAULT,
      totalSupply: "1000000",
      maxUsdceSettlementExposure: "1000",
      vaultUsdceBalance: "1000",
      vaultUsdceAllowance: "1000",
      onramp: ONRAMP,
      onrampCodeHash:
        "0x89eaba6b38dda7ebd07176f42f9e9f70dbadd46b7cbf826d15341729b19bb389",
      onrampCollateralToken: PUSD,
      onrampPausedUsdce: false,
      offramp: OFFRAMP,
      offrampCodeHash:
        "0x18de842db0ec4b253afe413446ac5c6c26e878289f5c7a425a9464dbad72d45d",
      offrampCollateralToken: PUSD,
      offrampPausedUsdce: false,
    },
    wrappedCollateralConfig: null,
    erc1155Approvals: [
      {
        tokenContract: CTF,
        owner: ACCOUNT,
        operator: STANDARD_FACTORY,
        approved: true,
        lastEventBlockNumber: null,
        lastEventTransactionHash: null,
        lastEventLogIndex: null,
      },
    ],
    erc20Allowances: [],
    authorities: [
      {
        contract: DEPOSIT_FACTORY,
        account: FACTORY_OWNER,
        role: "deposit-wallet-factory-upgrader",
        active: true,
        candidateSource: "event",
        lastEventBlockNumber: "9",
        lastEventTransactionHash: HASH_A,
        lastEventLogIndex: "0",
      },
      {
        contract: PUSD,
        account: OFFRAMP,
        role: "wrapper",
        active: true,
        candidateSource: "route",
        lastEventBlockNumber: null,
        lastEventTransactionHash: null,
        lastEventLogIndex: null,
      },
      {
        contract: PUSD,
        account: STANDARD_FACTORY,
        role: "wrapper",
        active: true,
        candidateSource: "route",
        lastEventBlockNumber: null,
        lastEventTransactionHash: null,
        lastEventLogIndex: null,
      },
    ],
    responses: responseHashes.map((responseHash, index) => ({
      responseHash,
      sourceProfile: "venue/polymarket/1",
      requestMethod: "GET",
      requestUrl: `https://clob.polymarket.com/book?token_id=${positions[index].positionId}`,
      httpStatus: "200",
      startedAtMs: "900",
      endedAtMs: "1000",
      mediaType: "application/json",
      bodyLength: "42",
      retrievalUris: [`ipfs://book-${index}`],
    })),
  };
}

function makeStandardDirectState(): VenueStateFixture {
  const state = makeDiagnosticState();
  const redemption = state.redemptionConfigs[0];
  Object.assign(redemption, {
    kind: "direct-ctf-onramp",
    adapterRole: "none",
    entrypoint: CTF,
    entrypointCodeHash:
      "0xbe524e094025c2a1122ccfbe3264e29fe662d7e0ae518b6926135c814405eceb",
    balanceSelection: "caller-full-listed-ids",
    collateralToken: null,
    onramp: ONRAMP,
    onrampCodeHash:
      "0x89eaba6b38dda7ebd07176f42f9e9f70dbadd46b7cbf826d15341729b19bb389",
    sweepBalances: [],
    sourceCommits: [
      "ccc0596074f4dfd62c944fbca4de252893b82b4b",
      "eeefca66eb46c800a9aaab88db2064a99026fde5",
    ],
  });
  const execution = state.redemptionExecutions[0];
  execution.redemptionCalls = [
    {
      target: CTF,
      value: "0",
      calldataState: "exact",
      calldata: encodeFunctionData({
        abi: CTF_REDEMPTION_ABI,
        functionName: "redeemPositions",
        args: [
          USDCE,
          ZERO_HASH,
          execution.conditionId,
          state.positions.map((entry) => BigInt(entry.position.indexSet)),
        ],
      }),
      expectedOutputToken: USDCE,
      minimumOutputAmount: "500",
    },
    {
      target: ONRAMP,
      value: "0",
      calldataState: "exact",
      calldata: encodeFunctionData({
        abi: COLLATERAL_ONRAMP_ABI,
        functionName: "wrap",
        args: [USDCE, ACCOUNT, 500n],
      }),
      expectedOutputToken: PUSD,
      minimumOutputAmount: "500",
    },
  ];
  state.erc20Allowances = [
    {
      token: USDCE,
      owner: ACCOUNT,
      spender: ONRAMP,
      amount: "500",
      candidateSource: "route",
      lastEventBlockNumber: null,
      lastEventTransactionHash: null,
      lastEventLogIndex: null,
    },
  ];
  state.authorities[2].account = ONRAMP;
  return state;
}

function addSecondStandardDirectExecution(state: ReturnType<typeof makeStandardDirectState>) {
  const collectionId = ctfCollectionId(
    ZERO_HASH,
    ctfConditionId(V31_ORACLE, HASH_F, 2n),
    1n,
  );
  const position = {
    ...makePosition("1", "500"),
    questionId: HASH_F,
    conditionId: ctfConditionId(V31_ORACLE, HASH_F, 2n),
    collectionId,
    positionId: ctfPositionId(USDCE, collectionId).toString(),
  };
  state.positions.push({
    position,
    custodyConfigId: "custody-deposit",
    marketKind: "standard",
    routeId: "route-standard",
    standardOracleConfigId: "oracle-standard-2",
    negRiskConfigId: null,
    redemptionExecutionId: "execute-standard-2",
    conditionPreparation: {
      blockNumber: "101",
      blockHash: HASH_C,
      transactionHash: HASH_D,
      logIndex: "0",
      oracle: V31_ORACLE,
      questionId: HASH_F,
      outcomeSlotCount: "2",
    },
    userPausedBlockAt: "0",
    isUserPaused: false,
    reservedQuantity: "0",
    venueReportedSize: null,
  });
  state.positions.sort((left, right) =>
    BigInt(left.position.positionId) < BigInt(right.position.positionId) ? -1 : 1,
  );
  state.books.push({
    ...state.books[0],
    assetId: position.positionId,
    market: position.conditionId,
    venueHash: "opaque-book-extra",
    responseHash: HASH_F,
  });
  state.books.sort((left, right) =>
    BigInt(left.assetId) < BigInt(right.assetId) ? -1 : 1,
  );
  state.standardOracleConfigs.push({
    ...state.standardOracleConfigs[0],
    standardOracleConfigId: "oracle-standard-2",
    questionId: HASH_F,
  });
  state.redemptionExecutions.push({
    redemptionExecutionId: "execute-standard-2",
    custodyConfigId: "custody-deposit",
    marketKind: "standard",
    conditionId: position.conditionId,
    payoutNumerators: ["0", "0"],
    payoutDenominator: "0",
    redemptionRouteId: "redeem-standard",
    coveredPositionIds: [position.positionId],
    redemptionCalls: [
      {
        target: CTF,
        value: "0",
        calldataState: "exact",
        calldata: encodeFunctionData({
          abi: CTF_REDEMPTION_ABI,
          functionName: "redeemPositions",
          args: [USDCE, ZERO_HASH, position.conditionId, [1n]],
        }),
        expectedOutputToken: USDCE,
        minimumOutputAmount: "500",
      },
      {
        target: ONRAMP,
        value: "0",
        calldataState: "exact",
        calldata: encodeFunctionData({
          abi: COLLATERAL_ONRAMP_ABI,
          functionName: "wrap",
          args: [USDCE, ACCOUNT, 500n],
        }),
        expectedOutputToken: PUSD,
        minimumOutputAmount: "500",
      },
    ],
  });
  state.responses.push({
    ...state.responses[0],
    responseHash: HASH_F,
    requestUrl: `https://clob.polymarket.com/book?token_id=${position.positionId}`,
    retrievalUris: ["ipfs://book-extra"],
  });
  state.collateralConfig.maxUsdceSettlementExposure = "1500";
  state.collateralConfig.vaultUsdceBalance = "1500";
  state.collateralConfig.vaultUsdceAllowance = "1500";
}

function makeNegativeDirectState(): VenueStateFixture {
  const state = makeDiagnosticState();
  const questionId: Hex = `0x${"11".repeat(31)}01`;
  const conditionId = ctfConditionId(NEG_RISK_ADAPTER, questionId, 2n);
  const positions = (["1", "2"] as const)
    .map((indexSet, index) => {
      const collectionId = ctfCollectionId(ZERO_HASH, conditionId, BigInt(indexSet));
      return {
        profile: "position/gnosis-ctf/1",
        chainId: "137",
        positionContract: CTF,
        custodyAccount: ACCOUNT,
        collateralToken: WCOL,
        oracle: NEG_RISK_ADAPTER,
        questionId,
        outcomeSlotCount: "2",
        conditionId,
        parentCollectionId: ZERO_HASH,
        indexSet,
        collectionId,
        positionId: ctfPositionId(WCOL, collectionId).toString(),
        quantity: index === 0 ? "1000" : "600",
      };
    })
    .sort((left, right) => (BigInt(left.positionId) < BigInt(right.positionId) ? -1 : 1));
  const preparation = {
    blockNumber: "100",
    blockHash: HASH_B,
    transactionHash: HASH_C,
    logIndex: "2",
    oracle: NEG_RISK_ADAPTER,
    questionId,
    outcomeSlotCount: "2",
  };
  state.positions = positions.map((position) => ({
    position,
    custodyConfigId: "custody-deposit",
    marketKind: "negative-risk",
    routeId: "route-negative",
    standardOracleConfigId: null,
    negRiskConfigId: "neg-config",
    redemptionExecutionId: "execute-negative",
    conditionPreparation: { ...preparation },
    userPausedBlockAt: "0",
    isUserPaused: false,
    reservedQuantity: "0",
    venueReportedSize: null,
  }));
  state.books = positions.map((position, index) => ({
    ...state.books[index],
    assetId: position.positionId,
    market: conditionId,
    negRisk: true,
  }));
  state.routeConfigs = [routeConfig("negative-risk")];
  state.standardOracleConfigs = [];
  const eventLocation = {
    blockNumber: "90",
    blockHash: HASH_A,
    transactionHash: HASH_B,
    logIndex: "1",
  };
  const marketOperator: Address = "0x661992aebf6becf7ba5abb66f6b0bf62aa7a2e93";
  const marketId: Hex = `0x${"11".repeat(31)}00`;
  state.negRiskConfigs = [
    {
      negRiskConfigId: "neg-config",
      marketId,
      questionId,
      questionIndex: "1",
      questionCount: "255",
      feeBps: "0",
      determined: false,
      resultIndex: null,
      negRiskAdapter: NEG_RISK_ADAPTER,
      negRiskAdapterCodeHash:
        "0x10798bfdebdc3b8727171551b1287ee4c87b486045ed51a6ddc94e34f66560a1",
      wrappedCollateral: WCOL,
      marketOperator,
      marketOperatorCodeHash:
        "0xcdf35da3f66423b7fa071ca745396c19d961e295ecae60516be55035b890797a",
      operatorNegRiskAdapter: NEG_RISK_ADAPTER,
      upstreamOracle: "0x69c47de9d4d3dad79590d61b9e05918e03775f24",
      upstreamOracleCodeHash:
        "0x76a83a5e6b6e30a6fefe5ca6af94dcfed92cea8e8ea739abbc8d4a663c876be1",
      upstreamCtf: marketOperator,
      upstreamOptimisticOracle: "0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1",
      upstreamCollateralWhitelist: "0x1020ae36548ab28bc0c41fd2a08d24132c82cc55",
      upstreamInitialized: true,
      upstreamFlagged: false,
      upstreamReady: false,
      upstreamQuestionStateReturnData: "0x",
      operatorDelaySeconds: "0",
      requestId: HASH_D,
      flaggedAt: "0",
      reportedAt: "0",
      reportedResult: null,
      adapterMarketPrepared: {
        ...eventLocation,
        marketId,
        oracle: marketOperator,
        feeBps: "0",
        data: "0x",
      },
      adapterQuestionPrepared: {
        ...eventLocation,
        marketId,
        questionId,
        questionIndex: "1",
        data: "0x",
      },
      operatorMarketPrepared: { ...eventLocation, marketId, feeBps: "0", data: "0x" },
      operatorQuestionPrepared: {
        ...eventLocation,
        marketId,
        questionId,
        requestId: HASH_D,
        questionIndex: "1",
        data: "0x",
      },
      operatorSourceCommit: "f78b35b0863b4308a431ca307d06f49b2ea65e78",
      upstreamSourceCommit: "8b76cc9e0d46c6f7450a0adb0ddc0f5b0568c9cc",
    },
  ];
  state.redemptionConfigs = [
    {
      redemptionRouteId: "redeem-negative",
      marketKind: "negative-risk",
      kind: "neg-risk-direct-ctf-onramp",
      adapterRole: "none",
      entrypoint: CTF,
      entrypointCodeHash:
        "0xbe524e094025c2a1122ccfbe3264e29fe662d7e0ae518b6926135c814405eceb",
      rawCtfCollateralToken: WCOL,
      intermediateOutputTokens: [WCOL, USDCE],
      accountingOutputToken: PUSD,
      balanceSelection: "caller-full-listed-ids",
      conditionalTokens: CTF,
      collateralToken: null,
      usdce: USDCE,
      negRiskAdapter: null,
      wrappedCollateral: WCOL,
      onramp: ONRAMP,
      onrampCodeHash:
        "0x89eaba6b38dda7ebd07176f42f9e9f70dbadd46b7cbf826d15341729b19bb389",
      sweepBalances: [],
      pausedUsdce: false,
      sourceCommits: [
        "ccc0596074f4dfd62c944fbca4de252893b82b4b",
        "eeefca66eb46c800a9aaab88db2064a99026fde5",
        "f78b35b0863b4308a431ca307d06f49b2ea65e78",
      ],
    },
  ];
  state.redemptionExecutions = [
    {
      redemptionExecutionId: "execute-negative",
      custodyConfigId: "custody-deposit",
      marketKind: "negative-risk",
      conditionId,
      payoutNumerators: ["0", "0"],
      payoutDenominator: "0",
      redemptionRouteId: "redeem-negative",
      coveredPositionIds: positions.map((position) => position.positionId),
      redemptionCalls: [
        {
          target: CTF,
          value: "0",
          calldataState: "exact",
          calldata: encodeFunctionData({
            abi: CTF_REDEMPTION_ABI,
            functionName: "redeemPositions",
            args: [WCOL, ZERO_HASH, conditionId, [1n, 2n]],
          }),
          expectedOutputToken: WCOL,
          minimumOutputAmount: "500",
        },
        {
          target: WCOL,
          value: "0",
          calldataState: "exact",
          calldata: encodeFunctionData({
            abi: WCOL_UNWRAP_ABI,
            functionName: "unwrap",
            args: [ACCOUNT, 500n],
          }),
          expectedOutputToken: USDCE,
          minimumOutputAmount: "500",
        },
        {
          target: ONRAMP,
          value: "0",
          calldataState: "exact",
          calldata: encodeFunctionData({
            abi: COLLATERAL_ONRAMP_ABI,
            functionName: "wrap",
            args: [USDCE, ACCOUNT, 500n],
          }),
          expectedOutputToken: PUSD,
          minimumOutputAmount: "500",
        },
      ],
    },
  ];
  state.wrappedCollateralConfig = {
    wrappedCollateral: WCOL,
    runtimeCodeHash: "0x99c62168488983e6ac023c62a6dca53acc7e8e902849fb72a9b08f29545dc474",
    owner: NEG_RISK_ADAPTER,
    underlying: USDCE,
    decimals: "6",
    totalSupply: "1000000",
    maxRedemptionExposure: "1000",
    underlyingBalance: "1000",
  };
  state.erc20Allowances = [
    {
      token: USDCE,
      owner: ACCOUNT,
      spender: ONRAMP,
      amount: "1000",
      candidateSource: "route",
      lastEventBlockNumber: null,
      lastEventTransactionHash: null,
      lastEventLogIndex: null,
    },
  ];
  state.authorities[2].account = ONRAMP;
  return state;
}

function makeNegativeFactoryState() {
  const state = makeNegativeDirectState();
  const redemption = state.redemptionConfigs[0];
  Object.assign(redemption, {
    kind: "neg-risk-exchange-bound-factory",
    adapterRole: "exchange-bound-factory",
    entrypoint: NEGATIVE_FACTORY,
    entrypointCodeHash:
      "0x0cec3398b0b528b191ccb9b0e7d023731c8f582f401d526f48ca7575df7a003e",
    balanceSelection: "caller-full-binary-set",
    collateralToken: PUSD,
    negRiskAdapter: NEG_RISK_ADAPTER,
    onramp: null,
    onrampCodeHash: null,
  });
  const tokenIds = state.positions.map((entry) => entry.position.positionId);
  const sweeps = [
    zeroSweep(NEGATIVE_FACTORY, CTF, tokenIds[0]),
    zeroSweep(NEGATIVE_FACTORY, CTF, tokenIds[1]),
    zeroSweep(NEG_RISK_ADAPTER, CTF, tokenIds[0]),
    zeroSweep(NEG_RISK_ADAPTER, CTF, tokenIds[1]),
    zeroSweep(NEG_RISK_ADAPTER, WCOL, null),
    zeroSweep(NEGATIVE_FACTORY, USDCE, null),
  ];
  const sweepKey = (sweep: ReturnType<typeof zeroSweep>) => {
    const tokenId = sweep.tokenId === null
      ? "n"
      : `u${BigInt(sweep.tokenId).toString().padStart(78, "0")}`;
    return `${sweep.account}|${sweep.tokenContract}|${tokenId}`;
  };
  redemption.sweepBalances = sweeps.sort((left, right) =>
    sweepKey(left) < sweepKey(right) ? -1 : 1,
  );
  const execution = state.redemptionExecutions[0];
  execution.redemptionCalls = [
    {
      target: NEGATIVE_FACTORY,
      value: "0",
      calldataState: "exact",
      calldata: encodeFunctionData({
        abi: CTF_REDEMPTION_ABI,
        functionName: "redeemPositions",
        args: [WCOL, ZERO_HASH, execution.conditionId, [1n, 2n]],
      }),
      expectedOutputToken: PUSD,
      minimumOutputAmount: "500",
    },
  ];
  state.erc1155Approvals = [
    {
      tokenContract: CTF,
      owner: ACCOUNT,
      operator: NEGATIVE_FACTORY,
      approved: true,
      lastEventBlockNumber: null,
      lastEventTransactionHash: null,
      lastEventLogIndex: null,
    },
    {
      tokenContract: CTF,
      owner: NEGATIVE_FACTORY,
      operator: NEG_RISK_ADAPTER,
      approved: true,
      lastEventBlockNumber: null,
      lastEventTransactionHash: null,
      lastEventLogIndex: null,
    },
  ].sort((left, right) =>
    `${left.tokenContract}|${left.owner}|${left.operator}`
      < `${right.tokenContract}|${right.owner}|${right.operator}`
      ? -1
      : 1,
  );
  state.erc20Allowances = [];
  state.authorities[2].account = NEGATIVE_FACTORY;
  return state;
}

function makeBuyCommitment(state: VenueStateFixture): OrderCommitmentFixture {
  const route = state.routeConfigs.find((candidate) => candidate.routeId === "route-standard");
  if (route === undefined) throw new Error("fixture has no standard route");
  const unsigned: OrderCommitmentFixture = {
    custodyConfigId: "custody-deposit",
    routeId: "route-standard",
    orderHash: HASH_A,
    salt: "1",
    maker: ACCOUNT,
    signer: ACCOUNT,
    tokenId: state.positions[0].position.positionId,
    makerAmount: "200",
    takerAmount: "100",
    side: "0",
    signatureType: "3",
    timestamp: "900",
    metadata: ZERO_HASH,
    builder: HASH_C,
    signature: "0x1234",
    statusFilled: false,
    statusRemaining: "0",
    effectiveRemainingMakerAmount: "200",
    reservedAssetType: "erc20",
    reservedAssetContract: PUSD,
    reservedTokenId: null,
    reservedAmount: "200",
    signatureValid: true,
    transferAuthorityActive: true,
    userPausedBlockAt: "0",
    isUserPaused: false,
  };
  unsigned.orderHash = polymarketV2OrderHash(unsigned, route.exchange);
  return unsigned;
}

function addBuyCommitment(state: VenueStateFixture): void {
  state.orderCommitments = [makeBuyCommitment(state)];
  state.erc20Allowances = [
    {
      token: PUSD,
      owner: ACCOUNT,
      spender: STANDARD_EXCHANGE,
      amount: "500",
      candidateSource: "route",
      lastEventBlockNumber: null,
      lastEventTransactionHash: null,
      lastEventLogIndex: null,
    },
  ];
  state.collateralConfig.maxUsdceSettlementExposure = "1200";
  state.collateralConfig.vaultUsdceBalance = "1200";
  state.collateralConfig.vaultUsdceAllowance = "1200";
}

function addSellCommitment(state: VenueStateFixture): void {
  const route = state.routeConfigs.find((candidate) => candidate.routeId === "route-standard");
  if (route === undefined) throw new Error("fixture has no standard route");
  const held = state.positions[0];
  const unsigned: OrderCommitmentFixture = {
    custodyConfigId: "custody-deposit",
    routeId: "route-standard",
    orderHash: HASH_A,
    salt: "2",
    maker: ACCOUNT,
    signer: ACCOUNT,
    tokenId: held.position.positionId,
    makerAmount: "200",
    takerAmount: "100",
    side: "1",
    signatureType: "3",
    timestamp: "901",
    metadata: ZERO_HASH,
    builder: HASH_C,
    signature: "0x5678",
    statusFilled: false,
    statusRemaining: "0",
    effectiveRemainingMakerAmount: "200",
    reservedAssetType: "erc1155",
    reservedAssetContract: CTF,
    reservedTokenId: held.position.positionId,
    reservedAmount: "200",
    signatureValid: true,
    transferAuthorityActive: true,
    userPausedBlockAt: "0",
    isUserPaused: false,
  };
  unsigned.orderHash = polymarketV2OrderHash(unsigned, route.exchange);
  state.orderCommitments = [unsigned];
  held.reservedQuantity = "200";
  state.erc1155Approvals.push({
    tokenContract: CTF,
    owner: ACCOUNT,
    operator: STANDARD_EXCHANGE,
    approved: true,
    lastEventBlockNumber: null,
    lastEventTransactionHash: null,
    lastEventLogIndex: null,
  });
  state.erc1155Approvals.sort((left, right) =>
    `${left.tokenContract}|${left.owner}|${left.operator}`
      < `${right.tokenContract}|${right.owner}|${right.operator}`
      ? -1
      : 1,
  );
}

function freezeConfig(
  route: RouteConfigFixture,
  custody: { custodyConfigId: string; custodyAccount: Address } = {
    custodyConfigId: "custody-deposit",
    custodyAccount: ACCOUNT,
  },
): SettlementFreezeConfigFixture {
  return {
    freezeConfigId: `freeze-${custody.custodyConfigId}-${route.routeId}`,
    custodyConfigId: custody.custodyConfigId,
    routeId: route.routeId,
    predicate: "effective-user-pause",
    enforcementMode: "settlement-transaction-precondition",
    predicateReads: [
      {
        target: route.exchange,
        calldata: encodeFunctionData({
          abi: USER_PAUSE_ABI,
          functionName: "isUserPaused",
          args: [custody.custodyAccount],
        }),
        expectedReturnData: ABI_TRUE,
      },
    ],
    enforcer: VAULT,
    enforcerCodeHash: HASH_D,
    settlementFunctionSelector: SETTLEMENT_SELECTOR,
    settlementCalldataHash: keccak256(SETTLEMENT_INPUT),
    enforcerSourceCommit: "ccc0596074f4dfd62c944fbca4de252893b82b4b",
  };
}

function revokedAuthoritiesFreeze(
  route: RouteConfigFixture,
): SettlementFreezeConfigFixture {
  return {
    ...freezeConfig(route),
    predicate: "transfer-authorities-revoked",
    predicateReads: [
      {
        target: CTF,
        calldata: encodeFunctionData({
          abi: APPROVAL_FOR_ALL_ABI,
          functionName: "isApprovedForAll",
          args: [ACCOUNT, route.exchange],
        }),
        expectedReturnData: ABI_FALSE_OR_ZERO,
      },
      {
        target: PUSD,
        calldata: encodeFunctionData({
          abi: ALLOWANCE_ABI,
          functionName: "allowance",
          args: [ACCOUNT, route.exchange],
        }),
        expectedReturnData: ABI_FALSE_OR_ZERO,
      },
    ],
  };
}

function legacySafeCustody(
  custodyConfigId: string,
  custodyAccount: Address,
  nonce: string,
  derivationSigner: Address = SIGNER,
): CustodyConfigFixture {
  return {
    custodyConfigId,
    custodyAccount,
    walletKind: "legacy-gnosis-safe",
    signatureType: "2",
    makerAddress: custodyAccount,
    orderSignerAddress: derivationSigner,
    accountSignerAddress: derivationSigner,
    owner: null,
    pendingOwner: null,
    pendingOwnerDeadline: null,
    pendingOwnerNonce: null,
    runtimeCodeHash: POLYMARKET_LEGACY_SAFE_PROXY_RUNTIME_CODE_HASH,
    factory: SAFE_FACTORY,
    factoryCodeHash:
      "0x7a423db1d467bbd092e48044242a9c1f003442a83ca8109f0f7c07a50782e23d",
    factoryImplementation: null,
    factoryImplementationCodeHash: null,
    proxyMode: "legacy-safe-proxy",
    implementationResolver: null,
    implementationResolverCodeHash: null,
    implementation: "0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8",
    implementationCodeHash:
      "0xf4b625c76701938f75938880a926414b5f91471d32e21c0cbb37566b62495ca7",
    controllers: [derivationSigner],
    threshold: "1",
    modules: [],
    guard: null,
    fallbackHandler: null,
    pausedAt: null,
    implementationPinned: null,
    sessionSigners: [],
    passkeySessionSigners: [],
    nonce,
  };
}

function makeSettlementState(): VenueStateFixture {
  const state = makeDiagnosticState();
  state.custodyConfigs = [legacySafeCustody("custody-deposit", ACCOUNT, "7")];
  const negative = routeConfig("negative-risk");
  state.routeConfigs = [negative, state.routeConfigs[0]];
  state.settlementFreezeConfigs = [freezeConfig(negative), freezeConfig(state.routeConfigs[1])];
  state.positions.forEach((position) => {
    position.userPausedBlockAt = "1";
    position.isUserPaused = true;
  });
  return state;
}

function addPUsdOnlyCustody(state: ReturnType<typeof makeSettlementState>) {
  const custody = {
    ...clone(state.custodyConfigs[0]),
    custodyConfigId: "custody-pusd-only",
    custodyAccount: PUSD_ONLY_ACCOUNT,
    makerAddress: PUSD_ONLY_ACCOUNT,
    orderSignerAddress: PUSD_ONLY_SIGNER,
    accountSignerAddress: PUSD_ONLY_SIGNER,
    controllers: [PUSD_ONLY_SIGNER],
    nonce: "8",
  };
  state.custodyConfigs.push(custody);
  state.custodyConfigs.sort((left, right) =>
    left.custodyConfigId < right.custodyConfigId ? -1 : 1,
  );
  state.settlementFreezeConfigs.push(
    ...state.routeConfigs.map((route) => freezeConfig(route, custody)),
  );
  state.settlementFreezeConfigs.sort((left, right) =>
    left.freezeConfigId < right.freezeConfigId ? -1 : 1,
  );
}

function settlementCallOptions(
  state: ReturnType<typeof makeSettlementState>,
  pUsdCustodyBalance = "0",
): PolymarketSettlementCallOptions {
  const custodyChecks = state.custodyConfigs.map((custody) => ({
    custodyConfigId: custody.custodyConfigId,
    custodyAccount: custody.custodyAccount,
    preProxyRuntimeCodeHash: custody.runtimeCodeHash,
    postProxyRuntimeCodeHash: custody.runtimeCodeHash,
    masterCopyCalldata: "0xa619486e",
    preMasterCopyReturnData: `0x${"00".repeat(12)}${custody.implementation.slice(2)}`,
    postMasterCopyReturnData: `0x${"00".repeat(12)}${custody.implementation.slice(2)}`,
    preImplementation: custody.implementation,
    postImplementation: custody.implementation,
    preImplementationCodeHash: custody.implementationCodeHash,
    postImplementationCodeHash: custody.implementationCodeHash,
    preControllers: [...custody.controllers],
    postControllers: [...custody.controllers],
    preThreshold: custody.threshold,
    postThreshold: custody.threshold,
    preModules: [...custody.modules],
    postModules: [...custody.modules],
    preGuard: custody.guard,
    postGuard: custody.guard,
    preFallbackHandler: custody.fallbackHandler,
    postFallbackHandler: custody.fallbackHandler,
    preNonce: custody.nonce,
    postNonce: custody.nonce,
  }));
  return {
    strategyCustodyAccounts: state.custodyConfigs
      .map((custody) => custody.custodyAccount)
      .sort(),
    pUsdCustodyBalance,
    fundingSourceAccounts: [CORE_FUNDING_SOURCE],
    expectedAuthorityIdentities: state.authorities.map(({ contract, account, role }) => ({
      contract,
      account,
      role,
    })),
    strategyCustodyTargetCallCount: "0",
    strategyCustodyOriginCallCount: "0",
    safeDelegatecallCount: "0",
    stateChangingV2CallCount: "0",
    custodyChecks,
  };
}

function useRevocationPredicates(state: VenueStateFixture): void {
  state.settlementFreezeConfigs = state.routeConfigs.map(revokedAuthoritiesFreeze).sort((a, b) =>
    a.freezeConfigId < b.freezeConfigId ? -1 : 1,
  );
  const exchangeApprovals = state.routeConfigs.map((route) => ({
    tokenContract: CTF,
    owner: ACCOUNT,
    operator: route.exchange,
    approved: false,
    lastEventBlockNumber: null,
    lastEventTransactionHash: null,
    lastEventLogIndex: null,
  }));
  state.erc1155Approvals = [...state.erc1155Approvals, ...exchangeApprovals].sort((a, b) =>
    `${a.tokenContract}|${a.owner}|${a.operator}` < `${b.tokenContract}|${b.owner}|${b.operator}`
      ? -1
      : 1,
  );
  state.erc20Allowances = state.routeConfigs
    .map((route) => ({
      token: PUSD,
      owner: ACCOUNT,
      spender: route.exchange,
      amount: "0",
      candidateSource: "route",
      lastEventBlockNumber: null,
      lastEventTransactionHash: null,
      lastEventLogIndex: null,
    }))
    .sort((a, b) => (`${a.token}|${a.owner}|${a.spender}` < `${b.token}|${b.owner}|${b.spender}` ? -1 : 1));
}

describe("Polymarket venue semantic verifier", () => {
  test("rejects an omitted or unknown verification scope", () => {
    const callWithoutScope = assertPolymarketVenueStateRaw as unknown as (
      value: unknown,
      options?: unknown,
    ) => void;
    expectCode(() => callWithoutScope(venueFixture), "INVALID_SHAPE");
    expectCode(
      () => callWithoutScope(venueFixture, { verificationScope: "record-valid" }),
      "INVALID_SHAPE",
    );
  });

  test("accepts the standalone public venue fixture", () => {
    expect(validateSchema(venueFixture), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(venueFixture)).not.toThrow();
  });

  test("accepts a schema-valid diagnostic capture with exact binary adapter coverage", () => {
    const state = makeDiagnosticState();
    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(state)).not.toThrow();
  });

  test("requires books only for unresolved positions on the CLOB-cross path", () => {
    const missingLiveBook = makeDiagnosticState();
    missingLiveBook.books.pop();
    expect(validateSchema(missingLiveBook), JSON.stringify(validateSchema.errors)).toBe(true);
    expectCode(() => assertPolymarketVenueState(missingLiveBook), "BOOK_SET_MISMATCH");

    const uncappedLiveRoute = makeDiagnosticState();
    uncappedLiveRoute.routeConfigs[0].maxFeeRateBps = "0";
    expect(validateSchema(uncappedLiveRoute), JSON.stringify(validateSchema.errors)).toBe(true);
    expectCode(() => assertPolymarketVenueState(uncappedLiveRoute), "POSITION_BINDING");

    const resolvedWithBooks = makeDiagnosticState();
    const execution = resolvedWithBooks.redemptionExecutions[0];
    execution.payoutNumerators = ["1", "0"];
    execution.payoutDenominator = "1";
    execution.redemptionCalls[0].minimumOutputAmount = resolvedWithBooks.positions
      .filter((entry) => entry.position.indexSet === "1")
      .reduce((sum, entry) => sum + BigInt(entry.position.quantity), 0n)
      .toString();
    expect(validateSchema(resolvedWithBooks), JSON.stringify(validateSchema.errors)).toBe(true);
    expectCode(() => assertPolymarketVenueState(resolvedWithBooks), "BOOK_SET_MISMATCH");

    const resolvedWithoutBooks = clone(resolvedWithBooks);
    resolvedWithoutBooks.books = [];
    resolvedWithoutBooks.responses = [];
    resolvedWithoutBooks.routeConfigs[0].maxFeeRateBps = "0";
    expect(validateSchema(resolvedWithoutBooks), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(resolvedWithoutBooks)).not.toThrow();

    const wrongResolvedOutput = clone(resolvedWithoutBooks);
    wrongResolvedOutput.redemptionExecutions[0].redemptionCalls[0].minimumOutputAmount = "999";
    expectCode(
      () => assertPolymarketVenueState(wrongResolvedOutput),
      "PAYOUT_STATE_MISMATCH",
    );

    const impossibleUnresolvedVector = makeDiagnosticState();
    impossibleUnresolvedVector.redemptionExecutions[0].payoutNumerators = ["1", "0"];
    expectCode(
      () => assertPolymarketVenueState(impossibleUnresolvedVector),
      "PAYOUT_STATE_MISMATCH",
    );
  });

  test("binds resolved negative-risk payouts to a binary winner", () => {
    const state = makeNegativeDirectState();
    const execution = state.redemptionExecutions[0];
    const payout = state.positions
      .filter((entry) => entry.position.indexSet === "1")
      .reduce((sum, entry) => sum + BigInt(entry.position.quantity), 0n);
    execution.payoutNumerators = ["1", "0"];
    execution.payoutDenominator = "1";
    execution.redemptionCalls[0].minimumOutputAmount = payout.toString();
    execution.redemptionCalls[1].minimumOutputAmount = payout.toString();
    execution.redemptionCalls[1].calldata = encodeFunctionData({
      abi: WCOL_UNWRAP_ABI,
      functionName: "unwrap",
      args: [ACCOUNT, payout],
    });
    execution.redemptionCalls[2].minimumOutputAmount = payout.toString();
    execution.redemptionCalls[2].calldata = encodeFunctionData({
      abi: COLLATERAL_ONRAMP_ABI,
      functionName: "wrap",
      args: [USDCE, ACCOUNT, payout],
    });
    state.books = [];
    state.responses = [];
    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(state)).not.toThrow();

    const fractional = clone(state);
    fractional.redemptionExecutions[0].payoutNumerators = ["1", "1"];
    fractional.redemptionExecutions[0].payoutDenominator = "2";
    expectCode(() => assertPolymarketVenueState(fractional), "PAYOUT_STATE_MISMATCH");
  });

  test("accepts an unfilled buy commitment and recomputes the V2 EIP-712 hash", () => {
    const state = makeDiagnosticState();
    addBuyCommitment(state);
    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(state.orderCommitments[0].orderHash).toBe(
      "0x8c80a138f85c37a6449b9dd6c64db66acbf1c2ce5b9baba9b465a4b6b10730cd",
    );
    expect(() => assertPolymarketVenueState(state)).not.toThrow();
  });

  test("rejects Deposit Wallet session-envelope signatures while accepting owner signatures", () => {
    const ownerSigned = makeDiagnosticState();
    addBuyCommitment(ownerSigned);
    expect(() => assertPolymarketVenueState(ownerSigned)).not.toThrow();

    const sessionEnvelope = clone(ownerSigned);
    sessionEnvelope.orderCommitments[0].signature =
      `0x${"11".repeat(65)}${POLYMARKET_DEPOSIT_SESSION_ENVELOPE_MAGIC.slice(2)}`;
    expectCode(() => assertPolymarketVenueState(sessionEnvelope), "ORDER_BINDING");

    const magicOnly = clone(ownerSigned);
    magicOnly.orderCommitments[0].signature = POLYMARKET_DEPOSIT_SESSION_ENVELOPE_MAGIC;
    expectCode(() => assertPolymarketVenueState(magicOnly), "ORDER_BINDING");

    const malformedPrefixedMagic = clone(ownerSigned);
    malformedPrefixedMagic.orderCommitments[0].signature =
      `0x00${POLYMARKET_DEPOSIT_SESSION_ENVELOPE_MAGIC.slice(2)}`;
    expectCode(() => assertPolymarketVenueState(malformedPrefixedMagic), "ORDER_BINDING");
  });

  test("rejects a uint256 value above the exact bound", () => {
    const state = makeDiagnosticState();
    state.collateralConfig.totalSupply = (1n << 256n).toString();
    expectCode(() => assertPolymarketVenueState(state), "INVALID_UINT256");
  });

  test("rejects noncanonical config ordering", () => {
    const state = makeDiagnosticState();
    state.books.reverse();
    expectCode(() => assertPolymarketVenueState(state), "ARRAY_ORDER");
  });

  test("rejects a CTF derivation mismatch", () => {
    const state = makeDiagnosticState();
    state.positions[0].position.collectionId = HASH_E;
    expectCode(() => assertPolymarketVenueState(state), "POSITION_DERIVATION");
  });

  test("binds the closed Deposit Wallet owner, pinning, pause, and signer state", () => {
    const missingTimestamp = makeDiagnosticState();
    expectCode(
      () => assertPolymarketVenueStateRaw(missingTimestamp, DIAGNOSTIC_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );

    const sharedPinned = makeDiagnosticState();
    sharedPinned.custodyConfigs[0].implementationPinned = true;
    expectCode(() => assertPolymarketVenueState(sharedPinned), "CUSTODY_BINDING");

    const pinnedUnpinned = makeDiagnosticState();
    Object.assign(pinnedUnpinned.custodyConfigs[0], {
      proxyMode: "deposit-implementation-pinned",
      implementationResolver: null,
      implementationResolverCodeHash: null,
      implementationPinned: false,
    });
    expectCode(() => assertPolymarketVenueState(pinnedUnpinned), "CUSTODY_BINDING");

    const wrongController = makeDiagnosticState();
    wrongController.custodyConfigs[0].controllers = [OTHER_ACCOUNT];
    expectCode(() => assertPolymarketVenueState(wrongController), "CUSTODY_BINDING");

    const extraController = makeDiagnosticState();
    extraController.custodyConfigs[0].controllers = [SIGNER, OTHER_ACCOUNT].sort();
    expectCode(() => assertPolymarketVenueState(extraController), "CUSTODY_BINDING");

    const wrongOwner = makeDiagnosticState();
    wrongOwner.custodyConfigs[0].owner = OTHER_ACCOUNT;
    expectCode(() => assertPolymarketVenueState(wrongOwner), "CUSTODY_BINDING");

    const invalidPause = makeDiagnosticState();
    Object.assign(invalidPause.custodyConfigs[0], { pausedAt: false });
    expectCode(() => assertPolymarketVenueState(invalidPause), "INVALID_SHAPE");

    const invalidHandover = makeDiagnosticState();
    invalidHandover.custodyConfigs[0].pendingOwnerDeadline = "1";
    expectCode(() => assertPolymarketVenueState(invalidHandover), "CUSTODY_BINDING");

    const sessionSigner = {
      signer: OTHER_ACCOUNT,
      validUntil: "1001",
      active: true,
      lastEventBlockNumber: "90",
      lastEventTransactionHash: HASH_A,
      lastEventLogIndex: "0",
    };
    const activeSessions = makeDiagnosticState();
    activeSessions.custodyConfigs[0].sessionSigners = [sessionSigner];
    expect(() => assertPolymarketVenueState(activeSessions)).not.toThrow();

    const wrongSessionState = clone(activeSessions);
    wrongSessionState.custodyConfigs[0].sessionSigners[0].active = false;
    expectCode(() => assertPolymarketVenueState(wrongSessionState), "CUSTODY_BINDING");

    const expiredSession = clone(activeSessions);
    expiredSession.custodyConfigs[0].sessionSigners[0].active = false;
    expect(() => assertPolymarketVenueState(expiredSession, {
      verificationScope: "diagnostic",
      valuationBlockTimestamp: 1_001n,
    })).not.toThrow();

    const passkeySession = makeDiagnosticState();
    passkeySession.custodyConfigs[0].passkeySessionSigners = [{
      passkeyId: HASH_A,
      x: HASH_B,
      y: HASH_C,
      validUntil: "1001",
      active: true,
      lastEventBlockNumber: "91",
      lastEventTransactionHash: HASH_B,
      lastEventLogIndex: "1",
    }];
    expect(() => assertPolymarketVenueState(passkeySession)).not.toThrow();
    passkeySession.custodyConfigs[0].passkeySessionSigners[0].active = false;
    expectCode(() => assertPolymarketVenueState(passkeySession), "CUSTODY_BINDING");

    const revokedPasskey = makeDiagnosticState();
    revokedPasskey.custodyConfigs[0].passkeySessionSigners = [{
      passkeyId: HASH_A,
      x: ZERO_HASH,
      y: ZERO_HASH,
      validUntil: "0",
      active: false,
      lastEventBlockNumber: "92",
      lastEventTransactionHash: HASH_C,
      lastEventLogIndex: "2",
    }];
    expect(() => assertPolymarketVenueState(revokedPasskey)).not.toThrow();

    const partialZeroPasskey = clone(revokedPasskey);
    partialZeroPasskey.custodyConfigs[0].passkeySessionSigners[0].x = HASH_B;
    expectCode(() => assertPolymarketVenueState(partialZeroPasskey), "CUSTODY_BINDING");

    const pinned = makeDiagnosticState();
    Object.assign(pinned.custodyConfigs[0], {
      proxyMode: "deposit-implementation-pinned",
      implementationResolver: null,
      implementationResolverCodeHash: null,
      implementationPinned: true,
    });
    expect(() => assertPolymarketVenueState(pinned)).not.toThrow();
  });

  test("derives and pins each legacy Safe identity", () => {
    expect(polymarketLegacySafeAddress(SIGNER)).toBe(
      "0x48b6e483e9c3a8f3fc1d29c5d584e15482c7153a",
    );
    expect(polymarketLegacySafeAddress(PUSD_ONLY_SIGNER)).toBe(
      "0x1eec8218a89f6fc49cfc1098454066f57a8d06ce",
    );
    const state = makeSettlementState();
    expect(() => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS)).not.toThrow();

    const fakeAddress = makeSettlementState();
    fakeAddress.custodyConfigs[0].custodyAccount = OTHER_ACCOUNT;
    fakeAddress.custodyConfigs[0].makerAddress = OTHER_ACCOUNT;
    expectCode(
      () => assertPolymarketVenueState(fakeAddress, {
        ...SETTLEMENT_STATE_OPTIONS,
        strategyCustodyAccounts: [OTHER_ACCOUNT],
      }),
      "CUSTODY_BINDING",
    );

    const fakeProxy = makeSettlementState();
    fakeProxy.custodyConfigs[0].runtimeCodeHash = HASH_A;
    expectCode(
      () => assertPolymarketVenueState(fakeProxy, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );

    const fakeFactory = makeSettlementState();
    fakeFactory.custodyConfigs[0].factory = OTHER_ACCOUNT;
    expectCode(
      () => assertPolymarketVenueState(fakeFactory, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );

    const fakeFactoryRuntime = makeSettlementState();
    fakeFactoryRuntime.custodyConfigs[0].factoryCodeHash = HASH_A;
    expectCode(
      () => assertPolymarketVenueState(fakeFactoryRuntime, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );

    const fakeSingleton = makeSettlementState();
    fakeSingleton.custodyConfigs[0].implementation = OTHER_ACCOUNT;
    expectCode(
      () => assertPolymarketVenueState(fakeSingleton, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );

    const fakeSingletonRuntime = makeSettlementState();
    fakeSingletonRuntime.custodyConfigs[0].implementationCodeHash = HASH_A;
    expectCode(
      () => assertPolymarketVenueState(fakeSingletonRuntime, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );

    const duplicateSigner = makeSettlementState();
    addPUsdOnlyCustody(duplicateSigner);
    const second = duplicateSigner.custodyConfigs.find(
      (custody) => custody.custodyConfigId === "custody-pusd-only",
    )!;
    second.orderSignerAddress = SIGNER;
    second.accountSignerAddress = SIGNER;
    second.controllers = [SIGNER];
    expectCode(
      () => assertPolymarketVenueState(duplicateSigner, {
        ...SETTLEMENT_STATE_OPTIONS,
        strategyCustodyAccounts: [ACCOUNT, PUSD_ONLY_ACCOUNT].sort(),
      }),
      "CUSTODY_BINDING",
    );
  });

  test("rejects preparation fields that do not match the CTF position", () => {
    const state = makeDiagnosticState();
    state.positions[0].conditionPreparation.questionId = HASH_E;
    expectCode(() => assertPolymarketVenueState(state), "POSITION_EVENT_MISMATCH");
  });

  test("rejects an oracle config that does not bind the position question", () => {
    const state = makeDiagnosticState();
    state.standardOracleConfigs[0].questionId = HASH_E;
    expectCode(() => assertPolymarketVenueState(state), "ORACLE_CONFIG_MISMATCH");
  });

  test("rejects missing and duplicate redemption coverage", () => {
    const missing = makeDiagnosticState();
    missing.redemptionExecutions[0].coveredPositionIds.pop();
    expectCode(() => assertPolymarketVenueState(missing), "REDEMPTION_COVERAGE");

    const duplicate = makeDiagnosticState();
    duplicate.redemptionExecutions = [
      { ...clone(duplicate.redemptionExecutions[0]), redemptionExecutionId: "execute-a" },
      duplicate.redemptionExecutions[0],
    ];
    expectCode(() => assertPolymarketVenueState(duplicate), "REDEMPTION_SCOPE");
  });

  test("rejects an extra or reordered redemption call", () => {
    const state = makeDiagnosticState();
    state.redemptionExecutions[0].redemptionCalls.push({
      ...state.redemptionExecutions[0].redemptionCalls[0],
      target: ONRAMP,
    });
    expectCode(() => assertPolymarketVenueState(state), "REDEMPTION_CALL_PLAN");
  });

  test("rejects exact redemption calldata for another condition or index set", () => {
    const wrongCondition = makeDiagnosticState();
    wrongCondition.redemptionExecutions[0].redemptionCalls[0].calldata = encodeFunctionData({
      abi: CTF_REDEMPTION_ABI,
      functionName: "redeemPositions",
      args: [USDCE, ZERO_HASH, HASH_E, [1n, 2n]],
    });
    expectCode(() => assertPolymarketVenueState(wrongCondition), "REDEMPTION_CALL_PLAN");

    const wrongIndexes = makeDiagnosticState();
    wrongIndexes.redemptionExecutions[0].redemptionCalls[0].calldata = encodeFunctionData({
      abi: CTF_REDEMPTION_ABI,
      functionName: "redeemPositions",
      args: [USDCE, ZERO_HASH, wrongIndexes.positions[0].position.conditionId, [1n]],
    });
    expectCode(() => assertPolymarketVenueState(wrongIndexes), "REDEMPTION_CALL_PLAN");
  });

  test("requires a canonical exact first redemption call", () => {
    const deferred = makeStandardDirectState();
    deferred.redemptionExecutions[0].redemptionCalls[0].calldataState = "resolution-dependent";
    deferred.redemptionExecutions[0].redemptionCalls[0].calldata = null;
    deferred.redemptionExecutions[0].redemptionCalls[0].minimumOutputAmount = "0";
    expectCode(() => assertPolymarketVenueState(deferred), "REDEMPTION_CALL_PLAN");

    const trailing = makeDiagnosticState();
    trailing.redemptionExecutions[0].redemptionCalls[0].calldata =
      `${trailing.redemptionExecutions[0].redemptionCalls[0].calldata!}00`;
    expectCode(() => assertPolymarketVenueState(trailing), "REDEMPTION_CALL_PLAN");
  });

  test("binds every exact onramp argument and rejects later trailing bytes", () => {
    const valid = makeStandardDirectState();
    expect(validateSchema(valid), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(valid)).not.toThrow();

    const wrongSelector = makeStandardDirectState();
    const validOnramp = wrongSelector.redemptionExecutions[0].redemptionCalls[1].calldata!;
    wrongSelector.redemptionExecutions[0].redemptionCalls[1].calldata =
      `0xdeadbeef${validOnramp.slice(10)}`;
    expectCode(() => assertPolymarketVenueState(wrongSelector), "REDEMPTION_CALL_PLAN");

    const wrongRecipient = makeStandardDirectState();
    wrongRecipient.redemptionExecutions[0].redemptionCalls[1].calldata = encodeFunctionData({
      abi: COLLATERAL_ONRAMP_ABI,
      functionName: "wrap",
      args: [USDCE, SIGNER, 500n],
    });
    expectCode(() => assertPolymarketVenueState(wrongRecipient), "REDEMPTION_CALL_PLAN");

    const wrongAmount = makeStandardDirectState();
    wrongAmount.redemptionExecutions[0].redemptionCalls[1].calldata = encodeFunctionData({
      abi: COLLATERAL_ONRAMP_ABI,
      functionName: "wrap",
      args: [USDCE, ACCOUNT, 499n],
    });
    expectCode(() => assertPolymarketVenueState(wrongAmount), "REDEMPTION_CALL_PLAN");

    const trailing = makeStandardDirectState();
    trailing.redemptionExecutions[0].redemptionCalls[1].calldata =
      `${trailing.redemptionExecutions[0].redemptionCalls[1].calldata!}00`;
    expectCode(() => assertPolymarketVenueState(trailing), "REDEMPTION_CALL_PLAN");
  });

  test("binds WCOL unwrap and defers only an amount-dependent suffix", () => {
    const valid = makeNegativeDirectState();
    expect(validateSchema(valid), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(valid)).not.toThrow();

    const wrongRecipient = makeNegativeDirectState();
    wrongRecipient.redemptionExecutions[0].redemptionCalls[1].calldata = encodeFunctionData({
      abi: WCOL_UNWRAP_ABI,
      functionName: "unwrap",
      args: [SIGNER, 500n],
    });
    expectCode(() => assertPolymarketVenueState(wrongRecipient), "REDEMPTION_CALL_PLAN");

    const wrongAmount = makeNegativeDirectState();
    wrongAmount.redemptionExecutions[0].redemptionCalls[1].calldata = encodeFunctionData({
      abi: WCOL_UNWRAP_ABI,
      functionName: "unwrap",
      args: [ACCOUNT, 499n],
    });
    expectCode(() => assertPolymarketVenueState(wrongAmount), "REDEMPTION_CALL_PLAN");

    const deferred = makeNegativeDirectState();
    for (const call of deferred.redemptionExecutions[0].redemptionCalls.slice(1)) {
      call.calldataState = "resolution-dependent";
      call.calldata = null;
      call.minimumOutputAmount = "0";
    }
    expect(validateSchema(deferred), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(deferred)).not.toThrow();

    const insufficientDeferredAllowance = clone(deferred);
    insufficientDeferredAllowance.erc20Allowances[0].amount = "999";
    expectCode(
      () => assertPolymarketVenueState(insufficientDeferredAllowance),
      "REDEMPTION_CALL_PLAN",
    );

    const exactAfterDeferred = clone(deferred);
    exactAfterDeferred.redemptionExecutions[0].redemptionCalls[2] =
      makeNegativeDirectState().redemptionExecutions[0].redemptionCalls[2];
    expectCode(() => assertPolymarketVenueState(exactAfterDeferred), "REDEMPTION_CALL_PLAN");

    const deferredAllowance = clone(deferred);
    deferredAllowance.erc20Allowances[0].amount = "999";
    expectCode(() => assertPolymarketVenueState(deferredAllowance), "REDEMPTION_CALL_PLAN");
  });

  test("requires every redemption transfer and wrapper authority", () => {
    const missingFactoryApproval = makeDiagnosticState();
    missingFactoryApproval.erc1155Approvals[0].approved = false;
    expectCode(() => assertPolymarketVenueState(missingFactoryApproval), "REDEMPTION_CALL_PLAN");

    const missingFactoryWrapper = makeDiagnosticState();
    missingFactoryWrapper.authorities.pop();
    expectCode(() => assertPolymarketVenueState(missingFactoryWrapper), "REDEMPTION_CALL_PLAN");

    const missingOfframpWrapper = makeDiagnosticState();
    missingOfframpWrapper.authorities = missingOfframpWrapper.authorities.filter(
      (authority) => authority.account !== OFFRAMP,
    );
    expectCode(() => assertPolymarketVenueState(missingOfframpWrapper), "REDEMPTION_CALL_PLAN");

    const insufficientOnrampAllowance = makeStandardDirectState();
    insufficientOnrampAllowance.erc20Allowances[0].amount = "499";
    expectCode(() => assertPolymarketVenueState(insufficientOnrampAllowance), "REDEMPTION_CALL_PLAN");

    const inactiveOnrampWrapper = makeStandardDirectState();
    inactiveOnrampWrapper.authorities[2].active = false;
    expectCode(() => assertPolymarketVenueState(inactiveOnrampWrapper), "REDEMPTION_CALL_PLAN");

    const negativeFactory = makeNegativeFactoryState();
    expect(validateSchema(negativeFactory), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(negativeFactory)).not.toThrow();
    negativeFactory.erc1155Approvals = negativeFactory.erc1155Approvals.filter(
      (approval) => approval.owner !== NEGATIVE_FACTORY,
    );
    expectCode(() => assertPolymarketVenueState(negativeFactory), "REDEMPTION_CALL_PLAN");
  });

  test("aggregates exact onramp allowance across redemption executions", () => {
    const state = makeStandardDirectState();
    addSecondStandardDirectExecution(state);
    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expectCode(() => assertPolymarketVenueState(state), "REDEMPTION_CALL_PLAN");
    state.erc20Allowances[0].amount = "1000";
    expect(() => assertPolymarketVenueState(state)).not.toThrow();
  });

  test("rejects a missing or substituted adapter sweep tuple", () => {
    const state = makeDiagnosticState();
    const firstCtfSweep = state.redemptionConfigs[0].sweepBalances.find(
      (sweep) => sweep.tokenContract === CTF,
    );
    if (firstCtfSweep === undefined) throw new Error("fixture has no CTF sweep");
    firstCtfSweep.tokenId = "0";
    expectCode(() => assertPolymarketVenueState(state), "SWEEP_SET_MISMATCH");
  });

  test("rejects a response reference with no sidecar descriptor", () => {
    const state = makeDiagnosticState();
    state.books[0].responseHash = HASH_A;
    expectCode(() => assertPolymarketVenueState(state), "RESPONSE_REFERENCE");
  });

  test("rejects mixed event provenance", () => {
    const state = makeDiagnosticState();
    state.erc1155Approvals[0].lastEventBlockNumber = "1";
    expectCode(() => assertPolymarketVenueState(state), "PROVENANCE_TUPLE");
  });

  test("rejects an understated pUSD to USDC.e settlement exposure", () => {
    const state = makeDiagnosticState();
    state.collateralConfig.maxUsdceSettlementExposure = "999";
    expectCode(() => assertPolymarketVenueState(state), "COLLATERAL_EXPOSURE");
  });

  test("rejects order hash, status, reserve, and position reservation mismatches", () => {
    const hashMismatch = makeDiagnosticState();
    addBuyCommitment(hashMismatch);
    hashMismatch.orderCommitments[0].orderHash = HASH_A;
    expectCode(() => assertPolymarketVenueState(hashMismatch), "ORDER_HASH_MISMATCH");

    const statusMismatch = makeDiagnosticState();
    addBuyCommitment(statusMismatch);
    statusMismatch.orderCommitments[0].effectiveRemainingMakerAmount = "1";
    expectCode(() => assertPolymarketVenueState(statusMismatch), "ORDER_STATUS_MISMATCH");

    const reserveMismatch = makeDiagnosticState();
    addBuyCommitment(reserveMismatch);
    reserveMismatch.orderCommitments[0].reservedAssetContract = USDCE;
    expectCode(() => assertPolymarketVenueState(reserveMismatch), "ORDER_RESERVE_MISMATCH");

    const positionMismatch = makeDiagnosticState();
    positionMismatch.positions[0].reservedQuantity = "1";
    expectCode(() => assertPolymarketVenueState(positionMismatch), "POSITION_RESERVATION_MISMATCH");
  });

  test("accepts a matched sell reservation only in diagnostic mode", () => {
    const state = makeDiagnosticState();
    addSellCommitment(state);
    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(state)).not.toThrow();
    expectCode(
      () => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );
  });

  test("enforces the V2 uint248 order-status bound", () => {
    const state = makeDiagnosticState();
    addBuyCommitment(state);
    state.orderCommitments[0].statusRemaining = (1n << 248n).toString();
    expectCode(() => assertPolymarketVenueState(state), "ORDER_STATUS_MISMATCH");
  });

  test("can include the outer pUSD custody balance without double-counting buy reserves", () => {
    const state = makeDiagnosticState();
    expectCode(
      () => assertPolymarketVenueState(state, {
        verificationScope: "diagnostic",
        pUsdCustodyBalance: "500",
      }),
      "COLLATERAL_EXPOSURE",
    );
    state.collateralConfig.maxUsdceSettlementExposure = "1500";
    state.collateralConfig.vaultUsdceBalance = "1500";
    state.collateralConfig.vaultUsdceAllowance = "1500";
    expect(() => assertPolymarketVenueState(state, {
      verificationScope: "diagnostic",
      pUsdCustodyBalance: "500",
    })).not.toThrow();
  });

  test("keeps Deposit Wallet custody diagnostic-only", () => {
    const state = makeDiagnosticState();
    expect(() => assertPolymarketVenueState(state)).not.toThrow();
    expectCode(
      () => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );
  });

  test("requires both V2 domains and the full custody by route freeze matrix", () => {
    const state = makeSettlementState();
    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS)).not.toThrow();
    expectCode(
      () => assertPolymarketVenueState(state, {
        ...SETTLEMENT_STATE_OPTIONS,
        expectedAuthorityIdentities: BASE_EXPECTED_AUTHORITY_IDENTITIES.slice(0, -1),
      }),
      "AUTHORITY_SET_MISMATCH",
    );
    const missingAuthority = makeSettlementState();
    missingAuthority.authorities.pop();
    expectCode(
      () => assertPolymarketVenueState(missingAuthority, SETTLEMENT_STATE_OPTIONS),
      "AUTHORITY_SET_MISMATCH",
    );
    expectCode(
      () => assertPolymarketVenueState(state, uncheckedVenueOptions({
        verificationScope: "settlement",
        pUsdCustodyBalance: "0",
      })),
      "CUSTODY_BINDING",
    );
    expectCode(
      () => assertPolymarketVenueState(state, uncheckedVenueOptions({
        verificationScope: "settlement",
        strategyCustodyAccounts: [ACCOUNT],
        fundingSourceAccounts: [CORE_FUNDING_SOURCE],
        expectedAuthorityIdentities: BASE_EXPECTED_AUTHORITY_IDENTITIES,
      })),
      "COLLATERAL_EXPOSURE",
    );

    expectCode(
      () => assertPolymarketVenueState(state, uncheckedVenueOptions({
        verificationScope: "settlement",
        strategyCustodyAccounts: [ACCOUNT],
        pUsdCustodyBalance: "0",
        expectedAuthorityIdentities: BASE_EXPECTED_AUTHORITY_IDENTITIES,
      })),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    state.settlementFreezeConfigs.pop();
    expectCode(
      () => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });

  test("authenticates pUSD-only custody and freezes it across both V2 routes", () => {
    const state = makeSettlementState();
    addPUsdOnlyCustody(state);
    state.collateralConfig.maxUsdceSettlementExposure = "1250";
    state.collateralConfig.vaultUsdceBalance = "1250";
    state.collateralConfig.vaultUsdceAllowance = "1250";
    const options = {
      verificationScope: "settlement",
      strategyCustodyAccounts: [PUSD_ONLY_ACCOUNT, ACCOUNT],
      fundingSourceAccounts: [CORE_FUNDING_SOURCE],
      pUsdCustodyBalance: "250",
      expectedAuthorityIdentities: BASE_EXPECTED_AUTHORITY_IDENTITIES,
    } as const;

    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(state.positions.some((entry) => entry.position.custodyAccount === PUSD_ONLY_ACCOUNT)).toBe(false);
    expect(
      state.settlementFreezeConfigs.filter(
        (freeze) => freeze.custodyConfigId === "custody-pusd-only",
      ),
    ).toHaveLength(2);
    expect(() => assertPolymarketVenueState(state, options)).not.toThrow();

    expectCode(
      () => assertPolymarketVenueState(state, {
        ...options,
        strategyCustodyAccounts: [ACCOUNT],
      }),
      "CUSTODY_BINDING",
    );
    expectCode(
      () => assertPolymarketVenueState(state, {
        ...options,
        strategyCustodyAccounts: [ACCOUNT, PUSD_ONLY_ACCOUNT, OTHER_ACCOUNT].sort(),
      }),
      "CUSTODY_BINDING",
    );
    expectCode(
      () => assertPolymarketVenueState(state, {
        ...options,
        strategyCustodyAccounts: [ACCOUNT, OTHER_ACCOUNT],
      }),
      "CUSTODY_BINDING",
    );
    expectCode(
      () => assertPolymarketVenueState(state, {
        ...options,
        strategyCustodyAccounts: [ACCOUNT, PUSD_ONLY_ACCOUNT],
      }),
      "ARRAY_ORDER",
    );
    expectCode(
      () => assertPolymarketVenueState(state, {
        ...options,
        strategyCustodyAccounts: [ACCOUNT, ACCOUNT],
      }),
      "DUPLICATE_ID",
    );

    const settlementOptions = settlementCallOptions(state, "250");
    expect(() => assertPolymarketSettlementCall(state, {
      to: VAULT,
      input: SETTLEMENT_INPUT,
      enforcerCodeHash: HASH_D,
    }, settlementOptions)).not.toThrow();
    const missingSettlementAccounts: Partial<PolymarketSettlementCallOptions> =
      clone(settlementOptions);
    delete missingSettlementAccounts.strategyCustodyAccounts;
    expectCode(
      () => assertPolymarketSettlementCall(state, {
        to: VAULT,
        input: SETTLEMENT_INPUT,
        enforcerCodeHash: HASH_D,
      }, uncheckedSettlementCallOptions(missingSettlementAccounts)),
      "CUSTODY_BINDING",
    );

    state.settlementFreezeConfigs.pop();
    expectCode(
      () => assertPolymarketVenueState(state, options),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });

  test("rejects settlement-bearing validation with no custody", () => {
    const state = makeSettlementState();
    state.custodyConfigs = [];
    state.positions = [];
    state.books = [];
    state.standardOracleConfigs = [];
    state.redemptionConfigs = [];
    state.redemptionExecutions = [];
    state.settlementFreezeConfigs = [];
    state.erc1155Approvals = [];
    state.authorities = [];
    state.responses = [];
    state.collateralConfig.maxUsdceSettlementExposure = "0";
    state.collateralConfig.vaultUsdceBalance = "0";
    state.collateralConfig.vaultUsdceAllowance = "0";
    expectCode(
      () => assertPolymarketVenueState(state, {
        ...SETTLEMENT_STATE_OPTIONS,
        strategyCustodyAccounts: [],
        expectedAuthorityIdentities: [],
      }),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });

  test("binds authority-revocation predicates to pinned approvals and allowances", () => {
    const state = makeSettlementState();
    useRevocationPredicates(state);
    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(state)).not.toThrow();
    expectCode(
      () => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    state.erc20Allowances.pop();
    expectCode(
      () => assertPolymarketVenueState(state),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });

  test("rejects freeze calldata for the wrong custody account", () => {
    const state = makeSettlementState();
    state.settlementFreezeConfigs[0].predicateReads[0].calldata = "0x12345678";
    expectCode(
      () => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });

  test("requires a bare legacy Safe control surface for settlement", () => {
    const moduleState = makeSettlementState();
    moduleState.custodyConfigs[0].modules = [OTHER_ACCOUNT];
    expectCode(
      () => assertPolymarketVenueState(moduleState, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );

    const guardState = makeSettlementState();
    guardState.custodyConfigs[0].guard = OTHER_ACCOUNT;
    expectCode(
      () => assertPolymarketVenueState(guardState, SETTLEMENT_STATE_OPTIONS),
      "CUSTODY_BINDING",
    );
  });

  test("rejects a currently executable signed order in settlement-bearing mode", () => {
    const state = makeSettlementState();
    state.positions.forEach((position) => {
      position.userPausedBlockAt = "0";
      position.isUserPaused = false;
    });
    addBuyCommitment(state);
    state.orderCommitments[0].signer = SIGNER;
    state.orderCommitments[0].signatureType = "2";
    state.orderCommitments[0].orderHash = polymarketV2OrderHash(
      state.orderCommitments[0],
      STANDARD_EXCHANGE,
    );
    expectCode(
      () => assertPolymarketVenueState(state, SETTLEMENT_STATE_OPTIONS),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });

  test("keeps resolution-dependent wind-down calls outside the normal-roll trace", () => {
    const state = makeNegativeDirectState();
    state.custodyConfigs = [legacySafeCustody("custody-deposit", ACCOUNT, "7")];
    state.routeConfigs = [...state.routeConfigs, routeConfig("standard")].sort((left, right) =>
      left.routeId < right.routeId ? -1 : 1,
    );
    state.settlementFreezeConfigs = state.routeConfigs.map((route) => freezeConfig(route));
    state.positions.forEach((position) => {
      position.userPausedBlockAt = "1";
      position.isUserPaused = true;
    });
    for (const call of state.redemptionExecutions[0].redemptionCalls.slice(1)) {
      call.calldataState = "resolution-dependent";
      call.calldata = null;
      call.minimumOutputAmount = "0";
    }

    expect(validateSchema(state), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(() => assertPolymarketVenueState(state, {
      ...SETTLEMENT_STATE_OPTIONS,
      expectedAuthorityIdentities: state.authorities.map(({ contract, account, role }) => ({
        contract,
        account,
        role,
      })),
    })).not.toThrow();
  });

  test("requires prefunded non-custody sources and an isolated, unchanged Safe", () => {
    const state = makeSettlementState();
    const call = {
      to: VAULT,
      input: SETTLEMENT_INPUT,
      enforcerCodeHash: HASH_D,
    };

    const custodyFundingSource = clone(settlementCallOptions(state));
    custodyFundingSource.fundingSourceAccounts = [ACCOUNT];
    expectCode(
      () => assertPolymarketSettlementCall(state, call, custodyFundingSource),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const missingFundingSources: Partial<PolymarketSettlementCallOptions> =
      clone(settlementCallOptions(state));
    delete missingFundingSources.fundingSourceAccounts;
    expectCode(
      () => assertPolymarketSettlementCall(
        state,
        call,
        uncheckedSettlementCallOptions(missingFundingSources),
      ),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const custodyTargetCall = clone(settlementCallOptions(state));
    custodyTargetCall.strategyCustodyTargetCallCount = "1";
    expectCode(
      () => assertPolymarketSettlementCall(state, call, custodyTargetCall),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const custodyOriginCall = clone(settlementCallOptions(state));
    custodyOriginCall.strategyCustodyOriginCallCount = "1";
    expectCode(
      () => assertPolymarketSettlementCall(state, call, custodyOriginCall),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const safeDelegatecall = clone(settlementCallOptions(state));
    safeDelegatecall.safeDelegatecallCount = "1";
    expectCode(
      () => assertPolymarketSettlementCall(state, call, safeDelegatecall),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const exchangeCall = clone(settlementCallOptions(state));
    exchangeCall.stateChangingV2CallCount = "1";
    expectCode(
      () => assertPolymarketSettlementCall(state, call, exchangeCall),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const extraEvidence = {
      ...clone(settlementCallOptions(state)),
      unrecognizedTraceClaim: "0",
    };
    expectCode(
      () => assertPolymarketSettlementCall(state, call, extraEvidence),
      "INVALID_SHAPE",
    );

    const wrongMasterCopy = clone(settlementCallOptions(state));
    wrongMasterCopy.custodyChecks[0].postMasterCopyReturnData = HASH_A;
    expectCode(
      () => assertPolymarketSettlementCall(state, call, wrongMasterCopy),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const changedSingletonRuntime = clone(settlementCallOptions(state));
    changedSingletonRuntime.custodyChecks[0].postImplementationCodeHash = HASH_A;
    expectCode(
      () => assertPolymarketSettlementCall(state, call, changedSingletonRuntime),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const changedOwners = clone(settlementCallOptions(state));
    changedOwners.custodyChecks[0].postControllers = [OTHER_ACCOUNT];
    expectCode(
      () => assertPolymarketSettlementCall(state, call, changedOwners),
      "SETTLEMENT_FREEZE_CONFIG",
    );

    const wrongNonceDelta = clone(settlementCallOptions(state));
    wrongNonceDelta.custodyChecks[0].postNonce = (
      BigInt(wrongNonceDelta.custodyChecks[0].preNonce) + 1n
    ).toString();
    expectCode(
      () => assertPolymarketSettlementCall(state, call, wrongNonceDelta),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });

  test("binds the outer settlement target and selector to the shared enforcer", () => {
    const state = makeSettlementState();
    expect(() =>
      assertPolymarketSettlementCall(state, {
        to: VAULT,
        input: SETTLEMENT_INPUT,
        enforcerCodeHash: HASH_D,
      }, settlementCallOptions(state)),
    ).not.toThrow();
    expectCode(
      () =>
        assertPolymarketSettlementCall(state, {
          to: VAULT,
          input: SETTLEMENT_INPUT,
          enforcerCodeHash: HASH_D,
        }, {
          ...settlementCallOptions(state),
          strategyCustodyAccounts: [ACCOUNT, OTHER_ACCOUNT],
        }),
      "CUSTODY_BINDING",
    );
    expectCode(
      () =>
        assertPolymarketSettlementCall(state, {
          to: ACCOUNT,
          input: SETTLEMENT_INPUT,
          enforcerCodeHash: HASH_D,
        }, settlementCallOptions(state)),
      "SETTLEMENT_FREEZE_CONFIG",
    );
    expectCode(
      () =>
        assertPolymarketSettlementCall(state, {
          to: VAULT,
          input: "0xdeadbeef1234",
          enforcerCodeHash: HASH_D,
        }, settlementCallOptions(state)),
      "SETTLEMENT_FREEZE_CONFIG",
    );
    expectCode(
      () =>
        assertPolymarketSettlementCall(state, {
          to: VAULT,
          input: SETTLEMENT_INPUT,
          enforcerCodeHash: HASH_E,
        }, settlementCallOptions(state)),
      "SETTLEMENT_FREEZE_CONFIG",
    );
    expectCode(
      () =>
        assertPolymarketSettlementCall(state, {
          to: VAULT,
          input: `${SETTLEMENT_INPUT}00`,
          enforcerCodeHash: HASH_D,
        }, settlementCallOptions(state)),
      "SETTLEMENT_FREEZE_CONFIG",
    );
  });
});
