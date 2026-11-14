import assert from "node:assert/strict";
import { test } from "node:test";
import { withToken } from "./rotate-sync-token.mjs";

test("withToken remplace la ligne existante et garde le reste", () => {
  const before = "REMOTE_APP_URL=http://x\nSYNC_SECRET_TOKEN=ancien\nAUTRE=1\n";
  assert.equal(withToken(before, "neuf"), "REMOTE_APP_URL=http://x\nSYNC_SECRET_TOKEN=neuf\nAUTRE=1\n");
});

test("withToken remplace aussi une ligne « export » ou espacée", () => {
  assert.equal(withToken("export SYNC_SECRET_TOKEN = ancien\n", "neuf"), "SYNC_SECRET_TOKEN=neuf\n");
});

test("withToken ajoute la ligne si elle manque, sans coller à la dernière", () => {
  assert.equal(withToken("A=1", "neuf"), "A=1\nSYNC_SECRET_TOKEN=neuf\n");
  assert.equal(withToken("", "neuf"), "SYNC_SECRET_TOKEN=neuf\n");
});

test("withToken ne touche pas une variable au nom voisin", () => {
  assert.equal(withToken("OLD_SYNC_SECRET_TOKEN=x\n", "neuf"), "OLD_SYNC_SECRET_TOKEN=x\nSYNC_SECRET_TOKEN=neuf\n");
});
