### Remote Readback Proof: Immutable Template General Release `v3.3.1`

The new immutable general Template release tag `v3.3.1` has been minted and published to GitHub `origin`. This receipt proves the exact `v3.3.1` release identity and records the current historical tag refs as post-mint context. It does **not** claim independently archived pre-mint/post-mint equality for the earlier tags because this receipt does not contain a pre-mint snapshot of those refs.

Live pre-mint inspection confirmed `v3.3.0` was already allocated by PR #341 / #400 (`32377fe16d952876428e2495d2fe3176a507eb4d`), so the next unused SemVer `3.3.1` (tag `v3.3.1`) was allocated. The tagged commit `06d055c0cbc2b085a68a4308d54162e27fb69deb` carries the #398 skill-bearing payload with 101 entries and exact validation-skill digests while its committed `VERSION` and `TEMPLATE_VERSION` bytes both equal the tag semver (`3.3.1`).

Independent remote GitHub readback against `origin` proves the published tag object, peeled commit, tree, 101 payload entries, exact content identities for both validation semantic skills, and `VERSION`/`TEMPLATE_VERSION` byte equality.

#### Release & Tag Identities

| Property | Value |
|---|---|
| **Git Tag Reference** | `refs/tags/v3.3.1` |
| **Annotated Tag Object SHA** | `a55dad22f5721dc7ebf71af1d238e78f52b6736e` |
| **Peeled Target Commit SHA** | `06d055c0cbc2b085a68a4308d54162e27fb69deb` |
| **Resolved Tree SHA** | `1e8b655df2f668480335e3b40d4685f3ebbeba57` |
| **Release Receipt Digest** | `792acbe060a9dc8a03abb0ad0b5b120ae93a6014e6313e95d020cb0ba377a3da` |
| **Publication State** | `published` |
| **Payload Entry Count** | `101` |
| **Payload Digest** | `9451d0be7295877f6a47e7d3489b9d49bdb8b0e6c78f9b58d81b1c4a9258e2b3` |
| **Release Manifest Digest** | `bda279ba2bbb85297e2667fcab4a37524cd7200336298c65c690bb8b3a1fe78f` |
| **Peeled Commit `VERSION` Bytes** | `3.3.1\n` (blob `bea438e9ade7708f8a0fc26bdacda06231f4a434`, matches tag `v3.3.1`) |
| **Peeled Commit `TEMPLATE_VERSION` Bytes** | `3.3.1\n` (blob `bea438e9ade7708f8a0fc26bdacda06231f4a434`) |
| **Verified Readback Time** | Friday, September 18, 2026, 1:10 AM PT |

#### Released Validation Semantic Skills

| Skill Path | Git Blob SHA | Content SHA-256 Digest | Size (bytes) | Status |
|---|---|---|---:|---|
| `skills/pr-validation/SKILL.md` | `4dddeed4b3c372dc5716108d279e80fd0ea56d8b` | `fd99403987656e9e2afcc6fbec0c935d6f9e83cc379403a8812e2ec6c26c2ab8` | 2,772 | Verified present in `v3.3.1` |
| `skills/full-validation/SKILL.md` | `ad35fbaf1bc5c58a97f266abef7864705cff2740` | `d2dbc241de1ca225e2de93f2e73b1259c9f81928cb2fde48f5f8db8d996b72b6` | 2,902 | Verified present in `v3.3.1` |

#### Current Historical Tag Refs (Post-Mint Context Only)

The following command records the current remote refs after `v3.3.1` publication. Because no pre-mint snapshot is embedded in this receipt, these values are **not** used as proof that historical refs were unchanged across the mint.

```text
$ git ls-remote --tags origin \
    'refs/tags/v3.1.0*' 'refs/tags/v3.2.0*' 'refs/tags/v3.2.1*' \
    'refs/tags/v3.3.0*' 'refs/tags/v3.3.1*'
e004586f3a588ce9585d39edae0bd58fa088ef3b	refs/tags/v3.1.0
c67f83f531ca101be0d2318f9cb4459508563420	refs/tags/v3.1.0^{}
6ded3cbea5b79b86dbf6cb02f83e137ef05ff4c6	refs/tags/v3.2.0
88591ee869bb109ef481171aa817d1ed204a970e	refs/tags/v3.2.0^{}
49259c40c83569b51642f52e7b76dfb2645c773f	refs/tags/v3.2.1
217a9ae74bb34d0727c11fbb1f52dd4552af0890	refs/tags/v3.2.1^{}
d8fc4716de1cd22cb0dcb7d567a8171fab997d78	refs/tags/v3.3.0
32377fe16d952876428e2495d2fe3176a507eb4d	refs/tags/v3.3.0^{}
a55dad22f5721dc7ebf71af1d238e78f52b6736e	refs/tags/v3.3.1
06d055c0cbc2b085a68a4308d54162e27fb69deb	refs/tags/v3.3.1^{}
```

#### Independent Remote Readback Verification Commands & Output

```text
$ git ls-remote --tags origin '*v3.3.1*'
a55dad22f5721dc7ebf71af1d238e78f52b6736e	refs/tags/v3.3.1
06d055c0cbc2b085a68a4308d54162e27fb69deb	refs/tags/v3.3.1^{}

$ gh api repos/spencer-shadley/repo-template/git/tags/a55dad22f5721dc7ebf71af1d238e78f52b6736e \
    --jq '{tag, object: {sha: .object.sha, type: .object.type}, receipt: (.message | fromjson | {publicationState, receiptDigest})}'
{
  "tag": "v3.3.1",
  "object": {"sha":"06d055c0cbc2b085a68a4308d54162e27fb69deb","type":"commit"},
  "receipt": {"publicationState":"published","receiptDigest":"792acbe060a9dc8a03abb0ad0b5b120ae93a6014e6313e95d020cb0ba377a3da"}
}

$ gh api repos/spencer-shadley/repo-template/git/commits/06d055c0cbc2b085a68a4308d54162e27fb69deb \
    --jq '{sha, treeSha: .tree.sha}'
{"sha":"06d055c0cbc2b085a68a4308d54162e27fb69deb","treeSha":"1e8b655df2f668480335e3b40d4685f3ebbeba57"}

$ gh api repos/spencer-shadley/repo-template/git/blobs/bea438e9ade7708f8a0fc26bdacda06231f4a434 \
    --jq '{sha, encoding, content}'
{"sha":"bea438e9ade7708f8a0fc26bdacda06231f4a434","encoding":"base64","content":"My4zLjEK"}
# base64(My4zLjEK) = "3.3.1\n"

$ gh api 'repos/spencer-shadley/repo-template/git/trees/1e8b655df2f668480335e3b40d4685f3ebbeba57?recursive=1' \
    --jq '.tree[] | select(.path == "VERSION" or .path == "TEMPLATE_VERSION" or .path == "skills/pr-validation/SKILL.md" or .path == "skills/full-validation/SKILL.md") | [.path,.sha,.size] | @tsv'
TEMPLATE_VERSION	bea438e9ade7708f8a0fc26bdacda06231f4a434	6
VERSION	bea438e9ade7708f8a0fc26bdacda06231f4a434	6
skills/full-validation/SKILL.md	ad35fbaf1bc5c58a97f266abef7864705cff2740	2902
skills/pr-validation/SKILL.md	4dddeed4b3c372dc5716108d279e80fd0ea56d8b	2772

$ gh api 'repos/spencer-shadley/repo-template/contents/release/inert-seed-manifest.json?ref=06d055c0cbc2b085a68a4308d54162e27fb69deb' --jq .content \
    | base64 --decode \
    | jq '{entryCount, skills: [.entries[] | select(.path == "skills/pr-validation/SKILL.md" or .path == "skills/full-validation/SKILL.md") | {path, contentSha256, bytes}]}'
{
  "entryCount": 101,
  "skills": [
    {"path":"skills/full-validation/SKILL.md","contentSha256":"d2dbc241de1ca225e2de93f2e73b1259c9f81928cb2fde48f5f8db8d996b72b6","bytes":2902},
    {"path":"skills/pr-validation/SKILL.md","contentSha256":"fd99403987656e9e2afcc6fbec0c935d6f9e83cc379403a8812e2ec6c26c2ab8","bytes":2772}
  ]
}

$ gh api 'repos/spencer-shadley/repo-template/contents/release/release-payload-set.json?ref=06d055c0cbc2b085a68a4308d54162e27fb69deb' --jq .content \
    | base64 --decode \
    | jq '{entryCount, payloadDigest, skills: [.entries[] | select(.path == "skills/pr-validation/SKILL.md" or .path == "skills/full-validation/SKILL.md") | {path, contentSha256}]}'
{
  "entryCount": 101,
  "payloadDigest": "9451d0be7295877f6a47e7d3489b9d49bdb8b0e6c78f9b58d81b1c4a9258e2b3",
  "skills": [
    {"path":"skills/full-validation/SKILL.md","contentSha256":"d2dbc241de1ca225e2de93f2e73b1259c9f81928cb2fde48f5f8db8d996b72b6"},
    {"path":"skills/pr-validation/SKILL.md","contentSha256":"fd99403987656e9e2afcc6fbec0c935d6f9e83cc379403a8812e2ec6c26c2ab8"}
  ]
}

$ for p in skills/pr-validation/SKILL.md skills/full-validation/SKILL.md; do \
    gh api "repos/spencer-shadley/repo-template/contents/$p?ref=06d055c0cbc2b085a68a4308d54162e27fb69deb" --jq .content \
      | base64 --decode | sha256sum; \
  done
fd99403987656e9e2afcc6fbec0c935d6f9e83cc379403a8812e2ec6c26c2ab8  -
d2dbc241de1ca225e2de93f2e73b1259c9f81928cb2fde48f5f8db8d996b72b6  -
```

Downstream consumers (Repo Factory #200 / PR 214 and Fleet Registry / Code #5453) can bind directly to immutable Template release `v3.3.1`.
