import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../gitUpstreamTagsMk.json5", import.meta.url), "utf8"));
const manager = config.customManagers[0];
const expression = new RegExp(manager.matchStrings[0]);
const currentDigest = "0123456789abcdef0123456789abcdef01234567";
const nextDigest = "fedcba9876543210fedcba9876543210fedcba98";

function upstream(ref, digest = currentDigest, url = "https://github.com/renovatebot/renovate.git") {
  return [
    "UPSTREAM_URL := " + url,
    "UPSTREAM_REF := " + ref,
    "UPSTREAM_DIGEST := " + digest,
    "",
  ].join("\n");
}

// Mirror the dependency fields exposed by Renovate's regex extraction.
// Arbitrary named capture groups are only available to *extraction* templates,
// not to autoReplaceStringTemplate.
function extract(file) {
  const match = expression.exec(file);
  if (!match) {
    return null;
  }
  const { packageName, currentValue, currentDigest } = match.groups;
  return {
    packageName,
    currentValue,
    currentDigest,
    datasource: manager.datasourceTemplate,
    versioning: manager.versioningTemplate,
    depType: manager.depTypeTemplate,
    replaceString: match[0],
    autoReplaceStringTemplate: manager.autoReplaceStringTemplate,
  };
}

function render(template, fields) {
  return template.replace(/\{\{\{(\w+)\}\}\}/g, (_, field) => {
    assert.ok(Object.hasOwn(fields, field), "Unknown Renovate replacement field: " + field);
    assert.equal(typeof fields[field], "string", "Missing Renovate value: " + field);
    return fields[field];
  });
}

function update(file, newValue, newDigest) {
  const dependency = extract(file);
  assert.ok(dependency, "Expected a versioned upstream with a full digest");
  const replacement = render(dependency.autoReplaceStringTemplate, {
    ...dependency,
    newValue,
    newDigest,
  });
  return file.replace(dependency.replaceString, replacement);
}

test("extracts the fields used by Renovate, excluding arbitrary regex groups", () => {
  const dependency = extract(upstream("44.181.5"));
  assert.deepEqual(dependency, {
    packageName: "https://github.com/renovatebot/renovate.git",
    currentValue: "44.181.5",
    currentDigest,
    datasource: "git-tags",
    versioning: "semver-coerced",
    depType: "git-upstream-tags-mk",
    replaceString: upstream("44.181.5").trimEnd(),
    autoReplaceStringTemplate: manager.autoReplaceStringTemplate,
  });
  assert.throws(
    () => render("{{{urlLine}}}", { ...dependency, newValue: "44.181.6", newDigest: nextDigest }),
    /Unknown Renovate replacement field: urlLine/,
  );
});

test("only recognizes versioned tags with full digests, not branches", () => {
  for (const ref of ["44.181.5", "v1.2.3", "v2.0.0-rc.1"]) {
    assert.ok(extract(upstream(ref)), ref);
  }
  assert.equal(extract(upstream("main")), null);
  assert.equal(extract(upstream("stable/1.x")), null);
  assert.equal(extract(upstream("1.2.3", "abc123")), null);
  assert.equal(extract("UPSTREAM_REF := 1.2.3\n"), null);
});

test("updates tag and commit digest together using extracted fields only", () => {
  const original = upstream(
    "44.181.5",
    currentDigest,
    "https://git.0xmax42.io/group/subgroup/project.git",
  ) + "CUSTOM_VAR := unchanged\n";
  assert.equal(
    update(original, "44.182.0", nextDigest),
    upstream("44.182.0", nextDigest, "https://git.0xmax42.io/group/subgroup/project.git")
      + "CUSTOM_VAR := unchanged\n",
  );
  assert.equal(manager.datasourceTemplate, "git-tags");
  assert.equal(manager.versioningTemplate, "semver-coerced");
});

test("updates prefixed releases and prereleases without changing unrelated content", () => {
  const original = "# Managed upstream\n" + upstream("v1.2.3-rc.1") + "# End\n";
  assert.equal(
    update(original, "v1.2.3", nextDigest),
    "# Managed upstream\n" + upstream("v1.2.3", nextDigest) + "# End\n",
  );
});

test("preserves patch/minor automerge and major approval rules", () => {
  for (const type of ["patch", "minor", "major"]) {
    const rule = config.packageRules.find((entry) => entry.matchUpdateTypes.includes(type));
    assert.ok(rule, type);
    assert.deepEqual([...rule.matchDatasources], ["git-tags"]);
    assert.deepEqual([...rule.matchDepTypes], ["git-upstream-tags-mk"]);
    assert.equal(rule.automerge, type !== "major");
    assert.equal(rule.automergeType, "pr");
    assert.equal(rule.automergeStrategy, "rebase");
    assert.ok(rule.labels.includes("dependency/git/" + type));
    if (type === "major") {
      assert.equal(rule.dependencyDashboardApproval, true);
      assert.ok(rule.labels.includes("dependency/automerge/disabled"));
    } else {
      assert.equal(rule.groupName, "git tag updates");
      assert.ok(rule.labels.includes("dependency/automerge"));
    }
  }
});
