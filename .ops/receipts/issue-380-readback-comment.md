### Remote Readback Proof: Immutable Template General Release `v3.2.1`

As directed in the post-merge readback review, the new immutable general Template release tag `v3.2.1` has been minted and published to GitHub `origin`, strictly preserving existing immutable release tags `v3.2.0` and `v3.1.0` without reuse or mutation.

Independent remote GitHub readback against `origin` proves the published tag object, peeled commit, tree, 101 payload entries, and exact content identities for both validation semantic skills:

#### Release & Tag Identities
| Property | Value |
|---|---|
| **Git Tag Reference** | `refs/tags/v3.2.1` |
| **Annotated Tag Object SHA** | `49259c40c83569b51642f52e7b76dfb2645c773f` |
| **Peeled Target Commit SHA** | `217a9ae74bb34d0727c11fbb1f52dd4552af0890` |
| **Resolved Tree SHA** | `b507f7312d2c4c7ee3f84ed46ab495d21b7b7707` |
| **Release Receipt Digest** | `20107ae4a25aa793d413de84b95285176a07013b41649d110e6b9ce88a9dd3f4` |
| **Publication State** | `published` |
| **Payload Entry Count** | `101` |
| **Payload Digest** | `9451d0be7295877f6a47e7d3489b9d49bdb8b0e6c78f9b58d81b1c4a9258e2b3` |
| **Release Manifest Digest** | `bda279ba2bbb85297e2667fcab4a37524cd7200336298c65c690bb8b3a1fe78f` |
| **Verified Readback Time** | Thursday, September 17, 2026, 11:57 PM PT |

#### Released Validation Semantic Skills
| Skill Path | Git Blob SHA | Content SHA-256 Digest | Size (bytes) | Status |
|---|---|---|---|---|
| `skills/pr-validation/SKILL.md` | `4dddeed4b3c372dc5716108d279e80fd0ea56d8b` | `fd99403987656e9e2afcc6fbec0c935d6f9e83cc379403a8812e2ec6c26c2ab8` | 2,772 | Verified present & closed in `v3.2.1` |
| `skills/full-validation/SKILL.md` | `ad35fbaf1bc5c58a97f266abef7864705cff2740` | `d2dbc241de1ca225e2de93f2e73b1259c9f81928cb2fde48f5f8db8d996b72b6` | 2,902 | Verified present & closed in `v3.2.1` |

#### Independent Remote Readback Verification Commands & Output
```text
$ git ls-remote --tags origin "*v3.2.1*"
49259c40c83569b51642f52e7b76dfb2645c773f	refs/tags/v3.2.1
217a9ae74bb34d0727c11fbb1f52dd4552af0890	refs/tags/v3.2.1^{}

$ gh api repos/spencer-shadley/repo-template/git/tags/49259c40c83569b51642f52e7b76dfb2645c773f
tag: v3.2.1
object.sha: 217a9ae74bb34d0727c11fbb1f52dd4552af0890 (type: commit)
publicationState: published
receiptDigest: 20107ae4a25aa793d413de84b95285176a07013b41649d110e6b9ce88a9dd3f4

$ gh api repos/spencer-shadley/repo-template/git/commits/217a9ae74bb34d0727c11fbb1f52dd4552af0890
tree.sha: b507f7312d2c4c7ee3f84ed46ab495d21b7b7707

$ gh api 'repos/spencer-shadley/repo-template/git/trees/b507f7312d2c4c7ee3f84ed46ab495d21b7b7707?recursive=1' \
    --jq '.tree[] | select(.path == "skills/pr-validation/SKILL.md" or .path == "skills/full-validation/SKILL.md") | [.path,.sha,.size] | @tsv'
skills/full-validation/SKILL.md	ad35fbaf1bc5c58a97f266abef7864705cff2740	2902
skills/pr-validation/SKILL.md	4dddeed4b3c372dc5716108d279e80fd0ea56d8b	2772

$ gh api 'repos/spencer-shadley/repo-template/contents/release/inert-seed-manifest.json?ref=217a9ae74bb34d0727c11fbb1f52dd4552af0890' --jq .content \
    | base64 --decode \
    | jq '{entryCount, skills: [.entries[] | select(.path == "skills/pr-validation/SKILL.md" or .path == "skills/full-validation/SKILL.md") | {path, contentSha256, bytes}]}'
{
  "entryCount": 101,
  "skills": [
    {"path":"skills/full-validation/SKILL.md","contentSha256":"d2dbc241de1ca225e2de93f2e73b1259c9f81928cb2fde48f5f8db8d996b72b6","bytes":2902},
    {"path":"skills/pr-validation/SKILL.md","contentSha256":"fd99403987656e9e2afcc6fbec0c935d6f9e83cc379403a8812e2ec6c26c2ab8","bytes":2772}
  ]
}

$ gh api 'repos/spencer-shadley/repo-template/contents/release/release-payload-set.json?ref=217a9ae74bb34d0727c11fbb1f52dd4552af0890' --jq .content \
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
    gh api "repos/spencer-shadley/repo-template/contents/$p?ref=217a9ae74bb34d0727c11fbb1f52dd4552af0890" --jq .content \
      | base64 --decode | sha256sum; \
  done
fd99403987656e9e2afcc6fbec0c935d6f9e83cc379403a8812e2ec6c26c2ab8  -
d2dbc241de1ca225e2de93f2e73b1259c9f81928cb2fde48f5f8db8d996b72b6  -
```

Downstream consumers (e.g. Repo Factory #200 / PR 214 and Fleet Registry) can now bind directly to immutable Template release `v3.2.1`.
