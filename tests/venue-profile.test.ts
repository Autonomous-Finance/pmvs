// SPDX-License-Identifier: CC0-1.0

import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";

import positionSchema from "../schemas/position-gnosis-ctf-1.schema.json";
import venueSchema from "../schemas/venue-polymarket-1.schema.json";

const CTF = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const USDCE = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const WCOL = "0x3a3bd7bb9528e159577f7c2e685cc81a765002e2";
const NEG_RISK_ADAPTER = "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296";
const ONRAMP = "0x93070a847efef7f70739046a929d47a521f5b8ee";
const V31_ORACLE = "0x157ce2d672854c848c9b79c49a8cc6cc89176a49";
const V4_ORACLE = "0x65070be91477460d8a7aeeb94ef92fe056c2f2a7";
const DEPOSIT_FACTORY = "0x00000000000fb5c9adea0298d729a0cb3823cc07";
const DEPOSIT_FACTORY_IMPLEMENTATION = "0x528cc05efac2b0d255e423272187efd41248abd7";
const SAFE_FACTORY = "0xaacfeea03eb1561c4e67d661e40682bd20e3541b";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const SIGNER = "0x2222222222222222222222222222222222222222";
const VAULT = "0x3333333333333333333333333333333333333333";
const FEE_RECEIVER = "0x4444444444444444444444444444444444444444";
const HASH_A = `0x${"11".repeat(32)}`;
const HASH_B = `0x${"22".repeat(32)}`;
const HASH_C = `0x${"33".repeat(32)}`;
const HASH_D = `0x${"44".repeat(32)}`;
const ZERO_HASH = `0x${"00".repeat(32)}`;
const BOOL_TRUE = `0x${"00".repeat(31)}01`;
const STANDARD_SOURCE_COMMITS = [
  "ccc0596074f4dfd62c944fbca4de252893b82b4b",
  "eeefca66eb46c800a9aaab88db2064a99026fde5",
];
const NEGATIVE_SOURCE_COMMITS = [
  ...STANDARD_SOURCE_COMMITS,
  "f78b35b0863b4308a431ca307d06f49b2ea65e78",
];
const addressArgument = (address: string) => `${"00".repeat(12)}${address.slice(2)}`;
const USER_PAUSED_CALL = `0x28872101${addressArgument(ACCOUNT)}`;
const SECOND_USER_PAUSED_CALL = `0x28872101${addressArgument(SIGNER)}`;
const APPROVAL_CALL = `0xe985e9c5${addressArgument(ACCOUNT)}${addressArgument("0xe2222d279d744050d28e00520010520000310f59")}`;
const ALLOWANCE_CALL = `0xdd62ed3e${addressArgument(ACCOUNT)}${addressArgument("0xe2222d279d744050d28e00520010520000310f59")}`;

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(positionSchema);
const validate = ajv.compile(venueSchema);

const clone = <T>(value: T): T => structuredClone(value);

type SessionSignerFixture = {
  signer: string;
  validUntil: string;
  active: boolean;
  lastEventBlockNumber: string;
  lastEventTransactionHash: string;
  lastEventLogIndex: string;
};

type PasskeySessionSignerFixture = {
  passkeyId: string;
  x: string;
  y: string;
  validUntil: string;
  active: boolean;
  lastEventBlockNumber: string;
  lastEventTransactionHash: string;
  lastEventLogIndex: string;
};

function expectValid(value: unknown) {
  const valid = validate(value);
  expect(valid, JSON.stringify(validate.errors)).toBe(true);
}

function expectInvalid(value: unknown) {
  expect(validate(value)).toBe(false);
}

const collateralConfig = {
  accountingToken: PUSD,
  proxyCodeHash: "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
  implementation: "0x6bbcef9f7ef3b6c592c99e0f206a0de94ad0925f",
  implementationCodeHash: "0x932c9369433b333d6d97d99b7731885751862aa3502122786d24174a9fd8e58e",
  decimals: "6",
  nativeUsdc: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  usdce: USDCE,
  vault: VAULT,
  totalSupply: "1000000",
  maxUsdceSettlementExposure: "500000",
  vaultUsdceBalance: "500000",
  vaultUsdceAllowance: "500000",
  onramp: ONRAMP,
  onrampCodeHash: "0x89eaba6b38dda7ebd07176f42f9e9f70dbadd46b7cbf826d15341729b19bb389",
  onrampCollateralToken: PUSD,
  onrampPausedUsdce: false,
  offramp: "0x2957922eb93258b93368531d39facca3b4dc5854",
  offrampCodeHash: "0x18de842db0ec4b253afe413446ac5c6c26e878289f5c7a425a9464dbad72d45d",
  offrampCollateralToken: PUSD,
  offrampPausedUsdce: false,
};

const baseVenueState = {
  profile: "venue/polymarket/1",
  custodyConfigs: [],
  positions: [],
  books: [],
  routeConfigs: [],
  standardOracleConfigs: [],
  negRiskConfigs: [],
  redemptionConfigs: [],
  redemptionExecutions: [],
  orderCommitments: [],
  settlementFreezeConfigs: [],
  collateralConfig,
  wrappedCollateralConfig: null,
  erc1155Approvals: [],
  erc20Allowances: [],
  authorities: [],
  responses: [],
};

const depositWallet = {
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
  factoryCodeHash: "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
  factoryImplementation: DEPOSIT_FACTORY_IMPLEMENTATION,
  factoryImplementationCodeHash: "0xe6424f1008e46b4b657efacf9500ea7747cbbf3055d9d76459253ac2884793d2",
  proxyMode: "deposit-shared-erc1967",
  implementationResolver: "0x7a18edfe055488a3128f01f563e5b479d92ffc3a",
  implementationResolverCodeHash: "0xf87b06a1302051471df08ff79a938757509569e16b7a7efa55a3ea7b29b0b9d1",
  implementation: "0xf7f27c29e60fe6325bef8da7f93250353d2e3294",
  implementationCodeHash: "0xf5c1072460e64902af84d35f5bb1d0a15d80a88c5827b831a977fbc5a0684b96",
  controllers: [SIGNER],
  threshold: "1",
  modules: [],
  guard: null,
  fallbackHandler: null,
  pausedAt: "0",
  implementationPinned: false,
  sessionSigners: [] as SessionSignerFixture[],
  passkeySessionSigners: [] as PasskeySessionSignerFixture[],
  nonce: "7",
};

const legacySafe = {
  custodyConfigId: "custody-safe",
  custodyAccount: ACCOUNT,
  walletKind: "legacy-gnosis-safe",
  signatureType: "2",
  makerAddress: ACCOUNT,
  orderSignerAddress: SIGNER,
  accountSignerAddress: SIGNER,
  owner: null,
  pendingOwner: null,
  pendingOwnerDeadline: null,
  pendingOwnerNonce: null,
  runtimeCodeHash: "0x92565062fdea8761e07d9df2fcdbd66c0582af6ddf0e0355bc07754ad97400b0",
  factory: SAFE_FACTORY,
  factoryCodeHash: "0x7a423db1d467bbd092e48044242a9c1f003442a83ca8109f0f7c07a50782e23d",
  factoryImplementation: null,
  factoryImplementationCodeHash: null,
  proxyMode: "legacy-safe-proxy",
  implementationResolver: null,
  implementationResolverCodeHash: null,
  implementation: "0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8",
  implementationCodeHash: "0xf4b625c76701938f75938880a926414b5f91471d32e21c0cbb37566b62495ca7",
  controllers: [SIGNER],
  threshold: "1",
  modules: [],
  guard: null,
  fallbackHandler: null,
  pausedAt: null,
  implementationPinned: null,
  sessionSigners: [],
  passkeySessionSigners: [],
  nonce: "8",
};

const exactCall = {
  target: CTF,
  value: "0",
  calldataState: "exact",
  calldata: "0x1234",
  expectedOutputToken: USDCE,
  minimumOutputAmount: "1",
};

const exactOnrampCall = {
  ...exactCall,
  target: ONRAMP,
  calldata: "0x5678",
  expectedOutputToken: PUSD,
};

const dependentCall = {
  target: NEG_RISK_ADAPTER,
  value: "0",
  calldataState: "resolution-dependent",
  calldata: null,
  expectedOutputToken: USDCE,
  minimumOutputAmount: "0",
};

const dependentOnrampCall = {
  ...dependentCall,
  target: ONRAMP,
  expectedOutputToken: PUSD,
};

const standardPosition = {
  profile: "position/gnosis-ctf/1",
  chainId: "137",
  positionContract: CTF,
  custodyAccount: ACCOUNT,
  collateralToken: USDCE,
  oracle: V31_ORACLE,
  questionId: HASH_A,
  outcomeSlotCount: "2",
  conditionId: HASH_B,
  parentCollectionId: ZERO_HASH,
  indexSet: "1",
  collectionId: HASH_C,
  positionId: "123",
  quantity: "1000",
};

const standardPositionEntry = {
  position: standardPosition,
  custodyConfigId: "custody-deposit",
  marketKind: "standard",
  routeId: "route-standard",
  standardOracleConfigId: "oracle-standard",
  negRiskConfigId: null,
  redemptionExecutionId: "execute-standard",
  conditionPreparation: {
    blockNumber: "100",
    blockHash: HASH_A,
    transactionHash: HASH_B,
    logIndex: "2",
    oracle: V31_ORACLE,
    questionId: HASH_A,
    outcomeSlotCount: "2",
  },
  userPausedBlockAt: "0",
  isUserPaused: false,
  reservedQuantity: "100",
  venueReportedSize: null,
};

const standardBook = {
  assetId: "123",
  market: HASH_B,
  negRisk: false,
  venueTimestampMs: "1000",
  venueHash: "opaque-book-hash",
  minOrderSizeBase: "1",
  tickSizeU6: "1000",
  lastTradePriceU6: null,
  bids: [{ priceU6: "500000", quantity: "1000" }],
  bidsTruncated: false,
  responseHash: HASH_D,
};

const standardRoute = {
  routeId: "route-standard",
  marketKind: "standard",
  exchange: "0xe111180000d2663c0091e4f400237545b87b996b",
  exchangeCodeHash: "0xa08da89bbac2063dfa6a705e70314d218d40fb2b2a6405442297c241fcd58401",
  exchangeCollateralToken: PUSD,
  ctf: CTF,
  ctfCodeHash: "0xbe524e094025c2a1122ccfbe3264e29fe662d7e0ae518b6926135c814405eceb",
  ctfCollateralToken: USDCE,
  outcomeTokenFactory: "0xada100874d00e3331d00f2007a9c336a65009718",
  outcomeTokenFactoryCodeHash: "0x1ece8945fe803fe6a0ff4f10d13979830429f51463075f3f284031d8bc17d9ed",
  factoryConditionalTokens: CTF,
  factoryCollateralToken: PUSD,
  factoryUsdce: USDCE,
  factoryNegRiskAdapter: null,
  factoryWrappedCollateral: null,
  factoryPausedUsdce: false,
  legacySafeFactory: SAFE_FACTORY,
  legacySafeFactoryCodeHash: "0x7a423db1d467bbd092e48044242a9c1f003442a83ca8109f0f7c07a50782e23d",
  legacySafeImplementation: "0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8",
  legacySafeImplementationCodeHash: "0xf4b625c76701938f75938880a926414b5f91471d32e21c0cbb37566b62495ca7",
  exchangePaused: false,
  userPauseBlockInterval: "100",
  maxFeeRateBps: "500",
  feeReceiver: FEE_RECEIVER,
  sourceCommit: "ccc0596074f4dfd62c944fbca4de252893b82b4b",
};

const standardOracle = {
  standardOracleConfigId: "oracle-standard",
  oracle: V31_ORACLE,
  version: "v3.1.0",
  runtimeCodeHash: "0xe44d7e53a84493f6b71255e19f42f7cea9b8be486492fee80529c75d75f61579",
  ctf: CTF,
  optimisticOracle: "0xee3afe347d5c74317041e2618c49534daf887c24",
  collateralWhitelist: "0x1020ae36548ab28bc0c41fd2a08d24132c82cc55",
  questionId: HASH_A,
  initialized: true,
  flagged: false,
  ready: false,
  questionStateReturnData: "0x",
  sourceCommit: "10dd8829d710ed9c2541b4196b463ad0c90546fc",
};

const standardDirectRedemption = {
  redemptionRouteId: "redeem-standard",
  marketKind: "standard",
  kind: "direct-ctf-onramp",
  adapterRole: "none",
  entrypoint: CTF,
  entrypointCodeHash: "0xbe524e094025c2a1122ccfbe3264e29fe662d7e0ae518b6926135c814405eceb",
  rawCtfCollateralToken: USDCE,
  intermediateOutputTokens: [USDCE],
  accountingOutputToken: PUSD,
  balanceSelection: "caller-full-listed-ids",
  conditionalTokens: CTF,
  collateralToken: null,
  usdce: USDCE,
  negRiskAdapter: null,
  wrappedCollateral: null,
  onramp: ONRAMP,
  onrampCodeHash: "0x89eaba6b38dda7ebd07176f42f9e9f70dbadd46b7cbf826d15341729b19bb389",
  sweepBalances: [],
  pausedUsdce: false,
  sourceCommits: STANDARD_SOURCE_COMMITS,
};

const standardRedemptionExecution = {
  redemptionExecutionId: "execute-standard",
  custodyConfigId: "custody-deposit",
  marketKind: "standard",
  conditionId: HASH_B,
  payoutNumerators: ["0", "0"],
  payoutDenominator: "0",
  redemptionRouteId: "redeem-standard",
  coveredPositionIds: ["123"],
  redemptionCalls: [exactCall, exactOnrampCall],
};

const sellOrderCommitment = {
  custodyConfigId: "custody-deposit",
  routeId: "route-standard",
  orderHash: HASH_B,
  salt: "1",
  maker: ACCOUNT,
  signer: ACCOUNT,
  tokenId: "123",
  makerAmount: "100",
  takerAmount: "50",
  side: "1",
  signatureType: "3",
  timestamp: "900",
  metadata: ZERO_HASH,
  builder: HASH_C,
  signature: "0x1234",
  statusFilled: false,
  statusRemaining: "0",
  effectiveRemainingMakerAmount: "100",
  signatureValid: true,
  transferAuthorityActive: true,
  userPausedBlockAt: "0",
  isUserPaused: false,
  reservedAssetType: "erc1155",
  reservedAssetContract: CTF,
  reservedTokenId: "123",
  reservedAmount: "100",
};

const standardFreezeConfig = {
  freezeConfigId: "freeze-standard",
  custodyConfigId: "custody-deposit",
  routeId: "route-standard",
  predicate: "effective-user-pause",
  enforcementMode: "settlement-transaction-precondition",
  predicateReads: [
    {
      target: "0xe111180000d2663c0091e4f400237545b87b996b",
      calldata: USER_PAUSED_CALL,
      expectedReturnData: BOOL_TRUE,
    },
  ],
  enforcer: VAULT,
  enforcerCodeHash: HASH_D,
  settlementFunctionSelector: "0xabcdef12",
  settlementCalldataHash: HASH_A,
  enforcerSourceCommit: "ccc0596074f4dfd62c944fbca4de252893b82b4b",
};

const negativeFreezeConfig = {
  ...standardFreezeConfig,
  freezeConfigId: "freeze-negative",
  custodyConfigId: "custody-safe",
  routeId: "route-negative",
  predicate: "transfer-authorities-revoked",
  predicateReads: [
    {
      target: CTF,
      calldata: APPROVAL_CALL,
      expectedReturnData: ZERO_HASH,
    },
    {
      target: PUSD,
      calldata: ALLOWANCE_CALL,
      expectedReturnData: ZERO_HASH,
    },
  ],
};

const response = {
  responseHash: HASH_D,
  sourceProfile: "venue/polymarket/1",
  requestMethod: "GET",
  requestUrl: "https://clob.polymarket.com/book?token_id=123",
  httpStatus: "200",
  startedAtMs: "900",
  endedAtMs: "1000",
  mediaType: "application/json",
  bodyLength: "42",
  retrievalUris: ["ipfs://example"],
};

const factoryUpgradeAuthority = {
  contract: DEPOSIT_FACTORY,
  account: SIGNER,
  role: "deposit-wallet-factory-upgrader",
  active: true,
  candidateSource: "event",
  lastEventBlockNumber: "9",
  lastEventTransactionHash: HASH_A,
  lastEventLogIndex: "0",
};

const standardVenueState = {
  ...baseVenueState,
  custodyConfigs: [depositWallet],
  positions: [standardPositionEntry],
  books: [standardBook],
  routeConfigs: [standardRoute],
  standardOracleConfigs: [standardOracle],
  redemptionConfigs: [standardDirectRedemption],
  redemptionExecutions: [standardRedemptionExecution],
  orderCommitments: [sellOrderCommitment],
  settlementFreezeConfigs: [standardFreezeConfig],
  erc1155Approvals: [
    {
      tokenContract: CTF,
      owner: ACCOUNT,
      operator: "0xada100874d00e3331d00f2007a9c336a65009718",
      approved: true,
      lastEventBlockNumber: null,
      lastEventTransactionHash: null,
      lastEventLogIndex: null,
    },
  ],
  erc20Allowances: [
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
  ],
  authorities: [
    factoryUpgradeAuthority,
    {
      contract: ONRAMP,
      account: SIGNER,
      role: "admin",
      active: true,
      candidateSource: "event",
      lastEventBlockNumber: "10",
      lastEventTransactionHash: HASH_A,
      lastEventLogIndex: "1",
    },
  ],
  responses: [response],
};

const negativePosition = {
  ...standardPosition,
  collateralToken: WCOL,
  oracle: NEG_RISK_ADAPTER,
  questionId: `0x${"11".repeat(31)}01`,
  conditionId: HASH_C,
  collectionId: HASH_D,
  positionId: "456",
};

const negativePositionEntry = {
  ...standardPositionEntry,
  position: negativePosition,
  marketKind: "negative-risk",
  routeId: "route-negative",
  standardOracleConfigId: null,
  negRiskConfigId: "neg-config",
  redemptionExecutionId: "execute-negative",
  conditionPreparation: {
    ...standardPositionEntry.conditionPreparation,
    oracle: NEG_RISK_ADAPTER,
    questionId: negativePosition.questionId,
  },
};

const negativeRoute = {
  ...standardRoute,
  routeId: "route-negative",
  marketKind: "negative-risk",
  exchange: "0xe2222d279d744050d28e00520010520000310f59",
  exchangeCodeHash: "0x04b857d48dcc38b3d484239569dc96a7a6c39bbb90ed2461227fc6e50ed5787d",
  ctfCollateralToken: WCOL,
  outcomeTokenFactory: "0xada200001000ef00d07553cee7006808f895c6f1",
  outcomeTokenFactoryCodeHash: "0x0cec3398b0b528b191ccb9b0e7d023731c8f582f401d526f48ca7575df7a003e",
  factoryNegRiskAdapter: NEG_RISK_ADAPTER,
  factoryWrappedCollateral: WCOL,
};

const eventLocation = {
  blockNumber: "90",
  blockHash: HASH_A,
  transactionHash: HASH_B,
  logIndex: "1",
};

const negativeRiskConfig = {
  negRiskConfigId: "neg-config",
  marketId: `0x${"11".repeat(31)}00`,
  questionId: negativePosition.questionId,
  questionIndex: "1",
  questionCount: "255",
  feeBps: "0",
  determined: false,
  resultIndex: null as string | null,
  negRiskAdapter: NEG_RISK_ADAPTER,
  negRiskAdapterCodeHash: "0x10798bfdebdc3b8727171551b1287ee4c87b486045ed51a6ddc94e34f66560a1",
  wrappedCollateral: WCOL,
  marketOperator: "0x661992aebf6becf7ba5abb66f6b0bf62aa7a2e93",
  marketOperatorCodeHash: "0xcdf35da3f66423b7fa071ca745396c19d961e295ecae60516be55035b890797a",
  operatorNegRiskAdapter: NEG_RISK_ADAPTER,
  upstreamOracle: "0x69c47de9d4d3dad79590d61b9e05918e03775f24",
  upstreamOracleCodeHash: "0x76a83a5e6b6e30a6fefe5ca6af94dcfed92cea8e8ea739abbc8d4a663c876be1",
  upstreamCtf: "0x661992aebf6becf7ba5abb66f6b0bf62aa7a2e93",
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
  reportedResult: null as boolean | null,
  adapterMarketPrepared: {
    ...eventLocation,
    marketId: `0x${"11".repeat(31)}00`,
    oracle: "0x661992aebf6becf7ba5abb66f6b0bf62aa7a2e93",
    feeBps: "0",
    data: "0x",
  },
  adapterQuestionPrepared: {
    ...eventLocation,
    marketId: `0x${"11".repeat(31)}00`,
    questionId: negativePosition.questionId,
    questionIndex: "1",
    data: "0x",
  },
  operatorMarketPrepared: {
    ...eventLocation,
    marketId: `0x${"11".repeat(31)}00`,
    feeBps: "0",
    data: "0x",
  },
  operatorQuestionPrepared: {
    ...eventLocation,
    marketId: `0x${"11".repeat(31)}00`,
    questionId: negativePosition.questionId,
    requestId: HASH_D,
    questionIndex: "1",
    data: "0x",
  },
  operatorSourceCommit: "f78b35b0863b4308a431ca307d06f49b2ea65e78",
  upstreamSourceCommit: "8b76cc9e0d46c6f7450a0adb0ddc0f5b0568c9cc",
};

const zeroSweep = (account: string, tokenContract: string, tokenId: string | null) => ({
  account,
  tokenContract,
  tokenId,
  amount: "0",
});

const negativeLegacyRedemption = {
  redemptionRouteId: "redeem-negative",
  marketKind: "negative-risk",
  kind: "neg-risk-adapter-onramp",
  adapterRole: "legacy-neg-risk-adapter",
  entrypoint: NEG_RISK_ADAPTER,
  entrypointCodeHash: "0x10798bfdebdc3b8727171551b1287ee4c87b486045ed51a6ddc94e34f66560a1",
  rawCtfCollateralToken: WCOL,
  intermediateOutputTokens: [WCOL, USDCE],
  accountingOutputToken: PUSD,
  balanceSelection: "explicit-binary-amounts",
  conditionalTokens: CTF,
  collateralToken: USDCE,
  usdce: USDCE,
  negRiskAdapter: null,
  wrappedCollateral: WCOL,
  onramp: ONRAMP,
  onrampCodeHash: "0x89eaba6b38dda7ebd07176f42f9e9f70dbadd46b7cbf826d15341729b19bb389",
  sweepBalances: [
    zeroSweep(NEG_RISK_ADAPTER, CTF, "11"),
    zeroSweep(NEG_RISK_ADAPTER, CTF, "12"),
    zeroSweep(NEG_RISK_ADAPTER, WCOL, null),
  ],
  pausedUsdce: false,
  sourceCommits: NEGATIVE_SOURCE_COMMITS,
};

const standardFactoryRedemption = {
  ...standardDirectRedemption,
  kind: "ctf-exchange-bound-factory",
  adapterRole: "exchange-bound-factory",
  entrypoint: "0xada100874d00e3331d00f2007a9c336a65009718",
  entrypointCodeHash: "0x1ece8945fe803fe6a0ff4f10d13979830429f51463075f3f284031d8bc17d9ed",
  balanceSelection: "caller-full-binary-set",
  collateralToken: PUSD,
  onramp: null,
  onrampCodeHash: null,
  sweepBalances: [
    zeroSweep("0xada100874d00e3331d00f2007a9c336a65009718", CTF, "1"),
    zeroSweep("0xada100874d00e3331d00f2007a9c336a65009718", CTF, "2"),
    zeroSweep("0xada100874d00e3331d00f2007a9c336a65009718", USDCE, null),
  ],
};

const negativeFactoryRedemption = {
  ...negativeLegacyRedemption,
  kind: "neg-risk-exchange-bound-factory",
  adapterRole: "exchange-bound-factory",
  entrypoint: "0xada200001000ef00d07553cee7006808f895c6f1",
  entrypointCodeHash: "0x0cec3398b0b528b191ccb9b0e7d023731c8f582f401d526f48ca7575df7a003e",
  balanceSelection: "caller-full-binary-set",
  collateralToken: PUSD,
  negRiskAdapter: NEG_RISK_ADAPTER,
  onramp: null,
  onrampCodeHash: null,
  sweepBalances: [
    zeroSweep("0xada200001000ef00d07553cee7006808f895c6f1", CTF, "1"),
    zeroSweep("0xada200001000ef00d07553cee7006808f895c6f1", CTF, "2"),
    zeroSweep(NEG_RISK_ADAPTER, CTF, "1"),
    zeroSweep(NEG_RISK_ADAPTER, CTF, "2"),
    zeroSweep(NEG_RISK_ADAPTER, WCOL, null),
    zeroSweep("0xada200001000ef00d07553cee7006808f895c6f1", USDCE, null),
  ],
};

const negativeRedemptionExecution = {
  redemptionExecutionId: "execute-negative",
  custodyConfigId: "custody-safe",
  marketKind: "negative-risk",
  conditionId: HASH_C,
  payoutNumerators: ["0", "0"],
  payoutDenominator: "0",
  redemptionRouteId: "redeem-negative",
  coveredPositionIds: ["456"],
  redemptionCalls: [dependentCall, dependentOnrampCall],
};

const wrappedCollateralConfig = {
  wrappedCollateral: WCOL,
  runtimeCodeHash: "0x99c62168488983e6ac023c62a6dca53acc7e8e902849fb72a9b08f29545dc474",
  owner: NEG_RISK_ADAPTER,
  underlying: USDCE,
  decimals: "6",
  totalSupply: "1000000",
  maxRedemptionExposure: "1000",
  underlyingBalance: "1000",
};

const negativeVenueState = {
  ...baseVenueState,
  custodyConfigs: [legacySafe],
  positions: [negativePositionEntry],
  books: [{ ...standardBook, assetId: "456", market: HASH_C, negRisk: true }],
  routeConfigs: [negativeRoute],
  negRiskConfigs: [negativeRiskConfig],
  redemptionConfigs: [negativeLegacyRedemption],
  redemptionExecutions: [negativeRedemptionExecution],
  settlementFreezeConfigs: [negativeFreezeConfig],
  wrappedCollateralConfig,
  responses: [response],
};

describe("Polymarket venue profile schema", () => {
  test("accepts the closed empty state and both custody wallet branches", () => {
    expectValid(baseVenueState);
    expectValid({
      ...baseVenueState,
      custodyConfigs: [depositWallet, legacySafe],
      authorities: [factoryUpgradeAuthority],
    });

    const uups = {
      ...depositWallet,
      proxyMode: "deposit-uups",
      implementationResolver: null,
      implementationResolverCodeHash: null,
    };
    expectValid({
      ...baseVenueState,
      custodyConfigs: [uups],
      authorities: [factoryUpgradeAuthority],
    });
  });

  test("accepts a complete synthetic standard branch", () => {
    expectValid(standardVenueState);

    const pausedDiagnostic = clone(standardVenueState);
    pausedDiagnostic.positions[0].isUserPaused = true;
    pausedDiagnostic.positions[0].reservedQuantity = "0";
    pausedDiagnostic.orderCommitments = [];
    expectValid(pausedDiagnostic);
  });

  test("accepts a complete synthetic negative-risk branch", () => {
    expectValid(negativeVenueState);
  });

  test("accepts every redemption kind and enforces adapter address-role pairs", () => {
    const negativeDirect = {
      ...standardDirectRedemption,
      marketKind: "negative-risk",
      kind: "neg-risk-direct-ctf-onramp",
      rawCtfCollateralToken: WCOL,
      intermediateOutputTokens: [WCOL, USDCE],
      wrappedCollateral: WCOL,
      sourceCommits: NEGATIVE_SOURCE_COMMITS,
    };

    for (const route of [
      standardDirectRedemption,
      standardFactoryRedemption,
      negativeDirect,
      negativeLegacyRedemption,
      negativeFactoryRedemption,
    ]) {
      expectValid({ ...baseVenueState, redemptionConfigs: [route] });
    }

    expectInvalid({
      ...baseVenueState,
      redemptionConfigs: [
        {
          ...standardFactoryRedemption,
          adapterRole: "direct-wallet-adapter",
          entrypoint: "0xada100db00ca00073811820692005400218fce1f",
          entrypointCodeHash: "0x93b965351d01c1a128821ac79fc98a18105daefb46bda0d1e5b52306d713aa4f",
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionConfigs: [
        {
          ...negativeFactoryRedemption,
          adapterRole: "direct-wallet-adapter",
          entrypoint: "0xada2005600dec949baf300f4c6120000bdb6eaab",
          entrypointCodeHash: "0x3b892c7c2f80e7af69f28faf72a51c2d793f6b79b96011bdf0a1996319fcbe5b",
        },
      ],
    });
  });

  test("requires the exact canonical source revision set for every redemption family", () => {
    expectInvalid({
      ...baseVenueState,
      redemptionConfigs: [
        { ...standardDirectRedemption, sourceCommits: STANDARD_SOURCE_COMMITS.slice(0, 1) },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionConfigs: [
        {
          ...standardFactoryRedemption,
          sourceCommits: [STANDARD_SOURCE_COMMITS[0], "1111111111111111111111111111111111111111"],
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionConfigs: [
        {
          ...negativeLegacyRedemption,
          sourceCommits: [...NEGATIVE_SOURCE_COMMITS, "1111111111111111111111111111111111111111"],
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionConfigs: [
        { ...negativeFactoryRedemption, sourceCommits: [...NEGATIVE_SOURCE_COMMITS].reverse() },
      ],
    });
  });

  test("rejects unknown fields at every tested object depth", () => {
    expectInvalid({ ...baseVenueState, unknown: true });

    const callState = clone(standardVenueState);
    (callState.redemptionExecutions[0].redemptionCalls[0] as typeof exactCall & { unknown: boolean }).unknown = true;
    expectInvalid(callState);

    const bookState = clone(standardVenueState);
    (bookState.books[0].bids[0] as { priceU6: string; quantity: string; unknown: boolean }).unknown = true;
    expectInvalid(bookState);

    const eventState = clone(standardVenueState);
    (eventState.positions[0].conditionPreparation as typeof standardPositionEntry.conditionPreparation & { unknown: boolean }).unknown = true;
    expectInvalid(eventState);

    const negativeEventState = clone(negativeVenueState);
    (negativeEventState.negRiskConfigs[0].operatorQuestionPrepared as typeof negativeRiskConfig.operatorQuestionPrepared & { unknown: boolean }).unknown = true;
    expectInvalid(negativeEventState);
  });

  test("rejects wallet discriminator and proxy-mode mismatches", () => {
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...depositWallet, signatureType: "2" }],
      authorities: [factoryUpgradeAuthority],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...legacySafe, pausedAt: "0" }],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...legacySafe, runtimeCodeHash: HASH_A }],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...legacySafe, factory: ACCOUNT }],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...legacySafe, factoryCodeHash: HASH_A }],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...legacySafe, implementation: ACCOUNT }],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...legacySafe, implementationCodeHash: HASH_A }],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...depositWallet, proxyMode: "deposit-uups" }],
      authorities: [factoryUpgradeAuthority],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...depositWallet, factoryImplementation: ACCOUNT }],
      authorities: [factoryUpgradeAuthority],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [depositWallet],
      authorities: [],
    });

    const pinnedWallet = {
      ...depositWallet,
      proxyMode: "deposit-implementation-pinned",
      implementationResolver: null,
      implementationResolverCodeHash: null,
      implementationPinned: true,
    };
    expectValid({
      ...baseVenueState,
      custodyConfigs: [pinnedWallet],
      authorities: [factoryUpgradeAuthority],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...pinnedWallet, implementationPinned: false }],
      authorities: [factoryUpgradeAuthority],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...depositWallet, implementationPinned: true }],
      authorities: [factoryUpgradeAuthority],
    });
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...depositWallet, controllers: [SIGNER, FEE_RECEIVER] }],
      authorities: [factoryUpgradeAuthority],
    });
  });

  test("closes Deposit Wallet ownership, pause timestamp, and session-candidate rows", () => {
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...depositWallet, pausedAt: false }],
      authorities: [factoryUpgradeAuthority],
    });

    const missingOwner = clone(depositWallet) as Record<string, unknown>;
    delete missingOwner.owner;
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [missingOwner],
      authorities: [factoryUpgradeAuthority],
    });

    const signerRows = clone(depositWallet);
    signerRows.sessionSigners = [{
      signer: FEE_RECEIVER,
      validUntil: "1001",
      active: true,
      lastEventBlockNumber: "90",
      lastEventTransactionHash: HASH_A,
      lastEventLogIndex: "0",
    }];
    signerRows.passkeySessionSigners = [{
      passkeyId: HASH_B,
      x: ZERO_HASH,
      y: ZERO_HASH,
      validUntil: "0",
      active: false,
      lastEventBlockNumber: "91",
      lastEventTransactionHash: HASH_C,
      lastEventLogIndex: "1",
    }];
    expectValid({
      ...baseVenueState,
      custodyConfigs: [signerRows],
      authorities: [factoryUpgradeAuthority],
    });

    const missingSessionProvenance: Omit<typeof signerRows, "sessionSigners"> & {
      sessionSigners: Array<
        Omit<SessionSignerFixture, "lastEventTransactionHash"> & {
          lastEventTransactionHash?: string;
        }
      >;
    } = clone(signerRows);
    delete missingSessionProvenance.sessionSigners[0].lastEventTransactionHash;
    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [missingSessionProvenance],
      authorities: [factoryUpgradeAuthority],
    });
  });

  test("rejects raw-collateral and position identity mismatches", () => {
    expectInvalid({
      ...baseVenueState,
      routeConfigs: [{ ...standardRoute, ctfCollateralToken: WCOL }],
    });

    const wrongPosition = clone(standardVenueState);
    wrongPosition.positions[0].position.collateralToken = WCOL;
    expectInvalid(wrongPosition);

    const nestedPosition = clone(standardVenueState);
    nestedPosition.positions[0].position.parentCollectionId = HASH_D;
    expectInvalid(nestedPosition);
  });

  test("rejects standard oracle/version mismatches and unknown negative adapters", () => {
    expectInvalid({
      ...baseVenueState,
      standardOracleConfigs: [{ ...standardOracle, version: "v4" }],
    });
    expectInvalid({
      ...baseVenueState,
      standardOracleConfigs: [{ ...standardOracle, initialized: false }],
    });
    expectInvalid({
      ...baseVenueState,
      negRiskConfigs: [{ ...negativeRiskConfig, negRiskAdapter: ACCOUNT }],
    });
    expectInvalid({
      ...baseVenueState,
      negRiskConfigs: [{ ...negativeRiskConfig, questionCount: "256" }],
    });
  });

  test("allows only declared nulls and binds calldata state", () => {
    expectValid(standardVenueState);
    expectValid(negativeVenueState);

    const exactNull = clone(standardVenueState);
    exactNull.redemptionExecutions[0].redemptionCalls[0].calldata = null as never;
    expectInvalid(exactNull);

    const dependentNonzero = clone(negativeVenueState);
    dependentNonzero.redemptionExecutions[0].redemptionCalls[0].minimumOutputAmount = "1";
    expectInvalid(dependentNonzero);

    expectInvalid({
      ...baseVenueState,
      custodyConfigs: [{ ...depositWallet, guard: ACCOUNT }],
      authorities: [factoryUpgradeAuthority],
    });
    expectInvalid({
      ...baseVenueState,
      books: [{ ...standardBook, bids: [{ priceU6: "500000", quantity: null }] }],
    });
    expectInvalid({
      ...baseVenueState,
      wrappedCollateralConfig: { ...wrappedCollateralConfig, underlying: null },
    });

    expectInvalid({ ...negativeVenueState, wrappedCollateralConfig: null });
    expectInvalid({ ...baseVenueState, wrappedCollateralConfig });
  });

  test("requires closed zero-balance sweep evidence", () => {
    const route = clone(negativeLegacyRedemption);
    route.sweepBalances[0].amount = "1";
    expectInvalid({ ...baseVenueState, redemptionConfigs: [route] });

    const unknown = clone(negativeLegacyRedemption);
    (unknown.sweepBalances[0] as (typeof unknown.sweepBalances)[number] & { token: string }).token = CTF;
    expectInvalid({ ...baseVenueState, redemptionConfigs: [unknown] });

    expectInvalid({
      ...baseVenueState,
      redemptionConfigs: [{ ...negativeLegacyRedemption, sweepBalances: negativeLegacyRedemption.sweepBalances.slice(0, 2) }],
    });
  });

  test("closes current unfilled order commitments and binds the reserved asset branch", () => {
    const buyOrder = {
      ...sellOrderCommitment,
      orderHash: HASH_C,
      side: "0",
      takerAmount: "0",
      reservedAssetType: "erc20",
      reservedAssetContract: PUSD,
      reservedTokenId: null,
    };
    expectValid({ ...baseVenueState, orderCommitments: [buyOrder] });

    const missing = clone(baseVenueState) as Record<string, unknown>;
    delete missing.orderCommitments;
    expectInvalid(missing);

    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...buyOrder, reservedAssetType: "erc1155" }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...buyOrder, reservedAssetContract: CTF }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, reservedTokenId: null }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, reservedAssetContract: PUSD }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, statusFilled: true }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, signatureValid: false }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, transferAuthorityActive: false }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, isUserPaused: true }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, signature: "0x" }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, effectiveRemainingMakerAmount: "0" }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, statusRemaining: "1".repeat(76) }],
    });
    expectInvalid({
      ...baseVenueState,
      orderCommitments: [{ ...sellOrderCommitment, expiration: "1000" }],
    });
  });

  test("requires closed execution-time settlement freeze predicates", () => {
    expectValid({ ...baseVenueState, settlementFreezeConfigs: [standardFreezeConfig, negativeFreezeConfig] });

    const missing = clone(baseVenueState) as Record<string, unknown>;
    delete missing.settlementFreezeConfigs;
    expectInvalid(missing);

    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [{ ...standardFreezeConfig, predicate: "observed-once" }],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [{ ...standardFreezeConfig, enforcementMode: "snapshot-only" }],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [{ ...standardFreezeConfig, predicateReads: [] }],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [
        {
          ...standardFreezeConfig,
          predicateReads: [
            ...standardFreezeConfig.predicateReads,
            { ...standardFreezeConfig.predicateReads[0], calldata: SECOND_USER_PAUSED_CALL },
          ],
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [
        {
          ...standardFreezeConfig,
          predicateReads: [{ ...standardFreezeConfig.predicateReads[0], target: ACCOUNT }],
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [{ ...negativeFreezeConfig, predicateReads: negativeFreezeConfig.predicateReads.slice(0, 1) }],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [
        { ...negativeFreezeConfig, predicateReads: [...negativeFreezeConfig.predicateReads].reverse() },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [
        {
          ...standardFreezeConfig,
          predicateReads: [{ ...standardFreezeConfig.predicateReads[0], expectedReturnData: ZERO_HASH }],
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [
        {
          ...standardFreezeConfig,
          predicateReads: [{ ...standardFreezeConfig.predicateReads[0], calldata: "0x00" }],
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [
        {
          ...standardFreezeConfig,
          predicateReads: [
            { ...standardFreezeConfig.predicateReads[0], calldata: `0xdeadbeef${addressArgument(ACCOUNT)}` },
          ],
        },
      ],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [{ ...standardFreezeConfig, settlementFunctionSelector: "0xabcdef" }],
    });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [{ ...standardFreezeConfig, settlementCalldataHash: "0x1234" }],
    });
    const missingCalldataHash = clone(standardFreezeConfig) as Record<string, unknown>;
    delete missingCalldataHash.settlementCalldataHash;
    expectInvalid({ ...baseVenueState, settlementFreezeConfigs: [missingCalldataHash] });
    expectInvalid({
      ...baseVenueState,
      settlementFreezeConfigs: [{ ...standardFreezeConfig, enforcerSourceCommit: "not-a-commit" }],
    });

    const unknownRead = clone(standardFreezeConfig);
    (unknownRead.predicateReads[0] as (typeof unknownRead.predicateReads)[number] & { blockNumber: string }).blockNumber = "1";
    expectInvalid({ ...baseVenueState, settlementFreezeConfigs: [unknownRead] });

    const unknownConfig = clone(standardFreezeConfig) as typeof standardFreezeConfig & { observedAt: string };
    unknownConfig.observedAt = "1000";
    expectInvalid({ ...baseVenueState, settlementFreezeConfigs: [unknownConfig] });
  });

  test("records the exact bounded fee state and the correct event oracle for each branch", () => {
    expectValid({ ...baseVenueState, routeConfigs: [{ ...standardRoute, maxFeeRateBps: "1" }] });
    expectValid({ ...baseVenueState, routeConfigs: [{ ...standardRoute, maxFeeRateBps: "9999" }] });
    expectValid({ ...baseVenueState, routeConfigs: [{ ...standardRoute, maxFeeRateBps: "0" }] });
    expectInvalid({ ...baseVenueState, routeConfigs: [{ ...standardRoute, maxFeeRateBps: "10000" }] });

    const wrongStandardOracle = clone(standardVenueState);
    wrongStandardOracle.positions[0].conditionPreparation.oracle = NEG_RISK_ADAPTER;
    expectInvalid(wrongStandardOracle);

    const wrongNegativeOracle = clone(negativeVenueState);
    wrongNegativeOracle.positions[0].conditionPreparation.oracle = V4_ORACLE;
    expectInvalid(wrongNegativeOracle);
  });

  test("records the exchange pause flag as a boolean observation", () => {
    expectValid({ ...baseVenueState, routeConfigs: [{ ...standardRoute, exchangePaused: true }] });
    expectValid({ ...baseVenueState, routeConfigs: [{ ...negativeRoute, exchangePaused: true }] });
    expectInvalid({ ...baseVenueState, routeConfigs: [{ ...standardRoute, exchangePaused: "false" }] });
    expectInvalid({ ...baseVenueState, routeConfigs: [{ ...negativeRoute, exchangePaused: null }] });
  });

  test("binds negative-risk result fields to their state discriminators", () => {
    const determined = clone(negativeVenueState);
    determined.negRiskConfigs[0].determined = true;
    determined.negRiskConfigs[0].resultIndex = "1";
    determined.negRiskConfigs[0].reportedAt = "1";
    determined.negRiskConfigs[0].reportedResult = true;
    expectValid(determined);

    const missingResult = clone(determined);
    missingResult.negRiskConfigs[0].resultIndex = null;
    expectInvalid(missingResult);

    const prematureResult = clone(negativeVenueState);
    prematureResult.negRiskConfigs[0].resultIndex = "1";
    expectInvalid(prematureResult);

    const prematureReport = clone(negativeVenueState);
    prematureReport.negRiskConfigs[0].reportedResult = false;
    expectInvalid(prematureReport);

    const missingReport = clone(negativeVenueState);
    missingReport.negRiskConfigs[0].reportedAt = "1";
    expectInvalid(missingReport);
  });

  test("requires complete source-dependent event provenance tuples", () => {
    const eventApproval = {
      ...standardVenueState.erc1155Approvals[0],
      lastEventBlockNumber: "1",
      lastEventTransactionHash: HASH_A,
      lastEventLogIndex: "0",
    };
    expectValid({ ...baseVenueState, erc1155Approvals: [eventApproval] });
    expectInvalid({
      ...baseVenueState,
      erc1155Approvals: [{ ...eventApproval, lastEventTransactionHash: null }],
    });

    const routeAllowance = standardVenueState.erc20Allowances[0];
    expectInvalid({
      ...baseVenueState,
      erc20Allowances: [{ ...routeAllowance, lastEventBlockNumber: "1" }],
    });
    expectInvalid({
      ...baseVenueState,
      erc20Allowances: [{ ...routeAllowance, candidateSource: "event" }],
    });

    expectInvalid({
      ...baseVenueState,
      authorities: [{ ...factoryUpgradeAuthority, candidateSource: "constructor" }],
    });
    expectInvalid({
      ...baseVenueState,
      authorities: [{ ...factoryUpgradeAuthority, lastEventLogIndex: null }],
    });
  });

  test("closes redemption execution scope before semantic coverage checks", () => {
    const missingPayoutDenominator = clone(standardRedemptionExecution) as Record<string, unknown>;
    delete missingPayoutDenominator.payoutDenominator;
    expectInvalid({
      ...baseVenueState,
      redemptionExecutions: [missingPayoutDenominator],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionExecutions: [{ ...standardRedemptionExecution, payoutNumerators: ["0"] }],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionExecutions: [{ ...standardRedemptionExecution, coveredPositionIds: [] }],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionExecutions: [{ ...standardRedemptionExecution, coveredPositionIds: ["123", "123"] }],
    });
    expectInvalid({
      ...baseVenueState,
      redemptionExecutions: [{ ...standardRedemptionExecution, marketKind: "unknown" }],
    });

    const oldPositionShape = clone(standardVenueState);
    (oldPositionShape.positions[0] as (typeof oldPositionShape.positions)[number] & { redemptionCalls: typeof exactCall[] }).redemptionCalls = [exactCall];
    expectInvalid(oldPositionShape);
  });

  test("requires each adapter sweep tuple exactly once and at the correct account", () => {
    const duplicate = clone(standardFactoryRedemption);
    duplicate.sweepBalances[1] = clone(duplicate.sweepBalances[0]);
    expectInvalid({ ...baseVenueState, redemptionConfigs: [duplicate] });

    const wrongStandardAccount = clone(standardFactoryRedemption);
    wrongStandardAccount.sweepBalances[2].account = ACCOUNT;
    expectInvalid({ ...baseVenueState, redemptionConfigs: [wrongStandardAccount] });

    const wrongLegacyAsset = clone(negativeLegacyRedemption);
    wrongLegacyAsset.sweepBalances[2].tokenContract = USDCE;
    expectInvalid({ ...baseVenueState, redemptionConfigs: [wrongLegacyAsset] });

    const wrongOuterAccount = clone(negativeFactoryRedemption);
    wrongOuterAccount.sweepBalances[5].account = NEG_RISK_ADAPTER;
    expectInvalid({ ...baseVenueState, redemptionConfigs: [wrongOuterAccount] });
  });
});
