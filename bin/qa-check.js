#!/usr/bin/env node

const { requireSupportedNode } = await import("../dist/core/nodeVersion.js");
requireSupportedNode();
await import("../dist/index.js");
