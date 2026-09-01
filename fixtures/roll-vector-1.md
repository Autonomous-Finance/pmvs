# PMVS v1 roll vector 1

A complete two-leg roll under `settlement/epoch-merkle/1`, `ROLL_SETTLEMENT_VERSION() == 2`, with a performance fee. Every number follows the formulas in the [EVM annex](../pmvs-evm.md#settlement-mechanics) and the [Merkle rules](../pmvs-evm.md#merkle-claims). Unlike vector 3 in [test-vectors.md](./test-vectors.md), each leg here is a real single-leg tree, so an implementation can compare its roots directly. Hashes were computed with an independent keccak implementation.

## Inputs

```text
chainId             = 137
settlementContract  = 0x1111111111111111111111111111111111111111
epoch               = 4
assetDecimals D     = 6            (BRIDGE = 10^12)
shareDecimals       = 18           (WAD = 10^18, K = WAD * BRIDGE = 10^30)
hwm                 = 1000000000000000000        (1.00)
grossPps            = 1100000000000000000        (1.10)
feeRate r           = 200000000000000000         (20%)
preFlowSupply       = 1000000000000000000000     (1000 shares)
```

## Fee

```text
delta        = grossPps - hwm                       = 100000000000000000
keep         = floor((WAD - r) * delta / WAD)       = 80000000000000000
ppsFinal     = hwm + keep                           = 1080000000000000000   (1.08)
feePerShare  = ceil(r * delta / WAD)                = 20000000000000000
sharesMinted = ceil(preFlowSupply * feePerShare / ppsFinal)
             = ceil(2 * 10^37 / 1.08 * 10^18)      = 18518518518518518519
new hwm      = ppsFinal                             = 1080000000000000000
```

## Deposit leg (leg = 0)

`depositSharesOut = floor(assets * BRIDGE * WAD / ppsFinal)`

| id | owner | assets (6dp) | sharesOut (18dp) |
|---|---|---|---|
| 11 | `0x2222222222222222222222222222222222222222` | 250000000 | 231481481481481481481 |
| 12 | `0x3333333333333333333333333333333333333333` | 1000000 | 925925925925925925 |

```text
totalAssets  = 251000000
totalShares  = 232407407407407407406
selectionHash = keccak256(abi.encode([11, 12]))
             = 0x122c30316e2ebdf0e7d13f4de4883b1cdd9778bdc331b111cf5973bfb204ec43

leaf(11) = 0x3c1c560efe0dbc891be79a7f63ddf4b0b1d44ac1dbc0ea9c15c41ea384f9cbf9
leaf(12) = 0xc1269f1aab86f90d1e414a5f3b220681d9b0a41b7b7eb91ec635cd404abea772
node     = keccak256(0x01 || min || max)
         = 0x1722d609d9831c222ef258d8b9d351a8570083c843465c91edcbbc271b042048
root     = keccak256(0x02 || be(2,32) || node)
         = 0x29ffa6ae019068b9175d14ea0c822f31f0a6d6e045a34f8f58a20ec01ff48db4
```

## Withdrawal leg (leg = 1)

`withdrawAssetsOut = floor(shares * ppsFinal / K)`

| id | owner | shares (18dp) | assetsOut (6dp) |
|---|---|---|---|
| 13 | `0x4444444444444444444444444444444444444444` | 100000000000000000000 | 108000000 |
| 14 | `0x5555555555555555555555555555555555555555` | 1000000000000000 | 1080 |

```text
totalShares  = 100001000000000000000
totalAssets  = 108001080
selectionHash = keccak256(abi.encode([13, 14]))
             = 0x91dc961a2f5eae41a7b793462a49c27efeb3c7b09c90d7e552105319dae85534

leaf(13) = 0x6f6ed3affb46dc3a6c877a5c5ce6b2cc4541ffcf686a7005640bbef4e8f44f8d
leaf(14) = 0x0d3b5f0b981bde68c84b6a6db2cdbe72708d90243e126b52699744b0da6b21ac
node     = 0x45c784ac1d7e97a023e017cf599be46f2992b594dfe7a3d99c23a3e34d681fc4
root     = 0xb44e4f28f5d3d29ce14e14392e73005ce8227fbe7a747e24911b94576052bd88
```

## Leaf preimage layout

As in [test-vectors.md](./test-vectors.md) vector 2: `0x00 || tag || be(chainId,32) || settlementContract(20) || leg(1) || be(epoch,8) || be(requestId,32) || owner(20) || be(amount,32)`, with `tag = keccak256("PMVS:MERKLE:1") = 0x71df0d2930a2279d0a8f0e38b7a9f5ceadeed5d0b250f4eaf38541b6fd7bf8ed` and `amount` the leg's output (shares for deposits, assets for withdrawals).

## What a conforming roll must do with this vector

Given the four stored requests, the committed `grossPps`, the stored `hwm` and `feeRate`, and the pre-flow supply, a conforming contract recomputes every figure above from storage and the price, mints `sharesMinted` fee shares, and rejects any submitted root or total that differs. A contract that stores submitted roots and totals without recomputing them cannot use this vector as a test and does not conform to Part II.

## Post-roll state to check

```text
supply after fee mint            = 1018518518518518518519
supply after deposit mint        = 1250925925925925925925
supply after withdrawal burn     = 1150924925925925925925
deposit claim reserve (shares)   = 232407407407407407406
withdrawal claim reserve (assets)= 108001080
EpochSettlementPriceUsed.ppsFinal = 1080000000000000000
FeeMintBasis.sharesMinted        = 18518518518518518519
```
