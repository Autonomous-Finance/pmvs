# PMVS v1 test vectors

Golden vectors for the byte-exact rules in the [EVM annex](../pmvs-evm.md). Every input is fully specified so an implementer can verify each step by hand. All hashes were computed with two independent keccak implementations.

## Vector 1 — PMVS-JCS record hash

```text
record fields (JSON object):
    epoch     = "3"
    kind      = "valuation"
    nav       = "123456789"
    subjectId = "0x0000000000000000000000000000000000000000000000000000000000000abc"

canonical bytes (UTF-16 key order, no whitespace, integers as decimal strings):
    {"epoch":"3","kind":"valuation","nav":"123456789","subjectId":"0x0000000000000000000000000000000000000000000000000000000000000abc"}

recordHash = keccak256(UTF8(canonical bytes)) =
    0x50903abd298f4020931dd322ca11fb53913792f4dcecba02949dd5ea76d2eae0
```

## Vector 2 — pmvs-merkle/1 leaf

All inputs:

```text
tag               = keccak256("PMVS:MERKLE:1")
                  = 0x71df0d2930a2279d0a8f0e38b7a9f5ceadeed5d0b250f4eaf38541b6fd7bf8ed
chainId           = 137
settlementContract= 0x1111111111111111111111111111111111111111
leg               = 1 (withdrawal)
epoch             = 3
requestId         = 7
owner             = 0x2222222222222222222222222222222222222222
amount            = 10^18
```

Leaf preimage (`0x00 || tag || be(chainId,32) || settlementContract(20) || leg(1) || be(epoch,8) || be(requestId,32) || owner(20) || be(amount,32)`), 178 bytes:

```text
0x0071df0d2930a2279d0a8f0e38b7a9f5ceadeed5d0b250f4eaf38541b6fd7bf8ed0000000000000000000000000000000000000000000000000000000000000089111111111111111111111111111111111111111101000000000000000300000000000000000000000000000000000000000000000000000000000000072222222222222222222222222222222222222222000000000000000000000000000000000000000000000000de0b6b3a7640000

leaf = keccak256(preimage) =
    0xcc88423ad1c7cbcee8c46378e5e844ff566ff4fafc053d55f2d0e973acab0f73
```

## Vector 3 — three-leaf tree with count-prefixed root

Same tag, chain, and settlement contract as vector 2. Leaves in selection order:

| # | leg | requestId | owner | amount | leaf |
|---|---|---|---|---|---|
| 0 | 1 withdrawal | 7 | `0x2222…` | 10^18 | `0xcc88423ad1c7cbcee8c46378e5e844ff566ff4fafc053d55f2d0e973acab0f73` |
| 1 | 0 deposit | 8 | `0x2222…` | 2·10^18 | `0x37b398cf95807c013e4d26298b78389171398f734234dfa839b4d19a48858e22` |
| 2 | 1 withdrawal | 9 | `0x3333…` | 3·10^18 | `0x1d8378d4b57dd6945cc7f994eb3c349e07fc70aba46c1c3df5ec6165f2212ac7` |

Nodes (sorted-pair hashing, odd node self-pairs):

```text
n01 = keccak256(0x01 || min(L0,L1) || max(L0,L1))
    = 0x6b5aedb82bbfebb7de0e9f50aa7cd274f1dde17ca0fc3435f4c5a3f51e2c5134
n2  = keccak256(0x01 || L2 || L2)   (self-pair)
    = 0x1ff9efe60300cdae803d663bb14fed1ce787aa0110013d56a2c08a42c5246907
rawTreeRoot = keccak256(0x01 || min(n01,n2) || max(n01,n2))
    = 0x658fe811cdd843fb7f11c01a85a9aa086f8701deddaf95ecd7892c8ebac3c083
root        = keccak256(0x02 || be(count=3,32) || rawTreeRoot)
    = 0x49df9c57ee3e8c4feff2c1a6efca914ec6692fb5a6c89798fbe6c9d6d782761e
```

A proof for leaf index 1 uses sibling `n2`; a proof for index 0 or 2 uses the other branch's node at level 1.
