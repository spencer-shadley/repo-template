import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  sha256CanonicalJson,
  validatePublishedTemplateReleaseReceiptV1,
} from "../../../artifacts/adoption-shell-v2/index.js";
import {
  FROZEN_CANDIDATE_COMMIT,
  FROZEN_CANDIDATE_TREE,
  FROZEN_SEMVER,
  PUBLICATION_SEMVER,
  PUBLICATION_TAG,
  RECEIPT_ID,
  FIRST_CANARY_RECEIPT_DIGEST,
  FIRST_CANARY_RECEIPT_ID,
  FIRST_CANARY_RECEIPT_URL,
  SECOND_CANARY_RECEIPT_DIGEST,
  SECOND_CANARY_RECEIPT_ID,
  SECOND_CANARY_RECEIPT_URL,
  TARGET_READBACK_RECEIPT_PATHS,
  TARGET_RELEASE_RECEIPT_PATHS,
  assertCanaryReceiptUrl,
  assertCommitVersionMatchesDeclaredSemver,
  buildPostPublicationReadbackReceipt,
  assertLoadedCanaryReceipt,
  compareCanonicalDigests,
  loadDurableCanaryReceipt,
  performRemoteReadback,
  resolveRemotePeeledCommit,
  serializeReceipt,
  validateCanaryReceipts,
  VENDOR_MG_RECEIPT_PATH,
  type PostPublicationReadbackReceipt,
} from "../../../scripts/publish-local-ci-v3-release.ts";
import {
  computeCanonicalDigests,
  sha256File,
} from "../../../scripts/freeze-local-ci-v3-candidate.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function isJsonSchema(value: unknown): value is AnySchema {
  return (
    typeof value === "boolean" ||
    (value !== null && typeof value === "object" && !Array.isArray(value))
  );
}

const schemaContent: unknown = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "contracts",
      "local-ci",
      "v3",
      "post-publication-readback-receipt.schema.json",
    ),
    "utf8",
  ),
);
if (!isJsonSchema(schemaContent)) {
  throw new TypeError("post-publication-readback-receipt schema must be a valid JSON schema");
}

const ajv = new Ajv2020({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
});
const validateReceiptSchema = ajv.compile(schemaContent);

function loadReadbackReceipt(relativePath: string): PostPublicationReadbackReceipt {
  const content = fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
  return JSON.parse(content) as PostPublicationReadbackReceipt;
}

void test("post-publication readback receipt and published release receipt files exist", () => {
  for (const relativePath of TARGET_READBACK_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    assert.equal(fs.existsSync(fullPath), true, `Readback receipt missing at ${relativePath}`);
  }
  for (const relativePath of TARGET_RELEASE_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    assert.equal(fs.existsSync(fullPath), true, `Published release receipt missing at ${relativePath}`);
  }

  const primary = fs.readFileSync(
    path.join(root, ...TARGET_READBACK_RECEIPT_PATHS[0].split("/")),
    "utf8",
  );
  const secondary = fs.readFileSync(
    path.join(root, ...TARGET_READBACK_RECEIPT_PATHS[1].split("/")),
    "utf8",
  );
  const docsReceipt = fs.readFileSync(
    path.join(root, ...TARGET_READBACK_RECEIPT_PATHS[2].split("/")),
    "utf8",
  );
  assert.equal(primary, secondary, "Readback receipt files must have identical contents");
  assert.equal(primary, docsReceipt, "Docs receipt copy must have identical contents");
});

void test("post-publication readback receipt validates against schema", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const isValid = validateReceiptSchema(receipt);
  assert.equal(isValid, true, JSON.stringify(validateReceiptSchema.errors, null, 2));
});

void test("published release receipt validates with validatePublishedTemplateReleaseReceiptV1", () => {
  const raw = fs.readFileSync(
    path.join(root, "contracts", "local-ci", "v3", "published-release-receipt.json"),
    "utf8",
  );
  const receipt = JSON.parse(raw);
  const validation = validatePublishedTemplateReleaseReceiptV1(receipt);
  assert.equal(
    validation.ok,
    true,
    validation.ok ? undefined : JSON.stringify(validation.diagnostics, null, 2),
  );
  assert.equal(receipt.publicationState, "published");
  assert.equal(receipt.releaseId, `spencer-shadley/repo-template@${PUBLICATION_SEMVER}`);
  assert.equal(receipt.producer.semver, PUBLICATION_SEMVER);
  assert.equal(receipt.producer.tag, PUBLICATION_TAG);
  assert.notEqual(receipt.producer.commit, FROZEN_CANDIDATE_COMMIT);
  assert.equal(receipt.releaseEvidence, undefined);
});

void test("readback receipt binds exact immutable candidate identity, lineage, and canaries", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");

  assert.equal(receipt.receiptId, RECEIPT_ID);
  assert.equal(receipt.publicationState, "published");
  assert.equal(receipt.candidate.commit, FROZEN_CANDIDATE_COMMIT);
  assert.equal(receipt.candidate.tree, FROZEN_CANDIDATE_TREE);
  assert.equal(receipt.candidate.semver, FROZEN_SEMVER);
  assert.equal(receipt.candidate.tag, `v${FROZEN_SEMVER}`);

  assert.equal(receipt.lineage.contractId, "repo-template/local-ci-v3");
  assert.equal(receipt.lineage.outcomeContractId, "repo-template/local-ci-outcome-v1");
  assert.equal(receipt.lineage.proofOfDetectionRequired, true);

  assert.equal(
    receipt.canaryReceipts.modelGateway.issue,
    "https://github.com/spencer-shadley/model-gateway/issues/991",
  );
  assert.equal(
    receipt.canaryReceipts.modelGateway.receiptDigest,
    FIRST_CANARY_RECEIPT_DIGEST,
  );
  assert.equal(receipt.canaryReceipts.modelGateway.candidateDigestMatches, true);

  assert.equal(
    receipt.canaryReceipts.repoFactory.issue,
    "https://github.com/spencer-shadley/repo-factory/issues/187",
  );
  assert.equal(
    receipt.canaryReceipts.repoFactory.receiptDigest,
    SECOND_CANARY_RECEIPT_DIGEST,
  );
  assert.equal(receipt.canaryReceipts.repoFactory.candidateDigestMatches, true);
  assert.equal(receipt.canaryReceipts.modelGateway.receiptUrl, FIRST_CANARY_RECEIPT_URL);
  assert.equal(receipt.canaryReceipts.repoFactory.receiptUrl, SECOND_CANARY_RECEIPT_URL);

  assert.equal(receipt.readback.candidateCommitMatches, true);
  assert.equal(receipt.readback.candidateTreeMatches, true);
  assert.equal(receipt.readback.allCanonicalDigestsMatch, true);
  assert.equal(receipt.readback.firstCanaryAgrees, true);
  assert.equal(receipt.readback.secondCanaryAgrees, true);
  assert.equal(receipt.readback.tagName, PUBLICATION_TAG);
  assert.equal(receipt.readback.releaseId, `spencer-shadley/repo-template@${PUBLICATION_SEMVER}`);
  assert.equal(receipt.readback.resolvedCommit, receipt.publishedReleaseReceipt.producer.commit);
  assert.equal(receipt.readback.resolvedTree, receipt.publishedReleaseReceipt.producer.tree);
  assert.notEqual(receipt.readback.resolvedCommit, FROZEN_CANDIDATE_COMMIT);
});

void test("readback receipt deterministically matches recomputed bytes and digest", () => {
  const diskSerialized = fs.readFileSync(
    path.join(root, "contracts", "local-ci", "v3", "post-publication-readback-receipt.json"),
    "utf8",
  );
  const recomputed = buildPostPublicationReadbackReceipt();
  const recomputedSerialized = serializeReceipt(recomputed);

  assert.equal(diskSerialized, recomputedSerialized);

  const { receiptDigest, ...body } = recomputed;
  const calculatedDigest = sha256CanonicalJson(body);
  assert.equal(receiptDigest, calculatedDigest);
});

void test("all canonical V3 artifacts on disk match their recorded digests in readback receipt", () => {
  const digests = computeCanonicalDigests();
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");

  for (const [filePath, expectedDigest] of Object.entries(receipt.canonicalDigests)) {
    const actualDigest = digests[filePath] ?? sha256File(filePath);
    assert.equal(
      actualDigest,
      expectedDigest,
      `Digest mismatch for canonical file: ${filePath}`,
    );
  }
  assert.deepEqual(receipt.canonicalDigests, digests);
});

void test("schema rejects non-published publicationState in readback receipt", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const premature = { ...receipt, publicationState: "candidate" };
  const isValid = validateReceiptSchema(premature);
  assert.equal(isValid, false, "Schema must reject publicationState other than 'published'");
});

void test("schema rejects invalid git commit sha in readback receipt", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const invalid = {
    ...receipt,
    candidate: { ...receipt.candidate, commit: "invalid-sha" },
  };
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject invalid git commit sha");
});

void test("schema rejects missing canary receipt in readback receipt", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const { modelGateway: _mg, ...canaryReceipts } = receipt.canaryReceipts as unknown as Record<string, unknown>;
  const invalid = {
    ...receipt,
    canaryReceipts,
  };
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject missing modelGateway canary receipt");
});

void test("schema rejects missing publishedReleaseReceipt in readback receipt", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const invalid = { ...(receipt as unknown as Record<string, unknown>) };
  delete invalid["publishedReleaseReceipt"];
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject missing publishedReleaseReceipt");
});

void test("schema rejects invalid publishedReleaseReceipt publicationState", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const invalid = {
    ...receipt,
    publishedReleaseReceipt: {
      ...receipt.publishedReleaseReceipt,
      publicationState: "candidate",
    },
  };
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject non-published publishedReleaseReceipt");
});

void test("schema rejects invalid git commit sha in publishedReleaseReceipt", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const invalid = {
    ...receipt,
    publishedReleaseReceipt: {
      ...receipt.publishedReleaseReceipt,
      producer: {
        ...receipt.publishedReleaseReceipt.producer,
        commit: "invalid-sha",
      },
    },
  };
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject invalid git commit sha in publishedReleaseReceipt");
});

void test("validateCanaryReceipts passes cleanly on registered durable receipts", () => {
  assert.doesNotThrow(() => {
    validateCanaryReceipts();
  });
});

void test("missing remote tag fails closed and does not copy match flags", () => {
  assert.throws(
    () =>
      resolveRemotePeeledCommit("origin", PUBLICATION_TAG, () => {
        return "";
      }),
    /Remote tag refs\/tags\/v3\.3\.0 not found/,
  );
  assert.throws(
    () =>
      resolveRemotePeeledCommit("origin", PUBLICATION_TAG, () => {
        throw new Error("network down");
      }),
    /could not be queried/,
  );
  assert.throws(
    () =>
      resolveRemotePeeledCommit("origin", PUBLICATION_TAG, () => {
        return "6ded3cbea5b79b86dbf6cb02f83e137ef05ff4c6\trefs/tags/v3.3.0";
      }),
    /is not an annotated tag with a peeled commit/,
  );
});

void test("VERSION/tag disagreement on the frozen 3.1.0 tree fails closed", () => {
  const show = (commitSha: string, pathName: string) =>
    execFileSync("git", ["show", `${commitSha}:${pathName}`], {
      cwd: root,
      encoding: "utf8",
    });
  assert.throws(() => {
    assertCommitVersionMatchesDeclaredSemver(FROZEN_CANDIDATE_COMMIT, PUBLICATION_SEMVER, show);
  }, /disagrees with commit/);
  assert.throws(() => {
    assertCommitVersionMatchesDeclaredSemver(FROZEN_CANDIDATE_COMMIT, FROZEN_SEMVER, show);
  }, /disagrees with commit/);
});

void test("non-receipt canary URL fails closed", () => {
  assert.throws(() => {
    assertCanaryReceiptUrl(
      "https://github.com/spencer-shadley/repo-factory/issues/187#issuecomment-5722794813",
      SECOND_CANARY_RECEIPT_ID,
    );
  }, /not a durable receipt artifact/);
  assert.throws(() => {
    assertCanaryReceiptUrl(
      "https://github.com/spencer-shadley/model-gateway/issues/991#issuecomment-5677659016",
      FIRST_CANARY_RECEIPT_ID,
    );
  }, /not a durable receipt artifact/);
  assert.throws(() => {
    assertCanaryReceiptUrl(
      "https://github.com/spencer-shadley/model-gateway/blob/master/docs/receipts/receipt-issue-991-mu14rxy2.json",
      FIRST_CANARY_RECEIPT_ID,
    );
  }, /not a durable receipt artifact/);
  assert.throws(() => {
    assertCanaryReceiptUrl(
      "https://github.com/spencer-shadley/repo-factory/blob/master/docs/receipts/receipt-issue-187-mu14zjfz.json",
      SECOND_CANARY_RECEIPT_ID,
    );
  }, /not a durable receipt artifact/);
  assert.doesNotThrow(() => {
    assertCanaryReceiptUrl(FIRST_CANARY_RECEIPT_URL, FIRST_CANARY_RECEIPT_ID);
    assertCanaryReceiptUrl(SECOND_CANARY_RECEIPT_URL, SECOND_CANARY_RECEIPT_ID);
  });
});

void test("canary loader rejects a tampered candidate.commit even when the digest is recomputed", () => {
  const genuine = loadDurableCanaryReceipt(
    VENDOR_MG_RECEIPT_PATH,
    FIRST_CANARY_RECEIPT_DIGEST,
    "Model Gateway",
  );
  const { receiptDigest: _ignored, ...body } = genuine;
  const tamperedBody = {
    ...body,
    candidate: {
      ...genuine.candidate,
      commit: "0000000000000000000000000000000000000000",
    },
  };
  const tampered = {
    ...tamperedBody,
    receiptDigest: sha256CanonicalJson(tamperedBody),
  };
  assert.throws(() => {
    assertLoadedCanaryReceipt(tampered, tampered.receiptDigest, "Model Gateway");
  }, /candidate commit mismatch/);
});

void test("performRemoteReadback throws when a canary agreement flag is false instead of copying true", () => {
  const identity = {
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    semver: PUBLICATION_SEMVER,
    tag: PUBLICATION_TAG,
  };
  assert.throws(
    () =>
      performRemoteReadback(
        identity,
        {
          allCanonicalDigestsMatch: true,
          firstCanaryAgrees: false,
          secondCanaryAgrees: true,
        },
        {
          remote: "origin",
          tagName: PUBLICATION_TAG,
          runGit: (args) => {
            if (args[0] === "ls-remote") {
              return `${identity.commit}\trefs/tags/${PUBLICATION_TAG}^{}`;
            }
            throw new Error(`unexpected git ${args.join(" ")}`);
          },
        },
      ),
    /Model Gateway canary does not agree/,
  );
});

void test("performRemoteReadback throws when allCanonicalDigestsMatch is false", () => {
  const identity = {
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    semver: PUBLICATION_SEMVER,
    tag: PUBLICATION_TAG,
  };
  assert.throws(() => {
    performRemoteReadback(
      identity,
      {
        allCanonicalDigestsMatch: false,
        firstCanaryAgrees: true,
        secondCanaryAgrees: true,
      },
      {
        remote: "origin",
        tagName: PUBLICATION_TAG,
        runGit: (args) => {
          if (args[0] === "ls-remote") {
            return `${identity.commit}\trefs/tags/${PUBLICATION_TAG}^{}`;
          }
          throw new Error(`unexpected git ${args.join(" ")}`);
        },
      },
    );
  }, /Canonical LocalCi V3 digests do not match the frozen candidate/);
});

void test("performRemoteReadback fails when remote and local tag objects differ despite same peel", () => {
  const identity = {
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    semver: PUBLICATION_SEMVER,
    tag: PUBLICATION_TAG,
  };
  const remoteTagObject = "cccccccccccccccccccccccccccccccccccccccc";
  const localTagObject = "dddddddddddddddddddddddddddddddddddddddd";
  assert.throws(
    () =>
      performRemoteReadback(
        identity,
        {
          allCanonicalDigestsMatch: true,
          firstCanaryAgrees: true,
          secondCanaryAgrees: true,
        },
        {
          remote: "origin",
          tagName: PUBLICATION_TAG,
          runGit: (args) => {
            if (args[0] === "ls-remote") {
              return [
                `${remoteTagObject}\trefs/tags/${PUBLICATION_TAG}`,
                `${identity.commit}\trefs/tags/${PUBLICATION_TAG}^{}`,
              ].join("\n");
            }
            if (args[0] === "rev-parse" && args[1] === `${identity.commit}^{tree}`) {
              return identity.tree;
            }
            if (args[0] === "rev-parse" && args[1] === `refs/tags/${PUBLICATION_TAG}`) {
              return localTagObject;
            }
            throw new Error(`unexpected git ${args.join(" ")}`);
          },
        },
      ),
    /does not match remote annotated tag object/,
  );
});

void test("performRemoteReadback fails when tag receipt digest disagrees with expected published receipt", () => {
  const identity = {
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    semver: PUBLICATION_SEMVER,
    tag: PUBLICATION_TAG,
  };
  const tagObjectSha = "cccccccccccccccccccccccccccccccccccccccc";
  const expectedDigest = "1111111111111111111111111111111111111111111111111111111111111111";
  const publishedPath = path.join(
    root,
    "contracts",
    "local-ci",
    "v3",
    "published-release-receipt.json",
  );
  const published = JSON.parse(fs.readFileSync(publishedPath, "utf8")) as {
    receiptDigest: string;
    producer: { commit: string; semver: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  assert.notEqual(
    published.receiptDigest,
    expectedDigest,
    "fixture receipt digest must differ from injected expected digest",
  );
  const annotatedTagBytes = [
    `object ${identity.commit}`,
    "type commit",
    `tag ${PUBLICATION_TAG}`,
    "tagger Test <test@example.com> 0 +0000",
    "",
    JSON.stringify(published),
  ].join("\n");

  assert.throws(
    () =>
      performRemoteReadback(
        identity,
        {
          allCanonicalDigestsMatch: true,
          firstCanaryAgrees: true,
          secondCanaryAgrees: true,
        },
        {
          remote: "origin",
          tagName: PUBLICATION_TAG,
          runGit: (args) => {
            if (args[0] === "ls-remote") {
              return [
                `${tagObjectSha}\trefs/tags/${PUBLICATION_TAG}`,
                `${identity.commit}\trefs/tags/${PUBLICATION_TAG}^{}`,
              ].join("\n");
            }
            if (args[0] === "rev-parse" && args[1] === `${identity.commit}^{tree}`) {
              return identity.tree;
            }
            if (args[0] === "rev-parse" && args[1] === `refs/tags/${PUBLICATION_TAG}`) {
              return tagObjectSha;
            }
            if (args[0] === "cat-file" && args[1] === "-p" && args[2] === tagObjectSha) {
              return annotatedTagBytes;
            }
            throw new Error(`unexpected git ${args.join(" ")}`);
          },
          expectedPublishedReceipt: {
            ...published,
            receiptDigest: expectedDigest,
            producer: {
              ...published.producer,
              commit: identity.commit,
              semver: PUBLICATION_SEMVER,
            },
          } as import("../../../artifacts/adoption-shell-v2/index.js").TemplateReleaseReceipt,
        },
      ),
    /receiptDigest .* does not match expected published receipt digest/,
  );
});

void test("compareCanonicalDigests enforces exact agreement and fails on drift", () => {
  const base = {
    "a.json": "1111111111111111111111111111111111111111111111111111111111111111",
    "b.json": "2222222222222222222222222222222222222222222222222222222222222222",
  };
  assert.equal(compareCanonicalDigests(base, { ...base }), true);
  assert.equal(
    compareCanonicalDigests(base, {
      ...base,
      "a.json": "0000000000000000000000000000000000000000000000000000000000000000",
    }),
    false,
  );
  assert.equal(
    compareCanonicalDigests(base, {
      "a.json": "1111111111111111111111111111111111111111111111111111111111111111",
    }),
    false,
  );
  assert.equal(
    compareCanonicalDigests(base, {
      ...base,
      "c.json": "3333333333333333333333333333333333333333333333333333333333333333",
    }),
    false,
  );
  assert.equal(compareCanonicalDigests(base, undefined), false);
  assert.equal(compareCanonicalDigests({}, {}), false);
});

