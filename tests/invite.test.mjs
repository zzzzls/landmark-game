import test from "node:test";
import assert from "node:assert/strict";
import { inviteAddresses } from "../src/invite.js";

test("an address already reached over the LAN or reverse proxy takes precedence", () => {
  assert.deepEqual(inviteAddresses("http://192.168.1.42:5173", ["http://10.0.0.9:5173"]), ["http://192.168.1.42:5173/"]);
  assert.deepEqual(inviteAddresses("https://game.example.com", []), ["https://game.example.com/"]);
});

test("localhost invitations skip proxy benchmark IPs, loopback and malformed addresses", () => {
  assert.deepEqual(inviteAddresses("http://localhost:5173", [
    "http://198.18.0.1:5173", "http://127.0.0.1:5173", "not a URL",
    "http://192.168.1.42:5173", "http://192.168.1.42:5173/", "http://10.0.0.9:5173",
    "ftp://172.16.0.2", "http://user:password@192.168.1.3", "http://172.32.1.1",
  ]), ["http://192.168.1.42:5173/", "http://10.0.0.9:5173/"]);
  assert.deepEqual(inviteAddresses("http://[::1]:5173", []), []);
  assert.deepEqual(inviteAddresses("http://game.localhost:5173", []), []);
});
