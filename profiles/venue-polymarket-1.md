# PMVS venue profile: `venue/polymarket/1`

```
pmvs-part:      profile (venue)
profile-id:     venue/polymarket/1
version:        1 (draft)
status:         Pre-EIP review draft
author:         Ivan Morozov (Zeit Finance)
created:        2026-08-18
requires:       PMVS Parts I through III; position/gnosis-ctf/1
```

Venue facts can change while the PMVS core remains stable. This draft was checked against Polymarket documentation, deployed Polygon contracts, and the pinned source revisions below on 2026-08-21. A material change to a contract, API, collateral route, or fee rule requires a new profile id after release. Old records keep the profile that governed their capture.

A venue profile supplies three inputs to Parts II and III: observable on-chain inventory, an observed bid surface for the cross calculation, and an on-chain resolution signal. An AMM or RFQ venue needs another venue profile because it has no compatible CLOB cross mark.

## Outcome-position protocol

This profile covers Polymarket CTF positions traded through the CLOB. It covers standard binary markets and negative-risk binary markets. Under this profile, `portfolio.positionFormats` MUST equal `["position/gnosis-ctf/1"]`.

Both market kinds use the same `ConditionalTokens` ERC-1155 contract. They do not use the same CTF collateral preimage or the same condition oracle. pUSD is the V2 exchange collateral and this profile's accounting asset. It is not the raw CTF collateral address used to derive either kind of position id.

Every supported position has `outcomeSlotCount = 2`, `parentCollectionId = 0`, and `indexSet = 1` or `2`. The `positionId` identifies balances, transfers, and CLOB orders. ERC-1155 approvals apply to an owner's full token set in the CTF contract, not to one `positionId`. CTF redemption receives the collateral, parent collection, condition, and index sets, then derives the affected ids.

This profile does not cover Polymarket Combo positions. Combo YES and NO tokens are ERC-1155 tokens issued by a separate `PositionManager` under the Positions Framework. They are not CTF positions. Combo execution uses an RFQ flow, not the CLOB book used by PMVS-M1 here. Supporting Combo positions therefore requires a separate position profile and a venue profile with a settlement-bearing RFQ valuation rule.

## Discovery and classification order

Inventory discovery starts from chain logs and pinned balances. It does not start from the Polymarket API.

Before venue discovery, the outer verifier independently derives the complete set of addresses assigned the `strategy-custody` role by the active component generation. It deduplicates and sorts that lowercase address set, then requires it to equal `custodyConfigs[].custodyAccount` one-to-one. The set includes an account that holds only pUSD or currently has a zero position balance.

1. Reconstruct every ERC-1155 candidate for each independently derived custody account as required by PMVS-M1. Read each balance at the pinned Polygon block.
2. Classify the emitting contract. A nonzero balance in the CTF contract proceeds below. A nonzero balance in PositionManager triggers the Combo exclusion rule. Any other ERC-1155 contract follows the unknown-token rule.
3. Use venue metadata only to propose a CTF preimage and CLOB `asset_id`. Locate the matching CTF `ConditionPreparation` event and recover the oracle, question id, and outcome slot count from chain history.
4. Read the CTF payout denominator and both payout numerators. If the denominator is zero, fetch `GET /book?token_id=...`. Require `asset_id` to equal the decimal CTF `positionId`, `market` to equal `conditionId`, and `neg_risk` to be a JSON boolean. If the denominator is positive, do not fetch or record a book for that position.
5. Select the market kind from the chain graph. A standard position uses USDC.e and an allowed standard oracle. A negative-risk position uses WCOL and the legacy NegRiskAdapter as its CTF oracle. For an unresolved position, require the book's unsigned `neg_risk` flag to agree with that chain classification.
6. Recompute the condition id, collection id, and position id with the raw collateral address for that market kind. Require an exact match to the held token. For an unresolved condition, also require the position id to match the book `asset_id`.
7. Read the selected exchange's route getters at the pinned block. Require all returned addresses to match the selected market kind.
8. Pin the resolution graph, redemption graph, code hashes, global pause state, custody-account pause state, fee state, authorities, ERC-1155 approvals, and ERC-20 allowances at the same block.
9. A missing event, unknown oracle version, route mismatch, stale read, or failed call blocks valuation. It does not become an empty inventory or a zero mark.

| Required fact | Standard market | Negative-risk market |
|---|---|---|
| Unresolved-book discriminator | `neg_risk == false` | `neg_risk == true` |
| V2 exchange | `0xe111180000d2663c0091e4f400237545b87b996b` | `0xe2222d279d744050d28e00520010520000310f59` |
| CTF condition oracle | Recovered from `ConditionPreparation`; must match the standard oracle allow-list | `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296` |
| Raw CTF `collateralToken` | USDC.e, `0x2791bca1f2de4661ed88a30c99a7a9449aa84174` | WCOL, `0x3a3bd7bb9528e159577f7c2e685cc81a765002e2` |
| Exchange collateral | pUSD, `0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb` | pUSD, `0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb` |
| Exchange-bound outcome-token factory | `0xada100874d00e3331d00f2007a9c336a65009718` | `0xada200001000ef00d07553cee7006808f895c6f1` |
| Direct root CTF redemption output | USDC.e | WCOL |
| Complete profile route accounting output | pUSD | pUSD |

The addresses in one market column form one route. A verifier MUST NOT mix a standard oracle with the negative-risk collateral, use pUSD in the raw position-id derivation, or replace an exchange-bound factory with a different adapter that has a similar name.

## Chain and dated discovery map

This profile uses Polygon PoS, chain id 137. The table below is a discovery aid, not conformance evidence. It was read at block `92410552`, block hash `0x44bf2575488cbe2f000acbbd213d2fe8a2ebf568a6cb902cfcf705f126f99bd6`, timestamp `2026-08-21T14:00:55Z`. Every record repeats the required reads at its own pinned block.

| Role | Address | Discovery note |
|---|---|---|
| Conditional Tokens, the ERC-1155 position contract | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` | Runtime hash `0xbe524e094025c2a1122ccfbe3264e29fe662d7e0ae518b6926135c814405eceb` |
| Standard CTF Exchange V2 | `0xe111180000d2663c0091e4f400237545b87b996b` | `getCtfCollateral()` returned USDC.e; runtime hash `0xa08da89bbac2063dfa6a705e70314d218d40fb2b2a6405442297c241fcd58401` |
| Negative-risk CTF Exchange V2 | `0xe2222d279d744050d28e00520010520000310f59` | `getCtfCollateral()` returned WCOL; runtime hash `0x04b857d48dcc38b3d484239569dc96a7a6c39bbb90ed2461227fc6e50ed5787d` |
| pUSD proxy | `0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb` | Exchange and accounting collateral; runtime hash `0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d` |
| pUSD implementation | `0x6bbcef9f7ef3b6c592c99e0f206a0de94ad0925f` | Runtime hash `0x932c9369433b333d6d97d99b7731885751862aa3502122786d24174a9fd8e58e` |
| USDC.e | `0x2791bca1f2de4661ed88a30c99a7a9449aa84174` | Standard raw CTF collateral and WCOL underlying |
| Native Polygon USDC | `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` | Supported by pUSD source, but not used as a raw CTF preimage here |
| Negative-risk WCOL | `0x3a3bd7bb9528e159577f7c2e685cc81a765002e2` | Negative-risk raw CTF collateral; runtime hash `0x99c62168488983e6ac023c62a6dca53acc7e8e902849fb72a9b08f29545dc474` |
| Collateral onramp | `0x93070a847efef7f70739046a929d47a521f5b8ee` | USDC or USDC.e to pUSD; runtime hash `0x89eaba6b38dda7ebd07176f42f9e9f70dbadd46b7cbf826d15341729b19bb389` |
| Collateral offramp | `0x2957922eb93258b93368531d39facca3b4dc5854` | pUSD to USDC or USDC.e; runtime hash `0x18de842db0ec4b253afe413446ac5c6c26e878289f5c7a425a9464dbad72d45d` |
| Legacy NegRiskAdapter | `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296` | Raw CTF oracle and V2 conversion dependency; runtime hash `0x10798bfdebdc3b8727171551b1287ee4c87b486045ed51a6ddc94e34f66560a1` |
| Standard exchange-bound outcome-token factory | `0xada100874d00e3331d00f2007a9c336a65009718` | Returned by the standard exchange; runtime hash `0x1ece8945fe803fe6a0ff4f10d13979830429f51463075f3f284031d8bc17d9ed` |
| Negative-risk exchange-bound outcome-token factory | `0xada200001000ef00d07553cee7006808f895c6f1` | Returned by the negative-risk exchange; runtime hash `0x0cec3398b0b528b191ccb9b0e7d023731c8f582f401d526f48ca7575df7a003e` |
| Excluded docs-listed direct standard adapter | `0xada100db00ca00073811820692005400218fce1f` | Discovery evidence only; runtime hash `0x93b965351d01c1a128821ac79fc98a18105daefb46bda0d1e5b52306d713aa4f` |
| Excluded docs-listed direct negative-risk adapter | `0xada2005600dec949baf300f4c6120000bdb6eaab` | Discovery evidence only; runtime hash `0x3b892c7c2f80e7af69f28faf72a51c2d793f6b79b96011bdf0a1996319fcbe5b` |
| Standard UMA CTF Adapter v3.1 | `0x157ce2d672854c848c9b79c49a8cc6cc89176a49` | Current allowed standard condition oracle |
| Standard UMA CTF Adapter V4 | `0x65070be91477460d8a7aeeb94ef92fe056c2f2a7` | Current allowed standard condition oracle |
| UMA CTF Adapter v2.0 | `0x6a9d222616c90fca5754cd1333cfd9b7fb6a4f74` | Historical release still listed on the contracts page; not universal |
| Legacy negative-risk operator | `0x71523d0f655b41e805cec45b17163f528b59b820` | Binds upstream adapter `0x2f5e3684cb1f318ec51b00edba38d79ac2c0aa9d`; delay is 3600 seconds |
| V4-linked negative-risk operator | `0x661992aebf6becf7ba5abb66f6b0bf62aa7a2e93` | Binds upstream adapter `0x69c47de9d4d3dad79590d61b9e05918e03775f24`; delay is 0 seconds |
| Legacy negative-risk UMA adapter | `0x2f5e3684cb1f318ec51b00edba38d79ac2c0aa9d` | `ctf()` is the legacy operator; runtime hash `0x9fc07708d13b3aca75a3a74f0f98a6f338b6e3c2384447edf096209f3a01fc1d` |
| Negative-risk UMA Adapter V4 | `0x69c47de9d4d3dad79590d61b9e05918e03775f24` | `ctf()` is the V4-linked operator; runtime hash `0x76a83a5e6b6e30a6fefe5ca6af94dcfed92cea8e8ea739abbc8d4a663c876be1` |
| Deposit Wallet factory proxy | `0x00000000000fb5c9adea0298d729a0cb3823cc07` | Factory for the current default account wallet; runtime hash `0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d` |
| Deposit Wallet factory implementation | `0x528cc05efac2b0d255e423272187efd41248abd7` | EIP-1967 implementation-slot result for the factory proxy; runtime hash `0xe6424f1008e46b4b657efacf9500ea7747cbbf3055d9d76459253ac2884793d2` |
| Deposit Wallet shared ERC-1967 implementation resolver | `0x7a18edfe055488a3128f01f563e5b479d92ffc3a` | Runtime hash `0xf87b06a1302051471df08ff79a938757509569e16b7a7efa55a3ea7b29b0b9d1`; `implementation()` returned `0xf7f27c29e60fe6325bef8da7f93250353d2e3294` |
| Deposit Wallet implementation from the shared resolver | `0xf7f27c29e60fe6325bef8da7f93250353d2e3294` | Runtime hash `0xf5c1072460e64902af84d35f5bb1d0a15d80a88c5827b831a977fbc5a0684b96` at the discovery block |
| Legacy Gnosis Safe factory | `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` | Legacy only; runtime hash `0x7a423db1d467bbd092e48044242a9c1f003442a83ca8109f0f7c07a50782e23d` |
| Legacy Safe implementation used by both V2 exchanges | `0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8` | `getSafeImplementation()` result; runtime hash `0xf4b625c76701938f75938880a926414b5f91471d32e21c0cbb37566b62495ca7` |
| PositionManager proxy | `0x006f54f7f9a22e0000cc2ab60031000000ae9fef` | Combo exclusion sentinel |
| AutoRedeemer proxy | `0xa1200000d0002264c9a1698e001292d00e1b00af` | Approval sentinel, not proof of Combo ownership |

The two adapter pairs are not interchangeable. At the discovery block, their runtime hashes and byte lengths differed even though their public getters named the same core dependencies. The V2 exchanges returned the exchange-bound pair through `getOutcomeTokenFactory()`. The Polymarket contracts page listed the direct pair.

This review did not prove an exact official source revision for either docs-listed direct runtime. This profile lists those addresses only as excluded discovery evidence. A version 1 record MUST NOT select either address as an entrypoint or dependency. An adapter route uses the exact exchange-bound factory returned by the selected exchange. The other accepted entrypoints are direct CTF and the legacy NegRiskAdapter at `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296`.

### Standard oracle allow-list

The CTF `ConditionPreparation` event is the authority for the `oracle` field. Venue metadata may help locate the event, but it cannot supply or replace the oracle.

This draft permits these standard condition-oracle deployments:

| Version | Oracle | Runtime hash at the discovery block | Required pinned getters | Source provenance |
|---|---|---|---|---|
| UMA CTF Adapter v3.1.0 | `0x157ce2d672854c848c9b79c49a8cc6cc89176a49` | `0xe44d7e53a84493f6b71255e19f42f7cea9b8be486492fee80529c75d75f61579` | `ctf = 0x4d97dcd97ec945f40cf65f87097ace5ea0476045`; `optimisticOracle = 0xee3afe347d5c74317041e2618c49534daf887c24` | Official v3.1.0 release and source tag `10dd8829d710ed9c2541b4196b463ad0c90546fc` |
| UMA CTF Adapter V4 | `0x65070be91477460d8a7aeeb94ef92fe056c2f2a7` | `0x52a5f0260d4fe3072f2636c084f0c7c80736912480db15cc3d1fbe251dc47d02` | `ctf = 0x4d97dcd97ec945f40cf65f87097ace5ea0476045`; `optimisticOracle = 0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1` | Official resolution-subgraph constant at `75d1818547862a5bd3477ed2e6b16f693d42dab6`; adapter source at `8b76cc9e0d46c6f7450a0adb0ddc0f5b0568c9cc` |

Both rows also returned `collateralWhitelist = 0x1020ae36548ab28bc0c41fd2a08d24132c82cc55` at the discovery block. Each record repeats all getters and pins the adapter's admin set and question state. The current contracts page lists `0x6a9d222616c90fca5754cd1333cfd9b7fb6a4f74`, but the official release history identifies it as v2.0.0 at source tag `e83ab043f1116509fd946b76fff4472d320b6c2e`. This profile does not treat that historical address, v3.0, or any other oracle as a synonym for the allowed rows. A held position with another oracle needs a later venue profile that pins that deployment.

### Negative-risk resolution graph

For a negative-risk token, `position.oracle` MUST equal the legacy NegRiskAdapter at `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296`. The upstream UMA adapter is not the CTF oracle and MUST NOT be written into `position.oracle`.

The verifier derives `marketId = questionId & bytes32(type(uint256).max << 8)` and `questionIndex = uint8(uint256(questionId))`. It then requires all of these facts:

1. `NegRiskAdapter.getConditionId(questionId)` equals the CTF `conditionId`, and `getPositionId(questionId, outcome)` equals the held id for the matching index set.
2. `getQuestionCount(marketId)` is from 2 through 255 and is greater than `questionIndex`. The pinned source stores the count in one byte and does not stop an increment at its maximum. A wrapped or adjacent-field-corrupting count is invalid under this profile.
3. The adapter's `MarketPrepared` and `QuestionPrepared` logs bind the same market, operator, question, and index. `getOracle(marketId)` equals that operator.
4. The operator's runtime code matches one of the two allowed operator generations below. Its `nrAdapter()` equals `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296` and its `oracle()` equals the paired upstream adapter.
5. The operator's `QuestionPrepared` event binds its request id to the same question id, and `questionIds(requestId)` returns that question id at the pinned block. The upstream adapter's `ctf()` equals that operator. The record pins the upstream adapter's runtime code, Optimistic Oracle address, collateral whitelist, question state, and admins.
6. The record pins `flaggedAt(questionId)`, `reportedAt(questionId)`, `results(questionId)`, and `DELAY_PERIOD()` for the selected operator. Admins can flag, unflag, and emergency-resolve questions. The V4-linked operator exposes a zero-second delay.

| Operator generation | Operator | Runtime hash at the discovery block | Upstream adapter | Delay | Source revision for the delay behavior |
|---|---|---|---|---:|---|
| Legacy | `0x71523d0f655b41e805cec45b17163f528b59b820` | `0xe3984626542d7a0a5ac4ef76b5cd0819a7164f3695bc41650a55579c6953d60f` | `0x2f5e3684cb1f318ec51b00edba38d79ac2c0aa9d` | 3600 seconds | `e206dd2ed5aa24cf1f86990b875c6b1577be25e2` |
| V4-linked | `0x661992aebf6becf7ba5abb66f6b0bf62aa7a2e93` | `0xcdf35da3f66423b7fa071ca745396c19d961e295ecae60516be55035b890797a` | `0x69c47de9d4d3dad79590d61b9e05918e03775f24` | 0 seconds | `f78b35b0863b4308a431ca307d06f49b2ea65e78` |

The negative-risk operator accepts only `[1, 0]` or `[0, 1]`, and the NegRiskAdapter reports that boolean result to CTF. A resolved negative-risk condition therefore requires denominator `1` and one of those two numerator vectors. Standard CTF conditions may have another nonzero denominator.

### Collateral layers and pUSD assumption

There are three separate collateral roles:

1. pUSD is the exchange and accounting token.
2. USDC.e is the raw CTF collateral for standard positions.
3. WCOL is the raw CTF collateral for negative-risk positions. Its underlying token is USDC.e, and the NegRiskAdapter owns its privileged wrap, mint, burn, and release functions. A holder can call `unwrap` on its own WCOL.

A negative-risk route treats WCOL base units as USDC.e base units only when the record pins WCOL code, owner, underlying token, decimals, total supply, and underlying balance. It calculates `wrappedCollateralConfig.maxRedemptionExposure`, the greatest WCOL amount that the vault's selected routes could need to unwrap before `validUntil`. `USDC.e.balanceOf(WCOL)` MUST be at least that exposure. A full-supply reserve is not required, so this is a current route-liquidity test rather than a claim that all WCOL is solvent. The NegRiskAdapter's release power remains an explicit control risk.

The pUSD source accepts native USDC and USDC.e. This profile selects a pUSD to USDC.e conversion route. It treats equal base-unit amounts as 1:1 only when a fresh pinned snapshot proves all of these facts:

1. The proxy implementation, implementation code, owner, upgrader state, pUSD role holders, and relevant authority events match the component record.
2. pUSD reports 6 decimals. Its `USDC()`, `USDCE()`, and `VAULT()` getters match the recorded native USDC, USDC.e, and backing vault.
3. The selected offramp reports `COLLATERAL_TOKEN() == pUSD`, has the pUSD wrapper role, and reports `paused(USDC.e) == false`.
4. The record calculates `maxUsdceSettlementExposure`: the greatest aggregate pUSD amount that the vault's allowed calls could send through the selected USDC.e offramp before `validUntil`. It includes every pUSD balance in the declared custody perimeter and the maximum pUSD that can enter that perimeter through the recorded redemption routes. It does not net a later or conditional USDC.e inflow. `USDC.e.balanceOf(pUSD.VAULT())` and `USDC.e.allowance(pUSD.VAULT(), pUSD)` MUST each be at least that exposure at the pinned block.
5. A route that wraps USDC.e into pUSD also pins the onramp or adapter code, its pUSD address, its wrapper role, and its USDC.e pause state.

A full-supply USDC.e reserve is not required because some pUSD can be backed by native USDC. The rule above proves current liquidity only for the selected USDC.e route and the subject vault's maximum exposure. It does not claim that all pUSD is solvent. A failed read, pause, role mismatch, code change, authority change, or route-liquidity shortfall blocks fresh settlement. It does not turn pUSD or a position into zero. The checks prove one block's state, not future availability. Each record states that residual collateral and upgrade risk.

### Custody-wallet binding

This profile does not prescribe a Safe or assume that the share-vault contract holds positions. The active component generation independently names every actual strategy-custody account. `custodyConfigs` covers that complete address set, including pUSD-only and zero-position accounts. Each position selects one matching entry.

| Wallet kind | Exchange signature type | `maker` | Order `signer` | Signature rule |
|---|---:|---|---|---|
| `deposit-wallet-v2` | `3` | Deposit Wallet address | Deposit Wallet address | The controlling account signer signs, then the client wraps the signature for the wallet's ERC-7739 validation path |
| `legacy-gnosis-safe` | `2` | Safe Wallet address | Account derivation signer address | The signer signs the Exchange `Order` typed data directly; the exchange recomputes the legacy Safe address from that signer and its pinned factory inputs |

Polymarket documentation says Deposit Wallet is the default account wallet for accounts created on or after 2026-05-04. It labels Proxy Wallet and Safe Wallet as legacy types. The type number is an exchange signature rule, not evidence that the custody account is safe or controlled by the vault.

This draft accepts only the two wallet kinds in the table. An EOA or legacy Proxy Wallet needs a later profile that defines its custody and signature evidence.

For a Deposit Wallet, capture resolves the actual account form at the pinned block. Accounts deployed before the 2026-06-29 upgrade can use a UUPS proxy. Later accounts can resolve their implementation through the shared ERC-1967 contract, unless the owner has pinned an implementation. The Deposit Wallet factory is also an ERC-1967 proxy. Capture records its proxy code, implementation-slot result, implementation code, and every authority that can upgrade or otherwise control the factory. It separately records the wallet's proxy mode, shared resolver when used, implementation, current owner, pending ownership handover, pause timestamp, implementation-pinning state, nonce, and the complete event-derived candidate sets for EOA and passkey session signers. Version 1 accepts only owner-signed orders and batches, so `accountSignerAddress == owner == controllers[0]` and `controllers` has one entry.

The Deposit Wallet control rules were checked against Blockscout-verified source for implementation `0xf7f27c29e60fe6325bef8da7f93250353d2e3294`, whose pinned runtime hash appears above. No upstream Git commit is available for that implementation, so a record binds the retained verified source, address, and code hash rather than implying Git provenance. The relevant native selectors are `owner()` `0x8da5cb5b`, `pendingOwner()` `0xe30c3978`, `pendingOwnerDeadline()` `0x76d0e490`, `pendingOwnerNonce()` `0x745ba806`, `paused()` `0x5c975abb`, `nonce()` `0xaffed0e0`, `sessionSignerAuthorizedUntil(address)` `0xb9ac71d6`, `passkeySessionSigner(bytes32)` `0xd7fa476f`, and `execute((address,uint256,uint256,(address,uint256,bytes)[]),bytes)` `0xe8c8bf64`. The factory's current batch entrypoint selector is `proxy((address,uint256,uint256,(address,uint256,bytes)[])[],bytes[])` `0x0a3c4405`.

Deposit Wallet signature validation selects a session-key envelope whenever a raw signature of at least 32 bytes ends with `0x6492649264926492649264926492649264926492649264926492649264926492`; otherwise it selects the owner path. Version 1 therefore rejects that suffix on every Deposit Wallet `orderCommitments[].signature`, including malformed magic-suffixed bytes. A true exchange `validateOrderSignature` result alone does not identify the underlying authorizer. Any later profile that permits Deposit Wallet factory batches must make the enforcer apply the same owner-only discriminator to every batch signature. The current settlement helper is legacy-Safe-only and does not decode Deposit Wallet batches.

For a legacy Safe Wallet, capture proves the exact address derivation used by V2. It sets `salt = keccak256(abi.encode(accountSignerAddress))` and recomputes `custodyAccount` with CREATE2 from factory `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` and proxy-creation bytecode hash `0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf`. The factory runtime hash MUST equal `0x7a423db1d467bbd092e48044242a9c1f003442a83ca8109f0f7c07a50782e23d`. The bytecode hash binds singleton `0xe51abdf814f8854941b9fe8e3a4f65cab4e7a4a8`. The deployed proxy runtime hash MUST equal `0x92565062fdea8761e07d9df2fcdbd66c0582af6ddf0e0355bc07754ad97400b0`; native `masterCopy()` MUST return that singleton; and the singleton runtime hash MUST equal `0xf4b625c76701938f75938880a926414b5f91471d32e21c0cbb37566b62495ca7`. A derivation signer can appear in only one custody config.

Capture also records owners, threshold, enabled modules, guard, fallback handler, and nonce. Signature type `2` does not ask the Safe contract to validate an order or check its current owners. The derivation signer can authorize exchange transfers from the Safe while the Safe's approval remains active, so the record lists that signer as a separate exchange-specific custody authority. The fixed derivation proves that an address is the V2 legacy proxy for that signer; it does not make the factory a recommended custody design.

## Inventory (Part III bindings)

- Transfer-log reconstruction covers every `TransferSingle` and `TransferBatch` candidate that touches each custody account from its proved checkpoint. The verifier then classifies the emitter as required by PMVS-M1.
- Quantities come from `balanceOfBatch` on CTF at the pinned valuation block. Venue Data API sizes are nullable `venueReportedSize` metadata only.
- Each entry contains a `position` object that passes `position/gnosis-ctf/1`, a `marketKind`, a route id, a redemption-execution id, and the matching `ConditionPreparation` evidence. The verifier applies the standard or negative-risk rules above before it uses the unresolved book path or the resolved redemption path.
- The Data API (`https://data-api.polymarket.com/positions`) applies server-side size filters. Because API sizes are non-normative this only affects metadata completeness, and capture MUST NOT apply any API-side filter to the normative set.

### Combo exclusion sentinel

1. Reconstruct the PositionManager token-id set for every custody account from its `TransferSingle` and `TransferBatch` logs.
2. Read every candidate id with PositionManager `balanceOfBatch` at the same pinned block as the CTF inventory.
3. Any nonzero PositionManager balance produces `UNSUPPORTED_POSITION_FORMAT`. It blocks valuation-dependent settlement under this profile. No dust exception applies.
4. A PositionManager `setApprovalForAll` approval does not prove that the custody account owns a Combo token. Record it as a custody power, but trigger the unsupported-position result only for a nonzero balance.
5. Reconstruct and pin the complete CTF and PositionManager operator sets as described below. An approval is custody power, not evidence that the owner holds a token.

The strict balance rule permits a liveness attack through an unsupported ERC-1155 transfer. A deployment MUST declare an unsupported-token response before accepting deposits. A recovery may move such a token only after independently establishing the beneficiary and preserving every material right; the transfer event's `from` field is not enough. Every supported CTF position remains a subject asset even when its arrival was unsolicited. It stays in inventory and NAV until an authorized disposition is complete and a new capture proves the resulting state. An unsupported token, disputed ownership, or an unmodeled material right blocks fresh valuation-dependent settlement. Existing cancellation and funded-claim paths remain available under the active settlement profile.

## Approval and control evidence

No relevant contract exposes a complete list of custody approvals or role members. Capture therefore reconstructs candidate sets from history and confirms current state at the pinned block.

1. For each custody account and each ERC-1155 contract, scan `ApprovalForAll` from deployment or a proved checkpoint. Apply the same scan to a route contract that grants another contract CTF authority. The negative-risk factory's approval to the legacy NegRiskAdapter is one such owner-operator pair. Deduplicate every operator ever named for each owner. Read `isApprovedForAll(owner, operator)` for every candidate at the pinned block. Include false entries so a verifier can confirm revocation.
2. Add every route contract that could require an ERC-1155 approval, even if no event was found. This includes the selected exchange, selected redemption entrypoint, legacy NegRiskAdapter when used, PositionManager modules, and AutoRedeemer when applicable. Read each approval directly.
3. For pUSD, USDC.e, native USDC, and any other custody ERC-20, take the union of spenders found in `Approval` logs and spenders named by an active route. Read every `allowance(owner, spender)` at the pinned block.
4. Reconstruct exchange admins and operators from constructor inputs and `NewAdmin`, `RemovedAdmin`, `NewOperator`, and `RemovedOperator` logs. Confirm every candidate with `isAdmin` or `isOperator`. Pin `paused`, `getFeeReceiver()`, `getMaxFeeRate()`, `userPauseBlockInterval()`, `userPausedBlockAt(custodyAccount)`, and `isUserPaused(custodyAccount)`.
5. Reconstruct owner and role candidates for pUSD, ramps, and collateral adapters from deployment data, ownership events, and role events. Confirm current ownership and role bitmaps. Record the authority that can upgrade pUSD, pause a route, mint pUSD, or grant wrapper power.
6. For negative-risk markets, perform the same procedure for the NegRiskAdapter, the selected NegRiskOperator, and the upstream UMA adapter. Record the admins who can prepare markets or questions, flag or emergency-resolve questions, and change any live control exposed by the pinned code.
7. For every custody account, apply the wallet-specific control procedure above. Deposit Wallet evidence includes the current and pending ownership state, pause timestamp, implementation state, and each live execution or upgrade path. Reconstruct every EOA and passkey session-signer candidate from authorization, ordinary revocation, and emergency-revocation events, then query every candidate at the pinned block and retain inactive rows. It also includes the Deposit Wallet factory's current upgrade authority under the role `deposit-wallet-factory-upgrader`, derived from the pinned factory implementation and confirmed at the factory proxy. Legacy Safe evidence includes its derivation signer as an exchange-specific authority, plus the complete owner set, threshold, modules, guard, fallback handler, and nonce. Confirm state through pinned calls after reconstructing every event-derived candidate.

An approved exchange, adapter, or other operator can move all CTF ids held by that owner. An ERC-20 allowance can move up to its recorded amount. The record states each power in those terms. A role, approval, allowance, pause, fee, code, implementation, or route change after capture requires a new record.

## Order commitments and chain-enforced freeze

The V2 EIP-712 `Order` has `salt`, `maker`, `signer`, `tokenId`, `makerAmount`, `takerAmount`, `side`, `signatureType`, `timestamp`, `metadata`, and `builder`. The signature is outside the typed-data hash. The `timestamp` is the creation time in milliseconds. The exchange does not use it as an expiry. V2 has no signed expiry field and no cancellation nonce. A CLOB API cancellation can remove an order from the service's book, but it does not invalidate the signed order on-chain.

A nonempty signed order can therefore remain executable until it is filled or its signature, transfer authority, or effective user-pause state makes it invalid. The maker must also have enough balance for the attempted fill. For a sell order, transfer authority is the maker's CTF approval for the selected exchange. For a buy order, it is the maker's pUSD allowance for that exchange. A scheduled user pause is not effective until `isUserPaused(maker)` returns true. The exchange-wide pause is controlled by admins and is not a custody freeze.

`orderCommitments` is the bounded set of active, unfilled orders disclosed for the pinned record. The ordinary PMVS valuation-record attestation anchors that set. Each row has a valid nonempty signature, active transfer authority, and an unpaused maker at the pinned block. It records the current order status and the asset amount still reserved by that disclosed order. The set remains subject to the Core limits of 65,536 items and a 16 MiB record. An overflow is a failed capture, never a reason to truncate the set.

This disclosed set is not proof of completeness. An authority attestation, a CLOB open-orders response, a cancellation response, or an authority-maintained list cannot cryptographically establish the absence of another valid signature. Settlement safety at L1 or any higher level MUST NOT depend on an assertion that no undisclosed order exists.

The rules below are necessary venue-side conditions for an L1 evidence-bound settlement and every higher level. They are not sufficient by themselves, and passing this profile does not produce an end-to-end L1 result. PMVS-M1 does not have a closed complete compute profile in this draft, so no current `venue/polymarket/1` record can support an L2 or L3 claim.

Every conforming settlement-bearing capture therefore declares one chain-enforced freeze for each independently authenticated strategy-custody account and each of the two supported V2 exchange domains. After `custodyConfigs` is proved equal to that complete account set, the required freezes are its Cartesian product with the standard and negative-risk `routeConfigs`, even when the account holds only pUSD, holds no position, or discloses orders for only one market kind. An undisclosed buy on either exchange can spend pUSD. An undisclosed sell on either exchange can spend any CTF token while that exchange remains an approved operator. The profile defines two predicate shapes:

1. The selected exchange reports an effective user pause for the custody account.
2. CTF reports no exchange operator approval for the custody account and pUSD reports a zero allowance from that account to the exchange.

The second predicate revokes both transfer paths even if the disclosed set contains only buys or only sells. It remains useful diagnostic evidence, but it cannot secure a settlement at L1 or any higher level under version 1. pUSD is an upgradeable proxy, and another contract cannot atomically read its EIP-1967 implementation slot. An allowance read therefore cannot prove that the same implementation will preserve ERC-20 transfer semantics. A later profile may admit this predicate after it defines an on-chain implementation lock or another atomic proof.

Every settlement-bearing freeze row used for L1 or a higher level in version 1 MUST select `effective-user-pause`. A block-pinned pause observation is not enough. The settlement transaction MUST call the recorded enforcer. Before its first state change or value-moving external call, the enforcer MUST re-read every pause predicate and revert on a failed call or false result.

Version 1 normal rolls do not redeem positions during settlement. Before valuation capture, the full accounting-asset amount needed for withdrawal claims and asset fees MUST already be available in the Core settlement contract's declared funding-source accounts. The outer verifier binds the active source list, balances, and encumbrances to valuation-block reads. No source account may appear in `strategyCustodyAccounts`. During the roll, Core transfers the funded amounts into the separate withdrawal-claim and fee reserves and verifies the exact source and reserve balance changes. Venue custody, a future redemption, or a conditional inflow cannot supply missing headroom.

The protected settlement transaction MUST satisfy all of these conditions:

1. The enforcer is a direct contract, not a proxy, diamond, clone, externally resolved implementation, or other code indirection. Its own reachable code contains no `DELEGATECALL`, mutable implementation dispatch, or code-destruction path.
2. Version 1 settlement-bearing custody is `legacy-gnosis-safe` only. Any Deposit Wallet makes the venue record diagnostic-only because this profile cannot atomically lock and read the current factory-proxy and operator paths.
3. From the first pause-predicate read through transaction completion, no call may target a strategy-custody account, and no call may originate from or execute in a strategy-custody account's storage context. The transaction therefore cannot enter a Safe proxy, call `execTransaction`, use a module, or produce a Safe proxy-to-singleton `DELEGATECALL`.
4. Over the same interval, no state-changing call may enter either V2 exchange. No route call, callback, or re-entry path may use a custody account as caller or storage context. A forbidden path must revert the whole transaction.
5. Every settlement-bearing Safe has `modules == []`, `guard == null`, and `fallbackHandler == null`. Canonical pre-state and post-state proofs bind its proxy runtime, native `masterCopy()` result, singleton runtime, owners, threshold, modules, guard, fallback handler, and nonce to the captured values. The nonce and every control value remain unchanged.

The reviewed enforcer source, receipt-block runtime, canonical Core receipt, state proofs, and complete transaction trace MUST prove these properties. The pause predicates stop disclosed and undisclosed V2 orders during the atomic roll. The unchanged Safe state and the ban on custody calls stop the roll itself from moving venue assets.

An unresolved-position book capture can have `isUserPaused == false` and can disclose active order commitments. It is diagnostic and provisional. It cannot support L1 or any higher level until the chain-enforced freeze precondition succeeds. A capture with an effective user pause can still record the book as a venue observation, but it does not describe immediately executable liquidity.

## Book capture (observed bid surface)

Source for unresolved positions: the CLOB API (`https://clob.polymarket.com`), `GET /book?token_id=...` per position token. The response and its `hash` field are unsigned, mutable venue observations.

```
 bid ladder (descending price)         position size = 900
 price         qty        cumulative
 0.42          300        300      capture
 0.40          250        550      capture
 0.37          500        1050     capture; first level reaching size
 0.30          800                 may stop; bidsTruncated: true

 If total displayed depth < size: capture the ENTIRE bid side.
 "unfilled remainder = 0" is only provable against an exhausted ladder.
```

1. **Raw-response preservation.** The exact response bytes of every book read that feeds a record MUST be retained and content-addressed: the hash goes in the record, and the bytes stay retrievable as a sidecar object under the storage profile. Normalized integer inputs (the ladders the engine consumes) are published inside the record, and the original decimal lexemes survive in the raw sidecar. Normalization is lossy, and only raw bytes can support later re-examination of a capture dispute.
2. **Ladder depth.** Bids MUST be captured from the best price downward through and including the first level at which cumulative bid quantity reaches the position's mark quantity. If total displayed depth is smaller, the entire bid side MUST be captured. `bidsTruncated: true` is lawful only when the cross fully filled within the captured depth. Under-capture is `INCOMPLETE_CAPTURE`.
3. Normalization: parse each decimal lexeme exactly, multiply it by `10^6`, and require an integer. No rounding is allowed. Prices become `priceU6` in `[0, 10^6]`; sizes become position base units. Merge duplicate price levels and sort in strict descending order. An empty `last_trade_price` becomes `null`; any nonempty value must parse exactly in the same price range. A malformed level, negative value, or zero-price bid invalidates the capture for that token: `DATA_UNAVAILABLE`, not "empty book". Ask-side capture is NOT required, since the cross mark never reads asks; implementations MAY retain asks in the raw sidecar only.
4. **Venue correlation fields.** Copy `market`, `asset_id`, `timestamp`, `hash`, `min_order_size`, `tick_size`, `neg_risk`, and `last_trade_price` from the response. Preserve their JSON types and lexemes in the raw sidecar. Treat `hash` as an opaque correlation value. Do not derive it from a truncated ladder.
5. **Kind binding.** Require the raw `neg_risk` boolean, normalized `marketKind`, selected exchange, raw CTF collateral, and resolution graph to agree. A disagreement is `DATA_UNAVAILABLE`, not a choice between two routes.
6. **Observation state.** Record the selected exchange's global pause and the custody account's user-pause values. False values show active venue state at the pinned block. They do not prove that settlement can exclude an undisclosed signed order. True values do not erase the observed book, but they prevent a claim of immediately executable liquidity.
7. **Freshness.** Record each request's start and response-end times. Enforce `maxSkewMs`, `maxVenueResponseLagMs`, `maxCaptureAgeMs`, and `validUntil` from Part III. All chain reads use one block number and block hash. A response or chain read outside those bounds cannot enter a fresh valuation.

## Resolution signal

CTF finality is `payoutDenominator(conditionId) > 0`. Each redemption execution records both CTF payout numerators and the denominator at the pinned block. Executions for the same condition under different custody accounts MUST contain the same vector. A zero denominator requires `[0, 0]` and selects the CLOB-cross path for every held position under that condition. A positive denominator requires the numerators to sum to it and selects the redemption path. Resolved positions have no `books[]` entry. The record does not infer finality from an upstream UMA state, a CLOB flag, a Gamma API field, an end date, or a market's `resolvedBy` metadata.

For standard markets, the CTF payout vector governs the redemption mark. For negative-risk markets, the vector must also be exactly `[1, 0]` or `[0, 1]` with denominator `1`. A different negative-risk vector conflicts with the allowed operator code and invalidates the route.

This venue profile permits only root positions. `parentCollectionId` MUST be zero. A nested CTF redemption mints a parent ERC-1155 position instead of an ERC-20 token and is outside this profile.

Each custody-and-condition redemption execution selects one of these complete root-redemption routes:

1. **Standard, direct CTF.** Call CTF with USDC.e, zero parent, the condition id, and the recorded index sets. CTF burns the caller's full balance for every listed index set and returns USDC.e. If the accounting output must be pUSD, route that USDC.e through the pinned onramp.
2. **Standard, exchange-bound factory.** Call the exact standard outcome-token factory returned by the selected exchange. Its pinned source reads the caller's full YES and NO balances and transfers both to itself. Its CTF call then burns the factory's full balances of both ids, including any positions already there. It finally wraps its entire USDC.e balance into pUSD. The record therefore pins the factory's pre-call balances of both CTF ids and USDC.e.
3. **Negative-risk, direct CTF.** Call CTF with WCOL, zero parent, the condition id, and the recorded index sets. CTF returns WCOL. The holder can unwrap its WCOL to USDC.e, then use the pinned onramp for pUSD.
4. **Negative-risk, legacy adapter.** Call `NegRiskAdapter.redeemPositions(conditionId, amounts)`. The amounts array is `[yesAmount, noAmount]`. The adapter pulls those amounts. Its CTF call burns the adapter's full balances of both ids, including any positions already there. It then unwraps its entire WCOL balance to USDC.e for the caller. The selected pUSD onramp completes the accounting route. The record pins the adapter's pre-call balances of both CTF ids and WCOL.
5. **Negative-risk, exchange-bound factory.** Call the exact negative-risk outcome-token factory returned by the selected exchange. It pulls the caller's full YES and NO balances and calls the legacy NegRiskAdapter. The factory can consume its pre-existing balances of both CTF ids. The legacy adapter can consume its pre-existing balances of both ids and its entire WCOL balance. The factory then wraps its entire USDC.e balance. Capture pins every one of those pre-call balances.

Direct CTF redemption and the accepted contract routes can consume full balances. Each top-level `redemptionExecutions` entry is scoped to one custody config, market kind, and condition id. Its `coveredPositionIds` is the exact numeric-sorted set of held position ids that its call sequence consumes. Every held position appears in exactly one such set and references that execution. Two executions MUST NOT cover the same held position.

A factory or legacy-adapter route that reads a caller's full binary balances covers every held YES or NO id for that custody account and condition. The record MUST NOT split or duplicate that full-balance set across executions. An executable contract route requires every recorded pre-call swept balance to be zero. This prevents old contract residue from being counted as vault output or transferred to the vault without a proved ownership claim. The execution MUST NOT describe a partial redemption. The selected contract's runtime code, public dependency getters, owner, admins, wrapper role, pause state, and CTF approval are pinned. For a negative-risk factory, `NEG_RISK_ADAPTER()` and `WRAPPED_COLLATERAL()` must also match the selected route.

The execution includes one ordered call list that reaches pUSD, the pinned before balances, reserved-position checks, required approvals, and minimum expected intermediate and final ERC-20 amounts. Calls for one custody-and-condition set appear once, at the top level, rather than once per position.

`redemptionExecutions` are pinned, executable valuation and wind-down plans. Their presence does not claim that the calls occurred, and a version 1 normal roll MUST NOT execute them inside its protected settlement transaction. If a separate, authorized transaction executes a plan, each listed top-level call MUST originate from the selected `custodyAccount`; an enforcer cannot substitute its own address. Trace verification for that separate execution binds the caller, target, zero native value, complete calldata, token balance changes, and required internal route calls. A redemption or other custody movement after capture makes the valuation stale. The operator MUST capture the new state and build a new valuation record before a normal roll.

## Venue fees

The pinned official Rust client computes the effective platform-fee rate as `feeRate * (price * (1 - price))^feeExponent`. For a trade amount expressed as `shares * price`, its platform-fee calculation is `shares * feeRate * (price * (1 - price))^feeExponent`. Market rates, exponents, builder fees, and rounding behavior are mutable service policy.

The venue's current maker-zero policy is also mutable. V2 `matchOrders` accepts both `takerFeeAmount` and `makerFeeAmounts`. The contract does not require maker fees to be zero. It checks each nonzero fee against the on-chain upper bound from `getMaxFeeRate()`.

For an unresolved position valued by crossing the CLOB as a taker, this profile defines:

```
maxFeeRateBps = exchange.getMaxFeeRate() at the pinned block
require 1 <= maxFeeRateBps <= 9_999
venueExitCost = floor(grossMark * maxFeeRateBps / 10_000)
mark          = grossMark - venueExitCost
```

The position entry names the exchange route. The record pins its code and the exact `getMaxFeeRate()` result, including zero. An unresolved position requires a value in `[1, 9999]`. In the pinned contract, zero disables the limit rather than the fee, so a verifier MUST NOT treat zero as a zero fee. A failed call, value above `9999`, or unknown route is `DATA_UNAVAILABLE`. This rule is an upper-bound haircut for one taker sell order, not a prediction of the operator's quoted fee. A later fee-cap change triggers M1's rebuild rule. A resolved position uses its CTF payout state and does not use this cap.

Both V2 exchanges returned `getMaxFeeRate() == 0` at the discovery block above. The deployed routes therefore could not produce an M1 CLOB mark at that block. A resolved, chain-redeemable position can still use its redemption mark. A later capture of an unresolved position needs a nonzero on-chain cap or a later profile with another enforceable fee bound.

Vector in 6-decimal collateral units: `grossMark = 50000000` and `maxFeeRateBps = 500` gives `venueExitCost = 2500000` and `mark = 47500000`. A one-unit gross mark at the same cap has zero cost after the contract's floor.

## Degraded modes (venue outage or shutdown)

The venue is a single centralized service. Its unavailability is an explicit operating state:

1. An API outage is `DATA_UNAVAILABLE` per Part III. An outage MUST NOT replace a required unresolved-position book with an empty book, omit inventory, or create a zero mark. No settlement that requires fresh valuation may use a capture after its validity bounds expire.
2. A prolonged outage or announced shutdown triggers the deployment's declared degraded mode: block valuation-dependent deposits and rolls, and keep cancellation and claim paths open, since they need no venue. Where positions can still resolve on-chain (CTF resolution is on-chain), a resolution-only recovery MAY value and redeem resolved positions from chain state alone and wind the vault down under Part II's retirement records.
3. A venue shutdown never justifies marking open positions to zero. A side pocket requires a separate profile that allocates its rights before new flows. Without one, unresolved material positions block settlement and enter wind-down disclosure.

## Closed machine shape

`inputs.venueState` is a closed object under this profile. Every integer is a canonical decimal string. Addresses and fixed bytes use lowercase PMVS-JCS hex. `null` is allowed only where the tables say so. [`venue-polymarket-1.schema.json`](../schemas/venue-polymarket-1.schema.json) rejects every undeclared field.

| `venueState` field | Type and rule |
|---|---|
| `profile` | MUST equal `venue/polymarket/1` |
| `custodyConfigs` | One closed wallet-binding object for every independently derived active-generation strategy-custody account, including pUSD-only and zero-position accounts |
| `positions` | Array of the closed position-entry shape below |
| `books` | Array of the closed normalized-book shape below; exactly one per distinct held `assetId` on an unresolved condition, and none for resolved positions |
| `routeConfigs` | Array of closed V2 exchange-route objects; every `routeId` used by a position, order commitment, or freeze config appears exactly once; a settlement-bearing record used for L1 or higher includes exactly one config for each of the two supported exchange domains |
| `standardOracleConfigs` | Array of closed standard-oracle objects; empty if no standard position is held |
| `negRiskConfigs` | Array of closed negative-risk market objects; empty if no negative-risk position is held |
| `redemptionConfigs` | Array of closed redemption-route objects; every `redemptionRouteId` used by an execution appears exactly once |
| `redemptionExecutions` | Array of closed custody-and-condition execution objects; together they consume every held position exactly once |
| `orderCommitments` | Bounded array of disclosed active and unfilled V2 orders with pinned reservation state |
| `settlementFreezeConfigs` | Array of closed transaction-time freeze preconditions for custody-and-route pairs |
| `collateralConfig` | One closed pUSD and USDC.e evidence object |
| `wrappedCollateralConfig` | Closed WCOL and USDC.e evidence object when a negative-risk position is held; otherwise `null` |
| `erc1155Approvals` | Complete reconstructed ERC-1155 approval-candidate set |
| `erc20Allowances` | Complete approval-event and active-route spender set |
| `authorities` | Complete reconstructed authority-candidate set for pUSD, the selected ramps and adapters, active exchange routes, and any Deposit Wallet factory in the custody set; the selected pUSD offramp wrapper row is always present and active |
| `responses` | Raw-response descriptors in the closed shape below |

Each `positions[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `position` | Object that passes `position/gnosis-ctf/1` |
| `custodyConfigId` | Nonempty string that selects the entry for `position.custodyAccount` |
| `marketKind` | `standard` or `negative-risk` |
| `routeId` | Nonempty string that selects one `routeConfigs` entry |
| `standardOracleConfigId` | Nonempty string for a standard position; otherwise `null` |
| `negRiskConfigId` | Nonempty string for a negative-risk position; otherwise `null` |
| `redemptionExecutionId` | Nonempty string that selects the one `redemptionExecutions` entry whose `coveredPositionIds` contains this position id |
| `conditionPreparation` | Closed event object with `blockNumber`, `blockHash`, `transactionHash`, `logIndex`, `oracle`, `questionId`, and `outcomeSlotCount` |
| `userPausedBlockAt` | Exact selected-exchange mapping value for `position.custodyAccount` |
| `isUserPaused` | Exact selected-exchange view result at the pinned block |
| `reservedQuantity` | Position amount reserved by the disclosed `orderCommitments` set or another known obligation; MUST be `0` before an execution sweeps the caller's full balance |
| `venueReportedSize` | Data API size normalized to position base units, or `null`; never used as the normative balance |

Each `redemptionExecutions[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `redemptionExecutionId` | Unique nonempty string |
| `custodyConfigId` | Nonempty string that selects the custody account whose balances the calls consume |
| `marketKind` | `standard` or `negative-risk`; MUST match every covered position and the selected route |
| `conditionId` | CTF condition id shared by every covered position |
| `payoutNumerators` | Two exact CTF payout-numerator reads, in outcome-slot order; `["0", "0"]` while unresolved |
| `payoutDenominator` | Exact CTF payout-denominator read; `"0"` selects CLOB crossing and a positive value selects redemption valuation |
| `redemptionRouteId` | Nonempty string that selects one `redemptionConfigs` entry |
| `coveredPositionIds` | Nonempty numeric-sorted array containing the exact held position ids consumed by this call sequence |
| `redemptionCalls` | Nonempty ordered array of the closed call-plan shape below that completes the selected route to pUSD |

Each `(custodyConfigId, conditionId)` pair appears in exactly one redemption execution. Its `coveredPositionIds` MUST equal the set of held positions for that pair that the selected calls consume. For every `positions[]` entry, its `(custodyConfigId, positionId)` pair appears in exactly one execution. The same numeric position id may repeat only under another custody config. A full-balance factory or legacy-adapter route covers all held ids in its binary balance set, so another execution MUST NOT repeat any part of that set.

Each `redemptionCalls[]` entry has exactly `target`, `value`, `calldataState`, `calldata`, `expectedOutputToken`, and `minimumOutputAmount`. `value` and `minimumOutputAmount` are decimal `uint256` strings. `calldataState` is `exact` or `resolution-dependent`. For `exact`, `calldata` is the complete hex calldata. The first call MUST always be exact because it has no prior payout dependency. For a later `resolution-dependent` call, `calldata` is `null` because the preceding payout amount is not known yet, and `minimumOutputAmount` MUST be `0`. Once `payoutDenominator(conditionId) > 0`, every call MUST be exact. This exception applies to future calldata only; the route addresses, code, getters, approvals, and current balances remain pinned.

For a resolved condition, the first call's `minimumOutputAmount` MUST equal the exact output calculated from the pinned CTF payout state, full covered balances, checked `uint256` arithmetic, and zero sweep balances. A WCOL step MUST decode as `unwrap(custodyAccount, amount)`. A pUSD onramp step MUST decode as `wrap(USDC.e, custodyAccount, amount)`. Both transformations are one-for-one in the pinned source. Their decoded `amount` and `minimumOutputAmount` MUST equal the preceding call's exact output. The outer chain verifier supplies the payout reads and checks this amount equation. The profile helper decodes every exact call and rejects a wrong selector, asset, recipient, amount, or trailing byte.

The call plan also binds the authority needed for each transfer. A factory or legacy NegRiskAdapter first call requires an active CTF approval from the custody account to that entrypoint. The negative-risk factory also requires the factory's active CTF approval to the legacy NegRiskAdapter. For each `(USDC.e, custodyAccount, onramp)` tuple, the allowance MUST cover the sum of every selected onramp call. Use the decoded amount for an exact call and the maximum binary payout of its covered positions for a resolution-dependent call. The pUSD authority set MUST show the wrapper role as active for each selected onramp or exchange-bound factory. A missing or insufficient approval, allowance, or wrapper role makes the route non-executable.

The ordered `expectedOutputToken` sequence is exact for each route kind. `direct-ctf-onramp` uses CTF to produce USDC.e, then the onramp to produce pUSD. `ctf-exchange-bound-factory` produces pUSD in its one factory call. `neg-risk-direct-ctf-onramp` uses CTF to produce WCOL, unwraps WCOL to USDC.e, then uses the onramp to produce pUSD. `neg-risk-adapter-onramp` uses the legacy NegRiskAdapter to produce USDC.e, then the onramp to produce pUSD. `neg-risk-exchange-bound-factory` produces pUSD in its one factory call. A direct CTF call MUST NOT name pUSD as its immediate output.

Each `custodyConfigs[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `custodyConfigId` | Unique nonempty string |
| `custodyAccount` | Address that holds the recorded pUSD and CTF balances |
| `walletKind` | `deposit-wallet-v2` or `legacy-gnosis-safe` |
| `signatureType` | Decimal string `3` for Deposit Wallet or `2` for legacy Safe |
| `makerAddress` | MUST equal `custodyAccount` |
| `orderSignerAddress` | MUST equal `custodyAccount` for Deposit Wallet and `accountSignerAddress` for legacy Safe |
| `accountSignerAddress` | Address of the account signer that authorizes the order |
| `owner` | Current Deposit Wallet owner and version 1 batch signer; `null` for legacy Safe |
| `pendingOwner` | Pending Deposit Wallet handover recipient, or `null`; `null` for legacy Safe |
| `pendingOwnerDeadline` | Deposit Wallet handover deadline as a decimal `uint256`; zero exactly when `pendingOwner` is `null`; `null` for legacy Safe |
| `pendingOwnerNonce` | Deposit Wallet handover nonce as a decimal `uint256`; `null` for legacy Safe |
| `runtimeCodeHash` | Pinned custody-account runtime-code hash |
| `factory` | Deposit Wallet factory or legacy Safe factory, according to `walletKind` |
| `factoryCodeHash` | Pinned factory runtime-code hash |
| `factoryImplementation` | Deposit Wallet factory proxy implementation from the EIP-1967 slot; `null` for the direct legacy Safe factory |
| `factoryImplementationCodeHash` | Pinned Deposit Wallet factory implementation runtime-code hash; `null` for the direct legacy Safe factory |
| `proxyMode` | `deposit-uups`, `deposit-shared-erc1967`, `deposit-implementation-pinned`, or `legacy-safe-proxy` |
| `implementationResolver` | Shared ERC-1967 resolver address when `proxyMode` is `deposit-shared-erc1967`; otherwise `null` |
| `implementationResolverCodeHash` | Pinned resolver code hash when a resolver is used; otherwise `null` |
| `implementation` | Implementation address resolved at the pinned block |
| `implementationCodeHash` | Pinned implementation runtime-code hash |
| `controllers` | Sorted nonempty array containing exactly `accountSignerAddress` for a Deposit Wallet, or every legacy Safe owner |
| `threshold` | Required controller count as a positive decimal integer; `1` for the documented Deposit Wallet signer path |
| `modules` | Sorted array of every active arbitrary-execution module; empty when the pinned account code has no such module system |
| `guard` | Active legacy Safe guard address, or `null`; MUST be `null` for Deposit Wallet |
| `fallbackHandler` | Active legacy Safe fallback-handler address, or `null`; MUST be `null` for Deposit Wallet |
| `pausedAt` | Exact Deposit Wallet `paused()` timestamp as a decimal `uint256`; zero means unpaused; `null` for legacy Safe |
| `implementationPinned` | `true` exactly for `deposit-implementation-pinned`, `false` for `deposit-shared-erc1967` and `deposit-uups`, and `null` for legacy Safe |
| `sessionSigners` | Sorted complete EOA session-signer candidate array; empty for legacy Safe |
| `passkeySessionSigners` | Sorted complete passkey session-signer candidate array; empty for legacy Safe |
| `nonce` | Pinned wallet execution nonce as a decimal `uint256` string |

Each `sessionSigners[]` row has exactly `signer`, `validUntil`, `active`, `lastEventBlockNumber`, `lastEventTransactionHash`, and `lastEventLogIndex`. `signer` is a lowercase nonzero address. Each `passkeySessionSigners[]` row has exactly `passkeyId`, `x`, `y`, `validUntil`, `active`, and the same three last-event fields. `passkeyId` is nonzero `bytes32`. An authorized passkey has nonzero `x` and `y`; a revoked candidate remains in the array with both coordinates and `validUntil` equal to zero. A partial-zero coordinate pair is invalid. The arrays retain inactive candidates and sort by `signer` or `passkeyId` respectively.

The outer verifier supplies the pinned block's timestamp as `valuationBlockTimestamp` whenever a Deposit Wallet config exists. For both signer kinds, `active` MUST equal `validUntil != 0 && valuationBlockTimestamp < validUntil`. Candidate completeness comes from every authorization, ordinary revocation, and emergency-revocation event, followed by the corresponding getter at the pinned block. The last-event tuple is always present and identifies the event that most recently changed that candidate.

For `deposit-wallet-v2`, the schema requires signature type `3`, `makerAddress == orderSignerAddress == custodyAccount`, the Deposit Wallet factory proxy and its pinned implementation, a deposit proxy mode, `threshold == "1"`, and null Safe-only fields. Version 1 additionally requires `accountSignerAddress == owner` and `controllers == [owner]`; it does not admit a session-signed order or batch. `implementationPinned` MUST agree with `proxyMode` as specified above. The authority set MUST contain the active factory upgrade authority proved by that implementation. For `legacy-gnosis-safe`, the schema requires signature type `2`, `makerAddress == custodyAccount`, `orderSignerAddress == accountSignerAddress`, the direct legacy Safe factory, null Deposit Wallet-only control fields, `legacy-safe-proxy`, and empty Deposit session-signer arrays. Address equality, time-dependent activity, and candidate completeness remain semantic validation rules where JSON Schema cannot express them.

Each `orderCommitments[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `custodyConfigId` | Nonempty string selecting the maker's custody config |
| `routeId` | Nonempty string selecting the V2 exchange and EIP-712 domain |
| `orderHash` | Exact exchange `hashOrder` result for the fields below |
| `salt` | Signed V2 `uint256` salt |
| `maker` | Signed maker address; MUST equal the selected custody account |
| `signer` | Signed signer address; MUST match the custody config's signature rule |
| `tokenId` | Signed CTF `uint256` token id |
| `makerAmount` | Signed positive `uint256` maker amount |
| `takerAmount` | Signed `uint256` taker amount |
| `side` | Signed decimal `uint8`: `0` for buy or `1` for sell |
| `signatureType` | Signed decimal `uint8`; MUST equal the selected custody config's type |
| `timestamp` | Signed V2 `uint256` creation time in milliseconds; it is not an expiry |
| `metadata` | Signed `bytes32` metadata |
| `builder` | Signed `bytes32` builder code |
| `signature` | Nonempty signature bytes for the disclosed order; a Deposit Wallet signature MUST NOT have the version 1 session-envelope magic suffix |
| `statusFilled` | Exact `getOrderStatus(orderHash).filled` result; MUST be false |
| `statusRemaining` | Exact decimal `uint248` `getOrderStatus(orderHash).remaining` result |
| `effectiveRemainingMakerAmount` | Positive amount equal to `makerAmount` when `statusRemaining` is `0`, or `statusRemaining` when it is nonzero |
| `signatureValid` | Boolean result of running `validateOrderSignature(orderHash, order)` at the pinned block; MUST be true |
| `transferAuthorityActive` | Whether the selected exchange has any required maker-asset transfer authority at the pinned block; MUST be true |
| `userPausedBlockAt` | Exact selected-exchange mapping value for `maker` |
| `isUserPaused` | Exact selected-exchange view result for `maker`; MUST be false |
| `reservedAssetType` | `erc20` for a buy or `erc1155` for a sell |
| `reservedAssetContract` | pUSD for a buy or CTF for a sell |
| `reservedTokenId` | `null` for a buy or the signed `tokenId` for a sell |
| `reservedAmount` | MUST equal `effectiveRemainingMakerAmount` |

For an ERC-1155 sell, `transferAuthorityActive` equals the recorded `isApprovedForAll(maker, exchange)` result. For an ERC-20 buy, it is true exactly when the recorded pUSD allowance from maker to exchange is nonzero. It does not assert that the maker has enough balance. The verifier recomputes the active reserved quantity from the order state, signature validity, pause state, transfer authority, and corresponding balance. It matches that result to each position's `reservedQuantity` and to the pUSD exposure calculation.

This comparison accounts for the disclosed rows only. An empty array means that the record discloses no current active order. It does not prove that no signed order exists.

Because this array contains only orders that remain active at the pinned block, a settlement-bearing record used for L1 or higher MUST use an empty `orderCommitments` array. The execution-time freeze, not that empty array, makes disclosed and undisclosed signatures unable to move assets during settlement.

Each `settlementFreezeConfigs[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `freezeConfigId` | Unique nonempty string |
| `custodyConfigId` | Nonempty string selecting the custody account protected by the predicate |
| `routeId` | Nonempty string selecting the exchange whose transfer paths are frozen |
| `predicate` | `effective-user-pause` or `transfer-authorities-revoked` |
| `enforcementMode` | MUST equal `settlement-transaction-precondition` |
| `predicateReads` | Ordered nonempty array of the closed read shape below |
| `enforcer` | Settlement contract that performs the predicate reads and covered state transition |
| `enforcerCodeHash` | Pinned runtime-code hash for `enforcer` |
| `settlementFunctionSelector` | Exact `bytes4` selector of the settlement entrypoint that enforces the reads |
| `settlementCalldataHash` | `keccak256` of the complete settlement transaction input, including the selector and every argument |
| `enforcerSourceCommit` | Full 40-hex source revision whose reviewed runtime matches `enforcerCodeHash` |

Each `predicateReads[]` entry has exactly `target`, `calldata`, and `expectedReturnData`. All three are exact. `target` is a nonzero address. `calldata` is the complete ABI calldata. `expectedReturnData` is the complete ABI-encoded return value.

For `effective-user-pause`, `predicateReads` contains exactly one call. It targets the selected exchange, calls `isUserPaused(custodyAccount)`, and expects encoded `true`. For `transfer-authorities-revoked`, it contains exactly two calls in that order. The first targets CTF, calls `isApprovedForAll(custodyAccount, exchange)`, and expects encoded `false`. The second targets pUSD, calls `allowance(custodyAccount, exchange)`, and expects encoded zero.

`transfer-authorities-revoked` is diagnostic-only in version 1 because the current pUSD implementation is upgradeable. A settlement-bearing record used for L1 or higher MUST use `effective-user-pause` in every freeze config.

The profile verifier requires the caller to select `diagnostic` or `settlement` scope. It has no default. Diagnostic validation checks the record's internal profile relations. It is nonconforming and cannot support L1. Settlement validation applies the venue checks required by L1 and higher levels. It remains one input to an outer end-to-end verifier.

The outer component and chain verifier supplies three independently derived inputs: `strategyCustodyAccounts`, `expectedAuthorityIdentities`, and the aggregate `pUsdCustodyBalance`. `strategyCustodyAccounts` is the active-generation custody address set in lowercase sorted order. `expectedAuthorityIdentities` is the sorted complete `(contract, account, role)` candidate set reconstructed under “Approval and control evidence,” including inactive historical candidates. The semantic verifier requires exact equality with the recorded custody and authority sets. It also requires an active pUSD wrapper row for the selected offramp and each selected wrapping route.

Diagnostic validation MAY omit the external sets and MAY use an empty `settlementFreezeConfigs` array. It then makes no custody- or authority-completeness claim. Settlement validation MUST receive both sets and include exactly one standard and one negative-risk `routeConfigs` entry. It MUST cover every combination of matched `custodyConfigId` and those two `routeId` values exactly once. This requirement does not depend on held positions, disclosed orders, or the route selected for valuation. The semantic verifier binds each target and calldata to its custody-route pair and rejects missing, extra, or duplicate coverage. `pUsdCustodyBalance` remains one aggregate balance across the perimeter. It is an exposure input, not evidence of account-set completeness.

Settlement-scope verification is a post-action conformance check. The current freeze stops V2 fills, and the receipt proves that the protected roll did not call custody or change Safe control state. It does not stop a Safe owner from moving assets after capture but before the protected transaction. A mismatch prevents L1 after execution, but it cannot prevent the transaction itself. A deployment using `venue/polymarket/1` therefore MUST NOT be presented as production-ready until its enforcer rechecks the exact captured custody balances and wallet-control predicates on-chain and reverts before any settlement effect when they differ.

All freeze configs in one settlement-bearing record used for L1 or higher MUST name the same `enforcer`, `enforcerCodeHash`, `settlementFunctionSelector`, `settlementCalldataHash`, and `enforcerSourceCommit`. The later settlement transaction MUST target that `enforcer`. Its complete input MUST begin with the selector and hash to `settlementCalldataHash`. An added, removed, or changed byte is a mismatch. The enforcer must satisfy the direct-enforcer, custody-isolation, and predicate-preservation rules above, and its runtime at the receipt block MUST match `enforcerCodeHash`. The reviewed source revision MUST bind that exact calldata to the full recorded custody-and-route predicate set. It MUST perform every required read before any settlement state change or value-moving external call. Only those read-only predicate calls may occur first. A failed read or mismatched return reverts the transaction before settlement effects. Settlement-receipt and trace validation enforce these relations between the outer record, every freeze config, and the one executed transaction.

This profile's cross-field semantic verifier does not make copied booleans or amounts self-authenticating. The outer PMVS chain verifier MUST derive the exact target and calldata for every on-chain observation named by this profile, find one matching read in `inputs.chainState` at the valuation block, and compare the complete returned bytes with the normalized `venueState` value. This includes both payout numerators, the payout denominator, order status, `validateOrderSignature`, user-pause state, balances, allowances, approvals, getters, code hashes, proxy slots, and authority state. Missing, duplicate, stale, or inconsistent reads fail verification. The same boundary applies to resolution-dependent redemption calls: the outer verifier MUST validate their complete calldata and minimum-output rule once the preceding payout is known.

For settlement, the outer verifier MUST fetch the canonical transaction and successful receipt from the recorded chain, transaction hash, block number, and block hash. It MUST validate the authorized sender, exact target, zero native value, complete input, successful status, event sequence, and receipt-block enforcer runtime. It MUST also confirm that each selected exchange still has the direct runtime recorded in its route config. A normal-roll trace contains no custody redemption call, so `redemptionExecutions` are not matched to settlement frames.

At capture, the outer verifier MUST authenticate the active Core funding-source enumeration, each accounting-asset balance, and each encumbrance against valuation-block reads in `inputs.chainState`. At settlement, it MUST authenticate the Core receipt's full `fundingSources`, `assetBalances`, and `reserveBuckets` arrays against that capture evidence, canonical transaction pre-state, emitted events, post-state, and exact transfer deltas. The receipt source accounts MUST equal the capture-time set. The verifier sorts that set and supplies it as `fundingSourceAccounts` to the venue helper. The helper rejects a missing top-level field, duplicate, malformed address, or overlap with `strategyCustodyAccounts`. A caller-chosen address list is not evidence.

The settlement-call helper takes one closed out-of-band evidence object. `strategyCustodyTargetCallCount`, `strategyCustodyOriginCallCount`, `safeDelegatecallCount`, and `stateChangingV2CallCount` cover the complete trace from the first pause read through transaction completion; each MUST be zero. `custodyChecks` contains exactly one row per custody config, sorted by `custodyConfigId`. Each row binds native `masterCopy()` calldata and pre/post return data, proxy runtime, singleton address and code hash, controllers, threshold, modules, guard, fallback handler, and nonce. Its pre-state values equal the captured config, its post-state values equal its pre-state values, and its nonce does not change. The outer verifier MUST derive these fields from canonical transaction pre-state, post-state, and the complete trace and reject an omitted frame or account. The helper cross-binds the normalized evidence; it cannot authenticate a caller-supplied summary.

Each unresolved held `assetId` has exactly one `books[]` entry. Resolved positions use the payout fields in their redemption execution and MUST NOT have a book entry. Each book has exactly these fields:

| Field | Type and rule |
|---|---|
| `assetId` | CTF token id as a `uint256` decimal string |
| `market` | CTF condition id as `bytes32` |
| `negRisk` | JSON boolean copied from the raw response |
| `venueTimestampMs` | Response `timestamp`, parsed as a nonnegative integer millisecond string |
| `venueHash` | Opaque nonempty string copied from `hash`; it is not a signature |
| `minOrderSizeBase` | `min_order_size` normalized to position base units |
| `tickSizeU6` | `tick_size` normalized to 6-decimal price units |
| `lastTradePriceU6` | `last_trade_price` normalized to 6-decimal price units, or `null` |
| `bids` | Array of closed `{ "priceU6", "quantity" }` objects, sorted by descending `priceU6`; both fields are decimal strings |
| `bidsTruncated` | Boolean; true only when the captured prefix fully fills the aggregate held quantity |
| `responseHash` | `bytes32` content hash that selects one `responses` entry |

Each `routeConfigs[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `routeId` | Unique nonempty string |
| `marketKind` | `standard` or `negative-risk` |
| `exchange` | V2 exchange address |
| `exchangeCodeHash` | Pinned runtime-code hash |
| `exchangeCollateralToken` | MUST equal pUSD |
| `ctf` | MUST equal the CTF address in this profile |
| `ctfCodeHash` | Pinned CTF runtime-code hash |
| `ctfCollateralToken` | USDC.e for standard; WCOL for negative risk |
| `outcomeTokenFactory` | Exact result of `getOutcomeTokenFactory()` |
| `outcomeTokenFactoryCodeHash` | Pinned runtime-code hash for that factory |
| `factoryConditionalTokens` | Exact factory `CONDITIONAL_TOKENS()` result; MUST equal `ctf` |
| `factoryCollateralToken` | Exact factory `COLLATERAL_TOKEN()` result; MUST equal pUSD |
| `factoryUsdce` | Exact factory `USDCE()` result; MUST equal USDC.e |
| `factoryNegRiskAdapter` | Exact factory `NEG_RISK_ADAPTER()` result for negative risk; otherwise `null` |
| `factoryWrappedCollateral` | Exact factory `WRAPPED_COLLATERAL()` result for negative risk; otherwise `null` |
| `factoryPausedUsdce` | Exact factory pause result for USDC.e |
| `legacySafeFactory` | Exact exchange `getSafeFactory()` result used by signature type `2` |
| `legacySafeFactoryCodeHash` | Pinned legacy Safe factory runtime-code hash |
| `legacySafeImplementation` | Exact exchange `getSafeImplementation()` result used in type `2` address derivation |
| `legacySafeImplementationCodeHash` | Pinned derived implementation runtime-code hash |
| `exchangePaused` | Exact `paused()` result |
| `userPauseBlockInterval` | Exact `userPauseBlockInterval()` result |
| `maxFeeRateBps` | Exact `getMaxFeeRate()` result; an unresolved position on this route requires a value in `[1, 9999]` for CLOB crossing, while a resolved position may record `0` |
| `feeReceiver` | Exact `getFeeReceiver()` result |
| `sourceCommit` | Full 40-hex source revision used for semantic verification |

Each `standardOracleConfigs[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `standardOracleConfigId` | Unique nonempty string |
| `oracle` | Event-derived v3.1 or V4 adapter address |
| `version` | `v3.1.0` or `v4` |
| `runtimeCodeHash` | Pinned oracle runtime-code hash |
| `ctf` | Exact `ctf()` result |
| `optimisticOracle` | Exact `optimisticOracle()` result |
| `collateralWhitelist` | Exact `collateralWhitelist()` result |
| `questionId` | The position's question id |
| `initialized` | Exact `isInitialized(questionId)` result; MUST be true |
| `flagged` | Exact `isFlagged(questionId)` result |
| `ready` | Exact `ready(questionId)` result |
| `questionStateReturnData` | Raw ABI return bytes from `getQuestion(questionId)` |
| `sourceCommit` | Full source revision for this adapter version |

Each `negRiskConfigs[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `negRiskConfigId` | Unique nonempty string |
| `marketId` | Question id with its low byte cleared |
| `questionId` | Exact negative-risk question id |
| `questionIndex` | Low byte of `questionId`, as a decimal string |
| `questionCount` | Exact `getQuestionCount(marketId)` result |
| `feeBps` | Exact `getFeeBips(marketId)` result |
| `determined` | Exact `getDetermined(marketId)` result |
| `resultIndex` | Exact `getResult(marketId)` result, or `null` when `determined` is false |
| `negRiskAdapter` | MUST equal `0xd91e80cf2e7be2e162c6513ced06f1dd0da35296` |
| `negRiskAdapterCodeHash` | Pinned runtime-code hash |
| `wrappedCollateral` | Exact `wcol()` result |
| `marketOperator` | Exact `getOracle(marketId)` result |
| `marketOperatorCodeHash` | Pinned operator runtime-code hash |
| `operatorNegRiskAdapter` | Exact operator `nrAdapter()` result; MUST equal `negRiskAdapter` |
| `upstreamOracle` | Exact operator `oracle()` result |
| `upstreamOracleCodeHash` | Pinned upstream-adapter runtime-code hash |
| `upstreamCtf` | Exact upstream-adapter `ctf()` result; MUST equal `marketOperator` |
| `upstreamOptimisticOracle` | Exact upstream `optimisticOracle()` result |
| `upstreamCollateralWhitelist` | Exact upstream `collateralWhitelist()` result |
| `upstreamInitialized` | Exact upstream `isInitialized(questionId)` result; MUST be true |
| `upstreamFlagged` | Exact upstream `isFlagged(questionId)` result |
| `upstreamReady` | Exact upstream `ready(questionId)` result |
| `upstreamQuestionStateReturnData` | Raw ABI return bytes from upstream `getQuestion(questionId)` |
| `operatorDelaySeconds` | Exact `DELAY_PERIOD()` result |
| `requestId` | Request id bound by the operator's `QuestionPrepared` event |
| `flaggedAt` | Exact `flaggedAt(questionId)` result |
| `reportedAt` | Exact `reportedAt(questionId)` result |
| `reportedResult` | Exact `results(questionId)` result, or `null` when `reportedAt` is zero |
| `adapterMarketPrepared` | Closed event object with `blockNumber`, `blockHash`, `transactionHash`, `logIndex`, `marketId`, `oracle`, `feeBps`, and `data` |
| `adapterQuestionPrepared` | Closed event object with `blockNumber`, `blockHash`, `transactionHash`, `logIndex`, `marketId`, `questionId`, `questionIndex`, and `data` |
| `operatorMarketPrepared` | Closed event object with `blockNumber`, `blockHash`, `transactionHash`, `logIndex`, `marketId`, `feeBps`, and `data` |
| `operatorQuestionPrepared` | Closed event object with `blockNumber`, `blockHash`, `transactionHash`, `logIndex`, `marketId`, `questionId`, `requestId`, `questionIndex`, and `data` |
| `operatorSourceCommit` | Full source revision for the selected operator generation |
| `upstreamSourceCommit` | Full source revision for the selected upstream adapter |

Each `redemptionConfigs[]` entry has exactly these fields:

| Field | Type and rule |
|---|---|
| `redemptionRouteId` | Unique nonempty string |
| `marketKind` | `standard` or `negative-risk` |
| `kind` | `direct-ctf-onramp`, `ctf-exchange-bound-factory`, `neg-risk-direct-ctf-onramp`, `neg-risk-adapter-onramp`, or `neg-risk-exchange-bound-factory` |
| `adapterRole` | `none`, `exchange-bound-factory`, or `legacy-neg-risk-adapter`, consistent with `kind` and `entrypoint` |
| `entrypoint` | Contract called by the first entry in each referencing execution's `redemptionCalls` |
| `entrypointCodeHash` | Pinned runtime-code hash |
| `rawCtfCollateralToken` | USDC.e or WCOL, according to `marketKind` |
| `intermediateOutputTokens` | Ordered nonempty token-address array for assets between CTF positions and pUSD; standard routes use `[USDC.e]`, negative-risk routes use `[WCOL, USDC.e]` |
| `accountingOutputToken` | MUST equal pUSD |
| `balanceSelection` | `caller-full-listed-ids`, `caller-full-binary-set`, or `explicit-binary-amounts` |
| `conditionalTokens` | CTF getter result for a factory or legacy-adapter route, or the CTF entrypoint for a direct route |
| `collateralToken` | Exchange-bound factory `COLLATERAL_TOKEN()` result, legacy NegRiskAdapter `col()` result, or `null` for a direct CTF route |
| `usdce` | Exchange-bound factory `USDCE()` result, legacy NegRiskAdapter `col()` result, or the selected onramp asset |
| `negRiskAdapter` | Negative-risk factory `NEG_RISK_ADAPTER()` result; otherwise `null`, including when the entrypoint is the NegRiskAdapter itself |
| `wrappedCollateral` | WCOL for every negative-risk route, read from `WRAPPED_COLLATERAL()`, `wcol()`, or the raw route binding as applicable; otherwise `null` |
| `onramp` | Selected pUSD onramp for a route that first returns USDC.e; otherwise `null` |
| `onrampCodeHash` | Pinned onramp runtime-code hash when `onramp` is non-null; otherwise `null` |
| `sweepBalances` | Sorted array of closed `{ "account", "tokenContract", "tokenId", "amount" }` pre-call balances for every contract balance that the selected code can consume; `tokenId` is `null` for ERC-20 and the decimal id for ERC-1155; every `amount` MUST equal `0`; empty for a direct route with no contract sweep |
| `pausedUsdce` | Exact selected exchange-bound factory or onramp pause result for USDC.e; MUST be false |
| `sourceCommits` | Sorted nonempty array of full source revisions covering every contract whose semantics the route relies on |

The source set is closed in version 1. A standard route MUST use exactly `ccc0596074f4dfd62c944fbca4de252893b82b4b` for V2 collateral conversion and `eeefca66eb46c800a9aaab88db2064a99026fde5` for CTF. A negative-risk route MUST use those two revisions plus `f78b35b0863b4308a431ca307d06f49b2ea65e78` for the NegRiskAdapter and WCOL. The arrays use that UTF-16 order. An omitted, substituted, extra, or reordered revision fails validation.

`collateralConfig` has exactly these fields: `accountingToken`, `proxyCodeHash`, `implementation`, `implementationCodeHash`, `decimals`, `nativeUsdc`, `usdce`, `vault`, `totalSupply`, `maxUsdceSettlementExposure`, `vaultUsdceBalance`, `vaultUsdceAllowance`, `onramp`, `onrampCodeHash`, `onrampCollateralToken`, `onrampPausedUsdce`, `offramp`, `offrampCodeHash`, `offrampCollateralToken`, and `offrampPausedUsdce`. Both collateral-token getter results MUST equal `accountingToken`. Addresses and code hashes use their types above. Amounts and decimals are decimal strings. Pause fields are booleans. Semantic validation recomputes the exposure and requires both USDC.e values to cover it.

`wrappedCollateralConfig` has exactly these fields: `wrappedCollateral`, `runtimeCodeHash`, `owner`, `underlying`, `decimals`, `totalSupply`, `maxRedemptionExposure`, and `underlyingBalance`. It is non-null exactly when a negative-risk position is held. `wrappedCollateral` MUST equal WCOL, `owner` MUST equal the NegRiskAdapter, and `underlying` MUST equal USDC.e. Amounts and decimals are decimal strings. Semantic validation recomputes the exposure and requires `underlyingBalance >= maxRedemptionExposure`.

Each `erc1155Approvals[]` entry has exactly `tokenContract`, `owner`, `operator`, `approved`, `lastEventBlockNumber`, `lastEventTransactionHash`, and `lastEventLogIndex`. The three last-event fields are `null` only for a route-added candidate with no matching event. Each `erc20Allowances[]` entry has exactly `token`, `owner`, `spender`, `amount`, `candidateSource`, `lastEventBlockNumber`, `lastEventTransactionHash`, and `lastEventLogIndex`; `candidateSource` is `event` or `route`.

Each `authorities[]` entry has exactly `contract`, `account`, `role`, `active`, `candidateSource`, `lastEventBlockNumber`, `lastEventTransactionHash`, and `lastEventLogIndex`. `candidateSource` is `constructor`, `event`, or `route`. Roles use stable identifiers from the pinned ABI or this profile, such as `owner`, `admin`, `operator`, `minter`, `wrapper`, `upgrader`, `deposit-wallet-controller`, `deposit-wallet-factory-upgrader`, `legacy-safe-owner`, `legacy-safe-module`, `legacy-safe-guard`, `legacy-safe-fallback-handler`, and `legacy-safe-order-signer`.

Each `responses[]` entry has exactly `responseHash`, `sourceProfile`, `requestMethod`, `requestUrl`, `httpStatus`, `startedAtMs`, `endedAtMs`, `mediaType`, `bodyLength`, and `retrievalUris`. Retrieval URIs point to byte-identical sidecars. Credentials and authorization headers MUST NOT appear in the record.

Sort `custodyConfigs` by `custodyConfigId`, each Deposit Wallet's `sessionSigners` by `signer`, and its `passkeySessionSigners` by `passkeyId`. Sort `positions` by numeric `position.positionId`, then `custodyConfigId`. Sort `books` by numeric `assetId`. Sort `redemptionExecutions` by `redemptionExecutionId`. Sort `orderCommitments` by `custodyConfigId`, `routeId`, numeric `tokenId`, and then `orderHash`. Sort `settlementFreezeConfigs` by `freezeConfigId`. Sort every other config array by its id in UTF-16 code-unit order. Sort approvals, allowances, and authorities by the lowercase address tuple shown in their fields, then by role where present. Sort `responses` by `responseHash`, and sort each response's `retrievalUris` in UTF-16 code-unit order. All listed sort keys are unique.

## Primary references

- [Polymarket contract addresses](https://docs.polymarket.com/resources/contracts)
- [Polymarket wallet types, Deposit Wallet deployment forms, and approvals](https://docs.polymarket.com/trading/wallets-auth)
- [Blockscout-verified Deposit Wallet implementation source](https://polygon.blockscout.com/address/0xf7f27c29e60fe6325bef8da7f93250353d2e3294?tab=contract)
- [Polymarket order fields and wallet signature-type mapping](https://docs.polymarket.com/trading/place-orders)
- [How Polymarket CTF positions work](https://docs.polymarket.com/trading/positions/how-positions-work)
- [Polymarket combinatorial positions and the separate Positions Framework](https://docs.polymarket.com/trading/positions/combinatorial)
- [Polymarket Combo RFQ flow](https://docs.polymarket.com/trading/combos/overview)
- [Order-book response](https://docs.polymarket.com/api-reference/market-data/get-order-book)
- [Official Rust client millisecond timestamp decoding at `222143d`](https://github.com/Polymarket/rs-clob-client-v2/blob/222143d321eba97d5711a848265eb9aab3bc7ff4/src/clob/types/response.rs)
- [Official Rust client fee calculation at `222143d`](https://github.com/Polymarket/rs-clob-client-v2/blob/222143d321eba97d5711a848265eb9aab3bc7ff4/src/clob/utilities.rs)
- [pUSD wrapping and unwrapping](https://docs.polymarket.com/concepts/pusd)
- [CTF Exchange V2 architecture at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/README.md)
- [V2 route getters at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/Assets.sol)
- [V2 Order fields, signature-type enum, and status at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/libraries/Structs.sol)
- [V2 EIP-712 domain and order hash at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/Hashing.sol)
- [V2 signature validation at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/Signatures.sol)
- [Legacy Safe address derivation at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/libraries/PolySafeLib.sol)
- [Legacy Safe signer check at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/PolyFactoryHelper.sol)
- [Per-user exchange pause at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/UserPausable.sol)
- [CollateralToken source at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/collateral/CollateralToken.sol)
- [CollateralOnramp source at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/collateral/CollateralOnramp.sol)
- [CollateralOfframp source at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/collateral/CollateralOfframp.sol)
- [Standard CTF Collateral Adapter at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/adapters/CtfCollateralAdapter.sol)
- [Negative-risk CTF Collateral Adapter at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/adapters/NegRiskCtfCollateralAdapter.sol)
- [Exchange fee cap source at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/Fees.sol)
- [V2 order validation, status, and fee settlement at `ccc0596`](https://github.com/Polymarket/ctf-exchange-v2/blob/ccc0596074f4dfd62c944fbca4de252893b82b4b/src/exchange/mixins/Trading.sol)
- [NegRiskAdapter at `f78b35b`](https://github.com/Polymarket/neg-risk-ctf-adapter/blob/f78b35b0863b4308a431ca307d06f49b2ea65e78/src/NegRiskAdapter.sol)
- [Negative-risk market-data layout at `f78b35b`](https://github.com/Polymarket/neg-risk-ctf-adapter/blob/f78b35b0863b4308a431ca307d06f49b2ea65e78/src/types/MarketData.sol)
- [WrappedCollateral at `f78b35b`](https://github.com/Polymarket/neg-risk-ctf-adapter/blob/f78b35b0863b4308a431ca307d06f49b2ea65e78/src/WrappedCollateral.sol)
- [Zero-delay NegRiskOperator at `f78b35b`](https://github.com/Polymarket/neg-risk-ctf-adapter/blob/f78b35b0863b4308a431ca307d06f49b2ea65e78/src/NegRiskOperator.sol)
- [One-hour-delay NegRiskOperator at `e206dd2`](https://github.com/Polymarket/neg-risk-ctf-adapter/blob/e206dd2ed5aa24cf1f86990b875c6b1577be25e2/src/NegRiskOperator.sol)
- [Published legacy negative-risk Polygon addresses at `f78b35b`](https://github.com/Polymarket/neg-risk-ctf-adapter/blob/f78b35b0863b4308a431ca307d06f49b2ea65e78/addresses.json)
- [UMA CTF Adapter v3.1.0 release](https://github.com/Polymarket/uma-ctf-adapter/releases/tag/v3.1.0)
- [UMA CTF Adapter v3.1.0 source at `10dd882`](https://github.com/Polymarket/uma-ctf-adapter/blob/10dd8829d710ed9c2541b4196b463ad0c90546fc/src/UmaCtfAdapter.sol)
- [UMA CTF Adapter V4 source at `8b76cc9`](https://github.com/Polymarket/uma-ctf-adapter/blob/8b76cc9e0d46c6f7450a0adb0ddc0f5b0568c9cc/src/UmaCtfAdapter.sol)
- [Resolution deployment constants at `75d1818`](https://github.com/Polymarket/resolution-subgraph/blob/75d1818547862a5bd3477ed2e6b16f693d42dab6/src/utils/constants.ts)
- [Pinned Gnosis CTF redemption source at `eeefca6`](https://github.com/gnosis/conditional-tokens-contracts/blob/eeefca66eb46c800a9aaab88db2064a99026fde5/contracts/ConditionalTokens.sol)
- [Resolution and redemption](https://docs.polymarket.com/concepts/resolution)
- [Trading fees](https://docs.polymarket.com/trading/fees)

## Data-rights note (non-normative)

Records under this profile embed venue API responses and republish them durably. Public API accessibility is not by itself a redistribution or permanent-republication license. Operators adopting this profile must clear venue terms, database rights, and applicable privacy obligations before publication. This is a deployment prerequisite, not a protocol rule.

## Copyright

Copyright and related rights on this document's text are waived via CC0-1.0.
